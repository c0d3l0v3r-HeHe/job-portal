import { AuthService } from '../src/services/authService'
import { UnauthorizedError, ValidationError } from '../src/services/errors'
import type {
  ICompanyRepository,
  IJwtSigner,
  IOtpLogRepository,
  IPasswordHasher,
  IQrCodeProvider,
  ITotpProvider,
  IUserRepository,
} from '../src/services/interfaces'

describe('AuthService', () => {
  let users: jest.Mocked<IUserRepository>
  let companies: jest.Mocked<ICompanyRepository>
  let hasher: jest.Mocked<IPasswordHasher>
  let totp: jest.Mocked<ITotpProvider>
  let qr: jest.Mocked<IQrCodeProvider>
  let jwt: jest.Mocked<IJwtSigner>
  let otpLogs: jest.Mocked<IOtpLogRepository>
  let service: AuthService

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    }
    companies = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    }
    hasher = { hash: jest.fn(), verify: jest.fn() }
    totp = { generateSecret: jest.fn(), verify: jest.fn() }
    qr = { toDataURL: jest.fn() }
    jwt = { sign: jest.fn() }
    otpLogs = { wasTokenUsed: jest.fn(), markTokenUsed: jest.fn() }

    service = new AuthService({ users, companies, hasher, totp, qr, jwt, otpLogs })
  })

  it('registers user and returns qrCode', async () => {
    users.findByEmail.mockResolvedValue(null)
    hasher.hash.mockResolvedValue('hash')
    totp.generateSecret.mockReturnValue({ secret: 's', otpauth: 'o' })
    users.create.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'hash',
      role: 'USER',
      totpEnabled: false,
      totpSecret: 's',
      name: 'U',
    })
    qr.toDataURL.mockResolvedValue('qr')

    const out = await service.register({ kind: 'USER', email: 'u@test.com', password: 'pw', name: 'U' })
    expect(out).toEqual({ qrCode: 'qr', subjectId: 'u1' })
  })

  it('throws on duplicate user email', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'h',
      role: 'USER',
      totpEnabled: true,
      totpSecret: 's',
      name: 'x',
    })
    await expect(service.register({ kind: 'USER', email: 'u@test.com', password: 'pw' })).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it('registers company and returns qrCode', async () => {
    companies.findByEmail.mockResolvedValue(null)
    hasher.hash.mockResolvedValue('hash')
    totp.generateSecret.mockReturnValue({ secret: 's', otpauth: 'o' })
    companies.create.mockResolvedValue({
      id: 'c1',
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'hash',
      totpEnabled: false,
      totpSecret: 's',
    })
    qr.toDataURL.mockResolvedValue('qr')

    const out = await service.register({ kind: 'COMPANY', email: 'c@test.com', password: 'pw', name: 'C' })
    expect(out).toEqual({ qrCode: 'qr', subjectId: 'c1' })
  })

  it('login returns requires2FA for user', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'hash',
      role: 'USER',
      totpEnabled: true,
      totpSecret: 's',
      name: 'U',
    })
    hasher.verify.mockResolvedValue(true)
    await expect(service.login({ kind: 'USER', email: 'u@test.com', password: 'pw' })).resolves.toEqual({
      requires2FA: true,
      subjectId: 'u1',
    })
  })

  it('login throws on wrong password', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'hash',
      role: 'USER',
      totpEnabled: true,
      totpSecret: 's',
      name: 'U',
    })
    hasher.verify.mockResolvedValue(false)
    await expect(service.login({ kind: 'USER', email: 'u@test.com', password: 'bad' })).rejects.toBeInstanceOf(
      UnauthorizedError
    )
  })

  it('login returns requires2FA for company', async () => {
    companies.findByEmail.mockResolvedValue({
      id: 'c1',
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'hash',
      totpEnabled: true,
      totpSecret: 's',
    })
    hasher.verify.mockResolvedValue(true)
    await expect(service.login({ kind: 'COMPANY', email: 'c@test.com', password: 'pw' })).resolves.toEqual({
      requires2FA: true,
      subjectId: 'c1',
    })
  })

  it('verify-2fa activates user account', async () => {
    users.findById.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'h',
      role: 'USER',
      totpEnabled: false,
      totpSecret: 's',
      name: 'U',
    })
    totp.verify.mockReturnValue(true)
    users.update.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'h',
      role: 'USER',
      totpEnabled: true,
      totpSecret: 's',
      name: 'U',
    })
    await expect(
      service.verifyRegistration2FA({ kind: 'USER', subjectId: 'u1', token: '123456' })
    ).resolves.toEqual({ message: 'Activated' })
  })

  it('verify-2fa activates company account', async () => {
    companies.findById.mockResolvedValue({
      id: 'c1',
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'h',
      totpEnabled: false,
      totpSecret: 's',
    })
    totp.verify.mockReturnValue(true)
    companies.update.mockResolvedValue({
      id: 'c1',
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'h',
      totpEnabled: true,
      totpSecret: 's',
    })
    await expect(
      service.verifyRegistration2FA({ kind: 'COMPANY', subjectId: 'c1', token: '123456' })
    ).resolves.toEqual({ message: 'Activated' })
  })

  it('2fa-login returns jwt for valid OTP', async () => {
    otpLogs.wasTokenUsed.mockResolvedValue(false)
    users.findById.mockResolvedValue({
      id: 'u1',
      email: 'u@test.com',
      passwordHash: 'h',
      role: 'USER',
      totpEnabled: true,
      totpSecret: 's',
      name: 'U',
    })
    totp.verify.mockReturnValue(true)
    jwt.sign.mockResolvedValue('jwt-token')
    await expect(service.twoFactorLogin({ kind: 'USER', subjectId: 'u1', token: '123456' })).resolves.toEqual({
      token: 'jwt-token',
      subjectId: 'u1',
    })
  })

  it('2fa-login returns jwt for valid OTP (company)', async () => {
    otpLogs.wasTokenUsed.mockResolvedValue(false)
    companies.findById.mockResolvedValue({
      id: 'c1',
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'h',
      totpEnabled: true,
      totpSecret: 's',
    })
    totp.verify.mockReturnValue(true)
    jwt.sign.mockResolvedValue('jwt-company')
    await expect(service.twoFactorLogin({ kind: 'COMPANY', subjectId: 'c1', token: '123456' })).resolves.toEqual({
      token: 'jwt-company',
      subjectId: 'c1',
    })
  })

  it('rejects TOTP replay attack', async () => {
    otpLogs.wasTokenUsed.mockResolvedValue(true)
    await expect(service.twoFactorLogin({ kind: 'USER', subjectId: 'u1', token: '123456' })).rejects.toBeInstanceOf(
      UnauthorizedError
    )
  })
})
