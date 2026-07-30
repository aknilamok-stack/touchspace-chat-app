import { calculateAnalyticsOverview } from './admin-analytics-overview';

const day = (value: string) => new Date(`${value}T09:00:00.000Z`);
const event = (
  id: string,
  createdAt: string,
  options?: {
    type?: string;
    resolvedAt?: string | null;
    topic?: string | null;
  },
) => ({
  id,
  ticketId: `ticket-${id}`,
  eventType: options?.type ?? 'initial',
  createdAt: day(createdAt),
  resolvedAt: options?.resolvedAt ? day(options.resolvedAt) : null,
  ticket: { topicCategory: options?.topic ?? null },
});

describe('calculateAnalyticsOverview', () => {
  const range = {
    from: new Date('2026-07-30T00:00:00.000Z'),
    to: new Date('2026-07-30T23:59:59.999Z'),
  };
  const formatDayKey = (value: Date) => value.toISOString().slice(0, 10);

  it('keeps the request cohort equation exact', () => {
    const result = calculateAnalyticsOverview({
      events: [
        event('1', '2026-07-30', { resolvedAt: '2026-07-30' }),
        event('2', '2026-07-30', { type: 'reopened' }),
        event('3', '2026-07-29', { resolvedAt: '2026-07-30' }),
      ],
      supplierRequests: [],
      range,
      now: range.to,
      formatDayKey,
    });

    expect(result.metrics.requests).toBe(2);
    expect(result.metrics.resolvedRequests).toBe(1);
    expect(result.metrics.openRequests).toBe(1);
    expect(
      result.metrics.resolvedRequests + result.metrics.openRequests,
    ).toBe(result.metrics.requests);
    expect(result.metrics.resolvedBacklog).toBe(1);
    expect(result.metrics.initialRequests).toBe(1);
    expect(result.metrics.repeatRequests).toBe(1);
  });

  it('attributes supplier work and topics to the matching request', () => {
    const result = calculateAnalyticsOverview({
      events: [
        event('1', '2026-07-30', {
          resolvedAt: '2026-07-30',
          topic: 'Счёт',
        }),
        event('2', '2026-07-30'),
      ],
      supplierRequests: [
        {
          ticketId: 'ticket-1',
          createdAt: new Date('2026-07-30T09:00:00.000Z'),
          responseBreached: true,
        },
        {
          ticketId: 'unrelated',
          createdAt: new Date('2026-07-30T10:00:00.000Z'),
          responseBreached: true,
        },
      ],
      range,
      now: range.to,
      formatDayKey,
    });

    expect(result.metrics.escalatedRequests).toBe(1);
    expect(result.metrics.escalatedSharePercent).toBe(50);
    expect(result.metrics.supplierRequests).toBe(1);
    expect(result.metrics.supplierOverdueRequests).toBe(1);
    expect(result.metrics.categorizedRequests).toBe(1);
    expect(result.metrics.uncategorizedRequests).toBe(1);
    expect(result.charts.topTopics).toEqual([
      { label: 'Счёт', count: 1 },
    ]);
  });
});
