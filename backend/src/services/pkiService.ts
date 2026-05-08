import type { IUserKeyRepository } from './interfaces'

export class PKIService {
  constructor(
    private readonly deps: {
      userKeys: IUserKeyRepository
    }
  ) {}

  async registerPublicKey(userId: string, publicKey: unknown) {
    const key = await this.deps.userKeys.upsert(userId, JSON.stringify(publicKey))
    return { message: 'Key registered', keyId: key.id }
  }

  async fetchPublicKey(userId: string) {
    const key = await this.deps.userKeys.findLatestByUserId(userId)
    if (!key) return null
    return JSON.parse(key.publicKey)
  }
}
