import { Module } from '@nestjs/common';
import { AppUpdatesService } from '../app-updates/app-updates.service';
import { AuthService } from '../auth.service';
import { PrismaService } from '../prisma.service';
import { ProfilesService } from '../profiles.service';
import { SupplierApiService } from '../supplier-api/supplier-api.service';
import { AdminAiService } from './admin-ai.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminAiService,
    AdminGuard,
    AuthService,
    AppUpdatesService,
    PrismaService,
    ProfilesService,
    SupplierApiService,
  ],
})
export class AdminModule {}
