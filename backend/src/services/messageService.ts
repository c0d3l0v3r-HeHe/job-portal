import type { IMessageRepository } from './interfaces'
import { ForbiddenError } from './errors'

export class MessageService {
  constructor(
    private readonly deps: {
      messages: IMessageRepository
    }
  ) {}

  async sendMessage(input: {
    senderId: string
    senderRole: string
    conversationId: string
    encryptedText: string
    iv: string
    encryptedKey: string
  }) {
    if (!['USER', 'COMPANY'].includes(input.senderRole)) {
      throw new ForbiddenError('Forbidden')
    }
    const isCompany = input.senderRole === 'COMPANY'
    return this.deps.messages.create({
      senderId: isCompany ? null : input.senderId,
      companyId: isCompany ? input.senderId : null,
      conversationId: input.conversationId,
      encryptedText: input.encryptedText,
      iv: input.iv,
      encryptedKey: input.encryptedKey,
    })
  }

  async fetchByConversationId(conversationId: string) {
    return this.deps.messages.findByConversationId(conversationId)
  }
}
