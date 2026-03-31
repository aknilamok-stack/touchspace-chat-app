import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TypingService } from '../typing.service';
import { ProfilesService } from '../profiles.service';
import { ChatAiService } from '../chat-ai.service';
import { PushService } from '../push.service';
import { readJsonStringArray } from '../prisma-json.util';
import { resolveTicketClientContext } from '../tickets/client-context.util';

type MessageViewer = {
  viewerType?: string;
  viewerId?: string;
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typingService: TypingService,
    private readonly profilesService: ProfilesService,
    private readonly chatAiService: ChatAiService,
    private readonly pushService: PushService,
  ) {}

  private async createSystemMessage(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ticketId: string,
    content: string,
  ) {
    return tx.message.create({
      data: {
        ticketId,
        content,
        senderType: 'system',
        senderRole: 'system',
        status: 'sent',
        deliveryStatus: 'sent',
        messageType: 'system',
      },
    });
  }

  private async markClientMessagesAsRead(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ticketId: string,
    readAt: Date,
  ) {
    await tx.message.updateMany({
      where: {
        ticketId,
        senderType: 'client',
        status: {
          in: ['sent', 'delivered'],
        },
      },
      data: {
        status: 'read',
        deliveryStatus: 'read',
        readAt,
      },
    });
  }

  private async assertTicketAccess(ticketId: string, viewer?: MessageViewer) {
    const viewerType = viewer?.viewerType?.trim();
    const viewerId = viewer?.viewerId?.trim();

    if (!viewerType || !viewerId) {
      return;
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        clientId: true,
        supplierId: true,
        assignedManagerId: true,
        invitedManagerIds: true,
        supplierRequests: {
          select: {
            supplierId: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
    }

    const invitedManagerIds = readJsonStringArray(ticket.invitedManagerIds);

    if (viewerType === 'client' && ticket.clientId === viewerId) {
      return;
    }

    if (
      viewerType === 'supplier' &&
      (ticket.supplierId === viewerId ||
        ticket.supplierRequests.some(
          (supplierRequest) => supplierRequest.supplierId === viewerId,
        ))
    ) {
      return;
    }

    if (
      viewerType === 'manager' &&
      (ticket.assignedManagerId === null ||
        ticket.assignedManagerId === viewerId ||
        invitedManagerIds.includes(viewerId))
    ) {
      return;
    }

    throw new ForbiddenException('No access to this ticket');
  }

  async create(
    ticketId: string,
    content: string,
    senderType: string,
    managerId?: string,
    managerName?: string,
    senderId?: string,
    senderName?: string,
    tradePointId?: string,
    tradePointExternalId?: string,
    tradePointName?: string,
    currentUserId?: string,
    currentUserEmail?: string,
    currentUserPhone?: string,
    currentUserXmlId?: string,
    isSuperuser?: boolean | string,
    superuserId?: string,
    superuserEmail?: string,
    superuserPhone?: string,
    canonicalEmail?: string,
    canonicalEmailSource?: string,
    clientEmail?: string,
    clientPhone?: string,
    replyToMessageId?: string,
    replyToContent?: string,
  ) {
    const actorId = senderId ?? managerId;
    const actorName = senderName ?? managerName;

    if (actorId) {
      await this.profilesService.ensureProfile({
        id: actorId,
        fullName: actorName,
        role: senderType,
      });
    }

    const { message, shouldAiReply, ticketSnapshot } =
      await this.prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
          where: { id: ticketId },
          select: {
            id: true,
            title: true,
            status: true,
            aiEnabled: true,
            currentHandlerType: true,
            conversationMode: true,
            firstResponseStartedAt: true,
            firstResponseAt: true,
            assignedManagerId: true,
            assignedManagerName: true,
            invitedManagerIds: true,
            clientId: true,
            clientName: true,
            tradePointExternalId: true,
            tradePointName: true,
            clientEmail: true,
            clientPhone: true,
            currentUserId: true,
            currentUserEmail: true,
            currentUserPhone: true,
            currentUserXmlId: true,
            isSuperuser: true,
            superuserId: true,
            superuserEmail: true,
            superuserPhone: true,
            canonicalEmail: true,
            canonicalEmailSource: true,
            lockedBySuperuser: true,
            supplierId: true,
            supplierName: true,
          },
        });

        if (!ticket) {
          throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
        }

        const isClientReopeningResolvedDialog =
          senderType === 'client' && ticket.status === 'resolved';

        if (isClientReopeningResolvedDialog) {
          const reopenedAt = new Date();

          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              status: 'new',
              assignedManagerId: null,
              assignedManagerName: null,
              handedToManagerAt: null,
              conversationMode: 'manager',
              currentHandlerType: 'manager',
              aiEnabled: false,
              firstResponseStartedAt: reopenedAt,
              firstResponseAt: null,
              firstResponseTime: null,
              firstResponseBreached: false,
              managerRating: null,
              managerRatingSubmittedAt: null,
              resolvedAt: null,
              closedAt: null,
              lastMessageAt: reopenedAt,
            },
          });
        }

        const message = await tx.message.create({
          data: {
            ticketId,
            content,
            senderType,
            senderRole: senderType,
            senderProfileId: actorId ?? null,
            replyToMessageId: replyToMessageId?.trim() || null,
            replyToContent: replyToContent?.trim() || null,
            status: 'sent',
            deliveryStatus: 'sent',
            messageType: 'text',
            isInternal: false,
          },
        });

        const managerMessagesCount = await tx.message.count({
          where: {
            ticketId,
            senderType: 'manager',
          },
        });

        let nextStatus = ticket.status;

        if (senderType === 'client') {
          nextStatus = isClientReopeningResolvedDialog
            ? 'new'
            : managerMessagesCount > 0
              ? 'in_progress'
              : 'new';
        }

        if (senderType === 'manager') {
          nextStatus = 'waiting_client';
        }

        if (senderType === 'client' && ticket.aiEnabled) {
          nextStatus = 'waiting_client';
        }

        if (senderType === 'supplier') {
          nextStatus = 'in_progress';
        }

        const ticketUpdateData: Record<string, unknown> = {
          lastMessageAt: message.createdAt,
          closedAt: null,
        };

        if (nextStatus !== ticket.status) {
          ticketUpdateData.status = nextStatus;
        }

        if (senderType === 'client') {
          const clientContext = resolveTicketClientContext(
            {
              tradePointId,
              tradePointExternalId,
              tradePointName,
              currentUserId,
              currentUserEmail,
              currentUserPhone,
              currentUserXmlId,
              isSuperuser,
              superuserId,
              superuserEmail,
              superuserPhone,
              canonicalEmail,
              canonicalEmailSource,
              clientEmail,
              clientPhone,
            },
            ticket,
          );

          ticketUpdateData.clientId = clientContext.clientId ?? ticket.clientId;
          ticketUpdateData.clientName =
            clientContext.clientName ?? ticket.clientName;
          ticketUpdateData.tradePointExternalId =
            clientContext.tradePointExternalId;
          ticketUpdateData.tradePointName =
            clientContext.tradePointName ?? ticket.tradePointName;
          ticketUpdateData.clientEmail = clientContext.clientEmail;
          ticketUpdateData.clientPhone = clientContext.clientPhone;
          ticketUpdateData.currentUserId = clientContext.currentUserId;
          ticketUpdateData.currentUserEmail = clientContext.currentUserEmail;
          ticketUpdateData.currentUserPhone = clientContext.currentUserPhone;
          ticketUpdateData.currentUserXmlId = clientContext.currentUserXmlId;
          ticketUpdateData.isSuperuser = clientContext.isSuperuser;
          ticketUpdateData.superuserId = clientContext.superuserId;
          ticketUpdateData.superuserEmail = clientContext.superuserEmail;
          ticketUpdateData.superuserPhone = clientContext.superuserPhone;
          ticketUpdateData.canonicalEmail = clientContext.canonicalEmail;
          ticketUpdateData.canonicalEmailSource =
            clientContext.canonicalEmailSource;
          ticketUpdateData.lockedBySuperuser = clientContext.lockedBySuperuser;
          if (ticket.aiEnabled) {
            ticketUpdateData.currentHandlerType = 'ai';
            ticketUpdateData.conversationMode = 'ai';
          }
        }

        if (senderType === 'supplier') {
          ticketUpdateData.supplierId = actorId ?? ticket.supplierId;
          ticketUpdateData.supplierName = actorName ?? ticket.supplierName;
        }

        await tx.ticket.update({
          where: { id: ticketId },
          data: ticketUpdateData,
        });

        if (senderType === 'manager' && !ticket.firstResponseAt) {
          const startedAt = ticket.firstResponseStartedAt ?? new Date();
          const durationMs = Math.max(
            message.createdAt.getTime() - startedAt.getTime(),
            0,
          );

          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              firstResponseAt: message.createdAt,
              firstResponseTime: durationMs,
              firstResponseBreached: durationMs > 2 * 60 * 1000,
            },
          });
        }

        if (
          senderType === 'manager' &&
          managerId &&
          managerName &&
          !ticket.assignedManagerId
        ) {
          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              assignedManagerId: managerId,
              assignedManagerName: managerName,
            },
          });
        }

        if (senderType === 'supplier') {
          const activeSupplierRequest = await tx.supplierRequest.findFirst({
            where: {
              ticketId,
              firstResponseAt: null,
              status: {
                notIn: ['closed', 'cancelled'],
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          if (activeSupplierRequest) {
            const startedAt =
              activeSupplierRequest.responseStartedAt ??
              activeSupplierRequest.createdAt;
            const durationMs = Math.max(
              message.createdAt.getTime() - startedAt.getTime(),
              0,
            );

            await tx.supplierRequest.update({
              where: { id: activeSupplierRequest.id },
              data: {
                firstResponseAt: message.createdAt,
                respondedAt: message.createdAt,
                responseTime: durationMs,
                responseBreached: durationMs > 60 * 60 * 1000,
              },
            });
          }
        }

        if (senderType === 'client') {
          this.typingService.clearTyping(ticketId, 'client');
        }

        if (senderType === 'manager') {
          this.typingService.clearTyping(ticketId, 'manager');
          await this.markClientMessagesAsRead(tx, ticketId, message.createdAt);
        }

        if (senderType === 'manager' && ticket.aiEnabled) {
          await this.createSystemMessage(
            tx,
            ticketId,
            'Менеджер подключился к диалогу',
          );
          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              aiEnabled: false,
              currentHandlerType: 'manager',
              conversationMode: 'manager',
              aiDeactivatedAt: message.createdAt,
              handedToManagerAt: message.createdAt,
              lastMessageAt: message.createdAt,
            },
          });
        }

        return {
          message,
          shouldAiReply: senderType === 'client' && ticket.aiEnabled,
          ticketSnapshot: {
            id: ticket.id,
            title: ticket.title ?? 'Диалог TouchSpace',
            assignedManagerId: ticket.assignedManagerId,
            invitedManagerIds: ticket.invitedManagerIds,
            supplierId: ticket.supplierId,
            aiEnabled: ticket.aiEnabled,
          },
        };
      });

    if (shouldAiReply) {
      void this.chatAiService.persistAiTurn(ticketId).catch((error) => {
        console.error('Ошибка AI-ответа в message flow:', error);
      });
    } else if (senderType === 'client') {
      void this.pushService
        .getManagerTargetsForTicket(ticketId)
        .then((targets) =>
          this.pushService.sendToProfiles(
            targets,
            {
              title: 'Новое сообщение от клиента',
              body:
                content.length > 120 ? `${content.slice(0, 120)}...` : content,
              url: `/?ticket=${ticketId}`,
              tag: `ticket-${ticketId}`,
            },
            'client_chats',
            actorId,
          ),
        )
        .catch((error) =>
          console.error('Ошибка push-уведомления для менеджеров:', error),
        );
    } else if (senderType === 'supplier') {
      const managerTargets = [
        ticketSnapshot.assignedManagerId,
        ...readJsonStringArray(ticketSnapshot.invitedManagerIds),
      ].filter((value): value is string => Boolean(value));

      void this.pushService
        .sendToProfiles(
          [...new Set(managerTargets)],
          {
            title: 'Новое сообщение от поставщика',
            body:
              content.length > 120 ? `${content.slice(0, 120)}...` : content,
            url: `/?ticket=${ticketId}`,
            tag: `ticket-${ticketId}`,
          },
          'supplier_chats',
          actorId,
        )
        .catch((error) =>
          console.error(
            'Ошибка push-уведомления для менеджера по сообщению поставщика:',
            error,
          ),
        );
    } else if (senderType === 'manager' && ticketSnapshot.supplierId) {
      void this.pushService
        .sendToProfiles(
          [ticketSnapshot.supplierId],
          {
            title: 'Новое сообщение по вашему запросу',
            body:
              content.length > 120 ? `${content.slice(0, 120)}...` : content,
            url: `/supplier?ticket=${ticketId}`,
            tag: `supplier-ticket-${ticketId}`,
          },
          'supplier_chats',
          actorId,
        )
        .catch((error) =>
          console.error('Ошибка push-уведомления поставщику:', error),
        );
    }

    return message;
  }

  async createAttachment(
    files: any[],
    ticketId: string,
    senderType: string,
    managerId?: string,
    managerName?: string,
    senderId?: string,
    senderName?: string,
    tradePointId?: string,
    tradePointExternalId?: string,
    tradePointName?: string,
    currentUserId?: string,
    currentUserEmail?: string,
    currentUserPhone?: string,
    currentUserXmlId?: string,
    isSuperuser?: boolean | string,
    superuserId?: string,
    superuserEmail?: string,
    superuserPhone?: string,
    canonicalEmail?: string,
    canonicalEmailSource?: string,
    clientEmail?: string,
    clientPhone?: string,
    caption?: string,
    replyToMessageId?: string,
    replyToContent?: string,
  ) {
    if (!files?.length) {
      throw new NotFoundException('Attachment file is required');
    }

    if (files.length > 5) {
      throw new BadRequestException(
        'Можно прикрепить не больше 5 файлов за раз',
      );
    }

    const totalSize = files.reduce(
      (sum, file) => sum + (typeof file?.size === 'number' ? file.size : 0),
      0,
    );

    if (totalSize > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Суммарный размер вложений в одном сообщении не должен превышать 5 МБ',
      );
    }

    const actorId = senderId ?? managerId;
    const actorName = senderName ?? managerName;

    if (actorId) {
      await this.profilesService.ensureProfile({
        id: actorId,
        fullName: actorName,
        role: senderType,
      });
    }

    const trimmedCaption = caption?.trim() || '';
    const attachments = files.map((file) => ({
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      caption: trimmedCaption,
    }));
    const attachmentPayload = JSON.stringify({
      attachments,
    });

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          clientId: true,
          clientName: true,
          tradePointExternalId: true,
          tradePointName: true,
          clientEmail: true,
          clientPhone: true,
          currentUserId: true,
          currentUserEmail: true,
          currentUserPhone: true,
          currentUserXmlId: true,
          isSuperuser: true,
          superuserId: true,
          superuserEmail: true,
          superuserPhone: true,
          canonicalEmail: true,
          canonicalEmailSource: true,
          lockedBySuperuser: true,
        },
      });

      if (!ticket) {
        throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
      }

      const message = await tx.message.create({
        data: {
          ticketId,
          content: attachmentPayload,
          senderType,
          senderRole: senderType,
          senderProfileId: actorId ?? null,
          replyToMessageId: replyToMessageId?.trim() || null,
          replyToContent: replyToContent?.trim() || null,
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'attachment',
          isInternal: false,
        },
      });

      const clientContext =
        senderType === 'client'
          ? resolveTicketClientContext(
              {
                tradePointId,
                tradePointExternalId,
                tradePointName,
                currentUserId,
                currentUserEmail,
                currentUserPhone,
                currentUserXmlId,
                isSuperuser,
                superuserId,
                superuserEmail,
                superuserPhone,
                canonicalEmail,
                canonicalEmailSource,
                clientEmail,
                clientPhone,
              },
              ticket,
            )
          : null;

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          lastMessageAt: message.createdAt,
          closedAt: null,
          status: senderType === 'client' ? 'new' : undefined,
          clientId: clientContext?.clientId,
          clientName: clientContext?.clientName,
          tradePointExternalId: clientContext?.tradePointExternalId,
          tradePointName: clientContext?.tradePointName,
          clientEmail: clientContext?.clientEmail,
          clientPhone: clientContext?.clientPhone,
          currentUserId: clientContext?.currentUserId,
          currentUserEmail: clientContext?.currentUserEmail,
          currentUserPhone: clientContext?.currentUserPhone,
          currentUserXmlId: clientContext?.currentUserXmlId,
          isSuperuser: clientContext?.isSuperuser,
          superuserId: clientContext?.superuserId,
          superuserEmail: clientContext?.superuserEmail,
          superuserPhone: clientContext?.superuserPhone,
          canonicalEmail: clientContext?.canonicalEmail,
          canonicalEmailSource: clientContext?.canonicalEmailSource,
          lockedBySuperuser: clientContext?.lockedBySuperuser,
        },
      });

      if (senderType === 'manager') {
        this.typingService.clearTyping(ticketId, 'manager');
        await this.markClientMessagesAsRead(tx, ticketId, message.createdAt);
      }

      if (senderType === 'client') {
        this.typingService.clearTyping(ticketId, 'client');
      }

      return message;
    });
  }

  async findByTicket(
    ticketId: string,
    viewerType?: string,
    markAsRead = false,
    viewerId?: string,
  ) {
    await this.assertTicketAccess(ticketId, {
      viewerType,
      viewerId,
    });

    return this.prisma.$transaction(async (tx) => {
      if (viewerType) {
        const readAt = markAsRead ? new Date() : null;
        const statusToSet = markAsRead ? 'read' : 'delivered';

        await tx.message.updateMany({
          where: {
            ticketId,
            senderType: {
              notIn: [viewerType, 'system'],
            },
            status: markAsRead
              ? {
                  in: ['sent', 'delivered'],
                }
              : 'sent',
          },
          data: {
            status: statusToSet,
            deliveryStatus: statusToSet,
            readAt,
          },
        });
      }

      const messages = await tx.message.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
        include: {
          senderProfile: {
            select: {
              fullName: true,
            },
          },
        },
      });

      return messages.map((message) => ({
        ...message,
        senderName: message.senderProfile?.fullName ?? null,
      }));
    });
  }
}
