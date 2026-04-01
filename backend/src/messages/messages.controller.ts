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
      tradePointId?: string;
      tradePointExternalId?: string;
      tradePointName?: string;
      currentUserId?: string;
      currentUserEmail?: string;
      currentUserPhone?: string;
      currentUserXmlId?: string;
      isSuperuser?: boolean | string;
      superuserId?: string;
      superuserEmail?: string;
      superuserPhone?: string;
      canonicalEmail?: string;
      canonicalEmailSource?: string;
      clientEmail?: string;
      clientPhone?: string;
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
      body.tradePointId,
      body.tradePointExternalId,
      body.tradePointName,
      body.currentUserId,
      body.currentUserEmail,
      body.currentUserPhone,
      body.currentUserXmlId,
      body.isSuperuser,
      body.superuserId,
      body.superuserEmail,
      body.superuserPhone,
      body.canonicalEmail,
      body.canonicalEmailSource,
      body.clientEmail,
      body.clientPhone,
      body.replyToMessageId,
      body.replyToContent,
    );
  }

  @Get('messages/manager-suggestions')
  findManagerSuggestions(
    @Query('managerId') managerId?: string,
    @Query('q') query?: string,
  ) {
    return this.messagesService.findManagerSuggestions(
      managerId?.trim() ?? '',
      query?.trim() ?? '',
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
          callback(
            null,
            `${safeBaseName || 'attachment'}-${suffix}${extension}`,
          );
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
      tradePointId?: string;
      tradePointExternalId?: string;
      tradePointName?: string;
      currentUserId?: string;
      currentUserEmail?: string;
      currentUserPhone?: string;
      currentUserXmlId?: string;
      isSuperuser?: boolean | string;
      superuserId?: string;
      superuserEmail?: string;
      superuserPhone?: string;
      canonicalEmail?: string;
      canonicalEmailSource?: string;
      clientEmail?: string;
      clientPhone?: string;
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
      body.tradePointId,
      body.tradePointExternalId,
      body.tradePointName,
      body.currentUserId,
      body.currentUserEmail,
      body.currentUserPhone,
      body.currentUserXmlId,
      body.isSuperuser,
      body.superuserId,
      body.superuserEmail,
      body.superuserPhone,
      body.canonicalEmail,
      body.canonicalEmailSource,
      body.clientEmail,
      body.clientPhone,
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
