export const SUPPLIER_REQUEST_SYNC_MESSAGE_TYPE = 'supplier_control';

export type SupplierRequestSyncAction = 'pause' | 'resume';
export type SupplierRequestSyncActorType = 'manager' | 'supplier';

export type SupplierRequestSyncPayload = {
  kind: 'supplier_request_sync';
  requestId: string;
  action: SupplierRequestSyncAction;
  actorType: SupplierRequestSyncActorType;
  actorId?: string | null;
  actorName?: string | null;
};

type RequestWindowLike = {
  id: string;
  createdAt: Date | string;
};

type ControlMessageLike = {
  content: string;
  createdAt: Date | string;
  messageType?: string | null;
};

export const buildSupplierRequestSyncPayload = (
  payload: SupplierRequestSyncPayload,
) => JSON.stringify(payload);

export const parseSupplierRequestSyncPayload = (
  content: string,
): SupplierRequestSyncPayload | null => {
  try {
    const parsed = JSON.parse(content) as Partial<SupplierRequestSyncPayload>;

    if (
      parsed.kind !== 'supplier_request_sync' ||
      typeof parsed.requestId !== 'string' ||
      (parsed.action !== 'pause' && parsed.action !== 'resume') ||
      (parsed.actorType !== 'manager' && parsed.actorType !== 'supplier')
    ) {
      return null;
    }

    return {
      kind: 'supplier_request_sync',
      requestId: parsed.requestId,
      action: parsed.action,
      actorType: parsed.actorType,
      actorId:
        typeof parsed.actorId === 'string' && parsed.actorId.trim()
          ? parsed.actorId.trim()
          : null,
      actorName:
        typeof parsed.actorName === 'string' && parsed.actorName.trim()
          ? parsed.actorName.trim()
          : null,
    };
  } catch {
    return null;
  }
};

export const getSupplierRequestSyncState = (
  requests: RequestWindowLike[],
  messages: ControlMessageLike[],
  requestId: string,
) => {
  const sortedRequests = [...requests].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  const requestIndex = sortedRequests.findIndex((request) => request.id === requestId);

  if (requestIndex < 0) {
    return {
      isPaused: false,
      lastPausedAt: null as string | null,
      lastResumedAt: null as string | null,
    };
  }

  const request = sortedRequests[requestIndex];
  const requestStartedAt = new Date(request.createdAt).getTime();
  const requestEndedAt =
    requestIndex < sortedRequests.length - 1
      ? new Date(sortedRequests[requestIndex + 1].createdAt).getTime()
      : Number.POSITIVE_INFINITY;

  const events = messages
    .filter(
      (message) =>
        message.messageType === SUPPLIER_REQUEST_SYNC_MESSAGE_TYPE &&
        Number.isFinite(new Date(message.createdAt).getTime()),
    )
    .map((message) => ({
      createdAt: new Date(message.createdAt).toISOString(),
      timestamp: new Date(message.createdAt).getTime(),
      payload: parseSupplierRequestSyncPayload(message.content),
    }))
    .filter(
      (event): event is { createdAt: string; timestamp: number; payload: SupplierRequestSyncPayload } => {
        if (!event.payload) {
          return false;
        }

        return (
          event.payload.requestId === requestId &&
          event.timestamp >= requestStartedAt &&
          event.timestamp < requestEndedAt
        );
      },
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  let isPaused = false;
  let lastPausedAt: string | null = null;
  let lastResumedAt: string | null = null;

  for (const event of events) {
    if (event.payload.action === 'pause') {
      isPaused = true;
      lastPausedAt = event.createdAt;
    } else {
      isPaused = false;
      lastResumedAt = event.createdAt;
    }
  }

  return {
    isPaused,
    lastPausedAt,
    lastResumedAt,
  };
};
