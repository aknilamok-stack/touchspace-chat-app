import { ConflictException } from '@nestjs/common';
import { SupplierRequestsService } from './supplier-requests.service';

type RequestState = {
  id: string;
  ticketId: string;
  supplierId: string;
  supplierName: string;
  status: string;
  assignedSupplierProfileId: string | null;
  assignedSupplierProfileName: string | null;
  claimedAt: Date | null;
  claimRequiredAt: Date | null;
  claimMissedAt: Date | null;
};

const createHarness = (initialState: RequestState) => {
  let state = { ...initialState };
  const messageCreate = jest.fn().mockResolvedValue({ id: 'system-message' });
  const ticketUpdate = jest.fn().mockResolvedValue({});
  const supplierRequest = {
    findUnique: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...state })),
    findUniqueOrThrow: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...state })),
    updateMany: jest.fn().mockImplementation(({ where, data }) => {
      if (
        state.id !== where.id ||
        state.status !== where.status ||
        state.assignedSupplierProfileId !== where.assignedSupplierProfileId
      ) {
        return Promise.resolve({ count: 0 });
      }

      state = { ...state, ...data };
      return Promise.resolve({ count: 1 });
    }),
  };
  const tx = {
    supplierRequest,
    message: { create: messageCreate },
    ticket: { update: ticketUpdate },
  };
  const prisma = {
    profile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'supplier-maria',
        fullName: 'Мария',
        role: 'supplier',
        supplierId: 'supplier-company',
        companyName: 'Лесно',
      }),
    },
    $transaction: jest.fn().mockImplementation((operation) => operation(tx)),
  };
  const service = new SupplierRequestsService(
    prisma as never,
    {} as never,
    {} as never,
  );

  return { service, supplierRequest, messageCreate, ticketUpdate };
};

const baseRequest = (): RequestState => ({
  id: 'request-1',
  ticketId: 'ticket-1',
  supplierId: 'supplier-company',
  supplierName: 'Лесно',
  status: 'pending',
  assignedSupplierProfileId: null,
  assignedSupplierProfileName: null,
  claimedAt: null,
  claimRequiredAt: new Date('2026-08-13T10:00:00.000Z'),
  claimMissedAt: null,
});

const claimInput = {
  status: 'in_progress' as const,
  assignedSupplierProfileId: 'supplier-maria',
  assignedSupplierProfileName: 'Мария',
  claimOnly: true,
};

describe('SupplierRequestsService atomic claim', () => {
  it('claims a free request and creates one system message', async () => {
    const { service, messageCreate, ticketUpdate } =
      createHarness(baseRequest());

    const result = await service.updateStatus('request-1', claimInput);

    expect(result.assignedSupplierProfileId).toBe('supplier-maria');
    expect(result.status).toBe('in_progress');
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(ticketUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects another employee without creating a second event', async () => {
    const { service, messageCreate, ticketUpdate } = createHarness({
      ...baseRequest(),
      status: 'in_progress',
      assignedSupplierProfileId: 'supplier-petr',
      assignedSupplierProfileName: 'Петя',
    });

    await expect(service.updateStatus('request-1', claimInput)).rejects.toEqual(
      new ConflictException('Запрос уже взят в работу: Петя'),
    );
    expect(messageCreate).not.toHaveBeenCalled();
    expect(ticketUpdate).not.toHaveBeenCalled();
  });

  it('treats a repeated claim by the winner as idempotent', async () => {
    const { service, messageCreate } = createHarness({
      ...baseRequest(),
      status: 'in_progress',
      assignedSupplierProfileId: 'supplier-maria',
      assignedSupplierProfileName: 'Мария',
    });

    const result = await service.updateStatus('request-1', claimInput);

    expect(result.assignedSupplierProfileId).toBe('supplier-maria');
    expect(messageCreate).not.toHaveBeenCalled();
  });
});
