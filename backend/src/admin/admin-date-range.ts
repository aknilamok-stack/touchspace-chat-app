const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AdminDateRangeInput = {
  preset?: string;
  dateFrom?: string;
  dateTo?: string;
};

export const startOfMoscowDay = (date: Date) => {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);

  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - MOSCOW_OFFSET_MS,
  );
};

const parseDate = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)) -
        MOSCOW_OFFSET_MS,
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeAdminDateRange = (
  input?: AdminDateRangeInput,
  now = new Date(),
) => {
  const explicitFrom = parseDate(input?.dateFrom);
  const explicitTo = parseDate(input?.dateTo);

  if (explicitFrom || explicitTo) {
    return {
      from: explicitFrom ?? new Date(now.getTime() - 30 * DAY_MS),
      to:
        explicitTo && input?.dateTo && DATE_ONLY_PATTERN.test(input.dateTo)
          ? new Date(explicitTo.getTime() + DAY_MS - 1)
          : (explicitTo ?? now),
    };
  }

  const preset = input?.preset ?? 'week';
  const todayStart = startOfMoscowDay(now);

  if (preset === 'today' || preset === 'day') {
    return { from: todayStart, to: now };
  }

  if (preset === 'yesterday') {
    const from = new Date(todayStart.getTime() - DAY_MS);
    return { from, to: new Date(todayStart.getTime() - 1) };
  }

  const durationByPreset: Record<string, number> = {
    week: 7,
    month: 30,
  };
  const days = durationByPreset[preset] ?? 7;

  return {
    from: new Date(todayStart.getTime() - (days - 1) * DAY_MS),
    to: now,
  };
};

export const formatMoscowDayKey = (date: Date) =>
  new Date(date.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
