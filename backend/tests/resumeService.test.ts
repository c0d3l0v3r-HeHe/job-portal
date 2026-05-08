import { ResumeService } from '../src/services/resumeService'
import { ForbiddenError, UnauthorizedError } from '../src/services/errors'
import type {
  IApplicationRepository,
  ICompanyRepository,
  IFileCrypto,
  IResumeRepository,
  ITotpProvider,
} from '../src/services/interfaces'

describe('ResumeService', () => {
  let resumes: jest.Mocked<IResumeRepository>
  let fileCrypto: jest.Mocked<IFileCrypto>
  let applications: jest.Mocked<IApplicationRepository>
  let companies: jest.Mocked<ICompanyRepository>
  let totp: jest.Mocked<ITotpProvider>
  let service: ResumeService

  beforeEach(() => {
    resumes = {
      create: jest.fn(),
      findById: jest.fn(),
      findLatestByUserId: jest.fn(),
      delete: jest.fn(),
    }
    fileCrypto = {
      encryptFile: jest.fn(),
      decryptFile: jest.fn(),
    }
    applications = {
      create: jest.fn(),
      findById: jest.fn(),
      listByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    companies = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    }
    totp = { generateSecret: jest.fn(), verify: jest.fn() }
    service = new ResumeService({ resumes, fileCrypto, applications, companies, totp })
  })

  it('uploads resume with encryption', async () => {
    fileCrypto.encryptFile.mockReturnValue({ filepath: '/tmp/f.enc', iv: 'abc' })
    resumes.create.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      encryptedFilePath: '/tmp/f.enc',
      iv: 'abc',
      originalName: 'cv.pdf',
      createdAt: new Date(),
    })
    const out = await service.upload({
      userId: 'u1',
      fileName: 'cv.pdf',
      buffer: Buffer.from('resume'),
    })
    expect(out.encryptedFilePath).toBe('/tmp/f.enc')
  })

  it('decrypts resume for company with valid 2FA and ownership', async () => {
    companies.findById.mockResolvedValue({
      id: 'c1',
      name: 'Company',
      email: 'c@x.com',
      passwordHash: 'h',
      totpEnabled: true,
      totpSecret: 'secret',
    })
    totp.verify.mockReturnValue(true)
    applications.findById.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      status: 'APPLIED',
      job: {
        id: 'j1',
        title: 't',
        description: 'd',
        companyId: 'c1',
        isRemote: false,
        jobType: 'FULL_TIME',
      },
    })
    resumes.findLatestByUserId.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      encryptedFilePath: '/tmp/x.enc',
      iv: 'iv',
      originalName: 'cv.pdf',
      createdAt: new Date(),
    })
    fileCrypto.decryptFile.mockReturnValue(Buffer.from('plain'))

    const out = await service.decryptForCompany({ companyId: 'c1', applicationId: 'a1', otpToken: '123456' })
    expect(out.buffer.toString()).toBe('plain')
  })

  it("company cannot view resume from job they don't own", async () => {
    companies.findById.mockResolvedValue({
      id: 'c1',
      name: 'Company',
      email: 'c@x.com',
      passwordHash: 'h',
      totpEnabled: false,
      totpSecret: null,
    })
    applications.findById.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      status: 'APPLIED',
      job: {
        id: 'j1',
        title: 't',
        description: 'd',
        companyId: 'c2',
        isRemote: false,
        jobType: 'FULL_TIME',
      },
    })
    await expect(
      service.decryptForCompany({ companyId: 'c1', applicationId: 'a1', otpToken: '123456' })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('fails with invalid OTP when 2FA is enabled', async () => {
    companies.findById.mockResolvedValue({
      id: 'c1',
      name: 'Company',
      email: 'c@x.com',
      passwordHash: 'h',
      totpEnabled: true,
      totpSecret: 'secret',
    })
    totp.verify.mockReturnValue(false)
    await expect(
      service.decryptForCompany({ companyId: 'c1', applicationId: 'a1', otpToken: 'bad' })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('delete enforces ownership', async () => {
    resumes.findById.mockResolvedValue({
      id: 'r1',
      userId: 'u2',
      encryptedFilePath: 'x',
      iv: 'iv',
      originalName: 'cv.pdf',
      createdAt: new Date(),
    })
    await expect(service.delete({ userId: 'u1', resumeId: 'r1' })).rejects.toBeInstanceOf(ForbiddenError)
  })
})
