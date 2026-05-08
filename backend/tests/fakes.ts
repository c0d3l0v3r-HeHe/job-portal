import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type {
  IApplicationRepository,
  IAuditRepository,
  IClock,
  ICompanyRepository,
  IFileCrypto,
  IHashProvider,
  IJobRepository,
  IMessageRepository,
  IOtpLogRepository,
  IPasswordHasher,
  IQrCodeProvider,
  IRecruiterNoteRepository,
  IResumeRepository,
  ISlidingWindowStore,
  ITotpProvider,
  IUserKeyRepository,
  IUserRepository,
} from '../src/services/interfaces'
import type {
  Application,
  AuditLog,
  Company,
  Job,
  Message,
  RecruiterNote,
  Resume,
  User,
  UserKey,
} from '../src/services/types'

const id = () => `id_${Math.random().toString(36).slice(2)}`

export class FakePrisma {
  users: User[] = []
  companies: Company[] = []
  resumes: Resume[] = []
  jobs: Job[] = []
  applications: (Application & { job?: Job | null })[] = []
  recruiterNotes: RecruiterNote[] = []
  auditLogs: AuditLog[] = []
  userKeys: UserKey[] = []
  messages: Message[] = []
  usedOtps: Array<{ subjectId: string; token: string }> = []
  rateMap = new Map<string, number[]>()
}

export class FakeUserRepository implements IUserRepository {
  constructor(private readonly db: FakePrisma) {}
  async findByEmail(email: string) {
    return this.db.users.find((u) => u.email === email) ?? null
  }
  async findById(userId: string) {
    return this.db.users.find((u) => u.id === userId) ?? null
  }
  async create(data: {
    email: string
    passwordHash: string
    name?: string
    role?: 'USER' | 'ADMIN'
    totpSecret?: string
    totpEnabled?: boolean
  }) {
    const row: User = {
      id: id(),
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name || null,
      role: data.role || 'USER',
      totpSecret: data.totpSecret || null,
      totpEnabled: data.totpEnabled ?? false,
    }
    this.db.users.push(row)
    return row
  }
  async update(userId: string, data: Partial<User>) {
    const idx = this.db.users.findIndex((u) => u.id === userId)
    this.db.users[idx] = { ...this.db.users[idx], ...data }
    return this.db.users[idx]
  }
}

export class FakeCompanyRepository implements ICompanyRepository {
  constructor(private readonly db: FakePrisma) {}
  async findByEmail(email: string) {
    return this.db.companies.find((c) => c.email === email) ?? null
  }
  async findById(companyId: string) {
    return this.db.companies.find((c) => c.id === companyId) ?? null
  }
  async create(data: {
    name: string
    email: string
    passwordHash: string
    totpSecret?: string
    totpEnabled?: boolean
  }) {
    const row: Company = {
      id: id(),
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      totpSecret: data.totpSecret || null,
      totpEnabled: data.totpEnabled ?? false,
    }
    this.db.companies.push(row)
    return row
  }
  async update(companyId: string, data: Partial<Company>) {
    const idx = this.db.companies.findIndex((c) => c.id === companyId)
    this.db.companies[idx] = { ...this.db.companies[idx], ...data }
    return this.db.companies[idx]
  }
}

export class FakeResumeRepository implements IResumeRepository {
  constructor(private readonly db: FakePrisma) {}
  async create(data: Omit<Resume, 'id' | 'createdAt'>) {
    const row: Resume = { ...data, id: id(), createdAt: new Date() }
    this.db.resumes.push(row)
    return row
  }
  async findById(resumeId: string) {
    return this.db.resumes.find((r) => r.id === resumeId) ?? null
  }
  async findLatestByUserId(userId: string) {
    return (
      this.db.resumes
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    )
  }
  async delete(resumeId: string) {
    this.db.resumes = this.db.resumes.filter((r) => r.id !== resumeId)
  }
}

export class FakeJobRepository implements IJobRepository {
  constructor(private readonly db: FakePrisma) {}
  async create(data: Omit<Job, 'id'>) {
    const row: Job = { ...data, id: id() }
    this.db.jobs.push(row)
    return row
  }
  async findById(jobId: string) {
    return this.db.jobs.find((j) => j.id === jobId) ?? null
  }
  async list(filters: { keyword?: string; location?: string; isRemote?: boolean; type?: string }) {
    return this.db.jobs.filter((j) => {
      const byKeyword = !filters.keyword || [j.title, j.tags || ''].join(' ').includes(filters.keyword)
      const byLocation = !filters.location || (j.location || '').includes(filters.location)
      const byRemote = filters.isRemote === undefined || j.isRemote === filters.isRemote
      const byType = !filters.type || j.jobType === filters.type
      return byKeyword && byLocation && byRemote && byType
    })
  }
}

