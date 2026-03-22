import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

type EnsureProfileInput = {
  id?: string | null;
  fullName?: string | null;
  role?: string | null;
  email?: string | null;
  authLogin?: string | null;
  passwordHash?: string | null;
  passwordChangeRequired?: boolean | null;
  passwordIssuedAt?: Date | null;
  status?: string | null;
  approvalStatus?: string | null;
  companyName?: string | null;
  companyId?: string | null;
  supplierId?: string | null;
  managerStatus?: string | null;
  managerPresenceHeartbeatAt?: Date | null;
  approvalComment?: string | null;
  lastLoginAt?: Date | null;
  createdByAdminId?: string | null;
  isActive?: boolean | null;
  notificationPushEnabled?: boolean | null;
  notifyClientChats?: boolean | null;
  notifySupplierChats?: boolean | null;
  notifySupplierRequests?: boolean | null;
  notifyAiHandoffs?: boolean | null;
  notifyAdminAlerts?: boolean | null;
};

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly managerPresenceTtlMs = 45_000;

  private resolveManagerPresenceStatus(
    managerStatus: string | null,
    heartbeatAt: Date | null,
  ) {
    if (!managerStatus || managerStatus === 'offline') {
      return 'offline';
    }

    if (!heartbeatAt) {
      return 'offline';
    }

    const isFresh = Date.now() - heartbeatAt.getTime() <= this.managerPresenceTtlMs;
    return isFresh ? managerStatus : 'offline';
  }

  async getManagerStatuses() {
    const managers = await this.prisma.profile.findMany({
      where: {
        role: 'manager',
        isActive: true,
        approvalStatus: {
          not: 'rejected',
        },
      },
      orderBy: {
        fullName: 'asc',
      },
      select: {
        id: true,
        fullName: true,
        managerStatus: true,
        managerPresenceHeartbeatAt: true,
        lastLoginAt: true,
      },
    });

    return managers.map((manager) => ({
      id: manager.id,
      fullName: manager.fullName,
      managerStatus: this.resolveManagerPresenceStatus(
        manager.managerStatus,
        manager.managerPresenceHeartbeatAt,
      ),
      lastLoginAt: manager.lastLoginAt,
      managerPresenceHeartbeatAt: manager.managerPresenceHeartbeatAt,
    }));
  }

  async updateManagerStatus(id: string, managerStatus: string, fullName?: string | null) {
    const normalizedId = id?.trim();
    const normalizedStatus = managerStatus?.trim();

    if (!normalizedId || !normalizedStatus) {
      return null;
    }

    await this.ensureProfile({
        id: normalizedId,
        role: 'manager',
        fullName,
        managerStatus: normalizedStatus,
        managerPresenceHeartbeatAt:
          normalizedStatus === 'offline' ? null : new Date(),
      });

    return this.prisma.profile.update({
      where: {
        id: normalizedId,
      },
      data: {
        managerStatus: normalizedStatus,
        managerPresenceHeartbeatAt:
          normalizedStatus === 'offline' ? null : new Date(),
      },
      select: {
        id: true,
        fullName: true,
        managerStatus: true,
        managerPresenceHeartbeatAt: true,
      },
    });
  }

  async ensureProfile(input: EnsureProfileInput) {
    const id = input.id?.trim();
    const role = input.role?.trim();

    if (!id || !role) {
      return null;
    }

    const fullName =
      input.fullName?.trim() ||
      (role === 'client'
        ? 'Клиент'
        : role === 'supplier'
          ? 'Поставщик'
          : 'Менеджер');

    return this.prisma.profile.upsert({
      where: { id },
      create: {
        id,
        fullName,
        role,
        email: input.email?.trim() || null,
        authLogin: input.authLogin?.trim() || null,
        passwordHash: input.passwordHash ?? null,
        passwordChangeRequired: input.passwordChangeRequired ?? false,
        passwordIssuedAt: input.passwordIssuedAt ?? null,
        status: input.status?.trim() || 'active',
        approvalStatus: input.approvalStatus?.trim() || 'approved',
        companyName: input.companyName?.trim() || null,
        companyId: input.companyId?.trim() || null,
        supplierId: input.supplierId?.trim() || null,
        managerStatus: input.managerStatus?.trim() || null,
        managerPresenceHeartbeatAt: input.managerPresenceHeartbeatAt ?? null,
        approvalComment: input.approvalComment?.trim() || null,
        lastLoginAt: input.lastLoginAt ?? null,
        createdByAdminId: input.createdByAdminId?.trim() || null,
        isActive: input.isActive ?? true,
        notificationPushEnabled: input.notificationPushEnabled ?? true,
        notifyClientChats: input.notifyClientChats ?? true,
        notifySupplierChats: input.notifySupplierChats ?? true,
        notifySupplierRequests: input.notifySupplierRequests ?? true,
        notifyAiHandoffs: input.notifyAiHandoffs ?? true,
        notifyAdminAlerts: input.notifyAdminAlerts ?? true,
      },
      update: {
        fullName,
        role,
        email: input.email?.trim() || undefined,
        authLogin: input.authLogin?.trim() || undefined,
        passwordHash: input.passwordHash ?? undefined,
        passwordChangeRequired: input.passwordChangeRequired ?? undefined,
        passwordIssuedAt: input.passwordIssuedAt ?? undefined,
        status: input.status?.trim() || undefined,
        approvalStatus: input.approvalStatus?.trim() || undefined,
        companyName: input.companyName?.trim() || undefined,
        companyId: input.companyId?.trim() || undefined,
        supplierId: input.supplierId?.trim() || undefined,
        managerStatus: input.managerStatus?.trim() || undefined,
        managerPresenceHeartbeatAt: input.managerPresenceHeartbeatAt ?? undefined,
        approvalComment: input.approvalComment?.trim() || undefined,
        lastLoginAt: input.lastLoginAt ?? undefined,
        createdByAdminId: input.createdByAdminId?.trim() || undefined,
        isActive: input.isActive ?? undefined,
        notificationPushEnabled: input.notificationPushEnabled ?? undefined,
        notifyClientChats: input.notifyClientChats ?? undefined,
        notifySupplierChats: input.notifySupplierChats ?? undefined,
        notifySupplierRequests: input.notifySupplierRequests ?? undefined,
        notifyAiHandoffs: input.notifyAiHandoffs ?? undefined,
        notifyAdminAlerts: input.notifyAdminAlerts ?? undefined,
      },
    });
  }
}
