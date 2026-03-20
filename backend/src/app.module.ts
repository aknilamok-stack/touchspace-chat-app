import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { PrismaService } from './prisma.service';
import { SupplierRequestsModule } from './supplier-requests/supplier-requests.module';
import { TicketsController } from './tickets/tickets.controller';
import { TicketsService } from './tickets/tickets.service';
import { TypingService } from './typing.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupplierRequestsModule,
  ],
  controllers: [AppController, TicketsController, MessagesController],
  providers: [
    AppService,
    PrismaService,
    TicketsService,
    MessagesService,
    TypingService,
  ],
})
export class AppModule {}
