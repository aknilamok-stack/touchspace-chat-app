import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SupervisorsService } from './supervisors.service';

@Controller('supervisors')
export class SupervisorsController {
  constructor(private readonly supervisorsService: SupervisorsService) {}

  @Get('operators')
  listOperators(@Query('supervisorId') supervisorId: string) {
    return this.supervisorsService.listOperators(supervisorId);
  }

  @Patch('operators/:id/chat-access')
  updateOperatorChatAccess(
    @Param('id') operatorId: string,
    @Body()
    body: {
      supervisorId: string;
      enabled: boolean;
    },
  ) {
    return this.supervisorsService.updateOperatorChatAccess(
      body.supervisorId,
      operatorId,
      body.enabled,
    );
  }

  @Patch('operators/:id/account')
  updateOperatorAccount(
    @Param('id') operatorId: string,
    @Body()
    body: {
      supervisorId: string;
      authLogin?: string;
      email?: string | null;
    },
  ) {
    return this.supervisorsService.updateOperatorAccount(
      body.supervisorId,
      operatorId,
      {
        authLogin: body.authLogin,
        email: body.email,
      },
    );
  }

  @Post('operators/:id/reissue-password')
  reissueOperatorPassword(
    @Param('id') operatorId: string,
    @Body()
    body: {
      supervisorId: string;
    },
  ) {
    return this.supervisorsService.reissueOperatorPassword(
      body.supervisorId,
      operatorId,
    );
  }
}
