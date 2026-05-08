import type {
  IApplicationRepository,
  ICompanyRepository,
  IFileCrypto,
  IResumeRepository,
} from './interfaces'
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors'
import type { ITotpProvider } from './interfaces'

export class ResumeService {
  constructor(
    private readonly deps: {
      resumes: IResumeRepository
      fileCrypto: IFileCrypto
      applications: IApplicationRepository
      companies: ICompanyRepository
      totp: ITotpProvider
    }
  ) {}

  async upload(input: { userId: string; fileName: string; buffer: Buffer }) {
    const { filepath, iv } = this.deps.fileCrypto.encryptFile(input.buffer, input.fileName)
    return this.deps.resumes.create({
      userId: input.userId,
      encryptedFilePath: filepath,
      iv,
      originalName: input.fileName,
    })
  }

  async decryptForCompany(input: { companyId: string; applicationId: string; otpToken: string }) {
    const company = await this.deps.companies.findById(input.companyId)
    if (!company) throw new NotFoundError('Company not found')
    if (company.totpEnabled && company.totpSecret) {
      const valid = this.deps.totp.verify(input.otpToken, company.totpSecret)
      if (!valid) throw new UnauthorizedError('Invalid authenticator code')
    }

    const application = await this.deps.applications.findById(input.applicationId)
    if (!application?.job) throw new NotFoundError('Application not found')
    if (application.job.companyId !== input.companyId) throw new ForbiddenError('Forbidden')

    const resume = await this.deps.resumes.findLatestByUserId(application.userId)
    if (!resume) throw new NotFoundError('Candidate has not uploaded a resume')
    const buffer = this.deps.fileCrypto.decryptFile(resume.encryptedFilePath, resume.iv)
    return { resume, buffer }
  }

  async delete(input: { userId: string; resumeId: string }) {
    const resume = await this.deps.resumes.findById(input.resumeId)
    if (!resume) throw new NotFoundError('Not found')
    if (resume.userId !== input.userId) throw new ForbiddenError('Forbidden')
    await this.deps.resumes.delete(input.resumeId)
    return { message: 'Deleted' }
  }
}
