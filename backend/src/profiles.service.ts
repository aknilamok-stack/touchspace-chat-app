import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  getDefaultFullNameForRole,
  isManagerRole,
  isSupplierRole,
  MANAGER_ROLES,
  SUPPLIER_ROLES,
} from './role.utils';
import { LiveEventsService } from './live-events/live-events.service';

type EnsureProfileInput = {
  id?: string | null;
  fullName?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  authLogin?: string | null;
  passwordHash?: string | null;
  passwordChangeRequired?: boolean | null;
  passwordIssuedAt?: Date | null;
  status?: string | null;
  approvalStatus?: string | null;
  companyName?: string | null;
  companyId?: string | null;
  supplierId?: string | null;
  supervisorProfileId?: string | null;
  managerStatus?: string | null;
  managerPresenceHeartbeatAt?: Date | null;
  supplierStatus?: string | null;
  supplierPresenceHeartbeatAt?: Date | null;
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
  chatAccessEnabled?: boolean | null;
};

@Injectable()
export class ProfilesService {
  private managerStatusesCache:
    | {
        expiresAt: number;
        value: Awaited<ReturnType<ProfilesService['buildManagerStatuses']>>;
      }
    | null = null;
  private supplierStatusesCache:
    | {
        expiresAt: number;
        value: Awaited<ReturnType<ProfilesService['buildSupplierStatuses']>>;
      }
    | null = null;
  private readonly presenceStatusesCacheTtlMs = 5_000;
  private readonly presenceHeartbeatTtlMs = 4 * 60 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEventsService: LiveEventsService,
  ) {}

  private buildDirectSupplierDialogTitle(supplierName: string) {
    return `Поставщик: ${supplierName}`;
  }

  private async resolveCompatibleRole(id: string, fallbackRole: string) {
    const existingProfile = await this.prisma.profile.findUnique({
      where: { id },
      select: { role: true },
    });

    if (isManagerRole(fallbackRole) && isManagerRole(existingProfile?.role)) {
      return existingProfile?.role ?? fallbackRole;
    }

    if (isSupplierRole(fallbackRole) && isSupplierRole(existingProfile?.role)) {
      return existingProfile?.role ?? fallbackRole;
    }

    return existingProfile?.role?.trim() || fallbackRole;
  }

  private resolvePresenceStatus(
    presenceStatus: string | null,
    heartbeatAt: Date | null,
  ) {
    if (!presenceStatus || presenceStatus === 'offline') {
      return 'offline';
    }

    const heartbeatTime = heartbeatAt?.getTime() ?? 0;

    if (!heartbeatTime || Date.now() - heartbeatTime > this.presenceHeartbeatTtlMs) {
      return 'offline';
    }

    return presenceStatus;
  }

  async updateBasicProfile(id: string, fullName: string) {
    const normalizedId = id?.trim();
    const normalizedFullName = fullName?.trim();

    if (!normalizedId) {
      throw new BadRequestException('userId обязателен');
    }

    if (!normalizedFullName) {
      throw new BadRequestException('Имя обязательно');
    }

    const existingProfile = await this.prisma.profile.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
      },
    });

    if (!existingProfile) {
      throw new NotFoundException(`Profile with id "${normalizedId}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.profile.update({
        where: { id: normalizedId },
        data: {
          fullName: normalizedFullName,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      });

      await this.syncProfileDisplayNameReferences(
        normalizedId,
        normalizedFullName,
        updatedProfile.role,
        tx,
      );

      return updatedProfile;
    });
  }

  async syncProfileDisplayNameReferences(
    profileId: string,
    fullName: string,
    role?: string | null,
    client: Pick<PrismaService, 'ticket' | 'supplierRequest'> | any = this.prisma,
  ) {
    const normalizedProfileId = profileId?.trim();
    const normalizedFullName = fullName?.trim();

    if (!normalizedProfileId || !normalizedFullName) {
      return;
    }

    if (!role || isManagerRole(role)) {
      await client.ticket.updateMany({
        where: {
          assignedManagerId: normalizedProfileId,
        },
        data: {
          assignedManagerName: normalizedFullName,
        },
      });

      await client.ticket.updateMany({
        where: {
          lastResolvedByManagerId: normalizedProfileId,
        },
        data: {
          lastResolvedByManagerName: normalizedFullName,
        },
      });
    }

    if (!role || isSupplierRole(role)) {
      await client.supplierRequest.updateMany({
        where: {
          assignedSupplierProfileId: normalizedProfileId,
        },
        data: {
          assignedSupplierProfileName: normalizedFullName,
        },
      });

      await client.ticket.updateMany({
        where: {
          conversationMode: 'direct_supplier',
          supplierId: normalizedProfileId,
        },
        data: {
          title: this.buildDirectSupplierDialogTitle(normalizedFullName),
          supplierName: normalizedFullName,
          clientName: normalizedFullName,
          tradePointName: normalizedFullName,
        },
      });
    }
  }

  async getManagerStatuses() {
    if (
      this.managerStatusesCache &&
      this.managerStatusesCache.expiresAt > Date.now()
    ) {
      return this.managerStatusesCache.value;
    }

    const value = await this.buildManagerStatuses();
    this.managerStatusesCache = {
      expiresAt: Date.now() + this.presenceStatusesCacheTtlMs,
      value,
    };
    return value;
  }

  private async buildManagerStatuses() {
    const managers = await this.prisma.profile.findMany({
      where: {
        role: {
          in: [...MANAGER_ROLES],
        },
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
      managerStatus: this.resolvePresenceStatus(
        manager.managerStatus,
        manager.managerPresenceHeartbeatAt,
      ),
      lastLoginAt: manager.lastLoginAt,
      managerPresenceHeartbeatAt: manager.managerPresenceHeartbeatAt,
    }));
  }

  async hasOnlineManagers() {
    const onlineManagers = await this.prisma.profile.count({
      where: {
        role: {
          in: [...MANAGER_ROLES],
        },
        isActive: true,
        approvalStatus: {
          not: 'rejected',
        },
        managerStatus: 'online',
      },
    });

    return onlineManagers > 0;
  }

  async updateManagerStatus(
    id: string,
    managerStatus: string,
    fullName?: string | null,
  ) {
    const normalizedId = id?.trim();
    const normalizedStatus = managerStatus?.trim();

    if (!normalizedId || !normalizedStatus) {
      return null;
    }

    const resolvedRole = await this.resolveCompatibleRole(
      normalizedId,
      'manager',
    );

    await this.ensureProfile({
      id: normalizedId,
      role: resolvedRole,
      fullName,
      managerStatus: normalizedStatus,
      managerPresenceHeartbeatAt:
        normalizedStatus === 'offline' ? null : new Date(),
    });

    this.managerStatusesCache = null;

    const updatedProfile = await this.prisma.profile.update({
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

    this.liveEventsService.emitProfilePresenceChanged({
      profileId: updatedProfile.id,
      role: resolvedRole,
      presenceStatus: updatedProfile.managerStatus ?? 'offline',
      presenceHeartbeatAt: updatedProfile.managerPresenceHeartbeatAt,
    });

    return updatedProfile;
  }

  async getSupplierStatuses() {
    if (
      this.supplierStatusesCache &&
      this.supplierStatusesCache.expiresAt > Date.now()
    ) {
      return this.supplierStatusesCache.value;
    }

    const value = await this.buildSupplierStatuses();
    this.supplierStatusesCache = {
      expiresAt: Date.now() + this.presenceStatusesCacheTtlMs,
      value,
    };
    return value;
  }

  private async buildSupplierStatuses() {
    const suppliers = await this.prisma.profile.findMany({
      where: {
        role: {
          in: [...SUPPLIER_ROLES],
        },
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
        companyName: true,
        supplierId: true,
        supplierStatus: true,
        supplierPresenceHeartbeatAt: true,
        lastLoginAt: true,
      },
    });

    return suppliers.map((supplier) => ({
      id: supplier.id,
      fullName: supplier.fullName,
      companyName: supplier.companyName,
      supplierId: supplier.supplierId,
      supplierStatus: this.resolvePresenceStatus(
        supplier.supplierStatus,
        supplier.supplierPresenceHeartbeatAt,
      ),
      lastLoginAt: supplier.lastLoginAt,
      supplierPresenceHeartbeatAt: supplier.supplierPresenceHeartbeatAt,
    }));
  }

  async hasOnlineSuppliersForScope(supplierId: string) {
    const normalizedSupplierId = supplierId?.trim();

    if (!normalizedSupplierId) {
      return false;
    }

    const onlineSuppliers = await this.prisma.profile.count({
      where: {
        role: {
          in: [...SUPPLIER_ROLES],
        },
        isActive: true,
        approvalStatus: {
          not: 'rejected',
        },
        supplierId: normalizedSupplierId,
        supplierStatus: 'online',
      },
    });

    return onlineSuppliers > 0;
  }

  async updateSupplierStatus(
    id: string,
    supplierStatus: string,
    fullName?: string | null,
  ) {
    const normalizedId = id?.trim();
    const normalizedStatus = supplierStatus?.trim();

    if (!normalizedId || !normalizedStatus) {
      return null;
    }

    const existingProfile = await this.prisma.profile.findUnique({
      where: { id: normalizedId },
      select: {
        role: true,
        supplierId: true,
      },
    });
    const resolvedRole =
      isSupplierRole(existingProfile?.role) && existingProfile?.role
        ? existingProfile.role
        : 'supplier';

    await this.ensureProfile({
      id: normalizedId,
      role: resolvedRole,
      fullName,
      supplierId: existingProfile?.supplierId?.trim() || undefined,
      supplierStatus: normalizedStatus,
      supplierPresenceHeartbeatAt:
        normalizedStatus === 'offline' ? null : new Date(),
    });

    this.supplierStatusesCache = null;

    const updatedProfile = await this.prisma.profile.update({
      where: {
        id: normalizedId,
      },
      data: {
        supplierStatus: normalizedStatus,
        supplierPresenceHeartbeatAt:
          normalizedStatus === 'offline' ? null : new Date(),
      },
      select: {
        id: true,
        fullName: true,
        supplierStatus: true,
        supplierPresenceHeartbeatAt: true,
      },
    });

    this.liveEventsService.emitProfilePresenceChanged({
      profileId: updatedProfile.id,
      role: resolvedRole,
      presenceStatus: updatedProfile.supplierStatus ?? 'offline',
      presenceHeartbeatAt: updatedProfile.supplierPresenceHeartbeatAt,
    });

    return updatedProfile;
  }

  async ensureProfile(input: EnsureProfileInput) {
    const id = input.id?.trim();
    const role = input.role?.trim();

    if (!id || !role) {
      return null;
    }

    const fullNameForCreate =
      input.fullName?.trim() ||
      (role === 'client' ? 'Клиент' : getDefaultFullNameForRole(role));
    const fullNameForUpdate =
      role === 'client' ? input.fullName?.trim() || undefined : undefined;

    return this.prisma.profile.upsert({
      where: { id },
      create: {
        id,
        fullName: fullNameForCreate,
        role,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        authLogin: input.authLogin?.trim() || null,
        passwordHash: input.passwordHash ?? null,
        passwordChangeRequired: input.passwordChangeRequired ?? false,
        passwordIssuedAt: input.passwordIssuedAt ?? null,
        status: input.status?.trim() || 'active',
        approvalStatus: input.approvalStatus?.trim() || 'approved',
        companyName: input.companyName?.trim() || null,
        companyId: input.companyId?.trim() || null,
        supplierId: input.supplierId?.trim() || null,
        supervisorProfileId: input.supervisorProfileId?.trim() || null,
        managerStatus: input.managerStatus?.trim() || null,
        managerPresenceHeartbeatAt: input.managerPresenceHeartbeatAt ?? null,
        supplierStatus: input.supplierStatus?.trim() || null,
        supplierPresenceHeartbeatAt: input.supplierPresenceHeartbeatAt ?? null,
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
        chatAccessEnabled: input.chatAccessEnabled ?? true,
      },
      update: {
        fullName: fullNameForUpdate,
        role,
        email: input.email?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        authLogin: input.authLogin?.trim() || undefined,
        passwordHash: input.passwordHash ?? undefined,
        passwordChangeRequired: input.passwordChangeRequired ?? undefined,
        passwordIssuedAt: input.passwordIssuedAt ?? undefined,
        status: input.status?.trim() || undefined,
        approvalStatus: input.approvalStatus?.trim() || undefined,
        companyName: input.companyName?.trim() || undefined,
        companyId: input.companyId?.trim() || undefined,
        supplierId: input.supplierId?.trim() || undefined,
        supervisorProfileId: input.supervisorProfileId?.trim() || undefined,
        managerStatus: input.managerStatus?.trim() || undefined,
        managerPresenceHeartbeatAt:
          input.managerPresenceHeartbeatAt ?? undefined,
        supplierStatus: input.supplierStatus?.trim() || undefined,
        supplierPresenceHeartbeatAt:
          input.supplierPresenceHeartbeatAt ?? undefined,
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
        chatAccessEnabled: input.chatAccessEnabled ?? undefined,
      },
    });
  }
}
