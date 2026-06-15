import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { SupplierApiService } from './supplier-api.service';

@Controller('external/supplier')
export class SupplierApiController {
  constructor(private readonly supplierApiService: SupplierApiService) {}

  private authenticate(authorization?: string) {
    return this.supplierApiService.authenticate(authorization);
  }

  @Get('employees')
  async getEmployees(@Headers('authorization') authorization?: string) {
    const context = await this.authenticate(authorization);
    return this.supplierApiService.getEmployees(context);
  }

  @Get('analytics')
  async getAnalytics(
    @Headers('authorization') authorization?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const context = await this.authenticate(authorization);
    return this.supplierApiService.getAnalytics(context, { dateFrom, dateTo });
  }

  @Get('analytics/employees')
  async getEmployeeAnalytics(
    @Headers('authorization') authorization?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const context = await this.authenticate(authorization);
    return this.supplierApiService.getEmployeeAnalytics(context, {
      dateFrom,
      dateTo,
    });
  }

  @Get('dialogs')
  async getDialogs(
    @Headers('authorization') authorization?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const context = await this.authenticate(authorization);
    return this.supplierApiService.getDialogs(context, { dateFrom, dateTo });
  }

  @Get('dialogs/:id/messages')
  async getDialogMessages(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const context = await this.authenticate(authorization);
    return this.supplierApiService.getDialogMessages(context, id, {
      dateFrom,
      dateTo,
    });
  }
}
