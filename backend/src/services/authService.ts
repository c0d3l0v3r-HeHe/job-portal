import type {
  ICompanyRepository,
  IJwtSigner,
  IOtpLogRepository,
  IPasswordHasher,
  IQrCodeProvider,
  ITotpProvider,
  IUserRepository,
} from './interfaces'
import { UnauthorizedError, ValidationError } from './errors'

export class AuthService {
  constructor(
    private readonly deps: {
      users: IUserRepository
      companies: ICompanyRepository
      hasher: IPasswordHasher
      totp: ITotpProvider
      qr: IQrCodeProvider
      jwt: IJwtSigner
      otpLogs: IOtpLogRepository
    }
  ) {}

  async register(input: {
    kind: 'USER' | 'COMPANY'
    email: string
    password: string
    name?: string
  }) {
    const { kind, email, password, name } = input
    if (!email || !password) throw new ValidationError('email and password are required')

    if (kind === 'USER') {
      const existing = await this.deps.users.findByEmail(email)
      if (existing) throw new ValidationError('Email exists')
      const passwordHash = await this.deps.hasher.hash(password)
      const { secret, otpauth } = this.deps.totp.generateSecret(email)
      const user = await this.deps.users.create({
        email,
        passwordHash,
        name,
        role: 'USER',
        totpSecret: secret,
        totpEnabled: false,
      })
      const qrCode = await this.deps.qr.toDataURL(otpauth)
      return { qrCode, subjectId: user.id }
    }

    const existing = await this.deps.companies.findByEmail(email)
    if (existing) throw new ValidationError('Company already exists')
    const passwordHash = await this.deps.hasher.hash(password)
    const { secret, otpauth } = this.deps.totp.generateSecret(email)
    const company = await this.deps.companies.create({
      name: name || 'Company',
      email,
      passwordHash,
      totpSecret: secret,
      totpEnabled: false,
    })
    const qrCode = await this.deps.qr.toDataURL(otpauth)
    return { qrCode, subjectId: company.id }
  }

  async verifyRegistration2FA(input: { kind: 'USER' | 'COMPANY'; subjectId: string; token: string }) {
    const { kind, subjectId, token } = input
    const actor =
      kind === 'USER' ? await this.deps.users.findById(subjectId) : await this.deps.companies.findById(subjectId)
    if (!actor?.totpSecret) throw new ValidationError('Invalid')
    const valid = this.deps.totp.verify(token, actor.totpSecret)
    if (!valid) throw new ValidationError('Invalid OTP')
    if (kind === 'USER') await this.deps.users.update(subjectId, { totpEnabled: true })
    else await this.deps.companies.update(subjectId, { totpEnabled: true })
    return { message: 'Activated' }
  }

  async login(input: { kind: 'USER' | 'COMPANY'; email: string; password: string }) {
    const { kind, email, password } = input
    if (kind === 'USER') {
      const user = await this.deps.users.findByEmail(email)
      if (!user) throw new UnauthorizedError('Invalid')
      const match = await this.deps.hasher.verify(password, user.passwordHash)
      if (!match) throw new UnauthorizedError('Invalid')
      if (!user.totpEnabled) throw new UnauthorizedError('Enable 2FA first')
      return { requires2FA: true as const, subjectId: user.id }
    }
    const company = await this.deps.companies.findByEmail(email)
    if (!company) throw new UnauthorizedError('Invalid')
    const match = await this.deps.hasher.verify(password, company.passwordHash)
    if (!match) throw new UnauthorizedError('Invalid')
    if (!company.totpEnabled) throw new UnauthorizedError('Enable 2FA first')
    return { requires2FA: true as const, subjectId: company.id }
  }

  async twoFactorLogin(input: { kind: 'USER' | 'COMPANY'; subjectId: string; token: string }) {
    const { kind, subjectId, token } = input
    const replay = await this.deps.otpLogs.wasTokenUsed(subjectId, token)
    if (replay) throw new UnauthorizedError('OTP already used')

    const actor =
      kind === 'USER' ? await this.deps.users.findById(subjectId) : await this.deps.companies.findById(subjectId)
    if (!actor?.totpSecret) throw new ValidationError('Invalid')
    const valid = this.deps.totp.verify(token, actor.totpSecret)
    if (!valid) throw new UnauthorizedError('Invalid OTP')

    await this.deps.otpLogs.markTokenUsed(subjectId, token)
    const role = kind === 'USER' ? 'USER' : 'COMPANY'
    const tokenOut = await this.deps.jwt.sign({ id: actor.id, role })
    return { token: tokenOut, subjectId: actor.id }
  }
}
