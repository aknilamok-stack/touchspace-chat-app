import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('messages')
  create(
    @Body()
    body: {
      ticketId: string;
      content: string;
      senderType: string;
      managerId?: string;
      managerName?: string;
    },
  ) {
    return this.messagesService.create(
      body.ticketId,
      body.content,
      body.senderType,
      body.managerId,
      body.managerName,
    );
  }

  @Get('tickets/:id/messages')
  findByTicket(
    @Param('id') id: string,
    @Query('viewerType') viewerType?: string,
    @Query('markAsRead') markAsRead?: string,
  ) {
    return this.messagesService.findByTicket(
      id,
      viewerType,
      markAsRead === 'true',
    );
  }
}
