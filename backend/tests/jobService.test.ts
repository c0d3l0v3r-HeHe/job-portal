import { JobService } from '../src/services/jobService'
import { ForbiddenError } from '../src/services/errors'
import type { ICompanyRepository, IJobRepository } from '../src/services/interfaces'

describe('JobService', () => {
  let jobs: jest.Mocked<IJobRepository>
  let companies: jest.Mocked<ICompanyRepository>
  let service: JobService

  beforeEach(() => {
    jobs = { create: jest.fn(), findById: jest.fn(), list: jest.fn() }
    companies = { findByEmail: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn() }
    service = new JobService({ jobs, companies })
  })

  it('create job allows company only', async () => {
    companies.findById.mockResolvedValue(null)
    await expect(
      service.createJob({ requesterId: 'u1', title: 'T', description: 'D', location: 'KTM' })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('create job returns new job for company', async () => {
    companies.findById.mockResolvedValue({
      id: 'c1',
      name: 'C',
      email: 'c@test.com',
      passwordHash: 'h',
      totpEnabled: true,
      totpSecret: 's',
    })
    jobs.create.mockResolvedValue({
      id: 'j1',
      title: 'T',
      description: 'D',
      location: 'KTM',
      isRemote: true,
      jobType: 'FULL_TIME',
      tags: 'node',
      companyId: 'c1',
    })
    const out = await service.createJob({
      requesterId: 'c1',
      title: 'T',
      description: 'D',
      location: 'KTM',
      isRemote: true,
      tags: 'node',
    })
    expect(out.id).toBe('j1')
  })

  it('list jobs with filters', async () => {
    jobs.list.mockResolvedValue([])
    await service.listJobs({ keyword: 'node', location: 'KTM', isRemote: true, type: 'FULL_TIME' })
    expect(jobs.list).toHaveBeenCalledWith({ keyword: 'node', location: 'KTM', isRemote: true, type: 'FULL_TIME' })
  })
})
