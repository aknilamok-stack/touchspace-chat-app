import {
  formatMoscowDayKey,
  normalizeAdminDateRange,
} from './admin-date-range';

describe('admin Moscow date range', () => {
  const now = new Date('2026-07-30T09:30:00.000Z');

  it('starts today at Moscow midnight', () => {
    expect(normalizeAdminDateRange({ preset: 'today' }, now)).toEqual({
      from: new Date('2026-07-29T21:00:00.000Z'),
      to: now,
    });
  });

  it('uses the full previous Moscow calendar day', () => {
    expect(normalizeAdminDateRange({ preset: 'yesterday' }, now)).toEqual({
      from: new Date('2026-07-28T21:00:00.000Z'),
      to: new Date('2026-07-29T20:59:59.999Z'),
    });
  });

  it('interprets custom date-only boundaries in Moscow time', () => {
    expect(
      normalizeAdminDateRange(
        { dateFrom: '2026-07-01', dateTo: '2026-07-02' },
        now,
      ),
    ).toEqual({
      from: new Date('2026-06-30T21:00:00.000Z'),
      to: new Date('2026-07-02T20:59:59.999Z'),
    });
  });

  it('groups timestamps by their Moscow calendar date', () => {
    expect(formatMoscowDayKey(new Date('2026-07-29T22:00:00.000Z'))).toBe(
      '2026-07-30',
    );
  });
});