export class FakeApplicationRepository implements IApplicationRepository {
  constructor(private readonly db: FakePrisma) {}
  async create(data: Omit<Application, 'id' | 'status'> & { status?: string }) {
    const row: Application = { ...data, id: id(), status: data.status || 'APPLIED' }
    this.db.applications.push(row)
    return row
  }
  async findById(applicationId: string) {
    const row = this.db.applications.find((a) => a.id === applicationId) ?? null
    if (!row) return null
    const job = this.db.jobs.find((j) => j.id === row.jobId) ?? null
    return { ...row, job }
  }
  async listByUserId(userId: string) {
    return this.db.applications.filter((a) => a.userId === userId)
  }
  async update(applicationId: string, data: Partial<Application>) {
    const idx = this.db.applications.findIndex((a) => a.id === applicationId)
    this.db.applications[idx] = { ...this.db.applications[idx], ...data }
    return this.db.applications[idx]
  }
  async delete(applicationId: string) {
    this.db.applications = this.db.applications.filter((a) => a.id !== applicationId)
  }
}

export class FakeRecruiterNoteRepository implements IRecruiterNoteRepository {
  constructor(private readonly db: FakePrisma) {}
  async create(data: Omit<RecruiterNote, 'id'>) {
    const row: RecruiterNote = { id: id(), ...data }
    this.db.recruiterNotes.push(row)
    return row
  }
}

export class FakeAuditRepository implements IAuditRepository {
  constructor(private readonly db: FakePrisma) {}
  async create(data: Omit<AuditLog, 'id' | 'createdAt'>) {
    const row: AuditLog = { id: id(), createdAt: new Date(), ...data }
    this.db.auditLogs.push(row)
    return row
  }
  async listAsc() {
    return [...this.db.auditLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
  async findLast() {
    return [...this.db.auditLogs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  }
}

export class FakeUserKeyRepository implements IUserKeyRepository {
  constructor(private readonly db: FakePrisma) {}
  async upsert(userId: string, publicKey: string) {
    const existing = this.db.userKeys.find((k) => k.userId === userId && k.publicKey === publicKey)
    if (existing) return existing
    const row: UserKey = { id: id(), userId, publicKey }
    this.db.userKeys.push(row)
    return row
  }
  async findLatestByUserId(userId: string) {
    return this.db.userKeys.filter((k) => k.userId === userId).slice(-1)[0] ?? null
  }
}

export class FakeMessageRepository implements IMessageRepository {
  constructor(private readonly db: FakePrisma) {}
  async create(data: Omit<Message, 'id'>) {
    const row: Message = { ...data, id: id() }
    this.db.messages.push(row)
    return row
  }
  async findByConversationId(conversationId: string) {
    return this.db.messages.filter((m) => m.conversationId === conversationId)
  }
}

export class FakeOtpLogRepository implements IOtpLogRepository {
  constructor(private readonly db: FakePrisma) {}
  async wasTokenUsed(subjectId: string, token: string) {
    return this.db.usedOtps.some((r) => r.subjectId === subjectId && r.token === token)
  }
  async markTokenUsed(subjectId: string, token: string) {
    this.db.usedOtps.push({ subjectId, token })
  }
}

export class FakePasswordHasher implements IPasswordHasher {
  async hash(input: string) {
    return `hashed:${input}`
  }
  async verify(input: string, hash: string) {
    return hash === `hashed:${input}`
  }
}

export class FakeTOTP implements ITotpProvider {
  verifyResponses = new Map<string, boolean>()
  generateSecret(subject: string) {
    return { secret: `secret-${subject}`, otpauth: `otpauth://${subject}` }
  }
  verify(token: string) {
    return this.verifyResponses.get(token) ?? false
  }
}

export class FakeQRCode implements IQrCodeProvider {
  async toDataURL(content: string) {
    return `data:image/png;base64,${Buffer.from(content).toString('base64')}`
  }
}

export class FakeCrypto implements IFileCrypto {
  baseDir: string
  constructor(baseDir?: string) {
    this.baseDir = baseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'resume-enc-'))
  }
  encryptFile(buffer: Buffer, originalName: string) {
    const key = crypto.createHash('sha256').update('test-key').digest().subarray(0, 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
    const filePath = path.join(this.baseDir, `${Date.now()}-${originalName}.enc`)
    fs.writeFileSync(filePath, encrypted)
    return { filepath: filePath, iv: iv.toString('hex') }
  }
  decryptFile(filePath: string, ivHex: string) {
    const key = crypto.createHash('sha256').update('test-key').digest().subarray(0, 32)
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = fs.readFileSync(filePath)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  }
}

export class FakeHashProvider implements IHashProvider {
  sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex')
  }
}

export class FakeClock implements IClock {
  private _now = 0
  now() {
    return this._now
  }
  set(ms: number) {
    this._now = ms
  }
  tick(ms: number) {
    this._now += ms
  }
}

export class FakeSlidingWindowStore implements ISlidingWindowStore {
  constructor(private readonly db: FakePrisma) {}
  async prune(key: string, beforeTs: number) {
    const points = this.db.rateMap.get(key) || []
    this.db.rateMap.set(
      key,
      points.filter((ts) => ts >= beforeTs)
    )
  }
  async countSince(key: string, sinceTs: number) {
    return (this.db.rateMap.get(key) || []).filter((ts) => ts >= sinceTs).length
  }
  async add(key: string, timestamp: number) {
    const points = this.db.rateMap.get(key) || []
    points.push(timestamp)
    this.db.rateMap.set(key, points)
  }
}

