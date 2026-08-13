import { MessagesService } from './messages.service';

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
