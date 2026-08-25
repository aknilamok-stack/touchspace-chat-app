import { Module } from '@nestjs/common';
import { ProfilesService } from '../profiles.service';
import { PushService } from '../push.service';
import { SupplierRequestsController } from './supplier-requests.controller';
import { SupplierRequestsService } from './supplier-requests.service';

@Module({
  controllers: [SupplierRequestsController],
  providers: [SupplierRequestsService, ProfilesService, PushService],
  exports: [SupplierRequestsService],
})
export class SupplierRequestsModule {}
