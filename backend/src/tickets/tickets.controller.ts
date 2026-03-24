import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { InviteManagerDto } from './dto/invite-manager.dto';
import { AssignManagerDto } from './dto/assign-manager.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() body?: { title?: string; clientId?: string; clientName?: string }) {
    return this.ticketsService.create(
      body?.title,
      body?.clientId,
      body?.clientName,
    );
  }

  @Post('with-first-message')
  createWithFirstMessage(
    @Body()
    body: {
      title: string;
      firstMessage: string;
      senderType: string;
      senderId?: string;
      senderName?: string;
      clientId?: string;
      clientName?: string;
      aiEnabled?: boolean;
    },
  ) {
    return this.ticketsService.createWithFirstMessage(
      body.title,
      body.firstMessage,
      body.senderType,
      body.senderId,
      body.senderName,
      body.clientId,
      body.clientName,
      body.aiEnabled,
    );
  }

  @Get()
  findAll(
    @Query('viewerType') viewerType?: string,
    @Query('viewerId') viewerId?: string,
  ) {
    return this.ticketsService.findAll({
      viewerType,
      viewerId,
    });
  }

  @Post(':id/typing')
  updateTyping(
    @Param('id') id: string,
    @Body() body: { senderType: string; previewText?: string },
  ) {
    return this.ticketsService.updateTyping(id, body.senderType, body.previewText);
  }

  @Get(':id/typing')
  getTyping(@Param('id') id: string) {
    return this.ticketsService.getTyping(id);
  }

  @Patch(':id/pin')
  togglePinned(@Param('id') id: string) {
    return this.ticketsService.togglePinned(id);
  }

  @Patch(':id/resolve')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  resolve(@Param('id') id: string, @Body() resolveTicketDto: ResolveTicketDto) {
    return this.ticketsService.resolve(id, resolveTicketDto);
  }

  @Post(':id/manager-rating')
  rateManager(
    @Param('id') id: string,
    @Body() body: { rating: number },
  ) {
    return this.ticketsService.rateManager(id, body.rating);
  }

  @Patch(':id/reopen')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  reopen(@Param('id') id: string, @Body() assignManagerDto: AssignManagerDto) {
    return this.ticketsService.reopen(id, assignManagerDto);
  }

  @Patch(':id/invite-manager')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  inviteManager(
    @Param('id') id: string,
    @Body() inviteManagerDto: InviteManagerDto,
  ) {
    return this.ticketsService.inviteManager(id, inviteManagerDto);
  }

  @Patch(':id/assign-manager')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  assignManager(
    @Param('id') id: string,
    @Body() assignManagerDto: AssignManagerDto,
  ) {
    return this.ticketsService.assignManager(id, assignManagerDto);
  }

  @Patch(':id/claim')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  claimIncoming(
    @Param('id') id: string,
    @Body() assignManagerDto: AssignManagerDto,
  ) {
    return this.ticketsService.claimIncoming(id, assignManagerDto);
  }

  @Post(':id/ai/enable')
  enableAiMode(@Param('id') id: string) {
    return this.ticketsService.enableAiMode(id);
  }

  @Post(':id/ai/disable')
  disableAiMode(@Param('id') id: string) {
    return this.ticketsService.disableAiMode(id);
  }
}
