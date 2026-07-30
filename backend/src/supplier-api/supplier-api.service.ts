import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type DateRangeInput = {
  dateFrom?: string;
  dateTo?: string;
};

type SupplierApiContext = {
  keyId: string;
  supplierScopeId: string;
  supplierCompanyName: string;
  permissions: string[];
};

type SupplierEmployee = {
  id: string;
  fullName: string;
  role: string;
  companyName: string | null;
  supplierId: string | null;
};

@Injectable()
export class SupplierApiService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCompanyName(value?: string | null) {
    return value?.trim() || null;
  }

  private buildSupplierScopeId(companyName: string) {
    const normalizedCompany = companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');

    return `supplier_scope_${normalizedCompany || 'default'}`;
  }

  private getSupplierProfileScope(profile: {
    id: string;
    supplierId?: string | null;
    companyName?: string | null;
  }) {
    const companyName = this.normalizeCompanyName(profile.companyName);
    return (
      profile.supplierId?.trim() ||
      (companyName ? this.buildSupplierScopeId(companyName) : profile.id)
    );
  }

  private hashKey(key: string) {
    return createHash('sha256').update(key).digest('hex');
  }

  private compareHashes(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private normalizeDateRange(input?: DateRangeInput) {
    const now = new Date();
    const from = input?.dateFrom ? new Date(input.dateFrom) : null;
    const to = input?.dateTo ? new Date(input.dateTo) : null;

    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('Некорректная дата dateFrom');
    }

    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('Некорректная дата dateTo');
    }

    if (input?.dateTo && !input.dateTo.includes('T') && to) {
      to.setHours(23, 59, 59, 999);
    }

    return {
      from: from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      to: to ?? now,
    };
  }

  private average(values: Array<number | null | undefined>) {
    const finiteValues = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    if (finiteValues.length === 0) {
      return null;
    }

    return Math.round(
      finiteValues.reduce((total, value) => total + value, 0) /
        finiteValues.length,
    );
  }

  private readPermissions(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private requireAnalyticsPermission(context: SupplierApiContext) {
    if (!context.permissions.includes('analytics:read')) {
      throw new ForbiddenException('У ключа нет доступа к аналитике');
    }
  }

  private extractBearerToken(authorization?: string) {
    const [scheme, token] = authorization?.trim().split(/\s+/) ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Передайте API-ключ в Authorization: Bearer');
    }

    return token;
  }

  async authenticate(authorization?: string): Promise<SupplierApiContext> {
    const token = this.extractBearerToken(authorization);
    const tokenHash = this.hashKey(token);
    const key = await this.prisma.supplierApiKey.findUnique({
      where: { keyHash: tokenHash },
    });

    if (!key || !key.isActive || key.revokedAt) {
      throw new UnauthorizedException('API-ключ не найден или отключён');
    }

    if (!this.compareHashes(key.keyHash, tokenHash)) {
      throw new UnauthorizedException('API-ключ не найден или отключён');
    }

    await this.prisma.supplierApiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      keyId: key.id,
      supplierScopeId: key.supplierScopeId,
      supplierCompanyName: key.supplierCompanyName,
      permissions: this.readPermissions(key.permissions),
    };
  }

  async getSupplierCompanies() {
    const profiles = await this.prisma.profile.findMany({
      where: {
        role: {
          in: ['supplier', 'supplier_supervisor'],
        },
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        companyName: true,
        supplierId: true,
      },
      orderBy: [{ companyName: 'asc' }, { fullName: 'asc' }],
    });

    const companies = new Map<
      string,
      {
        supplierScopeId: string;
        supplierCompanyName: string;
        employeesCount: number;
        employees: Array<{ id: string; fullName: string; role: string }>;
      }
    >();

    for (const profile of profiles) {
      const supplierCompanyName = this.normalizeCompanyName(profile.companyName);

      if (!supplierCompanyName) {
        continue;
      }

      const supplierScopeId = this.getSupplierProfileScope(profile);
      const current =
        companies.get(supplierScopeId) ??
        {
          supplierScopeId,
          supplierCompanyName,
          employeesCount: 0,
          employees: [],
        };

      current.employeesCount += 1;
      current.employees.push({
        id: profile.id,
        fullName: profile.fullName,
        role: profile.role,
      });
      companies.set(supplierScopeId, current);
    }

    return [...companies.values()].sort((left, right) =>
      left.supplierCompanyName.localeCompare(right.supplierCompanyName, 'ru'),
    );
  }

  async listKeys() {
    const [keys, companies] = await Promise.all([
      this.prisma.supplierApiKey.findMany({
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.getSupplierCompanies(),
    ]);

    return {
      companies,
      items: keys.map((key) => ({
        id: key.id,
        name: key.name,
        supplierScopeId: key.supplierScopeId,
        supplierCompanyName: key.supplierCompanyName,
        keyPreview: key.keyPreview,
        permissions: this.readPermissions(key.permissions),
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        createdAt: key.createdAt,
      })),
    };
  }

  async createKey(body: {
    name?: string;
    supplierScopeId?: string;
    createdByAdminId?: string;
  }) {
    const supplierScopeId = body.supplierScopeId?.trim();

    if (!supplierScopeId) {
      throw new BadRequestException('Выберите поставщика');
    }

    const company = (await this.getSupplierCompanies()).find(
      (item) => item.supplierScopeId === supplierScopeId,
    );

    if (!company) {
      throw new NotFoundException('Поставщик не найден');
    }

    const rawKey = `ts_live_${randomBytes(32).toString('base64url')}`;
    const keyPreview = `${rawKey.slice(0, 10)}...${rawKey.slice(-6)}`;
    const name =
      body.name?.trim() || `Bitrix ${company.supplierCompanyName}`;

    const created = await this.prisma.supplierApiKey.create({
      data: {
        name,
        supplierScopeId: company.supplierScopeId,
        supplierCompanyName: company.supplierCompanyName,
        keyHash: this.hashKey(rawKey),
        keyPreview,
        permissions: ['analytics:read'],
        createdByAdminId: body.createdByAdminId?.trim() || null,
      },
    });

    return {
      item: {
        id: created.id,
        name: created.name,
        supplierScopeId: created.supplierScopeId,
        supplierCompanyName: created.supplierCompanyName,
        keyPreview: created.keyPreview,
        permissions: this.readPermissions(created.permissions),
        isActive: created.isActive,
        lastUsedAt: created.lastUsedAt,
        revokedAt: created.revokedAt,
        createdAt: created.createdAt,
      },
      apiKey: rawKey,
    };
  }

  async revokeKey(id: string) {
    const key = await this.prisma.supplierApiKey.findUnique({
      where: { id },
    });

    if (!key) {
      throw new NotFoundException('API-ключ не найден');
    }

    return this.prisma.supplierApiKey.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  async deleteRevokedKey(id: string) {
    const key = await this.prisma.supplierApiKey.findUnique({
      where: { id },
    });

    if (!key) {
      throw new NotFoundException('API-ключ не найден');
    }

    if (key.isActive) {
      throw new BadRequestException(
        'Сначала отключите API-ключ, затем его можно будет удалить',
      );
    }

    await this.prisma.supplierApiKey.delete({
      where: { id },
    });

    return { deleted: true, id };
  }

  private async getEmployeesForContext(context: SupplierApiContext) {
    return this.prisma.profile.findMany({
      where: {
        role: {
          in: ['supplier', 'supplier_supervisor'],
        },
        OR: [
          { id: context.supplierScopeId },
          { supplierId: context.supplierScopeId },
          { companyName: context.supplierCompanyName },
        ],
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        companyName: true,
        supplierId: true,
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  private buildSupplierRequestWhere(
    context: SupplierApiContext,
    employees: SupplierEmployee[],
    range: { from: Date; to: Date },
  ): Prisma.SupplierRequestWhereInput {
    const employeeIds = employees.map((employee) => employee.id);

    return {
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
      OR: [
        { supplierId: context.supplierScopeId },
        { supplierName: context.supplierCompanyName },
        ...(employeeIds.length
          ? [
              { supplierId: { in: employeeIds } },
              { assignedSupplierProfileId: { in: employeeIds } },
              {
                ticket: {
                  messages: {
                    some: {
                      senderType: 'supplier',
                      senderProfileId: {
                        in: employeeIds,
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    };
  }

  private resolveResponsibleEmployee(
    request: {
      assignedSupplierProfileId?: string | null;
      assignedSupplierProfileName?: string | null;
      ticket?: {
        messages?: Array<{
          senderType: string;
          senderProfileId?: string | null;
          senderProfile?: {
            fullName: string;
          } | null;
        }>;
      } | null;
    },
    employeesById: Map<string, SupplierEmployee>,
  ) {
    const assignedId = request.assignedSupplierProfileId?.trim();

    if (assignedId) {
      return {
        id: assignedId,
        name:
          employeesById.get(assignedId)?.fullName ||
          request.assignedSupplierProfileName ||
          assignedId,
      };
    }

    const supplierMessage = request.ticket?.messages?.find(
      (message) =>
        message.senderType === 'supplier' &&
        message.senderProfileId &&
        employeesById.has(message.senderProfileId),
    );

    if (supplierMessage?.senderProfileId) {
      return {
        id: supplierMessage.senderProfileId,
        name:
          supplierMessage.senderProfile?.fullName ||
          employeesById.get(supplierMessage.senderProfileId)?.fullName ||
          supplierMessage.senderProfileId,
      };
    }

    return {
      id: null,
      name: null,
    };
  }

  private isUnansweredRequest(request: {
    status: string;
    firstResponseAt?: Date | null;
    respondedAt?: Date | null;
    closedAt?: Date | null;
  }) {
    return (
      !request.firstResponseAt &&
      !request.respondedAt &&
      !request.closedAt &&
      request.status !== 'answered' &&
      request.status !== 'resolved' &&
      request.status !== 'closed'
    );
  }

  private isMissedRequest(request: {
    claimMissedAt?: Date | null;
    responseBreached: boolean;
    closedAt?: Date | null;
    firstResponseAt?: Date | null;
  }) {
    return Boolean(
      request.claimMissedAt ||
        (request.responseBreached && !request.firstResponseAt && !request.closedAt),
    );
  }

  private toDialogDto(
    request: any,
    employeesById: Map<string, SupplierEmployee>,
  ) {
    const responsible = this.resolveResponsibleEmployee(request, employeesById);
    const messages = request.ticket?.messages ?? [];

    return {
      dialogId: request.id,
      ticketId: request.ticketId,
      clientId: request.ticket?.clientId ?? null,
      clientName: request.ticket?.clientName ?? request.ticket?.title ?? null,
      clientEmail: request.ticket?.clientEmail ?? request.ticket?.currentUserEmail ?? null,
      clientPhone: request.ticket?.clientPhone ?? request.ticket?.currentUserPhone ?? null,
      createdAt: request.createdAt,
      completedAt: request.closedAt ?? null,
      status: request.status,
      responsibleSupplierEmployeeId: responsible.id,
      responsibleSupplierEmployeeName: responsible.name,
      messagesCount: messages.length,
      averageResponseTimeSeconds:
        typeof request.responseTime === 'number'
          ? Math.round(request.responseTime / 1000)
          : null,
      missed: this.isMissedRequest(request),
      unanswered: this.isUnansweredRequest(request),
    };
  }

  async getEmployees(context: SupplierApiContext) {
    this.requireAnalyticsPermission(context);
    const employees = await this.getEmployeesForContext(context);

    return employees.map((employee) => ({
      supplierEmployeeId: employee.id,
      name: employee.fullName,
      role: employee.role,
      supplierId: context.supplierScopeId,
      company: employee.companyName ?? context.supplierCompanyName,
    }));
  }

  async getAnalytics(context: SupplierApiContext, input?: DateRangeInput) {
    this.requireAnalyticsPermission(context);
    const range = this.normalizeDateRange(input);
    const employees = await this.getEmployeesForContext(context);
    const requests = await this.prisma.supplierRequest.findMany({
      where: this.buildSupplierRequestWhere(context, employees, range),
      include: {
        ticket: {
          select: {
            messages: {
              where: {
                createdAt: {
                  gte: range.from,
                  lte: range.to,
                },
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    return {
      supplierId: context.supplierScopeId,
      supplierCompanyName: context.supplierCompanyName,
      period: range,
      dialogsCount: requests.length,
      messagesCount: requests.reduce(
        (total, request) => total + (request.ticket?.messages.length ?? 0),
        0,
      ),
      averageResponseTimeSeconds:
        this.average(requests.map((request) => request.responseTime)) === null
          ? null
          : Math.round(
              (this.average(requests.map((request) => request.responseTime)) ?? 0) /
                1000,
            ),
      missedDialogsCount: requests.filter((request) => this.isMissedRequest(request))
        .length,
      unansweredDialogsCount: requests.filter((request) =>
        this.isUnansweredRequest(request),
      ).length,
    };
  }

  async getEmployeeAnalytics(
    context: SupplierApiContext,
    input?: DateRangeInput,
  ) {
    this.requireAnalyticsPermission(context);
    const range = this.normalizeDateRange(input);
    const employees = await this.getEmployeesForContext(context);
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
    const requests = await this.prisma.supplierRequest.findMany({
      where: this.buildSupplierRequestWhere(context, employees, range),
      include: {
        ticket: {
          select: {
            messages: {
              where: {
                createdAt: {
                  gte: range.from,
                  lte: range.to,
                },
              },
              select: {
                id: true,
                senderType: true,
                senderProfileId: true,
                senderProfile: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const statsByEmployee = new Map<
      string,
      {
        supplierEmployeeId: string;
        name: string;
        role: string;
        dialogsCount: number;
        messagesCount: number;
        responseTimes: number[];
        missedDialogsCount: number;
        unansweredDialogsCount: number;
      }
    >();

    for (const employee of employees) {
      statsByEmployee.set(employee.id, {
        supplierEmployeeId: employee.id,
        name: employee.fullName,
        role: employee.role,
        dialogsCount: 0,
        messagesCount: 0,
        responseTimes: [],
        missedDialogsCount: 0,
        unansweredDialogsCount: 0,
      });
    }

    for (const request of requests) {
      const responsible = this.resolveResponsibleEmployee(request, employeesById);

      if (!responsible.id) {
        continue;
      }

      const stats = statsByEmployee.get(responsible.id);

      if (!stats) {
        continue;
      }

      stats.dialogsCount += 1;
      stats.messagesCount += request.ticket?.messages.length ?? 0;

      if (typeof request.responseTime === 'number') {
        stats.responseTimes.push(request.responseTime);
      }

      if (this.isMissedRequest(request)) {
        stats.missedDialogsCount += 1;
      }

      if (this.isUnansweredRequest(request)) {
        stats.unansweredDialogsCount += 1;
      }
    }

    return [...statsByEmployee.values()].map((stats) => ({
      supplierEmployeeId: stats.supplierEmployeeId,
      name: stats.name,
      role: stats.role,
      dialogsCount: stats.dialogsCount,
      messagesCount: stats.messagesCount,
      averageResponseTimeSeconds:
        this.average(stats.responseTimes) === null
          ? null
          : Math.round((this.average(stats.responseTimes) ?? 0) / 1000),
      missedDialogsCount: stats.missedDialogsCount,
      unansweredDialogsCount: stats.unansweredDialogsCount,
    }));
  }

  async getDialogs(context: SupplierApiContext, input?: DateRangeInput) {
    this.requireAnalyticsPermission(context);
    const range = this.normalizeDateRange(input);
    const employees = await this.getEmployeesForContext(context);
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
    const requests = await this.prisma.supplierRequest.findMany({
      where: this.buildSupplierRequestWhere(context, employees, range),
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            clientId: true,
            clientName: true,
            clientEmail: true,
            clientPhone: true,
            currentUserEmail: true,
            currentUserPhone: true,
            messages: {
              where: {
                createdAt: {
                  gte: range.from,
                  lte: range.to,
                },
              },
              select: {
                id: true,
                senderType: true,
                senderProfileId: true,
                senderProfile: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return requests.map((request) => this.toDialogDto(request, employeesById));
  }

  async getDialogMessages(
    context: SupplierApiContext,
    dialogId: string,
    input?: DateRangeInput,
  ) {
    this.requireAnalyticsPermission(context);
    const range = this.normalizeDateRange(input);
    const employees = await this.getEmployeesForContext(context);
    const request = await this.prisma.supplierRequest.findFirst({
      where: {
        id: dialogId,
        ...this.buildSupplierRequestWhere(context, employees, {
          from: new Date(0),
          to: new Date('9999-12-31T23:59:59.999Z'),
        }),
      },
      include: {
        ticket: {
          include: {
            messages: {
              where: {
                createdAt: {
                  gte: range.from,
                  lte: range.to,
                },
              },
              include: {
                senderProfile: {
                  select: {
                    fullName: true,
                    role: true,
                  },
                },
              },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Диалог не найден');
    }

    return request.ticket.messages.map((message) => ({
      messageId: message.id,
      dialogId: request.id,
      ticketId: request.ticketId,
      createdAt: message.createdAt,
      authorType: message.senderType,
      authorRole: message.senderRole,
      supplierEmployeeId:
        message.senderType === 'supplier' ? message.senderProfileId : null,
      authorName:
        message.senderProfile?.fullName ||
        (message.senderType === 'client'
          ? request.ticket.clientName
          : message.senderType),
      text: message.content,
      messageType: message.messageType,
      transport: message.transport,
    }));
  }
}
