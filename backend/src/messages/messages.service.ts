import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TypingService } from '../typing.service';
import { ProfilesService } from '../profiles.service';
import { ChatAiService } from '../chat-ai.service';
import { PushService } from '../push.service';
import { readJsonStringArray } from '../prisma-json.util';

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

    const { message, shouldAiReply, ticketSnapshot } = await this.prisma.$transaction(async (tx) => {
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
          supplierId: true,
          supplierName: true,
        },
      });

      if (!ticket) {
        throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
      }

      if (senderType === 'client' && ticket.status === 'resolved') {
        const reopenedAt = new Date();

        await this.createSystemMessage(tx, ticketId, 'Клиент возобновил диалог');

        await tx.ticket.update({
          where: { id: ticketId },
          data: {
            assignedManagerId: null,
            assignedManagerName: null,
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
        nextStatus = managerMessagesCount > 0 ? 'in_progress' : 'new';
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
        ticketUpdateData.clientId = actorId ?? ticket.clientId;
        ticketUpdateData.clientName = actorName ?? ticket.clientName;
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
      }

      if (senderType === 'manager' && ticket.aiEnabled) {
        await this.createSystemMessage(tx, ticketId, 'Менеджер подключился к диалогу');
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
          this.pushService.sendToProfiles(targets, {
            title: 'Новое сообщение от клиента',
            body: content.length > 120 ? `${content.slice(0, 120)}...` : content,
            url: `/?ticket=${ticketId}`,
            tag: `ticket-${ticketId}`,
          }, 'client_chats', actorId),
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
        .sendToProfiles([...new Set(managerTargets)], {
          title: 'Новое сообщение от поставщика',
          body: content.length > 120 ? `${content.slice(0, 120)}...` : content,
          url: `/?ticket=${ticketId}`,
          tag: `ticket-${ticketId}`,
        }, 'supplier_chats', actorId)
        .catch((error) =>
          console.error('Ошибка push-уведомления для менеджера по сообщению поставщика:', error),
        );
    } else if (senderType === 'manager' && ticketSnapshot.supplierId) {
      void this.pushService
        .sendToProfiles([ticketSnapshot.supplierId], {
          title: 'Новое сообщение по вашему запросу',
          body: content.length > 120 ? `${content.slice(0, 120)}...` : content,
          url: `/supplier?ticket=${ticketId}`,
          tag: `supplier-ticket-${ticketId}`,
        }, 'supplier_chats', actorId)
        .catch((error) =>
          console.error('Ошибка push-уведомления поставщику:', error),
        );
    }

    return message;
  }

  async createAttachment(
    file: any,
    ticketId: string,
    senderType: string,
    managerId?: string,
    managerName?: string,
    senderId?: string,
    senderName?: string,
    caption?: string,
  ) {
    if (!file) {
      throw new NotFoundException('Attachment file is required');
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

    const attachmentPayload = JSON.stringify({
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      caption: caption?.trim() || '',
    });

    const message = await this.prisma.message.create({
      data: {
        ticketId,
        content: attachmentPayload,
        senderType,
        senderRole: senderType,
        senderProfileId: actorId ?? null,
        status: 'sent',
        deliveryStatus: 'sent',
        messageType: 'attachment',
        isInternal: false,
      },
    });

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: message.createdAt,
        closedAt: null,
        status: senderType === 'client' ? 'new' : undefined,
      },
    });

    return message;
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
