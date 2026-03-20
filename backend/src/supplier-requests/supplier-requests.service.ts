import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateSupplierRequestDto } from './dto/create-supplier-request.dto';
import { UpdateSupplierRequestStatusDto } from './dto/update-supplier-request-status.dto';

@Injectable()
export class SupplierRequestsService {
  constructor(private prisma: PrismaService) {}

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

    const systemMessage = `Запрошен поставщик: ${createSupplierRequestDto.supplierName}. Комментарий: ${createSupplierRequestDto.requestText}`;

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const supplierRequest = await tx.supplierRequest.create({
        data: {
          ticketId: createSupplierRequestDto.ticketId,
          supplierId: createSupplierRequestDto.supplierId ?? null,
          supplierName: createSupplierRequestDto.supplierName,
          requestText: createSupplierRequestDto.requestText,
          status: createSupplierRequestDto.status ?? 'pending',
          slaMinutes: createSupplierRequestDto.slaMinutes ?? null,
          createdByManagerId:
            createSupplierRequestDto.createdByManagerId ?? null,
          responseStartedAt: now,
          firstResponseAt: null,
          responseTime: null,
          responseBreached: false,
        },
      });

      await tx.message.create({
        data: {
          ticketId: createSupplierRequestDto.ticketId,
          content: systemMessage,
          senderType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id: createSupplierRequestDto.ticketId },
        data: {
          status: 'waiting_supplier',
        },
      });

      return supplierRequest;
    });
  }

  async findByTicket(ticketId: string) {
    return this.prisma.supplierRequest.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(supplierName?: string) {
    return this.prisma.supplierRequest.findMany({
      where: supplierName ? { supplierName } : undefined,
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
          closedAt: status === 'closed' ? new Date() : null,
        },
      });

      await tx.message.create({
        data: {
          ticketId: supplierRequest.ticketId,
          content: this.buildStatusChangedMessage(
            supplierRequest.supplierName,
            status,
          ),
          senderType: 'system',
        },
      });

      if (status === 'answered') {
        await tx.ticket.update({
          where: { id: supplierRequest.ticketId },
          data: {
            status: 'in_progress',
          },
        });
      }

      return updatedSupplierRequest;
    });
  }
}
