import { PKIService } from '../src/services/pkiService'
import type { IUserKeyRepository } from '../src/services/interfaces'

describe('PKIService', () => {
  let userKeys: jest.Mocked<IUserKeyRepository>
  let service: PKIService

  beforeEach(() => {
    userKeys = { upsert: jest.fn(), findLatestByUserId: jest.fn() }
    service = new PKIService({ userKeys })
  })

  it('register public key', async () => {
    userKeys.upsert.mockResolvedValue({ id: 'k1', userId: 'u1', publicKey: '{"k":"v"}' })
    await expect(service.registerPublicKey('u1', { k: 'v' })).resolves.toEqual({
      message: 'Key registered',
      keyId: 'k1',
    })
  })

  it('fetch public key', async () => {
    userKeys.findLatestByUserId.mockResolvedValue({ id: 'k1', userId: 'u1', publicKey: '{"k":"v"}' })
    await expect(service.fetchPublicKey('u1')).resolves.toEqual({ k: 'v' })
  })

  it('returns null when key not found', async () => {
    userKeys.findLatestByUserId.mockResolvedValue(null)
    await expect(service.fetchPublicKey('u1')).resolves.toBeNull()
  })
})
