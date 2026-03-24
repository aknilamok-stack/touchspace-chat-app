import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'node:path';
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
      senderId?: string;
      senderName?: string;
    },
  ) {
    return this.messagesService.create(
      body.ticketId,
      body.content,
      body.senderType,
      body.managerId,
      body.managerName,
      body.senderId,
      body.senderName,
    );
  }

  @Post('messages/attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_request, file, callback) => {
          const safeBaseName = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-zA-Z0-9-_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 64);
          const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const extension = extname(file.originalname) || '';
          callback(null, `${safeBaseName || 'attachment'}-${suffix}${extension}`);
        },
      }),
      limits: {
        fileSize: 15 * 1024 * 1024,
      },
    }),
  )
  createAttachment(
    @UploadedFile() file: any,
    @Body()
    body: {
      ticketId: string;
      senderType: string;
      managerId?: string;
      managerName?: string;
      senderId?: string;
      senderName?: string;
      caption?: string;
    },
  ) {
    return this.messagesService.createAttachment(
      file,
      body.ticketId,
      body.senderType,
      body.managerId,
      body.managerName,
      body.senderId,
      body.senderName,
      body.caption,
    );
  }

  @Get('tickets/:id/messages')
  findByTicket(
    @Param('id') id: string,
    @Query('viewerType') viewerType?: string,
    @Query('markAsRead') markAsRead?: string,
    @Query('viewerId') viewerId?: string,
  ) {
    return this.messagesService.findByTicket(
      id,
      viewerType,
      markAsRead === 'true',
      viewerId,
    );
  }
}
