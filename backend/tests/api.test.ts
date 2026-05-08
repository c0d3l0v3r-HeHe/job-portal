import { createApp } from '../src/app'
import { sign } from 'hono/jwt'
import {
  FakeApplicationRepository,
  FakeAuditRepository,
  FakeClock,
  FakeCompanyRepository,
  FakeCrypto,
  FakeHashProvider,
  FakeJobRepository,
  FakeMessageRepository,
  FakeOtpLogRepository,
  FakePasswordHasher,
  FakePrisma,
  FakeQRCode,
  FakeRecruiterNoteRepository,
  FakeResumeRepository,
  FakeSlidingWindowStore,
  FakeTOTP,
  FakeUserKeyRepository,
  FakeUserRepository,
} from './fakes'

describe('API integration', () => {
  let db: FakePrisma
  let totp: FakeTOTP
  let app: ReturnType<typeof createApp>['app']
  const jwtSecret = 'test-secret'

  const makeToken = async (id: string, role: string) => sign({ id, role }, jwtSecret)

  beforeEach(() => {
    db = new FakePrisma()
    totp = new FakeTOTP()
    const userRepo = new FakeUserRepository(db)
    const companyRepo = new FakeCompanyRepository(db)
    const appRepo = new FakeApplicationRepository(db)
    app = createApp({
      users: userRepo,
      companies: companyRepo,
      resumes: new FakeResumeRepository(db),
      jobs: new FakeJobRepository(db),
      applications: appRepo,
      notes: new FakeRecruiterNoteRepository(db),
      audits: new FakeAuditRepository(db),
      userKeys: new FakeUserKeyRepository(db),
      messages: new FakeMessageRepository(db),
      otpLogs: new FakeOtpLogRepository(db),
      hasher: new FakePasswordHasher(),
      totp,
      qr: new FakeQRCode(),
      fileCrypto: new FakeCrypto(),
      hash: new FakeHashProvider(),
      clock: new FakeClock(),
      rateStore: new FakeSlidingWindowStore(db),
      jwtSecret,
    }).app
  })

  it('POST /api/auth/register -> 200 with qrCode', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.qrCode).toBeDefined()
  })

  it('POST /api/auth/register -> 400 on duplicate email', async () => {
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/auth/login -> requires2FA true on valid credentials', async () => {
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    const { userId } = await reg.json()
    const user = db.users.find((u) => u.id === userId)!
    user.totpEnabled = true

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).requires2FA).toBe(true)
  })

  it('POST /api/auth/login -> 401 on wrong password', async () => {
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    const { userId } = await reg.json()
    db.users.find((u) => u.id === userId)!.totpEnabled = true
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'bad' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/2fa-login -> 200 with JWT on valid OTP', async () => {
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    const { userId } = await reg.json()
    db.users.find((u) => u.id === userId)!.totpEnabled = true
    totp.verifyResponses.set('123456', true)
    const res = await app.request('/api/auth/2fa-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, token: '123456' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).token).toBeDefined()
  })

  it('POST /api/auth/2fa-login -> 401 on invalid OTP', async () => {
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    const { userId } = await reg.json()
    db.users.find((u) => u.id === userId)!.totpEnabled = true
    totp.verifyResponses.set('bad', false)
    const res = await app.request('/api/auth/2fa-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, token: 'bad' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/login -> 429 after exceeding rate limit', async () => {
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'pw', name: 'U' }),
    })
    db.users[0].totpEnabled = true
    for (let i = 0; i < 5; i++) {
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
        body: JSON.stringify({ email: 'u@test.com', password: 'bad' }),
      })
    }
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
      body: JSON.stringify({ email: 'u@test.com', password: 'bad' }),
    })
    expect(res.status).toBe(429)
  })

  it('POST /api/auth/register -> 429 after exceeding rate limit', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
        body: JSON.stringify({ email: `u${i}@test.com`, password: 'pw', name: 'U' }),
      })
    }
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
      body: JSON.stringify({ email: 'u4@test.com', password: 'pw', name: 'U' }),
    })
    expect(res.status).toBe(429)
  })

  it('GET /api/profile -> 200 with user data when authenticated', async () => {
    const user = await new FakeUserRepository(db).create({
      email: 'u@test.com',
      passwordHash: 'hashed:pw',
      role: 'USER',
      totpEnabled: true,
    })
    const token = await makeToken(user.id, 'USER')
    const res = await app.request('/api/profile', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  it('GET /api/profile -> 401 when no token', async () => {
    const res = await app.request('/api/profile')
    expect(res.status).toBe(401)
  })

  it('POST /api/resume/upload -> 200 and file encrypted on disk', async () => {
    const user = await new FakeUserRepository(db).create({
      email: 'u@test.com',
      passwordHash: 'hashed:pw',
      role: 'USER',
      totpEnabled: true,
    })
    const token = await makeToken(user.id, 'USER')
    const fd = new FormData()
    fd.set('resume', new File([Buffer.from('resume-content')], 'resume.pdf', { type: 'application/pdf' }))
    const res = await app.request('/api/resume/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.encryptedFilePath.endsWith('.enc')).toBe(true)
  })

  it('POST /api/application/:id/resume -> 401 without valid OTP', async () => {
    const company = await new FakeCompanyRepository(db).create({
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'h',
      totpEnabled: true,
      totpSecret: 'secret-c',
    })
    const job = await new FakeJobRepository(db).create({
      title: 'T',
      description: 'D',
      companyId: company.id,
      isRemote: false,
      jobType: 'FULL_TIME',
      location: null,
      tags: null,
    })
    const user = await new FakeUserRepository(db).create({
      email: 'u@test.com',
      passwordHash: 'hashed:pw',
      role: 'USER',
      totpEnabled: true,
    })
    await new FakeResumeRepository(db).create({
      userId: user.id,
      encryptedFilePath: new FakeCrypto().encryptFile(Buffer.from('hello'), 'r.pdf').filepath,
      iv: new FakeCrypto().encryptFile(Buffer.from('hello'), 'r.pdf').iv,
      originalName: 'r.pdf',
    })
    await new FakeApplicationRepository(db).create({ userId: user.id, jobId: job.id, coverNote: '', signature: null })
    const token = await makeToken(company.id, 'COMPANY')
    totp.verifyResponses.set('bad', false)
    const res = await app.request(`/api/application/${db.applications[0].id}/resume`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ otpToken: 'bad' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/application/:id/resume -> 403 if not company role', async () => {
    const user = await new FakeUserRepository(db).create({
      email: 'u@test.com',
      passwordHash: 'hashed:pw',
      role: 'USER',
      totpEnabled: true,
    })
    const token = await makeToken(user.id, 'USER')
    const res = await app.request('/api/application/a1/resume', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ otpToken: '123456' }),
    })
    expect(res.status).toBe(403)
  })

  it('GET /api/admin/logs -> 403 if not ADMIN role', async () => {
    const user = await new FakeUserRepository(db).create({
      email: 'u@test.com',
      passwordHash: 'hashed:pw',
      role: 'USER',
      totpEnabled: true,
    })
    const token = await makeToken(user.id, 'USER')
    const res = await app.request('/api/admin/logs', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  })

  it('GET /api/admin/verify-logs -> returns SECURE on clean chain', async () => {
    const hash = new FakeHashProvider()
    const h1 = hash.sha256('A' + '{"x":1}' + 'GENESIS')
    const h2 = hash.sha256('B' + '{"y":2}' + h1)
    db.auditLogs.push(
      { id: '1', action: 'A', userId: null, metadata: '{"x":1}', prevHash: 'GENESIS', hash: h1, createdAt: new Date(1) },
      { id: '2', action: 'B', userId: null, metadata: '{"y":2}', prevHash: h1, hash: h2, createdAt: new Date(2) }
    )
    const token = await makeToken('admin', 'ADMIN')
    const res = await app.request('/api/admin/verify-logs', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).systemIntegrity).toBe('SECURE')
  })

  it('GET /api/admin/verify-logs -> returns COMPROMISED on tampered log', async () => {
    const hash = new FakeHashProvider()
    const h1 = hash.sha256('A' + '{"x":1}' + 'GENESIS')
    const h2 = hash.sha256('B' + '{"y":2}' + h1)
    db.auditLogs.push(
      { id: '1', action: 'A', userId: null, metadata: '{"x":1}', prevHash: 'GENESIS', hash: h1, createdAt: new Date(1) },
      { id: '2', action: 'B', userId: null, metadata: '{"y":999}', prevHash: h1, hash: h2, createdAt: new Date(2) }
    )
    const token = await makeToken('admin', 'ADMIN')
    const res = await app.request('/api/admin/verify-logs', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).systemIntegrity).toBe('COMPROMISED')
  })
})
