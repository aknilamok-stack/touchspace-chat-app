import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSupplierRequestDto } from './dto/create-supplier-request.dto';
import { UpdateSupplierRequestStatusDto } from './dto/update-supplier-request-status.dto';
import { ProfilesService } from '../profiles.service';
import { PushService } from '../push.service';

@Injectable()
export class SupplierRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
    private readonly pushService: PushService,
  ) {}

  private buildStatusChangedMessage(
    supplierName: string,
    status: UpdateSupplierRequestStatusDto['status'],
  ) {
    return `Запрос поставщику ${supplierName} переведён в статус: ${status}`;
  }

  async create(createSupplierRequestDto: CreateSupplierRequestDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: createSupplierRequestDto.ticketId },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(
        `Ticket with id "${createSupplierRequestDto.ticketId}" not found`,
      );
    }

    await this.profilesService.ensureProfile({
      id: createSupplierRequestDto.supplierId,
      fullName: createSupplierRequestDto.supplierName,
      role: createSupplierRequestDto.supplierId ? 'supplier' : null,
      supplierId: createSupplierRequestDto.supplierId ?? null,
    });

    await this.profilesService.ensureProfile({
      id: createSupplierRequestDto.createdByManagerId,
      fullName: createSupplierRequestDto.createdByManagerId ?? undefined,
      role: createSupplierRequestDto.createdByManagerId ? 'manager' : null,
    });

    const systemMessage = `Запрошен поставщик: ${createSupplierRequestDto.supplierName}. Комментарий: ${createSupplierRequestDto.requestText}`;

    const supplierRequest = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const createdSupplierRequest = await tx.supplierRequest.create({
        data: {
          ticketId: createSupplierRequestDto.ticketId,
          supplierId: createSupplierRequestDto.supplierId ?? null,
          supplierName: createSupplierRequestDto.supplierName,
          requestText: createSupplierRequestDto.requestText,
          status: createSupplierRequestDto.status ?? 'pending',
          slaMinutes: createSupplierRequestDto.slaMinutes ?? null,
          createdByManagerId:
            createSupplierRequestDto.createdByManagerId ?? null,
          requestedAt: now,
          responseStartedAt: now,
          firstResponseAt: null,
          respondedAt: null,
          responseTime: null,
          responseBreached: false,
        },
      });

      await tx.message.create({
        data: {
          ticketId: createSupplierRequestDto.ticketId,
          content: systemMessage,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id: createSupplierRequestDto.ticketId },
        data: {
          status: 'waiting_supplier',
          supplierId: createSupplierRequestDto.supplierId ?? null,
          supplierName: createSupplierRequestDto.supplierName,
          supplierEscalatedAt: now,
          lastMessageAt: now,
        },
      });

      return createdSupplierRequest;
    });

    if (supplierRequest.supplierId) {
      void this.pushService
        .sendToProfiles([supplierRequest.supplierId], {
          title: 'Новый запрос поставщику',
          body:
            supplierRequest.requestText.length > 120
              ? `${supplierRequest.requestText.slice(0, 120)}...`
              : supplierRequest.requestText,
          url: `/supplier?request=${supplierRequest.id}`,
          tag: `supplier-request-${supplierRequest.id}`,
        }, 'supplier_requests', supplierRequest.createdByManagerId ?? undefined)
        .catch((error) =>
          console.error('Ошибка push-уведомления поставщику:', error),
        );
    }

    return supplierRequest;
  }

  async findByTicket(ticketId: string, supplierId?: string) {
    return this.prisma.supplierRequest.findMany({
      where: {
        ticketId,
        ...(supplierId ? { supplierId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(supplierName?: string, supplierId?: string) {
    return this.prisma.supplierRequest.findMany({
      where: {
        ...(supplierName ? { supplierName } : {}),
        ...(supplierId ? { supplierId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    status: UpdateSupplierRequestStatusDto['status'],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const supplierRequest = await tx.supplierRequest.findUnique({
        where: { id },
      });

      if (!supplierRequest) {
        throw new NotFoundException(`SupplierRequest with id "${id}" not found`);
      }

      const updatedSupplierRequest = await tx.supplierRequest.update({
        where: { id },
        data: {
          status,
          respondedAt: status === 'answered' ? new Date() : supplierRequest.respondedAt,
          closedAt: status === 'closed' ? new Date() : null,
        },
      });

      const now = new Date();

      await tx.message.create({
        data: {
          ticketId: supplierRequest.ticketId,
          content: this.buildStatusChangedMessage(
            supplierRequest.supplierName,
            status,
          ),
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      if (status === 'answered') {
        await tx.ticket.update({
          where: { id: supplierRequest.ticketId },
          data: {
            status: 'in_progress',
            lastMessageAt: now,
          },
        });
      } else {
        await tx.ticket.update({
          where: { id: supplierRequest.ticketId },
          data: {
            lastMessageAt: now,
          },
        });
      }

      return updatedSupplierRequest;
    });
  }
}
