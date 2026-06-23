import { Controller, MessageEvent, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { LiveEventsService } from './live-events.service';

@Controller('live')
export class LiveEventsController {
  constructor(private readonly liveEventsService: LiveEventsService) {}

  @Sse('events')
  events(@Query('ticketId') ticketId?: string): Observable<MessageEvent> {
    return this.liveEventsService.stream({
      ticketId: ticketId?.trim() || undefined,
    });
  }
}
