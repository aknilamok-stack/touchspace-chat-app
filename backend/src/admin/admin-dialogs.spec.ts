import { AdminService } from './admin.service';

const createService = () =>
  new AdminService({} as never, {} as never, {} as never);

describe('AdminService dialog data rules', () => {
  it('shows all active dialogs without a created-at period restriction', () => {
    const service = createService();
    const where = (service as any).buildDialogsWhere({
      scope: 'active',
      preset: 'week',
    });

    expect(where.status).toEqual({
      notIn: ['resolved', 'closed'],
    });
    expect(where.createdAt).toBeUndefined();
    expect(where.requestEvents).toBeUndefined();
  });

  it('selects historical dialogs by request events in the period', () => {
    const service = createService();
    const where = (service as any).buildDialogsWhere({
      scope: 'history',
      preset: 'today',
    });

    expect(where.createdAt).toBeUndefined();
    expect(where.requestEvents?.some?.createdAt?.gte).toBeInstanceOf(Date);
    expect(where.requestEvents?.some?.createdAt?.lte).toBeInstanceOf(Date);
  });

  it('combines supplier and SLA filters instead of overwriting either one', () => {
    const service = createService();
    const where = (service as any).buildDialogsWhere({
      scope: 'active',
      supplierId: 'supplier-1',
      supplierEscalated: 'true',
      slaBreached: 'true',
    });

    expect(where.AND).toHaveLength(3);
    expect(where.AND[0].OR).toBeDefined();
    expect(where.AND[1].OR).toBeDefined();
    expect(where.AND[2].OR).toBeDefined();
  });

  it('uses stable client identifiers and never joins by a shared display name', () => {
    const service = createService();
    const byClientId = (service as any).buildClientDialogWhere({
      id: 'ticket-1',
      clientId: 'client-1',
      canonicalEmail: 'other@example.com',
      tradePointExternalId: 'trade-point-1',
      clientName: 'Одинаковое имя',
    });
    const byEmail = (service as any).buildClientDialogWhere({
      id: 'ticket-2',
      canonicalEmail: 'CLIENT@EXAMPLE.COM',
      clientName: 'Одинаковое имя',
    });
    const fallback = (service as any).buildClientDialogWhere({
      id: 'ticket-3',
      clientName: 'Одинаковое имя',
      tradePointName: 'Одинаковая торговая точка',
    });

    expect(byClientId).toEqual({ clientId: 'client-1' });
    expect(byEmail.OR).toEqual([
      { canonicalEmail: 'client@example.com' },
      { clientEmail: 'client@example.com' },
      { currentUserEmail: 'client@example.com' },
    ]);
    expect(fallback).toEqual({ id: 'ticket-3' });
  });

  it('limits and paginates the dialog list on the server', async () => {
    const prisma = {
      ticket: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(75),
      },
    };
    const service = new AdminService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.getDialogs({
      scope: 'active',
      page: '2',
      pageSize: '30',
    });

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 30,
        take: 30,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 30,
      total: 75,
      totalPages: 3,
    });
  });
});
