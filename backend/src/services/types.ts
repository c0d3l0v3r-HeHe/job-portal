export type Role = 'USER' | 'COMPANY' | 'ADMIN'

export interface User {
  id: string
  email: string
  passwordHash: string
  name?: string | null
  role: Role
  totpSecret?: string | null
  totpEnabled: boolean
}

export interface Company {
  id: string
  name: string
  email: string
  passwordHash: string
  totpSecret?: string | null
  totpEnabled: boolean
}

export interface Resume {
  id: string
  userId: string
  encryptedFilePath: string
  iv: string
  originalName: string
  createdAt: Date
}

export interface Job {
  id: string
  title: string
  description: string
  location?: string | null
  isRemote: boolean
  jobType: string
  tags?: string | null
  companyId: string
}

export interface Application {
  id: string
  userId: string
  jobId: string
  status: string
  coverNote?: string | null
  signature?: string | null
}

export interface RecruiterNote {
  id: string
  note: string
  applicationId: string
  authorId: string
}

export interface Message {
  id: string
  senderId: string | null
  companyId: string | null
  conversationId: string
  encryptedText: string
  iv: string
  encryptedKey: string
}

export interface UserKey {
  id: string
  userId: string
  publicKey: string
}

export interface AuditLog {
  id: string
  action: string
  userId: string | null
  metadata: string
  prevHash: string
  hash: string
  createdAt: Date
}
