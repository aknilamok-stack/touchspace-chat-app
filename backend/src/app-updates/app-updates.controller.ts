import { Controller, Get, Query } from '@nestjs/common';
import { AppUpdatesService } from './app-updates.service';

@Controller('app-updates')
export class AppUpdatesController {
  constructor(private readonly appUpdatesService: AppUpdatesService) {}

  @Get('desktop/check')
  checkDesktopUpdate(
    @Query('version') version?: string,
    @Query('platform') platform?: string,
  ) {
    return this.appUpdatesService.checkDesktopUpdate({ version, platform });
  }
}
