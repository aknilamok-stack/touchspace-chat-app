export const SUPPLIER_REQUEST_SYNC_MESSAGE_TYPE = "supplier_control";

export type SupplierRequestSyncPayload = {
  kind: "supplier_request_sync";
  requestId: string;
  action: "pause" | "resume";
  actorType: "manager" | "supplier";
  actorId?: string | null;
  actorName?: string | null;
};

type RequestWindowLike = {
  id: string;
  createdAt: string;
};

type MessageLike = {
  content: string;
  createdAt: string;
  messageType?: string | null;
};

export const parseSupplierRequestSyncPayload = (
  content: string
): SupplierRequestSyncPayload | null => {
  try {
    const parsed = JSON.parse(content) as Partial<SupplierRequestSyncPayload>;

    if (
      parsed.kind !== "supplier_request_sync" ||
      typeof parsed.requestId !== "string" ||
      (parsed.action !== "pause" && parsed.action !== "resume") ||
      (parsed.actorType !== "manager" && parsed.actorType !== "supplier")
    ) {
      return null;
    }

    return {
      kind: "supplier_request_sync",
      requestId: parsed.requestId,
      action: parsed.action,
      actorType: parsed.actorType,
      actorId: typeof parsed.actorId === "string" ? parsed.actorId : null,
      actorName: typeof parsed.actorName === "string" ? parsed.actorName : null,
    };
  } catch {
    return null;
  }
};

export const isSupplierSyncControlMessage = (message: MessageLike) =>
  message.messageType === SUPPLIER_REQUEST_SYNC_MESSAGE_TYPE &&
  Boolean(parseSupplierRequestSyncPayload(message.content));

export const getSupplierRequestSyncState = (
  requests: RequestWindowLike[],
  messages: MessageLike[],
  requestId: string
) => {
  const sortedRequests = [...requests].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const requestIndex = sortedRequests.findIndex((request) => request.id === requestId);

  if (requestIndex < 0) {
    return {
      isPaused: false,
      visibleIntervals: [] as Array<{ start: number; end: number }>,
      lastPausedAt: null as string | null,
      lastResumedAt: null as string | null,
    };
  }

  const requestStartedAt = new Date(sortedRequests[requestIndex].createdAt).getTime();
  const requestEndedAt =
    requestIndex < sortedRequests.length - 1
      ? new Date(sortedRequests[requestIndex + 1].createdAt).getTime()
      : Number.POSITIVE_INFINITY;

  const events = messages
    .filter((message) => message.messageType === SUPPLIER_REQUEST_SYNC_MESSAGE_TYPE)
    .map((message) => ({
      payload: parseSupplierRequestSyncPayload(message.content),
      createdAt: message.createdAt,
      timestamp: new Date(message.createdAt).getTime(),
    }))
    .filter(
      (
        event
      ): event is {
        payload: SupplierRequestSyncPayload;
        createdAt: string;
        timestamp: number;
      } => {
        if (!event.payload) {
          return false;
        }

        return (
          event.payload.requestId === requestId &&
          Number.isFinite(event.timestamp) &&
          event.timestamp >= requestStartedAt &&
          event.timestamp < requestEndedAt
        );
      }
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  const visibleIntervals: Array<{ start: number; end: number }> = [];
  let currentVisibleStart = requestStartedAt;
  let isPaused = false;
  let lastPausedAt: string | null = null;
  let lastResumedAt: string | null = null;

  for (const event of events) {
    if (event.payload.action === "pause") {
      if (!isPaused && currentVisibleStart < event.timestamp) {
        visibleIntervals.push({ start: currentVisibleStart, end: event.timestamp });
      }

      isPaused = true;
      currentVisibleStart = event.timestamp;
      lastPausedAt = event.createdAt;
      continue;
    }

    isPaused = false;
    currentVisibleStart = event.timestamp;
    lastResumedAt = event.createdAt;
  }

  if (!isPaused) {
    visibleIntervals.push({
      start: currentVisibleStart,
      end: requestEndedAt,
    });
  }

  return {
    isPaused,
    visibleIntervals,
    lastPausedAt,
    lastResumedAt,
  };
};
