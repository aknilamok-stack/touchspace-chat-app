import { Global, Module } from '@nestjs/common';
import { LiveEventsController } from './live-events.controller';
import { LiveEventsService } from './live-events.service';

@Global()
@Module({
  controllers: [LiveEventsController],
  providers: [LiveEventsService],
  exports: [LiveEventsService],
})
export class LiveEventsModule {}
