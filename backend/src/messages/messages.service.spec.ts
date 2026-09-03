import { MessagesService } from './messages.service';
import { ForbiddenException } from '@nestjs/common';

const createService = () =>
  new MessagesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

const runWithWriteConflictRetry = <T>(
  service: MessagesService,
  operation: () => Promise<T>,
) =>
  (
    service as unknown as {
      runWithWriteConflictRetry: (operation: () => Promise<T>) => Promise<T>;
    }
  ).runWithWriteConflictRetry(operation);

const assertSupplierCanSendToTicket = (
  service: MessagesService,
  tx: unknown,
  actorId = 'supplier-profile-1',
  supplierRequestId = 'request-1',
) =>
  (
    service as unknown as {
      assertSupplierCanSendToTicket: (
        tx: unknown,
        ticketId: string,
        actorId?: string,
        supplierRequestId?: string,
      ) => Promise<unknown>;
    }
  ).assertSupplierCanSendToTicket(
    tx,
    'ticket-1',
    actorId,
    supplierRequestId,
  );

describe('MessagesService write conflict retry', () => {
  it('retries a TicketRequestEvent sequence conflict', async () => {
    const service = createService();
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: {
          modelName: 'TicketRequestEvent',
          driverAdapterError: {
            cause: {
              constraint: {
                index: 'TicketRequestEvent_ticketId_sequence_key',
              },
            },
          },
        },
      })
      .mockResolvedValue('message-saved');

    await expect(runWithWriteConflictRetry(service, operation)).resolves.toBe(
      'message-saved',
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not hide an unrelated unique constraint error', async () => {
    const service = createService();
    const error = {
      code: 'P2002',
      meta: {
        modelName: 'Message',
        target: ['messageId'],
      },
    };
    const operation = jest.fn<Promise<string>, []>().mockRejectedValue(error);

    await expect(runWithWriteConflictRetry(service, operation)).rejects.toBe(
      error,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('stops after three sequence conflicts', async () => {
    const service = createService();
    const error = {
      code: 'P2002',
      meta: {
        modelName: 'TicketRequestEvent',
        target: ['ticketId_sequence'],
      },
    };
    const operation = jest.fn<Promise<string>, []>().mockRejectedValue(error);

    await expect(runWithWriteConflictRetry(service, operation)).rejects.toBe(
      error,
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

describe('MessagesService message idempotency', () => {
  it('returns the existing message for a repeated client message id', async () => {
    const existingMessage = {
      id: 'message-1',
      ticketId: 'ticket-1',
      messageId: 'client-message-1',
      content: 'Одинаковый ответ',
    };
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue(existingMessage),
      },
    };
    const service = new MessagesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create({
        ticketId: 'ticket-1',
        content: 'Одинаковый ответ',
        senderType: 'supplier',
        senderId: 'supplier-1',
        messageId: 'client-message-1',
      }),
    ).resolves.toBe(existingMessage);
    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { messageId: 'client-message-1' },
    });
  });
});

describe('MessagesService supplier request write guard', () => {
  const createTransaction = (request: {
    id: string;
    status: string;
    assignedSupplierProfileId: string | null;
  } | null) => ({
    ticket: {
      findUnique: jest.fn().mockResolvedValue({ conversationMode: 'manager' }),
    },
    supplierRequest: {
      findFirst: jest.fn().mockResolvedValue(request),
    },
  });

  it.each(['closed', 'resolved', 'cancelled'])(
    'rejects a supplier message after request status %s',
    async (status) => {
      const service = createService();
      const tx = createTransaction({
        id: 'request-1',
        status,
        assignedSupplierProfileId: 'supplier-profile-1',
      });

      await expect(assertSupplierCanSendToTicket(service, tx)).rejects.toThrow(
        new ForbiddenException(
          'Запрос поставщика уже завершён. Отправка сообщений недоступна.',
        ),
      );
    },
  );

  it('rejects a supplier who does not own the request', async () => {
    const service = createService();
    const tx = createTransaction({
      id: 'request-1',
      status: 'in_progress',
      assignedSupplierProfileId: 'supplier-profile-2',
    });

    await expect(assertSupplierCanSendToTicket(service, tx)).rejects.toThrow(
      'Запрос закреплён за другим сотрудником поставщика.',
    );
  });

  it('rejects a supplier message after the manager resolves the ticket', async () => {
    const service = createService();
    const tx = createTransaction({
      id: 'request-1',
      status: 'in_progress',
      assignedSupplierProfileId: 'supplier-profile-1',
    });
    tx.ticket.findUnique.mockResolvedValue({
      conversationMode: 'manager',
      status: 'resolved',
    });

    await expect(assertSupplierCanSendToTicket(service, tx)).rejects.toThrow(
      'Диалог уже завершён. Отправка сообщений недоступна.',
    );
  });

  it('allows the assigned supplier while the request is active', async () => {
    const service = createService();
    const request = {
      id: 'request-1',
      status: 'in_progress',
      assignedSupplierProfileId: 'supplier-profile-1',
    };
    const tx = createTransaction(request);

    await expect(assertSupplierCanSendToTicket(service, tx)).resolves.toEqual(
      request,
    );
  });
});
