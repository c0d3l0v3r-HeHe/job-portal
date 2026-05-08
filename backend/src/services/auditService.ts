import type { IAuditRepository, IHashProvider } from './interfaces'

export class AuditService {
  constructor(
    private readonly deps: {
      audits: IAuditRepository
      hash: IHashProvider
    }
  ) {}

  async createAuditLog(action: string, userId: string | null, metadata: Record<string, unknown>) {
    const last = await this.deps.audits.findLast()
    const prevHash = last ? last.hash : 'GENESIS'
    const metadataString = JSON.stringify(metadata)
    const hash = this.deps.hash.sha256(action + metadataString + prevHash)
    return this.deps.audits.create({
      action,
      userId,
      metadata: metadataString,
      prevHash,
      hash,
    })
  }

  async verifyChain() {
    const logs = await this.deps.audits.listAsc()
    for (let i = 0; i < logs.length; i++) {
      const prevHash = i === 0 ? 'GENESIS' : logs[i - 1].hash
      const expected = this.deps.hash.sha256(logs[i].action + logs[i].metadata + prevHash)
      if (expected !== logs[i].hash) {
        return { systemIntegrity: 'COMPROMISED' as const, tamperedLogId: logs[i].id }
      }
    }
    return { systemIntegrity: 'SECURE' as const, tamperedLogId: null }
  }
}
