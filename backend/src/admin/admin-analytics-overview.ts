export type AnalyticsRequestEvent = {
  id: string;
  ticketId: string;
  eventType: string;
  createdAt: Date;
  resolvedAt: Date | null;
  ticket: { topicCategory: string | null };
};

export type AnalyticsSupplierRequest = {
  ticketId: string;
  createdAt: Date;
  responseBreached: boolean;
};

type AnalyticsRange = { from: Date; to: Date };

const isWithin = (value: Date, range: AnalyticsRange) =>
  value >= range.from && value <= range.to;

const belongsToRequest = (
  supplierRequest: AnalyticsSupplierRequest,
  event: AnalyticsRequestEvent,
  now: Date,
) =>
  supplierRequest.ticketId === event.ticketId &&
  supplierRequest.createdAt >= event.createdAt &&
  supplierRequest.createdAt <= (event.resolvedAt ?? now);

const buildRequestSeries = (
  events: AnalyticsRequestEvent[],
  range: AnalyticsRange,
  formatDayKey: (date: Date) => string,
) => {
  const buckets = new Map<string, number>();
  const cursor = new Date(range.from);

  while (cursor <= range.to) {
    buckets.set(formatDayKey(cursor), 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const event of events) {
    const key = formatDayKey(event.createdAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({
    date,
    count,
    label: `${date.slice(8, 10)}.${date.slice(5, 7)}`,
    shortLabel: `${date.slice(8, 10)}.${date.slice(5, 7)}`,
    granularity: 'day',
  }));
};

export const calculateAnalyticsOverview = ({
  events,
  supplierRequests,
  range,
  now,
  formatDayKey,
}: {
  events: AnalyticsRequestEvent[];
  supplierRequests: AnalyticsSupplierRequest[];
  range: AnalyticsRange;
  now: Date;
  formatDayKey: (date: Date) => string;
}) => {
  const requestsInPeriod = events.filter((event) =>
    isWithin(event.createdAt, range),
  );
  const resolvedRequests = requestsInPeriod.filter((event) =>
    Boolean(event.resolvedAt),
  );
  const openRequests = requestsInPeriod.filter((event) => !event.resolvedAt);
  const resolvedBacklog = events.filter(
    (event) =>
      event.createdAt < range.from &&
      Boolean(event.resolvedAt) &&
      isWithin(event.resolvedAt!, range),
  );
  const initialRequests = requestsInPeriod.filter(
    (event) => event.eventType === 'initial',
  );
  const repeatRequests = requestsInPeriod.filter(
    (event) => event.eventType !== 'initial',
  );
  const escalatedEvents = requestsInPeriod.filter((event) =>
    supplierRequests.some((request) => belongsToRequest(request, event, now)),
  );
  const supplierRequestsForCohort = supplierRequests.filter((request) =>
    requestsInPeriod.some((event) => belongsToRequest(request, event, now)),
  );
  const categorizedRequests = requestsInPeriod.filter((event) =>
    Boolean(event.ticket.topicCategory?.trim()),
  );
  const topicBuckets = new Map<string, number>();

  for (const event of categorizedRequests) {
    const topic = event.ticket.topicCategory!.trim();
    topicBuckets.set(topic, (topicBuckets.get(topic) ?? 0) + 1);
  }

  return {
    metrics: {
      requests: requestsInPeriod.length,
      initialRequests: initialRequests.length,
      repeatRequests: repeatRequests.length,
      resolvedRequests: resolvedRequests.length,
      openRequests: openRequests.length,
      resolvedBacklog: resolvedBacklog.length,
      escalatedRequests: escalatedEvents.length,
      escalatedSharePercent: requestsInPeriod.length
        ? Number(
            ((escalatedEvents.length / requestsInPeriod.length) * 100).toFixed(
              1,
            ),
          )
        : 0,
      supplierRequests: supplierRequestsForCohort.length,
      supplierOverdueRequests: supplierRequestsForCohort.filter(
        (request) => request.responseBreached,
      ).length,
      categorizedRequests: categorizedRequests.length,
      uncategorizedRequests:
        requestsInPeriod.length - categorizedRequests.length,
    },
    charts: {
      requestsByDay: buildRequestSeries(
        requestsInPeriod,
        range,
        formatDayKey,
      ),
      topTopics: [...topicBuckets.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
    },
  };
};
