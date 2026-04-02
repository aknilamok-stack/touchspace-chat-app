import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ProfilesService } from './profiles.service';
import {
  getDefaultFullNameForRole,
  isManagerRole,
  isSupplierRole,
} from './role.utils';

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

type SupplierNotificationCandidate = {
  ticketId: string;
  requestId: string | null;
  title: string;
  messageId: string;
  messageText: string;
  createdAt: Date;
  kind: 'message' | 'request';
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesService: ProfilesService,
  ) {}

  private async resolveScopedRole(profileId: string, fallbackRole: string) {
    const existingProfile = await this.prisma.profile.findUnique({
      where: { id: profileId },
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

  private async ensureSettingsProfile(profileId: string, role: string) {
    const normalizedProfileId = profileId?.trim();
    const normalizedRole = role?.trim();

    if (!normalizedProfileId || !normalizedRole) {
      throw new BadRequestException('profileId и role обязательны');
    }

    const resolvedRole = await this.resolveScopedRole(
      normalizedProfileId,
      normalizedRole,
    );

    await this.profilesService.ensureProfile({
      id: normalizedProfileId,
      role: resolvedRole,
      fullName: getDefaultFullNameForRole(resolvedRole),
    });

    const profile = await this.prisma.profile.findUnique({
      where: { id: normalizedProfileId },
      select: {
        id: true,
        role: true,
        fullName: true,
        email: true,
        supplierId: true,
        chatAccessEnabled: true,
        notificationPushEnabled: true,
        notifyClientChats: true,
        notifySupplierChats: true,
        notifySupplierRequests: true,
        notifyAiHandoffs: true,
        notifyAdminAlerts: true,
      },
    });

    if (!profile) {
      throw new BadRequestException(
        `Profile with id "${normalizedProfileId}" not found`,
      );
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

    const [unreadDialogs, aiDialogs, pendingSupplierRequests] =
      await Promise.all([
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
      .filter((manager) => manager.managerStatus === 'online')
      .map((manager) => manager.id);
  }

  private async getActiveSupplierIds(supplierId?: string | null) {
    const statuses = await this.profilesService.getSupplierStatuses();
    const normalizedSupplierId = supplierId?.trim();

    return statuses
      .filter((supplier) => {
        if (supplier.supplierStatus !== 'online') {
          return false;
        }

        if (!normalizedSupplierId) {
          return true;
        }

        return (
          supplier.id === normalizedSupplierId ||
          supplier.supplierId === normalizedSupplierId
        );
      })
      .map((supplier) => supplier.id);
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

    return candidate.assignedManagerId === profileId;
  }

  private async getSupplierCounters(profileId: string) {
    const profile = await this.ensureSettingsProfile(profileId, 'supplier');
    const supplierScopeId = profile.supplierId || profile.id;
    const [unreadDialogs, newRequests, openDialogs] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          senderType: 'manager',
          status: {
            in: ['sent', 'delivered'],
          },
          ticket: {
            OR: [
              { supplierId: supplierScopeId },
              {
                supplierRequests: {
                  some: {
                    supplierId: supplierScopeId,
                    OR: [
                      { assignedSupplierProfileId: null },
                      { assignedSupplierProfileId: profile.id },
                    ],
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
          supplierId: supplierScopeId,
          OR: [
            { assignedSupplierProfileId: null },
            { assignedSupplierProfileId: profile.id },
          ],
          firstResponseAt: null,
          status: {
            notIn: ['closed', 'cancelled'],
          },
        },
      }),
      this.prisma.ticket.count({
        where: {
          OR: [
            { supplierId: supplierScopeId },
            {
              supplierRequests: {
                some: {
                  supplierId: supplierScopeId,
                  OR: [
                    { assignedSupplierProfileId: null },
                    { assignedSupplierProfileId: profile.id },
                  ],
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
    if (isManagerRole(role)) {
      return this.getManagerCounters(profileId);
    }

    if (isSupplierRole(role)) {
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
        orderBy: [
          { isActive: 'desc' },
          { lastUsedAt: 'desc' },
          { createdAt: 'desc' },
        ],
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
        chatAccessEnabled: profile.chatAccessEnabled,
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

    if (
      !profile.chatAccessEnabled ||
      !profile.notificationPushEnabled ||
      !profile.notifyClientChats
    ) {
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

        if (
          !this.shouldNotifyManagerAboutTicket(
            profile.id,
            activeManagerIdsSet,
            candidate,
          )
        ) {
          return null;
        }

        return candidate;
      })
      .filter((candidate): candidate is ManagerNotificationCandidate =>
        Boolean(candidate),
      );

    return {
      items,
    };
  }

  async getSupplierNotificationCandidates(profileId: string) {
    const profile = await this.ensureSettingsProfile(profileId, 'supplier');
    const supplierScopeId = profile.supplierId || profile.id;

    if (
      !profile.chatAccessEnabled ||
      !profile.notificationPushEnabled ||
      (!profile.notifySupplierChats && !profile.notifySupplierRequests)
    ) {
      return {
        items: [],
      };
    }

    const activeSupplierIds = new Set(
      await this.getActiveSupplierIds(profile.supplierId || profile.id),
    );

    if (!activeSupplierIds.has(profile.id)) {
      return {
        items: [],
      };
    }

    const items: SupplierNotificationCandidate[] = [];

    if (profile.notifySupplierChats) {
      const tickets = await this.prisma.ticket.findMany({
        where: {
          status: {
            notIn: ['resolved', 'closed'],
          },
          OR: [
            { supplierId: supplierScopeId },
            {
              supplierRequests: {
                some: {
                  supplierId: supplierScopeId,
                },
              },
            },
          ],
          messages: {
            some: {
              senderType: 'manager',
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
          tradePointName: true,
          clientName: true,
          messages: {
            where: {
              senderType: 'manager',
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
          supplierRequests: {
            where: {
              supplierId: supplierScopeId,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
            select: {
              id: true,
              status: true,
              assignedSupplierProfileId: true,
            },
          },
        },
      });

      tickets.forEach((ticket) => {
        const latestUnreadMessage = ticket.messages[0];
        const latestActiveRequest =
          ticket.supplierRequests.find(
            (request) => !['closed', 'cancelled'].includes(request.status),
          ) ?? ticket.supplierRequests[0];

        if (!latestUnreadMessage) {
          return;
        }

        if (
          latestActiveRequest?.assignedSupplierProfileId &&
          latestActiveRequest.assignedSupplierProfileId !== profile.id
        ) {
          return;
        }

        items.push({
          ticketId: ticket.id,
          requestId: latestActiveRequest?.id ?? ticket.supplierRequests[0]?.id ?? null,
          title:
            ticket.tradePointName?.trim() ||
            ticket.title?.trim() ||
            ticket.clientName?.trim() ||
            'Диалог с клиентом',
          messageId: latestUnreadMessage.id,
          messageText: latestUnreadMessage.content,
          createdAt: latestUnreadMessage.createdAt,
          kind: 'message',
        });
      });
    }

    if (profile.notifySupplierRequests) {
      const requests = await this.prisma.supplierRequest.findMany({
        where: {
          supplierId: supplierScopeId,
          OR: [
            { assignedSupplierProfileId: null },
            { assignedSupplierProfileId: profile.id },
          ],
          firstResponseAt: null,
          status: {
            notIn: ['closed', 'cancelled'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          ticketId: true,
          supplierName: true,
          requestText: true,
          createdAt: true,
        },
      });

      requests.forEach((request) => {
        items.push({
          ticketId: request.ticketId,
          requestId: request.id,
          title: request.supplierName?.trim() || 'Новый запрос поставщику',
          messageId: `request:${request.id}`,
          messageText: request.requestText,
          createdAt: request.createdAt,
          kind: 'request',
        });
      });
    }

    items.sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return {
      items,
    };
  }

  async updatePreferences(
    profileId: string,
    role: string,
    input: NotificationPreferencesInput,
  ) {
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
