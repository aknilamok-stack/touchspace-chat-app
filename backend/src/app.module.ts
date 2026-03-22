import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ChatAiService } from './chat-ai.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaService } from './prisma.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { SupplierRequestsModule } from './supplier-requests/supplier-requests.module';
import { TicketsController } from './tickets/tickets.controller';
import { TicketsService } from './tickets/tickets.service';
import { TypingService } from './typing.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AdminModule,
    SupplierRequestsModule,
  ],
  controllers: [
    AppController,
    AuthController,
    PushController,
    NotificationsController,
    ProfilesController,
    TicketsController,
    MessagesController,
  ],
  providers: [
    AppService,
    AuthService,
    ChatAiService,
    NotificationsService,
    PrismaService,
    ProfilesService,
    PushService,
    TicketsService,
    MessagesService,
    TypingService,
  ],
})
export class AppModule {}
