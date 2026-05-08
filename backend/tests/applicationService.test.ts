import { ApplicationService } from '../src/services/applicationService'
import { ForbiddenError } from '../src/services/errors'
import type { IApplicationRepository, IJobRepository, IRecruiterNoteRepository } from '../src/services/interfaces'

describe('ApplicationService', () => {
  let applications: jest.Mocked<IApplicationRepository>
  let jobs: jest.Mocked<IJobRepository>
  let notes: jest.Mocked<IRecruiterNoteRepository>
  let service: ApplicationService

  beforeEach(() => {
    applications = {
      create: jest.fn(),
      findById: jest.fn(),
      listByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    jobs = { create: jest.fn(), findById: jest.fn(), list: jest.fn() }
    notes = { create: jest.fn() }
    service = new ApplicationService({ applications, jobs, notes })
  })

  it('apply with signature', async () => {
    jobs.findById.mockResolvedValue({
      id: 'j1',
      title: 'T',
      description: 'D',
      companyId: 'c1',
      isRemote: false,
      jobType: 'FULL_TIME',
    })
    applications.create.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      status: 'APPLIED',
      signature: 'sig',
      coverNote: 'x',
    })
    const out = await service.apply({ userId: 'u1', jobId: 'j1', signature: 'sig', coverNote: 'x' })
    expect(out.signature).toBe('sig')
  })

  it('withdraw allowed only for owner', async () => {
    applications.findById.mockResolvedValue({
      id: 'a1',
      userId: 'u2',
      jobId: 'j1',
      status: 'APPLIED',
      job: null,
    })
    await expect(service.withdraw({ userId: 'u1', applicationId: 'a1' })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('user cannot update application status (company only)', async () => {
    await expect(
      service.updateStatus({
        requesterId: 'u1',
        requesterRole: 'USER',
        applicationId: 'a1',
        status: 'REVIEWING',
      })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('company updates status only for owned job', async () => {
    applications.findById.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      status: 'APPLIED',
      job: {
        id: 'j1',
        title: 'T',
        description: 'D',
        companyId: 'c1',
        isRemote: false,
        jobType: 'FULL_TIME',
      },
    })
    applications.update.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      status: 'REVIEWING',
    })
    await expect(
      service.updateStatus({
        requesterId: 'c1',
        requesterRole: 'COMPANY',
        applicationId: 'a1',
        status: 'REVIEWING',
      })
    ).resolves.toEqual({
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      status: 'REVIEWING',
    })
  })

  it('add recruiter notes (company only)', async () => {
    notes.create.mockResolvedValue({ id: 'n1', applicationId: 'a1', authorId: 'c1', note: 'good fit' })
    await expect(
      service.addRecruiterNote({
        requesterId: 'c1',
        requesterRole: 'COMPANY',
        applicationId: 'a1',
        note: 'good fit',
      })
    ).resolves.toEqual({ id: 'n1', applicationId: 'a1', authorId: 'c1', note: 'good fit' })
  })
})
