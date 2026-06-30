import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

export type LiveEventPayload = {
  type: string;
  ticketId?: string;
  profileId?: string;
  role?: string;
  presenceStatus?: string;
  presenceHeartbeatAt?: string | null;
  actorType?: string;
  actorId?: string | null;
  targetProfileIds?: string[];
  createdAt: string;
};

@Injectable()
export class LiveEventsService {
  private readonly events$ = new Subject<MessageEvent>();

  stream(filters?: { ticketId?: string }): Observable<MessageEvent> {
    const heartbeat$ = interval(25_000).pipe(
      map(
        (): MessageEvent => ({
          type: 'heartbeat',
          data: { type: 'heartbeat', createdAt: new Date().toISOString() },
        }),
      ),
    );

    const events$ = this.events$.asObservable().pipe(
      filter((event) => {
        if (!filters?.ticketId) {
          return true;
        }

        const data = event.data as LiveEventPayload | undefined;
        return data?.ticketId === filters.ticketId;
      }),
    );

    return merge(events$, heartbeat$);
  }

  emit(payload: Omit<LiveEventPayload, 'createdAt'>) {
    this.events$.next({
      type: payload.type,
      data: {
        ...payload,
        createdAt: new Date().toISOString(),
      },
    });
  }

  emitTicketChanged(payload: {
    ticketId: string;
    actorType?: string;
    actorId?: string | null;
    targetProfileIds?: string[];
  }) {
    this.emit({
      type: 'ticket.changed',
      ...payload,
    });
  }

  emitProfilePresenceChanged(payload: {
    profileId: string;
    role: string;
    presenceStatus: string;
    presenceHeartbeatAt?: Date | string | null;
  }) {
    const heartbeatAt = payload.presenceHeartbeatAt;

    this.emit({
      type: 'profile.presence.changed',
      profileId: payload.profileId,
      role: payload.role,
      presenceStatus: payload.presenceStatus,
      presenceHeartbeatAt:
        heartbeatAt instanceof Date
          ? heartbeatAt.toISOString()
          : heartbeatAt ?? null,
    });
  }
}
