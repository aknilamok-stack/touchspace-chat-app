import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
      replyToMessageId?: string;
      replyToContent?: string;
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
      body.replyToMessageId,
      body.replyToContent,
    );
  }

  @Post('messages/attachment')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
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
        fileSize: 5 * 1024 * 1024,
        files: 5,
      },
    }),
  )
  createAttachment(
    @UploadedFiles() files: any[],
    @Body()
    body: {
      ticketId: string;
      senderType: string;
      managerId?: string;
      managerName?: string;
      senderId?: string;
      senderName?: string;
      caption?: string;
      replyToMessageId?: string;
      replyToContent?: string;
    },
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one attachment file is required');
    }

    return this.messagesService.createAttachment(
      files,
      body.ticketId,
      body.senderType,
      body.managerId,
      body.managerName,
      body.senderId,
      body.senderName,
      body.caption,
      body.replyToMessageId,
      body.replyToContent,
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
