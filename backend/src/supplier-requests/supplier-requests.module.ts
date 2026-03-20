import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SupplierRequestsController } from './supplier-requests.controller';
import { SupplierRequestsService } from './supplier-requests.service';

@Module({
  controllers: [SupplierRequestsController],
  providers: [SupplierRequestsService, PrismaService],
  exports: [SupplierRequestsService],
})
export class SupplierRequestsModule {}
