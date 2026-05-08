import { AuditService } from '../src/services/auditService'
import { FakeHashProvider } from './fakes'
import type { IAuditRepository, IHashProvider } from '../src/services/interfaces'

describe('AuditService', () => {
  let audits: jest.Mocked<IAuditRepository>
  let hash: IHashProvider
  let service: AuditService

  beforeEach(() => {
    audits = {
      create: jest.fn(),
      listAsc: jest.fn(),
      findLast: jest.fn(),
    }
    hash = new FakeHashProvider()
    service = new AuditService({ audits, hash })
  })

  it('createAuditLog chains hash with prevHash', async () => {
    audits.findLast.mockResolvedValue({
      id: 'l1',
      action: 'LOGIN',
      userId: 'u1',
      metadata: '{"ok":true}',
      prevHash: 'GENESIS',
      hash: 'abc',
      createdAt: new Date(),
    })
    audits.create.mockImplementation(async (d) => ({ ...d, id: 'l2', createdAt: new Date() }))
    const out = await service.createAuditLog('UPLOAD', 'u1', { resumeId: 'r1' })
    expect(out.prevHash).toBe('abc')
    expect(out.hash).toBe(hash.sha256('UPLOAD' + JSON.stringify({ resumeId: 'r1' }) + 'abc'))
  })

  it('verifyChain passes on clean data', async () => {
    const h1 = hash.sha256('A' + '{"x":1}' + 'GENESIS')
    const h2 = hash.sha256('B' + '{"y":2}' + h1)
    audits.listAsc.mockResolvedValue([
      { id: '1', action: 'A', userId: null, metadata: '{"x":1}', prevHash: 'GENESIS', hash: h1, createdAt: new Date() },
      { id: '2', action: 'B', userId: null, metadata: '{"y":2}', prevHash: h1, hash: h2, createdAt: new Date() },
    ])
    await expect(service.verifyChain()).resolves.toEqual({ systemIntegrity: 'SECURE', tamperedLogId: null })
  })

  it('verifyChain detects tampering when a field is modified', async () => {
    const h1 = hash.sha256('A' + '{"x":1}' + 'GENESIS')
    const h2 = hash.sha256('B' + '{"y":2}' + h1)
    audits.listAsc.mockResolvedValue([
      { id: '1', action: 'A', userId: null, metadata: '{"x":1}', prevHash: 'GENESIS', hash: h1, createdAt: new Date() },
      { id: '2', action: 'B', userId: null, metadata: '{"y":999}', prevHash: h1, hash: h2, createdAt: new Date() },
    ])
    await expect(service.verifyChain()).resolves.toEqual({ systemIntegrity: 'COMPROMISED', tamperedLogId: '2' })
  })
})
