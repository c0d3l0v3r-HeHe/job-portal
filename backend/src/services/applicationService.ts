import type {
  IApplicationRepository,
  IJobRepository,
  IRecruiterNoteRepository,
} from './interfaces'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'

export class ApplicationService {
  constructor(
    private readonly deps: {
      applications: IApplicationRepository
      jobs: IJobRepository
      notes: IRecruiterNoteRepository
    }
  ) {}

  async apply(input: {
    userId: string
    jobId: string
    coverNote?: string
    signature?: string
  }) {
    if (!input.jobId) throw new ValidationError('jobId is required')
    const job = await this.deps.jobs.findById(input.jobId)
    if (!job) throw new NotFoundError('Job not found')
    return this.deps.applications.create({
      userId: input.userId,
      jobId: input.jobId,
      coverNote: input.coverNote || '',
      signature: input.signature || null,
    })
  }

  async withdraw(input: { userId: string; applicationId: string }) {
    const app = await this.deps.applications.findById(input.applicationId)
    if (!app) throw new NotFoundError('Application not found')
    if (app.userId !== input.userId) throw new ForbiddenError('Forbidden')
    await this.deps.applications.delete(input.applicationId)
    return { message: 'Withdrawn' }
  }

  async updateStatus(input: {
    requesterId: string
    requesterRole: string
    applicationId: string
    status: string
  }) {
    if (input.requesterRole !== 'COMPANY') throw new ForbiddenError('Forbidden')
    const app = await this.deps.applications.findById(input.applicationId)
    if (!app?.job) throw new NotFoundError('Application not found')
    if (app.job.companyId !== input.requesterId) throw new ForbiddenError('Forbidden')
    return this.deps.applications.update(input.applicationId, { status: input.status })
  }

  async addRecruiterNote(input: {
    requesterId: string
    requesterRole: string
    applicationId: string
    note: string
  }) {
    if (input.requesterRole !== 'COMPANY') throw new ForbiddenError('Forbidden')
    return this.deps.notes.create({
      applicationId: input.applicationId,
      note: input.note,
      authorId: input.requesterId,
    })
  }
}
