import {
  isExcludedAnalyticsSupplier,
  isExcludedAnalyticsTicket,
  isIncludedAnalyticsManager,
} from './admin-analytics-exclusions';

describe('admin analytics exclusions', () => {
  it('keeps only the three approved managers', () => {
    expect(isIncludedAnalyticsManager('manual_1781790161531')).toBe(true);
    expect(isIncludedAnalyticsManager('manual_1781788292393')).toBe(true);
    expect(isIncludedAnalyticsManager('manual_1781777826812')).toBe(true);
    expect(isIncludedAnalyticsManager('manual_1782735391603')).toBe(false);
    expect(isIncludedAnalyticsManager('manual_1775737251960')).toBe(false);
  });

  it('excludes Lapik dialogs by stable client id and name fallback', () => {
    expect(isExcludedAnalyticsTicket({ clientId: '2198' })).toBe(true);
    expect(
      isExcludedAnalyticsTicket({
        tradePointName: 'Лапик А.Л./Круглов М. М.',
      }),
    ).toBe(true);
    expect(
      isExcludedAnalyticsTicket({
        clientId: 'real-client',
        assignedManagerId: 'manual_1781790161531',
      }),
    ).toBe(false);
  });

  it('excludes unapproved manager activity from analytics', () => {
    expect(
      isExcludedAnalyticsTicket({
        assignedManagerId: 'manual_1782735391603',
      }),
    ).toBe(true);
    expect(
      isExcludedAnalyticsTicket({
        lastResolvedByManagerId: 'manual_1775737251960',
      }),
    ).toBe(true);
  });

  it('excludes test, flooring and healthcheck suppliers', () => {
    expect(isExcludedAnalyticsSupplier({ id: 'healthcheck' })).toBe(true);
    expect(isExcludedAnalyticsSupplier({ id: 'manual_1782212848989' })).toBe(
      true,
    );
    expect(isExcludedAnalyticsSupplier({ companyName: 'ТЕСТ МИРА' })).toBe(
      true,
    );
    expect(isExcludedAnalyticsSupplier({ supplierName: 'ПОЛЫ' })).toBe(true);
    expect(isExcludedAnalyticsSupplier({ companyName: 'Карелия/Лесно' })).toBe(
      false,
    );
  });
});
