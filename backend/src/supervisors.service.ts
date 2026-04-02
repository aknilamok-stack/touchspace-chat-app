import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

type SupervisorRole = 'manager_supervisor' | 'supplier_supervisor';

type UpdateOperatorAccountInput = {
  authLogin?: string;
  email?: string | null;
};

type AnalyticsRangeInput = {
  preset?: string;
  dateFrom?: string;
  dateTo?: string;
};

@Injectable()
export class SupervisorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  private sanitizeLoginCandidate(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._-]+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  }

  private normalizeEmail(value?: string | null) {
    const normalizedValue = value?.trim().toLowerCase() || '';

    if (!normalizedValue) {
      return null;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedValue)) {
      throw new BadRequestException('Некорректный email');
    }

    return normalizedValue;
  }

  private async getSupervisor(supervisorId: string) {
    const normalizedSupervisorId = supervisorId?.trim();

    if (!normalizedSupervisorId) {
      throw new BadRequestException('supervisorId обязателен');
    }

    const supervisor = await this.prisma.profile.findUnique({
      where: { id: normalizedSupervisorId },
      select: {
        id: true,
        role: true,
        supplierId: true,
        fullName: true,
      },
    });

    if (!supervisor) {
      throw new NotFoundException(
        `Supervisor with id "${normalizedSupervisorId}" not found`,
      );
    }

    if (
      supervisor.role !== 'manager_supervisor' &&
      supervisor.role !== 'supplier_supervisor'
    ) {
      throw new BadRequestException(
        'Только управленец может управлять операторами',
      );
    }

    return supervisor;
  }

  private toDate(value?: string | null) {
    if (!value?.trim()) {
      return null;
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private normalizeAnalyticsRange(input?: AnalyticsRangeInput) {
    const now = new Date();
    const preset = input?.preset?.trim() || 'day';
    const customFrom = this.toDate(input?.dateFrom);
    const customTo = this.toDate(input?.dateTo);

    if (preset === 'custom' && customFrom && customTo) {
      return {
        preset,
        from: new Date(customFrom.setHours(0, 0, 0, 0)),
        to: new Date(customTo.setHours(23, 59, 59, 999)),
      };
    }

    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);

    if (preset === 'week') {
      from.setDate(from.getDate() - 6);
    } else if (preset === 'month') {
      from.setDate(from.getDate() - 29);
    }

    return {
      preset,
      from,
      to,
    };
  }

  private average(values: Array<number | null | undefined>) {
    const validValues = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    if (validValues.length === 0) {
      return null;
    }

    return Math.round(
      validValues.reduce((total, value) => total + value, 0) / validValues.length,
    );
  }

  private buildSlaRating(onTimeRate: number) {
    if (onTimeRate >= 80) {
      return {
        label: 'Отвечают вовремя',
        tone: 'good',
      };
    }

    if (onTimeRate >= 50) {
      return {
        label: 'Отвечают долговато',
        tone: 'warning',
      };
    }

    return {
      label: 'Отвечают долго',
      tone: 'critical',
    };
  }

  private async ensureOperatorInScope(
    supervisorId: string,
    operatorId: string,
  ) {
    const supervisor = await this.getSupervisor(supervisorId);
    const normalizedOperatorId = operatorId?.trim();

    if (!normalizedOperatorId) {
      throw new BadRequestException('operatorId обязателен');
    }

    const where =
      supervisor.role === 'supplier_supervisor'
        ? {
            id: normalizedOperatorId,
            role: 'supplier',
            supplierId: supervisor.supplierId,
          }
        : {
            id: normalizedOperatorId,
            role: 'manager',
          };

    const operator = await this.prisma.profile.findFirst({
      where,
      select: {
        id: true,
        role: true,
        fullName: true,
        authLogin: true,
        email: true,
        supplierId: true,
        chatAccessEnabled: true,
      },
    });

    if (!operator) {
      throw new NotFoundException(
        `Operator with id "${normalizedOperatorId}" not found in supervisor scope`,
      );
    }

    return {
      supervisor,
      operator,
    };
  }

  async listOperators(supervisorId: string) {
    const supervisor = await this.getSupervisor(supervisorId);
    const role: SupervisorRole = supervisor.role as SupervisorRole;

    const operators = await this.prisma.profile.findMany({
      where:
        role === 'supplier_supervisor'
          ? {
              role: 'supplier',
              supplierId: supervisor.supplierId,
            }
          : {
              role: 'manager',
            },
      orderBy: [{ fullName: 'asc' }],
      select: {
        id: true,
        fullName: true,
        authLogin: true,
        email: true,
        role: true,
        status: true,
        supplierId: true,
        managerStatus: true,
        managerPresenceHeartbeatAt: true,
        supplierStatus: true,
        supplierPresenceHeartbeatAt: true,
        lastLoginAt: true,
        passwordChangeRequired: true,
        chatAccessEnabled: true,
      },
    });

    return {
      scope: role,
      supervisor: {
        id: supervisor.id,
        fullName: supervisor.fullName,
        role: supervisor.role,
        supplierId: supervisor.supplierId,
      },
      items: operators.map((operator) => ({
        id: operator.id,
        fullName: operator.fullName,
        authLogin: operator.authLogin,
        email: operator.email,
        role: operator.role,
        supplierId: operator.supplierId,
        status:
          role === 'supplier_supervisor'
            ? operator.supplierStatus || 'offline'
            : operator.managerStatus || 'offline',
        lastSeenAt:
          role === 'supplier_supervisor'
            ? operator.supplierPresenceHeartbeatAt || operator.lastLoginAt
            : operator.managerPresenceHeartbeatAt || operator.lastLoginAt,
        lastLoginAt: operator.lastLoginAt,
        passwordChangeRequired: operator.passwordChangeRequired,
        chatAccessEnabled: operator.chatAccessEnabled,
      })),
    };
  }

  async updateOperatorChatAccess(
    supervisorId: string,
    operatorId: string,
    enabled: boolean,
  ) {
    await this.ensureOperatorInScope(supervisorId, operatorId);

    const updatedOperator = await this.prisma.profile.update({
      where: { id: operatorId },
      data: {
        chatAccessEnabled: enabled,
      },
      select: {
        id: true,
        chatAccessEnabled: true,
      },
    });

    return {
      ok: true,
      operator: updatedOperator,
    };
  }

  async updateOperatorAccount(
    supervisorId: string,
    operatorId: string,
    input: UpdateOperatorAccountInput,
  ) {
    const { operator } = await this.ensureOperatorInScope(supervisorId, operatorId);
    const nextEmail = this.normalizeEmail(input.email);
    const nextAuthLogin = input.authLogin
      ? this.sanitizeLoginCandidate(input.authLogin)
      : '';

    if (!nextEmail && !nextAuthLogin) {
      throw new BadRequestException(
        'Нужно передать новый логин и/или email оператора',
      );
    }

    if (nextEmail && nextEmail !== operator.email) {
      const emailOwner = await this.prisma.profile.findFirst({
        where: {
          email: nextEmail,
          id: {
            not: operator.id,
          },
        },
        select: { id: true },
      });

      if (emailOwner) {
        throw new BadRequestException('Этот email уже используется');
      }
    }

    if (nextAuthLogin && nextAuthLogin !== operator.authLogin) {
      const loginOwner = await this.prisma.profile.findFirst({
        where: {
          authLogin: nextAuthLogin,
          id: {
            not: operator.id,
          },
        },
        select: { id: true },
      });

      if (loginOwner) {
        throw new BadRequestException('Этот логин уже используется');
      }
    }

    const updatedOperator = await this.prisma.profile.update({
      where: { id: operator.id },
      data: {
        ...(nextEmail !== null ? { email: nextEmail } : {}),
        ...(nextAuthLogin ? { authLogin: nextAuthLogin } : {}),
      },
      select: {
        id: true,
        fullName: true,
        authLogin: true,
        email: true,
      },
    });

    return {
      ok: true,
      operator: updatedOperator,
    };
  }

  async reissueOperatorPassword(supervisorId: string, operatorId: string) {
    const { operator } = await this.ensureOperatorInScope(supervisorId, operatorId);
    const credentials = await this.authService.issueCredentialsForProfile(
      operator.id,
      operator.authLogin ?? operator.email ?? undefined,
    );

    return {
      ok: true,
      operatorId: operator.id,
      fullName: operator.fullName,
      credentials,
    };
  }

  async getAnalytics(supervisorId: string, input?: AnalyticsRangeInput) {
    const supervisor = await this.getSupervisor(supervisorId);
    const range = this.normalizeAnalyticsRange(input);

    if (supervisor.role === 'supplier_supervisor') {
      const operators = await this.prisma.profile.findMany({
        where: {
          role: 'supplier',
          supplierId: supervisor.supplierId,
        },
        select: {
          id: true,
          fullName: true,
          supplierStatus: true,
          lastLoginAt: true,
        },
        orderBy: {
          fullName: 'asc',
        },
      });

      const requests = await this.prisma.supplierRequest.findMany({
        where: {
          supplierId: supervisor.supplierId,
          createdAt: {
            gte: range.from,
            lte: range.to,
          },
        },
        select: {
          id: true,
          status: true,
          assignedSupplierProfileId: true,
          firstResponseAt: true,
          responseTime: true,
          responseBreached: true,
          createdAt: true,
          claimedAt: true,
        },
      });

      const markedRequests = requests.filter(
        (request) =>
          Boolean(request.firstResponseAt) ||
          request.status === 'answered' ||
          request.status === 'closed',
      );
      const unansweredRequests = requests.filter((request) => !request.firstResponseAt);
      const onTimeRequests = requests.filter((request) => !request.responseBreached);
      const onTimeRate = requests.length
        ? Math.round((onTimeRequests.length / requests.length) * 100)
        : 100;
      const rating = this.buildSlaRating(onTimeRate);
      const byOperator = operators.map((operator) => {
        const operatorRequests = requests.filter(
          (request) => request.assignedSupplierProfileId === operator.id,
        );

        return {
          id: operator.id,
          fullName: operator.fullName,
          totalRequests: operatorRequests.length,
          markedRequests: operatorRequests.filter(
            (request) =>
              Boolean(request.firstResponseAt) ||
              request.status === 'answered' ||
              request.status === 'closed',
          ).length,
          avgResponseMs: this.average(operatorRequests.map((request) => request.responseTime)),
          onTimeRate: operatorRequests.length
            ? Math.round(
                (operatorRequests.filter((request) => !request.responseBreached).length /
                  operatorRequests.length) *
                  100,
              )
            : 100,
        };
      });

      const topOperator =
        byOperator
          .slice()
          .sort((left, right) => right.totalRequests - left.totalRequests)[0] ?? null;

      return {
        scope: supervisor.role,
        period: {
          preset: range.preset,
          from: range.from,
          to: range.to,
        },
        summary: {
          totalRequests: requests.length,
          markedRequests: markedRequests.length,
          unmarkedRequests: requests.length - markedRequests.length,
          avgResponseMs: this.average(requests.map((request) => request.responseTime)),
          onTimeRate,
          rating,
        },
        breakdown: {
          byOperator,
        },
        insights: {
          activeOperators: operators.filter((operator) => operator.supplierStatus === 'online')
            .length,
          unansweredRequests: unansweredRequests.length,
          takenInWork: requests.filter((request) => Boolean(request.claimedAt)).length,
          topOperator: topOperator?.fullName ?? null,
        },
      };
    }

    const operators = await this.prisma.profile.findMany({
      where: {
        role: 'manager',
      },
      select: {
        id: true,
        fullName: true,
        managerStatus: true,
        lastLoginAt: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    const operatorIds = operators.map((operator) => operator.id);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
        OR: [
          {
            assignedManagerId: {
              in: operatorIds,
            },
          },
          {
            lastResolvedByManagerId: {
              in: operatorIds,
            },
          },
        ],
      },
      select: {
        id: true,
        assignedManagerId: true,
        lastResolvedByManagerId: true,
        firstResponseTime: true,
        firstResponseBreached: true,
        slaBreached: true,
        status: true,
        resolvedAt: true,
        createdAt: true,
        supplierEscalatedAt: true,
      },
    });

    const markedTickets = tickets.filter(
      (ticket) => ticket.status === 'resolved' || ticket.status === 'closed' || Boolean(ticket.resolvedAt),
    );
    const onTimeTickets = tickets.filter(
      (ticket) => !ticket.firstResponseBreached && !ticket.slaBreached,
    );
    const onTimeRate = tickets.length
      ? Math.round((onTimeTickets.length / tickets.length) * 100)
      : 100;
    const rating = this.buildSlaRating(onTimeRate);
    const byOperator = operators.map((operator) => {
      const operatorTickets = tickets.filter(
        (ticket) =>
          ticket.assignedManagerId === operator.id ||
          ticket.lastResolvedByManagerId === operator.id,
      );

      return {
        id: operator.id,
        fullName: operator.fullName,
        totalRequests: operatorTickets.length,
        markedRequests: operatorTickets.filter(
          (ticket) =>
            ticket.status === 'resolved' ||
            ticket.status === 'closed' ||
            Boolean(ticket.resolvedAt),
        ).length,
        avgResponseMs: this.average(
          operatorTickets.map((ticket) => ticket.firstResponseTime),
        ),
        onTimeRate: operatorTickets.length
          ? Math.round(
              (operatorTickets.filter(
                (ticket) => !ticket.firstResponseBreached && !ticket.slaBreached,
              ).length /
                operatorTickets.length) *
                100,
            )
          : 100,
      };
    });

    const topOperator =
      byOperator
        .slice()
        .sort((left, right) => right.totalRequests - left.totalRequests)[0] ?? null;

    return {
      scope: supervisor.role,
      period: {
        preset: range.preset,
        from: range.from,
        to: range.to,
      },
      summary: {
        totalRequests: tickets.length,
        markedRequests: markedTickets.length,
        unmarkedRequests: tickets.length - markedTickets.length,
        avgResponseMs: this.average(tickets.map((ticket) => ticket.firstResponseTime)),
        onTimeRate,
        rating,
      },
      breakdown: {
        byOperator,
      },
      insights: {
        activeOperators: operators.filter((operator) => operator.managerStatus === 'online')
          .length,
        escalatedToSupplier: tickets.filter((ticket) => Boolean(ticket.supplierEscalatedAt))
          .length,
        unresolvedDialogs: tickets.filter(
          (ticket) => ticket.status !== 'resolved' && ticket.status !== 'closed',
        ).length,
        topOperator: topOperator?.fullName ?? null,
      },
    };
  }
}
