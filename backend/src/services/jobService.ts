import type { ICompanyRepository, IJobRepository } from './interfaces'
import { ForbiddenError, ValidationError } from './errors'

export class JobService {
  constructor(
    private readonly deps: {
      jobs: IJobRepository
      companies: ICompanyRepository
    }
  ) {}

  async createJob(input: {
    requesterId: string
    title: string
    description: string
    location?: string
    isRemote?: boolean
    jobType?: string
    tags?: string
  }) {
    if (!input.title || !input.description) throw new ValidationError('title and description are required')
    const company = await this.deps.companies.findById(input.requesterId)
    if (!company) throw new ForbiddenError('Not a company account')
    return this.deps.jobs.create({
      title: input.title,
      description: input.description,
      location: input.location || null,
      isRemote: Boolean(input.isRemote),
      jobType: input.jobType || 'FULL_TIME',
      tags: input.tags || null,
      companyId: company.id,
    })
  }

  async listJobs(filters: {
    keyword?: string
    location?: string
    isRemote?: boolean
    type?: string
  }) {
    return this.deps.jobs.list(filters)
  }
}
