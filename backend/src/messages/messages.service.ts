import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TypingService } from '../typing.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private typingService: TypingService,
  ) {}

  async create(
    ticketId: string,
    content: string,
    senderType: string,
    managerId?: string,
    managerName?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          status: true,
          firstResponseStartedAt: true,
          firstResponseAt: true,
          assignedManagerId: true,
          assignedManagerName: true,
        },
      });

      if (!ticket) {
        throw new Error(`Ticket with id "${ticketId}" not found`);
      }

      if (senderType === 'client' && ticket.status === 'resolved') {
        await tx.message.create({
          data: {
            ticketId,
            content: 'Клиент возобновил диалог',
            senderType: 'system',
          },
        });
      }

      const message = await tx.message.create({
        data: {
          ticketId,
          content,
          senderType,
          status: 'sent',
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

      if (senderType === 'supplier') {
        nextStatus = 'in_progress';
      }

      if (nextStatus !== ticket.status) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: nextStatus,
            assignedManagerId:
              senderType === 'client' && ticket.status === 'resolved'
                ? null
                : undefined,
            assignedManagerName:
              senderType === 'client' && ticket.status === 'resolved'
                ? null
                : undefined,
            firstResponseStartedAt:
              senderType === 'client' && ticket.status === 'resolved'
                ? message.createdAt
                : undefined,
            firstResponseAt:
              senderType === 'client' && ticket.status === 'resolved'
                ? null
                : undefined,
            firstResponseTime:
              senderType === 'client' && ticket.status === 'resolved'
                ? null
                : undefined,
            firstResponseBreached:
              senderType === 'client' && ticket.status === 'resolved'
                ? false
                : undefined,
            closedAt: null,
          },
        });
      }

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
              responseTime: durationMs,
              responseBreached: durationMs > 60 * 60 * 1000,
            },
          });
        }
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (viewerType) {
        await tx.message.updateMany({
          where: {
            ticketId,
            senderType: {
              notIn: [viewerType, 'system'],
            },
            status: 'sent',
          },
          data: {
            status: 'delivered',
          },
        });

        if (markAsRead) {
          await tx.message.updateMany({
            where: {
              ticketId,
              senderType: {
                notIn: [viewerType, 'system'],
              },
              status: {
                in: ['sent', 'delivered'],
              },
            },
            data: {
              status: 'read',
            },
          });
        }
      }

      return tx.message.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
      });
    });
  }
}
