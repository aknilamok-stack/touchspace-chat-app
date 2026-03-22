import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('manager-statuses')
  getManagerStatuses() {
    return this.profilesService.getManagerStatuses();
  }

  @Patch(':id/manager-status')
  updateManagerStatus(
    @Param('id') id: string,
    @Body() body: { fullName?: string; managerStatus: string },
  ) {
    return this.profilesService.updateManagerStatus(id, body.managerStatus, body.fullName);
  }
}
