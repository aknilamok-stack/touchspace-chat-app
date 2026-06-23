import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { LiveEventsService } from './live-events.service';

@Controller('live')
export class LiveEventsController {
  constructor(private readonly liveEventsService: LiveEventsService) {}

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.liveEventsService.stream();
  }
}
