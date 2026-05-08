import { MessageService } from '../src/services/messageService'
import type { IMessageRepository } from '../src/services/interfaces'

describe('MessageService', () => {
  let messages: jest.Mocked<IMessageRepository>
  let service: MessageService

  beforeEach(() => {
    messages = { create: jest.fn(), findByConversationId: jest.fn() }
    service = new MessageService({ messages })
  })

  it('send message as user', async () => {
    messages.create.mockResolvedValue({
      id: 'm1',
      senderId: 'u1',
      companyId: null,
      conversationId: 'c1',
      encryptedText: 'x',
      iv: 'iv',
      encryptedKey: 'k',
    })
    const out = await service.sendMessage({
      senderId: 'u1',
      senderRole: 'USER',
      conversationId: 'c1',
      encryptedText: 'x',
      iv: 'iv',
      encryptedKey: 'k',
    })
    expect(out.senderId).toBe('u1')
  })

  it('send message as company', async () => {
    messages.create.mockResolvedValue({
      id: 'm1',
      senderId: null,
      companyId: 'co1',
      conversationId: 'c1',
      encryptedText: 'x',
      iv: 'iv',
      encryptedKey: 'k',
    })
    const out = await service.sendMessage({
      senderId: 'co1',
      senderRole: 'COMPANY',
      conversationId: 'c1',
      encryptedText: 'x',
      iv: 'iv',
      encryptedKey: 'k',
    })
    expect(out.companyId).toBe('co1')
  })

  it('fetch messages by conversationId', async () => {
    messages.findByConversationId.mockResolvedValue([])
    await service.fetchByConversationId('c1')
    expect(messages.findByConversationId).toHaveBeenCalledWith('c1')
  })
})
