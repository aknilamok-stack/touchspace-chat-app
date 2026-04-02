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
}
