import {
  buildSupplierDialogWorkbook,
  calculateSupplierDialogExportMetrics,
  getSupplierDialogLabel,
  isInsideSupplierRequestWindow,
  type SupplierDialogExportRequest,
} from './admin-supplier-dialog-export';
import { strFromU8, unzipSync } from 'fflate';

const request = (overrides: Partial<SupplierDialogExportRequest> = {}) => ({
  id: 'request-1',
  ticketId: 'ticket-1',
  dialogTitle: 'Диалог',
  clientName: 'Клиент',
  supplierName: 'Поставщик',
  supplierEmployeeName: 'Сотрудник',
  managerName: 'Менеджер',
  requestText: 'Проверьте заказ',
  status: 'closed',
  createdAt: new Date('2026-08-01T09:00:00.000Z'),
  claimedAt: new Date('2026-08-01T09:10:00.000Z'),
  firstResponseAt: new Date('2026-08-01T09:20:00.000Z'),
  closedAt: new Date('2026-08-01T10:10:00.000Z'),
  responseBreached: false,
  messages: [],
  ...overrides,
});

describe('supplier dialog export', () => {
  it('calculates only completed intervals in averages', () => {
    const metrics = calculateSupplierDialogExportMetrics([
      request(),
      request({
        id: 'request-2',
        claimedAt: null,
        firstResponseAt: null,
        closedAt: null,
        responseBreached: true,
      }),
    ]);

    expect(metrics.totalRequests).toBe(2);
    expect(metrics.closedRequests).toBe(1);
    expect(metrics.openRequests).toBe(1);
    expect(metrics.overdueRequests).toBe(1);
    expect(metrics.avgClaimMs).toBe(10 * 60_000);
    expect(metrics.avgFirstResponseMs).toBe(20 * 60_000);
    expect(metrics.avgWorkMs).toBe(60 * 60_000);
    expect(metrics.avgTotalMs).toBe(70 * 60_000);
  });

  it('creates a real xlsx workbook with three sheets', async () => {
    const buffer = await buildSupplierDialogWorkbook({
      period: {
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-01T23:59:59.999Z'),
      },
      generatedAt: new Date('2026-08-02T09:00:00.000Z'),
      supplierName: null,
      requests: [request()],
    });

    expect(Buffer.from(buffer).subarray(0, 2).toString()).toBe('PK');
    expect(Buffer.from(buffer).length).toBeGreaterThan(5000);

    const files = unzipSync(buffer);
    const workbookXml = strFromU8(files['xl/workbook.xml']);
    const requestsXml = strFromU8(files['xl/worksheets/sheet2.xml']);
    const messagesXml = strFromU8(files['xl/worksheets/sheet3.xml']);

    expect(workbookXml).toContain('name="Сводка"');
    expect(workbookXml).toContain('name="Запросы"');
    expect(workbookXml).toContain('name="Переписка"');
    expect(requestsXml).toContain('Проверьте заказ');
    expect(messagesXml).toContain('Проверьте заказ');
    expect(requestsXml).not.toContain('ID запроса');
    expect(messagesXml).toContain('Диалог 1 из 1');
    expect(messagesXml).toContain('Время');
    expect(messagesXml).toContain('Участник');
    expect(messagesXml).not.toContain('ID запроса');
  });

  it('replaces local file links with a useful dialog label', () => {
    expect(
      getSupplierDialogLabel(
        'file:///C:/Users/%D0%A2%D0%B8%D0%BC%D1%83%D1%80/',
        'Торговая точка «Львовская»',
      ),
    ).toBe('Торговая точка «Львовская»');
    expect(getSupplierDialogLabel('Заказ 13605', 'Клиент')).toBe('Заказ 13605');
  });

  it('cuts correspondence at supplier close or report generation time', () => {
    const startedAt = new Date('2026-08-01T09:00:00.000Z');
    const closedAt = new Date('2026-08-01T10:00:00.000Z');
    const generatedAt = new Date('2026-08-01T12:00:00.000Z');

    expect(
      isInsideSupplierRequestWindow(
        new Date('2026-08-01T09:30:00.000Z'),
        startedAt,
        closedAt,
        generatedAt,
      ),
    ).toBe(true);
    expect(
      isInsideSupplierRequestWindow(
        new Date('2026-08-01T10:01:00.000Z'),
        startedAt,
        closedAt,
        generatedAt,
      ),
    ).toBe(false);
    expect(
      isInsideSupplierRequestWindow(
        new Date('2026-08-01T11:00:00.000Z'),
        startedAt,
        null,
        generatedAt,
      ),
    ).toBe(true);
  });
});
