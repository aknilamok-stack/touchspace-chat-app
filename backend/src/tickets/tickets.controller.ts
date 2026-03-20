import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
  create(@Body() body?: { title?: string }) {
    return this.ticketsService.create(body?.title);
  }

  @Post('with-first-message')
  createWithFirstMessage(
    @Body()
    body: { title: string; firstMessage: string; senderType: string },
  ) {
    return this.ticketsService.createWithFirstMessage(
      body.title,
      body.firstMessage,
      body.senderType,
    );
  }

  @Get()
  findAll() {
    return this.ticketsService.findAll();
  }

  @Post(':id/typing')
  updateTyping(@Param('id') id: string, @Body() body: { senderType: string }) {
    return this.ticketsService.updateTyping(id, body.senderType);
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
}
