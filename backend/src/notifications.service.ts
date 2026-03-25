import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ProfilesService } from './profiles.service';

type NotificationPreferencesInput = {
  notificationPushEnabled?: boolean;
  notifyClientChats?: boolean;
  notifySupplierChats?: boolean;
  notifySupplierRequests?: boolean;
  notifyAiHandoffs?: boolean;
  notifyAdminAlerts?: boolean;
};

type ManagerNotificationCandidate = {
  ticketId: string;
  title: string;
  clientName: string | null;
  messageId: string;
  messageText: string;
  createdAt: Date;
  assignedManagerId: string | null;
  assignedManagerName: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
  ) {}

  private async ensureSettingsProfile(profileId: string, role: string) {
    const normalizedProfileId = profileId?.trim();
    const normalizedRole = role?.trim();

    if (!normalizedProfileId || !normalizedRole) {
      throw new BadRequestException('profileId и role обязательны');
    }

    await this.profilesService.ensureProfile({
      id: normalizedProfileId,
      role: normalizedRole,
      fullName:
        normalizedRole === 'admin'
          ? 'Администратор'
          : normalizedRole === 'supplier'
            ? 'Поставщик'
            : 'Менеджер',
    });

    const profile = await this.prisma.profile.findUnique({
      where: { id: normalizedProfileId },
      select: {
        id: true,
        role: true,
        fullName: true,
        email: true,
        notificationPushEnabled: true,
        notifyClientChats: true,
        notifySupplierChats: true,
        notifySupplierRequests: true,
        notifyAiHandoffs: true,
        notifyAdminAlerts: true,
      },
    });

    if (!profile) {
      throw new BadRequestException(`Profile with id "${normalizedProfileId}" not found`);
    }

    return profile;
  }

  private async getManagerCounters(profileId: string) {
    const managerScope = {
      OR: [
        { assignedManagerId: null },
        { assignedManagerId: profileId },
        { invitedManagerIds: { path: '$', array_contains: profileId } },
        { lastResolvedByManagerId: profileId },
      ],
    };

    const [unreadDialogs, aiDialogs, pendingSupplierRequests] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          senderType: {
            in: ['client', 'supplier'],
          },
          status: {
            in: ['sent', 'delivered'],
          },
          ticket: {
            ...managerScope,
            aiEnabled: false,
            status: {
              notIn: ['resolved', 'closed'],
            },
          },
        },
        distinct: ['ticketId'],
        select: { ticketId: true },
      }),
      this.prisma.ticket.count({
        where: {
          ...managerScope,
          aiEnabled: true,
          status: {
            notIn: ['resolved', 'closed'],
          },
        },
      }),
      this.prisma.supplierRequest.count({
        where: {
          createdByManagerId: profileId,
          firstResponseAt: null,
          status: {
            notIn: ['closed', 'cancelled'],
          },
        },
      }),
    ]);

    return {
      unreadDialogs: unreadDialogs.length,
      aiDialogs,
      pendingSupplierRequests,
    };
  }

  private async getActiveManagerIds() {
    const statuses = await this.profilesService.getManagerStatuses();

    return statuses
      .filter((manager) => manager.managerStatus === 'online' || manager.managerStatus === 'break')
      .map((manager) => manager.id);
  }

  private shouldNotifyManagerAboutTicket(
    profileId: string,
    activeManagerIds: Set<string>,
    candidate: Pick<ManagerNotificationCandidate, 'assignedManagerId'>,
  ) {
    if (!activeManagerIds.has(profileId)) {
      return false;
    }

    if (!candidate.assignedManagerId) {
      return true;
    }

    if (candidate.assignedManagerId === profileId) {
      return true;
    }

    return !activeManagerIds.has(candidate.assignedManagerId);
  }

  private async getSupplierCounters(profileId: string) {
    const [unreadDialogs, newRequests, openDialogs] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          senderType: 'manager',
          status: {
            in: ['sent', 'delivered'],
          },
          ticket: {
            OR: [
              { supplierId: profileId },
              {
                supplierRequests: {
                  some: {
                    supplierId: profileId,
                  },
                },
              },
            ],
          },
        },
        distinct: ['ticketId'],
        select: { ticketId: true },
      }),
      this.prisma.supplierRequest.count({
        where: {
          supplierId: profileId,
          firstResponseAt: null,
          status: {
            notIn: ['closed', 'cancelled'],
          },
        },
      }),
      this.prisma.ticket.count({
        where: {
          OR: [
            { supplierId: profileId },
            {
              supplierRequests: {
                some: {
                  supplierId: profileId,
                },
              },
            },
          ],
          status: {
            notIn: ['resolved', 'closed'],
          },
        },
      }),
    ]);

    return {
      unreadDialogs: unreadDialogs.length,
      newRequests,
      openDialogs,
    };
  }

  private async getAdminCounters() {
    const [pendingRegistrations, slaBreaches, aiHandoffs] = await Promise.all([
      this.prisma.registrationRequest.count({
        where: {
          status: 'pending',
        },
      }),
      this.prisma.ticket.count({
        where: {
          slaBreached: true,
          status: {
            notIn: ['resolved', 'closed'],
          },
        },
      }),
      this.prisma.ticket.count({
        where: {
          handedToManagerAt: {
            not: null,
          },
          status: {
            notIn: ['resolved', 'closed'],
          },
        },
      }),
    ]);

    return {
      pendingRegistrations,
      slaBreaches,
      aiHandoffs,
    };
  }

  private async getCounters(profileId: string, role: string) {
    if (role === 'manager') {
      return this.getManagerCounters(profileId);
    }

    if (role === 'supplier') {
      return this.getSupplierCounters(profileId);
    }

    return this.getAdminCounters();
  }

  async getSettings(profileId: string, role: string) {
    const profile = await this.ensureSettingsProfile(profileId, role);
    const [devices, counters] = await Promise.all([
      this.prisma.pushSubscription.findMany({
        where: {
          profileId: profile.id,
        },
        orderBy: [{ isActive: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          endpoint: true,
          role: true,
          deviceLabel: true,
          userAgent: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.getCounters(profile.id, profile.role),
    ]);

    return {
      profile: {
        id: profile.id,
        role: profile.role,
        fullName: profile.fullName,
        email: profile.email,
      },
      preferences: {
        notificationPushEnabled: profile.notificationPushEnabled,
        notifyClientChats: profile.notifyClientChats,
        notifySupplierChats: profile.notifySupplierChats,
        notifySupplierRequests: profile.notifySupplierRequests,
        notifyAiHandoffs: profile.notifyAiHandoffs,
        notifyAdminAlerts: profile.notifyAdminAlerts,
      },
      counters,
      devices,
    };
  }

  async getManagerNotificationCandidates(profileId: string) {
    const profile = await this.ensureSettingsProfile(profileId, 'manager');

    if (!profile.notificationPushEnabled || !profile.notifyClientChats) {
      return {
        items: [],
      };
    }

    const [activeManagerIds, tickets] = await Promise.all([
      this.getActiveManagerIds(),
      this.prisma.ticket.findMany({
        where: {
          aiEnabled: false,
          status: {
            notIn: ['resolved', 'closed'],
          },
          messages: {
            some: {
              senderType: 'client',
              status: {
                in: ['sent', 'delivered'],
              },
            },
          },
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
        select: {
          id: true,
          title: true,
          clientName: true,
          assignedManagerId: true,
          assignedManagerName: true,
          messages: {
            where: {
              senderType: 'client',
              status: {
                in: ['sent', 'delivered'],
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              id: true,
              content: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const activeManagerIdsSet = new Set(activeManagerIds);

    const items = tickets
      .map((ticket) => {
        const latestUnreadMessage = ticket.messages[0];

        if (!latestUnreadMessage) {
          return null;
        }

        const candidate: ManagerNotificationCandidate = {
          ticketId: ticket.id,
          title: ticket.title?.trim() || ticket.clientName?.trim() || 'Клиент',
          clientName: ticket.clientName?.trim() || null,
          messageId: latestUnreadMessage.id,
          messageText: latestUnreadMessage.content,
          createdAt: latestUnreadMessage.createdAt,
          assignedManagerId: ticket.assignedManagerId,
          assignedManagerName: ticket.assignedManagerName,
        };

        if (!this.shouldNotifyManagerAboutTicket(profile.id, activeManagerIdsSet, candidate)) {
          return null;
        }

        return candidate;
      })
      .filter((candidate): candidate is ManagerNotificationCandidate => Boolean(candidate));

    return {
      items,
    };
  }

  async updatePreferences(profileId: string, role: string, input: NotificationPreferencesInput) {
    await this.ensureSettingsProfile(profileId, role);

    const updated = await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        notificationPushEnabled: input.notificationPushEnabled ?? undefined,
        notifyClientChats: input.notifyClientChats ?? undefined,
        notifySupplierChats: input.notifySupplierChats ?? undefined,
        notifySupplierRequests: input.notifySupplierRequests ?? undefined,
        notifyAiHandoffs: input.notifyAiHandoffs ?? undefined,
        notifyAdminAlerts: input.notifyAdminAlerts ?? undefined,
      },
      select: {
        notificationPushEnabled: true,
        notifyClientChats: true,
        notifySupplierChats: true,
        notifySupplierRequests: true,
        notifyAiHandoffs: true,
        notifyAdminAlerts: true,
      },
    });

    return {
      ok: true,
      preferences: updated,
    };
  }

  async deactivateDevice(profileId: string, subscriptionId: string) {
    const subscription = await this.prisma.pushSubscription.findFirst({
      where: {
        id: subscriptionId,
        profileId,
      },
      select: {
        id: true,
      },
    });

    if (!subscription) {
      throw new BadRequestException('Устройство не найдено');
    }

    await this.prisma.pushSubscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        isActive: false,
      },
    });

    return {
      ok: true,
    };
  }
}
