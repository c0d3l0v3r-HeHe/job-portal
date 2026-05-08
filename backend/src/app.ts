import { Hono } from 'hono'
import { jwt, sign, verify } from 'hono/jwt'
import type {
  IAuditRepository,
  IClock,
  ICompanyRepository,
  IJobRepository,
  IOtpLogRepository,
  IPasswordHasher,
  IQrCodeProvider,
  IResumeRepository,
  ITotpProvider,
  IUserKeyRepository,
  IUserRepository,
  IMessageRepository,
  IApplicationRepository,
  IRecruiterNoteRepository,
  IFileCrypto,
  IHashProvider,
  ISlidingWindowStore,
} from './services/interfaces'
import { AuthService } from './services/authService'
import { ResumeService } from './services/resumeService'
import { JobService } from './services/jobService'
import { ApplicationService } from './services/applicationService'
import { AuditService } from './services/auditService'
import { PKIService } from './services/pkiService'
import { MessageService } from './services/messageService'
import { RedisSlidingWindowRateLimiter } from './services/rateLimiter'
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './services/errors'

type AppDeps = {
  users: IUserRepository
  companies: ICompanyRepository
  resumes: IResumeRepository
  jobs: IJobRepository
  applications: IApplicationRepository
  notes: IRecruiterNoteRepository
  audits: IAuditRepository
  userKeys: IUserKeyRepository
  messages: IMessageRepository
  otpLogs: IOtpLogRepository
  hasher: IPasswordHasher
  totp: ITotpProvider
  qr: IQrCodeProvider
  fileCrypto: IFileCrypto
  hash: IHashProvider
  clock: IClock
  rateStore: ISlidingWindowStore
  jwtSecret: string
}

const handleError = (e: unknown, c: any) => {
  if (e instanceof ValidationError) return c.json({ error: e.message }, 400)
  if (e instanceof UnauthorizedError) return c.json({ error: e.message }, 401)
  if (e instanceof ForbiddenError) return c.json({ error: e.message }, 403)
  if (e instanceof NotFoundError) return c.json({ error: e.message }, 404)
  return c.json({ error: 'Internal server error' }, 500)
}

const authMiddleware = (jwtSecret: string) => {
  return async (c: any, next: any) => {
    const auth = c.req.header('authorization')
    if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
    try {
      const token = auth.replace('Bearer ', '')
      const payload = await verify(token, jwtSecret, 'HS256')
      c.set('jwtPayload', payload as { id: string; role: string })
      await next()
    } catch {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
}

export function createApp(deps: AppDeps) {
  const app = new Hono()

  const authService = new AuthService({
    users: deps.users,
    companies: deps.companies,
    hasher: deps.hasher,
    totp: deps.totp,
    qr: deps.qr,
    jwt: { sign: (payload) => sign(payload, deps.jwtSecret) },
    otpLogs: deps.otpLogs,
  })
  const resumeService = new ResumeService({
    resumes: deps.resumes,
    fileCrypto: deps.fileCrypto,
    applications: deps.applications,
    companies: deps.companies,
    totp: deps.totp,
  })
  const jobService = new JobService({ jobs: deps.jobs, companies: deps.companies })
  const applicationService = new ApplicationService({
    applications: deps.applications,
    jobs: deps.jobs,
    notes: deps.notes,
  })
  const auditService = new AuditService({ audits: deps.audits, hash: deps.hash })
  const pkiService = new PKIService({ userKeys: deps.userKeys })
  const messageService = new MessageService({ messages: deps.messages })
  const loginLimiter = new RedisSlidingWindowRateLimiter({
    store: deps.rateStore,
    clock: deps.clock,
    windowMs: 5 * 60 * 1000,
    maxRequests: 5,
  })
  const registerLimiter = new RedisSlidingWindowRateLimiter({
    store: deps.rateStore,
    clock: deps.clock,
    windowMs: 15 * 60 * 1000,
    maxRequests: 3,
  })

  app.post('/api/auth/register', async (c) => {
    try {
      const ip = c.req.header('x-forwarded-for') || 'unknown'
      const limit = await registerLimiter.check(`register:${ip}`)
      if (!limit.allowed) return c.json({ error: 'Too many requests' }, 429)
      const body = await c.req.json()
      const out = await authService.register({
        kind: 'USER',
        email: body.email,
        password: body.password,
        name: body.name,
      })
      return c.json({ qrCode: out.qrCode, userId: out.subjectId }, 200)
    } catch (e) {
      return handleError(e, c)
    }
  })

  app.post('/api/auth/login', async (c) => {
    try {
      const ip = c.req.header('x-forwarded-for') || 'unknown'
      const limit = await loginLimiter.check(`login:${ip}`)
      if (!limit.allowed) return c.json({ error: 'Too many requests' }, 429)
      const body = await c.req.json()
      const out = await authService.login({
        kind: 'USER',
        email: body.email,
        password: body.password,
      })
      return c.json(out, 200)
    } catch (e) {
      return handleError(e, c)
    }
  })

  app.post('/api/auth/2fa-login', async (c) => {
    try {
      const body = await c.req.json()
      const out = await authService.twoFactorLogin({
        kind: 'USER',
        subjectId: body.userId,
        token: body.token,
      })
      return c.json(out, 200)
    } catch (e) {
      return handleError(e, c)
    }
  })

  const protectedApi = new Hono()
  protectedApi.use('*', authMiddleware(deps.jwtSecret))

  protectedApi.get('/profile', async (c) => {
    const payload = c.get('jwtPayload') as { id: string }
    const user = await deps.users.findById(payload.id)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    return c.json(user, 200)
  })

  protectedApi.post('/resume/upload', async (c) => {
    try {
      const payload = c.get('jwtPayload') as { id: string }
      const body = await c.req.parseBody()
      const file = body['resume'] as File
      const buffer = Buffer.from(await file.arrayBuffer())
      const resume = await resumeService.upload({
        userId: payload.id,
        fileName: file.name,
        buffer,
      })
      return c.json(resume, 200)
    } catch (e) {
      return handleError(e, c)
    }
  })

  protectedApi.post('/application/:id/resume', async (c) => {
    try {
      const payload = c.get('jwtPayload') as { id: string; role: string }
      if (payload.role !== 'COMPANY') return c.json({ error: 'Forbidden' }, 403)
      const body = await c.req.json()
      const out = await resumeService.decryptForCompany({
        companyId: payload.id,
        applicationId: c.req.param('id'),
        otpToken: body.otpToken,
      })
      c.header('Content-Type', 'application/octet-stream')
      c.header('Content-Disposition', `attachment; filename="${out.resume.originalName}"`)
      return c.body(new Uint8Array(out.buffer))
    } catch (e) {
      return handleError(e, c)
    }
  })

  protectedApi.get('/admin/logs', async (c) => {
    const payload = c.get('jwtPayload') as { role: string }
    if (payload.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403)
    const logs = await deps.audits.listAsc()
    return c.json(logs, 200)
  })

  protectedApi.get('/admin/verify-logs', async (c) => {
    const out = await auditService.verifyChain()
    return c.json(out, 200)
  })

  app.route('/api', protectedApi)

  return {
    app,
    services: {
      authService,
      resumeService,
      jobService,
      applicationService,
      auditService,
      pkiService,
      messageService,
    },
  }
}
