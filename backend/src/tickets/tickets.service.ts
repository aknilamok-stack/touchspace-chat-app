import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InviteManagerDto } from './dto/invite-manager.dto';
import { AssignManagerDto } from './dto/assign-manager.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { TypingService } from '../typing.service';
import { ProfilesService } from '../profiles.service';
import { ChatAiService } from '../chat-ai.service';

type TicketViewer = {
  viewerType?: string;
  viewerId?: string;
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typingService: TypingService,
    private readonly profilesService: ProfilesService,
    private readonly chatAiService: ChatAiService,
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

  private buildTicketWhere(viewer?: TicketViewer) {
    const viewerId = viewer?.viewerId?.trim();
    const viewerType = viewer?.viewerType?.trim();

    if (!viewerType || !viewerId) {
      return undefined;
    }

    if (viewerType === 'client') {
      return { clientId: viewerId };
    }

    if (viewerType === 'supplier') {
      return {
        OR: [
          { supplierId: viewerId },
          {
            supplierRequests: {
              some: {
                supplierId: viewerId,
              },
            },
          },
        ],
      };
    }

    if (viewerType === 'manager') {
      return {
        OR: [
          { assignedManagerId: null },
          { assignedManagerId: viewerId },
          { invitedManagerIds: { has: viewerId } },
          { lastResolvedByManagerId: viewerId },
        ],
      };
    }

    return undefined;
  }

  async create(title = 'Тестовый тикет', clientId?: string, clientName?: string) {
    const now = new Date();

    await this.profilesService.ensureProfile({
      id: clientId,
      fullName: clientName,
      role: clientId ? 'client' : null,
    });

    return this.prisma.ticket.create({
      data: {
        title,
        status: 'new',
        conversationMode: 'manager',
        currentHandlerType: 'manager',
        aiEnabled: false,
        aiResolved: false,
        invitedManagerIds: [],
        invitedManagerNames: [],
        assignedManagerId: null,
        assignedManagerName: null,
        lastResolvedByManagerId: null,
        lastResolvedByManagerName: null,
        clientId: clientId ?? null,
        clientName: clientName ?? null,
        supplierId: null,
        supplierName: null,
        firstResponseStartedAt: now,
        firstResponseAt: null,
        firstResponseTime: null,
        firstResponseBreached: false,
        lastMessageAt: null,
      },
    });
  }

  async createWithFirstMessage(
    title: string,
    firstMessage: string,
    senderType: string,
    senderId?: string,
    senderName?: string,
    clientId?: string,
    clientName?: string,
    aiEnabled = false,
  ) {
    const createdTicket = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const isClientStart = senderType === 'client';
      const normalizedClientId =
        senderType === 'client' ? (senderId ?? clientId ?? null) : (clientId ?? null);
      const normalizedClientName =
        senderType === 'client' ? (senderName ?? clientName ?? null) : (clientName ?? null);
      const firstResponseTime = senderType === 'manager' ? 0 : null;

      await this.profilesService.ensureProfile({
        id: normalizedClientId,
        fullName: normalizedClientName,
        role: normalizedClientId ? 'client' : null,
      });

      if (senderId) {
        await this.profilesService.ensureProfile({
          id: senderId,
          fullName: senderName,
          role: senderType,
        });
      }

      const ticket = await tx.ticket.create({
        data: {
          title,
          status: isClientStart ? 'new' : 'in_progress',
          conversationMode: aiEnabled ? 'ai' : 'manager',
          currentHandlerType: aiEnabled ? 'ai' : 'manager',
          aiEnabled,
          aiActivatedAt: aiEnabled ? now : null,
          aiResolved: false,
          invitedManagerIds: [],
          invitedManagerNames: [],
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: null,
          lastResolvedByManagerName: null,
          clientId: normalizedClientId,
          clientName: normalizedClientName,
          supplierId: senderType === 'supplier' ? (senderId ?? null) : null,
          supplierName: senderType === 'supplier' ? (senderName ?? null) : null,
          firstResponseStartedAt: isClientStart ? now : null,
          firstResponseAt: senderType === 'manager' ? now : null,
          firstResponseTime,
          firstResponseBreached: false,
          lastMessageAt: now,
        },
      });

      const message = await tx.message.create({
        data: {
          ticketId: ticket.id,
          content: firstMessage,
          senderType,
          senderRole: senderType,
          senderProfileId: senderId ?? null,
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'text',
        },
      });

      if (aiEnabled) {
        await this.createSystemMessage(tx, ticket.id, 'AI-помощник подключён к диалогу');
      }

      return {
        ...ticket,
        messages: [message],
      };
    });

    if (aiEnabled) {
      void this.chatAiService.persistAiTurn(createdTicket.id).catch((error) => {
        console.error('Ошибка AI-ответа в createWithFirstMessage:', error);
      });
    }

    return this.prisma.ticket.findUnique({
      where: { id: createdTicket.id },
    });
  }

  async findAll(viewer?: TicketViewer) {
    return this.prisma.ticket.findMany({
      where: this.buildTicketWhere(viewer),
      orderBy: [{ pinned: 'desc' }, { lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async updateTyping(id: string, senderType: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    this.typingService.setTyping(id, senderType);

    return {
      ok: true,
    };
  }

  async getTyping(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    return this.typingService.getTyping(id);
  }

  async togglePinned(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true, pinned: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (!ticket.pinned) {
      const pinnedTicketsCount = await this.prisma.ticket.count({
        where: { pinned: true },
      });

      if (pinnedTicketsCount >= 3) {
        throw new BadRequestException('Можно закрепить максимум 3 чата');
      }
    }

    return this.prisma.ticket.update({
      where: { id },
      data: {
        pinned: !ticket.pinned,
      },
    });
  }

  async resolve(id: string, resolveTicketDto: ResolveTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: resolveTicketDto.managerId,
      fullName: resolveTicketDto.managerName,
      role: 'manager',
    });

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: 'resolved',
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: resolveTicketDto.managerId,
          lastResolvedByManagerName: resolveTicketDto.managerName,
          resolvedAt: now,
          closedAt: now,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Диалог отмечен как решённый менеджером ${resolveTicketDto.managerName}`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async reopen(id: string, assignManagerDto: AssignManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: assignManagerDto.managerId,
      fullName: assignManagerDto.managerName,
      role: 'manager',
    });

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: 'in_progress',
          assignedManagerId: assignManagerDto.managerId,
          assignedManagerName: assignManagerDto.managerName,
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiEnabled: false,
          handedToManagerAt: now,
          resolvedAt: null,
          closedAt: null,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Менеджер ${assignManagerDto.managerName} снова открыл диалог`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async inviteManager(id: string, inviteManagerDto: InviteManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        invitedManagerIds: true,
        invitedManagerNames: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: inviteManagerDto.managerId,
      fullName: inviteManagerDto.managerName,
      role: 'manager',
    });

    if (ticket.invitedManagerIds.includes(inviteManagerDto.managerId)) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          invitedManagerIds: [...ticket.invitedManagerIds, inviteManagerDto.managerId],
          invitedManagerNames: [...ticket.invitedManagerNames, inviteManagerDto.managerName],
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `В диалог приглашён менеджер ${inviteManagerDto.managerName}`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async assignManager(id: string, assignManagerDto: AssignManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        assignedManagerId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: assignManagerDto.managerId,
      fullName: assignManagerDto.managerName,
      role: 'manager',
    });

    if (ticket.assignedManagerId === assignManagerDto.managerId) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          assignedManagerId: assignManagerDto.managerId,
          assignedManagerName: assignManagerDto.managerName,
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiEnabled: false,
          handedToManagerAt: now,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Диалог передан менеджеру ${assignManagerDto.managerName}`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async claimIncoming(id: string, assignManagerDto: AssignManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        aiEnabled: true,
        assignedManagerId: true,
        assignedManagerName: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: assignManagerDto.managerId,
      fullName: assignManagerDto.managerName,
      role: 'manager',
    });

    if (ticket.aiEnabled) {
      throw new ConflictException('Диалог сейчас ведёт AI и его нельзя взять как обычный входящий');
    }

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      throw new ConflictException('Диалог уже закрыт и недоступен для взятия в работу');
    }

    if (ticket.assignedManagerId === assignManagerDto.managerId) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    if (ticket.assignedManagerId && ticket.assignedManagerId !== assignManagerDto.managerId) {
      throw new ConflictException(
        `Диалог уже взят в работу менеджером ${ticket.assignedManagerName ?? 'другим менеджером'}`,
      );
    }

    const now = new Date();
    const updateResult = await this.prisma.ticket.updateMany({
      where: {
        id,
        assignedManagerId: null,
        aiEnabled: false,
        status: {
          notIn: ['resolved', 'closed'],
        },
      },
      data: {
        assignedManagerId: assignManagerDto.managerId,
        assignedManagerName: assignManagerDto.managerName,
        status: 'in_progress',
        conversationMode: 'manager',
        currentHandlerType: 'manager',
        handedToManagerAt: now,
      },
    });

    if (updateResult.count === 0) {
      const latestTicket = await this.prisma.ticket.findUnique({
        where: { id },
        select: {
          assignedManagerId: true,
          assignedManagerName: true,
        },
      });

      throw new ConflictException(
        `Диалог уже взят в работу менеджером ${latestTicket?.assignedManagerName ?? 'другим менеджером'}`,
      );
    }

    await this.prisma.message.create({
      data: {
        ticketId: id,
        content: `Диалог взят в работу менеджером ${assignManagerDto.managerName}`,
        senderType: 'system',
        senderRole: 'system',
        status: 'sent',
        deliveryStatus: 'sent',
        messageType: 'system',
      },
    });

    await this.prisma.ticket.update({
      where: { id },
      data: {
        lastMessageAt: now,
      },
    });

    return this.prisma.ticket.findUnique({
      where: { id },
    });
  }

  async enableAiMode(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true, aiEnabled: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (ticket.aiEnabled) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.ticket.update({
        where: { id },
        data: {
          aiEnabled: true,
          conversationMode: 'ai',
          currentHandlerType: 'ai',
          aiActivatedAt: now,
          aiResolved: false,
        },
      });

      await this.createSystemMessage(tx, id, 'AI-помощник подключён к диалогу');

      return tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });
    });
  }

  async disableAiMode(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.ticket.update({
        where: { id },
        data: {
          aiEnabled: false,
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiDeactivatedAt: now,
          handedToManagerAt: now,
          aiResolved: false,
        },
      });

      await this.createSystemMessage(tx, id, 'AI-помощник отключён. Диалог снова ведёт менеджер');

      return tx.ticket.update({
        where: { id },
        data: {
          status: 'new',
          lastMessageAt: now,
        },
      });
    });
  }
}
