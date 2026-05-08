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
} from './types'

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  create(data: {
    email: string
    passwordHash: string
    name?: string
    role?: 'USER' | 'ADMIN'
    totpSecret?: string
    totpEnabled?: boolean
  }): Promise<User>
  update(id: string, data: Partial<User>): Promise<User>
}

export interface ICompanyRepository {
  findByEmail(email: string): Promise<Company | null>
  findById(id: string): Promise<Company | null>
  create(data: {
    name: string
    email: string
    passwordHash: string
    totpSecret?: string
    totpEnabled?: boolean
  }): Promise<Company>
  update(id: string, data: Partial<Company>): Promise<Company>
}

export interface IResumeRepository {
  create(data: Omit<Resume, 'id' | 'createdAt'>): Promise<Resume>
  findById(id: string): Promise<Resume | null>
  findLatestByUserId(userId: string): Promise<Resume | null>
  delete(id: string): Promise<void>
}

export interface IJobRepository {
  create(data: Omit<Job, 'id'>): Promise<Job>
  findById(id: string): Promise<Job | null>
  list(filters: {
    keyword?: string
    location?: string
    isRemote?: boolean
    type?: string
  }): Promise<Job[]>
}

export interface IApplicationRepository {
  create(data: Omit<Application, 'id' | 'status'> & { status?: string }): Promise<Application>
  findById(id: string): Promise<(Application & { job?: Job | null }) | null>
  listByUserId(userId: string): Promise<Application[]>
  update(id: string, data: Partial<Application>): Promise<Application>
  delete(id: string): Promise<void>
}

export interface IRecruiterNoteRepository {
  create(data: Omit<RecruiterNote, 'id'>): Promise<RecruiterNote>
}

export interface IAuditRepository {
  create(data: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>
  listAsc(): Promise<AuditLog[]>
  findLast(): Promise<AuditLog | null>
}

export interface IUserKeyRepository {
  upsert(userId: string, publicKey: string): Promise<UserKey>
  findLatestByUserId(userId: string): Promise<UserKey | null>
}

export interface IMessageRepository {
  create(data: Omit<Message, 'id'>): Promise<Message>
  findByConversationId(conversationId: string): Promise<Message[]>
}

export interface IOtpLogRepository {
  wasTokenUsed(subjectId: string, token: string): Promise<boolean>
  markTokenUsed(subjectId: string, token: string): Promise<void>
}

export interface IPasswordHasher {
  hash(input: string): Promise<string>
  verify(input: string, hash: string): Promise<boolean>
}

export interface ITotpProvider {
  generateSecret(subject: string): { secret: string; otpauth: string }
  verify(token: string, secret: string): boolean
}

export interface IQrCodeProvider {
  toDataURL(content: string): Promise<string>
}

export interface IJwtSigner {
  sign(payload: Record<string, unknown>): Promise<string>
}

export interface IFileCrypto {
  encryptFile(buffer: Buffer, originalName: string): { filepath: string; iv: string }
  decryptFile(filePath: string, ivHex: string): Buffer
}

export interface IHashProvider {
  sha256(input: string): string
}

export interface IClock {
  now(): number
}

export interface ISlidingWindowStore {
  prune(key: string, beforeTs: number): Promise<void>
  countSince(key: string, sinceTs: number): Promise<number>
  add(key: string, timestamp: number): Promise<void>
}
