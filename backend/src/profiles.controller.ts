import { Body, Controller, Get, Header, Param, Patch } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('manager-statuses')
  @Header('Cache-Control', 'no-store')
  getManagerStatuses() {
    return this.profilesService.getManagerStatuses();
  }

  @Get('supplier-statuses')
  @Header('Cache-Control', 'no-store')
  getSupplierStatuses() {
    return this.profilesService.getSupplierStatuses();
  }

  @Patch(':id/manager-status')
  updateManagerStatus(
    @Param('id') id: string,
    @Body() body: { fullName?: string; managerStatus: string },
  ) {
    return this.profilesService.updateManagerStatus(
      id,
      body.managerStatus,
      body.fullName,
    );
  }

  @Patch(':id/supplier-status')
  updateSupplierStatus(
    @Param('id') id: string,
    @Body() body: { fullName?: string; supplierStatus: string },
  ) {
    return this.profilesService.updateSupplierStatus(
      id,
      body.supplierStatus,
      body.fullName,
    );
  }

  @Patch(':id/basic')
  updateBasicProfile(
    @Param('id') id: string,
    @Body() body: { fullName: string },
  ) {
    return this.profilesService.updateBasicProfile(id, body.fullName);
  }
}
