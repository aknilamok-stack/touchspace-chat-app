import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InviteManagerDto } from './dto/invite-manager.dto';
import { AssignManagerDto } from './dto/assign-manager.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { TypingService } from '../typing.service';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private typingService: TypingService,
  ) {}

  async create(title = 'Тестовый тикет') {
    const now = new Date();

    return this.prisma.ticket.create({
      data: {
        title,
        status: 'new',
        invitedManagerNames: [],
        assignedManagerId: null,
        assignedManagerName: null,
        lastResolvedByManagerId: null,
        lastResolvedByManagerName: null,
        firstResponseStartedAt: now,
        firstResponseAt: null,
        firstResponseTime: null,
        firstResponseBreached: false,
      },
    });
  }

  async createWithFirstMessage(
    title: string,
    firstMessage: string,
    senderType: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const isClientStart = senderType === 'client';
      const firstResponseTime =
        senderType === 'manager' ? 0 : null;

      const ticket = await tx.ticket.create({
        data: {
          title,
          status: isClientStart ? 'new' : 'in_progress',
          invitedManagerNames: [],
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: null,
          lastResolvedByManagerName: null,
          firstResponseStartedAt: isClientStart ? now : null,
          firstResponseAt: senderType === 'manager' ? now : null,
          firstResponseTime,
          firstResponseBreached: false,
        },
      });

      const message = await tx.message.create({
        data: {
          ticketId: ticket.id,
          content: firstMessage,
          senderType,
        },
      });

      return {
        ...ticket,
        messages: [message],
      };
    });
  }

  async findAll() {
    return this.prisma.ticket.findMany({
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
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
      select: { id: true, status: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: 'resolved',
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: resolveTicketDto.managerId,
          lastResolvedByManagerName: resolveTicketDto.managerName,
          closedAt: new Date(),
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Диалог отмечен как решённый менеджером ${resolveTicketDto.managerName}`,
          senderType: 'system',
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
        status: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: 'in_progress',
          assignedManagerId: assignManagerDto.managerId,
          assignedManagerName: assignManagerDto.managerName,
          closedAt: null,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Менеджер ${assignManagerDto.managerName} снова открыл диалог`,
          senderType: 'system',
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
        invitedManagerNames: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (ticket.invitedManagerNames.includes(inviteManagerDto.managerName)) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          invitedManagerNames: [...ticket.invitedManagerNames, inviteManagerDto.managerName],
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `В диалог приглашён менеджер ${inviteManagerDto.managerName}`,
          senderType: 'system',
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
        assignedManagerName: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (ticket.assignedManagerId === assignManagerDto.managerId) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          assignedManagerId: assignManagerDto.managerId,
          assignedManagerName: assignManagerDto.managerName,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Диалог передан менеджеру ${assignManagerDto.managerName}`,
          senderType: 'system',
        },
      });

      return updatedTicket;
    });
  }
}
