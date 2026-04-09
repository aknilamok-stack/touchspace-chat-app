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
  notificationKey: string;
  ticketId: string;
  title: string;
  clientName: string | null;
  tradePointName?: string | null;
  messageId: string;
  messageText: string;
  createdAt: Date;
  avatarColor?: string | null;
  avatarEmoji?: string | null;
  scopeStatus:
    | 'new_unclaimed'
    | 'missed_unclaimed'
    | 'rescue_queue'
    | 'owned_active'
    | 'claimed_by_other_recently';
  waitSeconds: number;
  assignedManagerId: string | null;
  assignedManagerName: string | null;
};

type SupplierNotificationCandidate = {
  notificationKey: string;
  ticketId: string;
  requestId: string | null;
  title: string;
  messageId: string;
  messageText: string;
  createdAt: Date;
  tradePointName?: string | null;
  avatarColor?: string | null;
  avatarEmoji?: string | null;
  scopeStatus:
    | 'new_unclaimed'
    | 'missed_unclaimed'
    | 'owned_active'
    | 'claimed_by_other_recently';
  waitSeconds: number;
  assignedSupplierProfileId?: string | null;
  assignedSupplierProfileName?: string | null;
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

  private async createSystemMessageIfMissing(
    ticketId: string,
    content: string,
    createdAt: Date,
  ) {
    const existing = await this.prisma.message.findFirst({
      where: {
        ticketId,
        senderType: 'system',
        messageType: 'system',
        content,
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await this.prisma.message.create({
      data: {
        ticketId,
        content,
        senderType: 'system',
        senderRole: 'system',
        status: 'sent',
        deliveryStatus: 'sent',
        messageType: 'system',
        createdAt,
      },
    });
  }

  private async ensureManagerOperationalState() {
    const now = new Date();
    const missedThreshold = new Date(now.getTime() - 10 * 60 * 1000);
    const rescueThreshold = new Date(now.getTime() - 20 * 60 * 1000);

    const [unclaimedTickets, stalledAssignedTickets] = await Promise.all([
      this.prisma.ticket.findMany({
        where: {
          aiEnabled: false,
          assignedManagerId: null,
          status: {
            notIn: ['resolved', 'closed'],
          },
          claimRequiredAt: {
            lte: missedThreshold,
          },
          claimMissedAt: null,
        },
        select: {
          id: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: {
          aiEnabled: false,
          assignedManagerId: {
            not: null,
          },
          status: {
            notIn: ['resolved', 'closed'],
          },
          lastClientMessageAt: {
            lte: rescueThreshold,
          },
          rescueQueuedAt: null,
        },
        select: {
          id: true,
          assignedManagerId: true,
          assignedManagerName: true,
          lastClientMessageAt: true,
          lastManagerReplyAt: true,
        },
      }),
    ]);

    for (const ticket of unclaimedTickets) {
      const claimMissedAt = new Date();
      const updateResult = await this.prisma.ticket.updateMany({
        where: {
          id: ticket.id,
          assignedManagerId: null,
          claimMissedAt: null,
        },
        data: {
          claimMissedAt,
        },
      });

      if (updateResult.count > 0) {
        await this.createSystemMessageIfMissing(
          ticket.id,
          'Пропущенное сообщение более 10 минут',
          claimMissedAt,
        );
      }
    }

    for (const ticket of stalledAssignedTickets) {
      if (
        ticket.lastManagerReplyAt &&
        ticket.lastClientMessageAt &&
        ticket.lastManagerReplyAt >= ticket.lastClientMessageAt
      ) {
        continue;
      }

      const rescueQueuedAt = new Date();
      const updateResult = await this.prisma.ticket.updateMany({
        where: {
          id: ticket.id,
          assignedManagerId: ticket.assignedManagerId,
          rescueQueuedAt: null,
        },
        data: {
          status: 'new',
          assignedManagerId: null,
          assignedManagerName: null,
          claimRequiredAt: ticket.lastClientMessageAt ?? rescueQueuedAt,
          returnedToQueueAt: rescueQueuedAt,
          rescueQueuedAt,
          handedToManagerAt: null,
        },
      });

      if (updateResult.count > 0) {
        await this.createSystemMessageIfMissing(
          ticket.id,
          ticket.assignedManagerName?.trim()
            ? `Чат возвращён в общую очередь: менеджер ${ticket.assignedManagerName} не ответил более 20 минут`
            : 'Чат возвращён в общую очередь: менеджер не ответил более 20 минут',
          rescueQueuedAt,
        );
      }
    }
  }

  private async ensureSupplierOperationalState() {
    const now = new Date();
    const missedThreshold = new Date(now.getTime() - 10 * 60 * 1000);
    const unclaimedRequests = await this.prisma.supplierRequest.findMany({
      where: {
        assignedSupplierProfileId: null,
        status: {
          notIn: ['closed', 'cancelled'],
        },
        claimRequiredAt: {
          lte: missedThreshold,
        },
        claimMissedAt: null,
      },
      select: {
        id: true,
        ticketId: true,
        supplierName: true,
      },
    });

    for (const request of unclaimedRequests) {
      const claimMissedAt = new Date();
      const updateResult = await this.prisma.supplierRequest.updateMany({
        where: {
          id: request.id,
          assignedSupplierProfileId: null,
          claimMissedAt: null,
        },
        data: {
          claimMissedAt,
        },
      });

      if (updateResult.count > 0) {
        await this.createSystemMessageIfMissing(
          request.ticketId,
          `Пропущенный запрос поставщику более 10 минут: ${request.supplierName}`,
          claimMissedAt,
        );
      }
    }
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
    await this.ensureManagerOperationalState();

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
            },
          },
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
        select: {
          id: true,
          title: true,
          status: true,
          clientName: true,
          tradePointName: true,
          assignedManagerId: true,
          assignedManagerName: true,
          claimRequiredAt: true,
          claimedAt: true,
          claimMissedAt: true,
          rescueQueuedAt: true,
          lastClientMessageAt: true,
          lastManagerReplyAt: true,
          avatarColor: true,
          avatarEmoji: true,
          messages: {
            where: {
              senderType: 'client',
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
          notificationKey: `ticket:${ticket.id}:${latestUnreadMessage.id}`,
          ticketId: ticket.id,
          title: ticket.title?.trim() || ticket.clientName?.trim() || 'Клиент',
          clientName: ticket.clientName?.trim() || null,
          tradePointName: ticket.tradePointName?.trim() || null,
          messageId: latestUnreadMessage.id,
          messageText: latestUnreadMessage.content,
          createdAt: latestUnreadMessage.createdAt,
          avatarColor: ticket.avatarColor,
          avatarEmoji: ticket.avatarEmoji,
          scopeStatus: ticket.rescueQueuedAt
            ? 'rescue_queue'
            : ticket.claimMissedAt
              ? 'missed_unclaimed'
              : !ticket.assignedManagerId
                ? 'new_unclaimed'
                : 'owned_active',
          waitSeconds: Math.max(
            Math.floor(
              (Date.now() -
                (ticket.claimRequiredAt?.getTime() ??
                  latestUnreadMessage.createdAt.getTime())) /
                1000,
            ),
            0,
          ),
          assignedManagerId: ticket.assignedManagerId,
          assignedManagerName: ticket.assignedManagerName,
        };

        if (!activeManagerIdsSet.has(profile.id)) {
          return null;
        }

        if (!ticket.assignedManagerId) {
          return candidate;
        }

        if (ticket.status === 'waiting_supplier') {
          return null;
        }

        if (
          ticket.assignedManagerId === profile.id &&
          ticket.lastClientMessageAt &&
          (!ticket.lastManagerReplyAt ||
            ticket.lastClientMessageAt > ticket.lastManagerReplyAt)
        ) {
          return {
            ...candidate,
            scopeStatus: 'owned_active',
            waitSeconds: Math.max(
              Math.floor(
                (Date.now() - ticket.lastClientMessageAt.getTime()) / 1000,
              ),
              0,
            ),
          };
        }

        return null;
      })
      .filter((candidate): candidate is ManagerNotificationCandidate =>
        Boolean(candidate),
      );

    const recentlyClaimedByOther = tickets
      .filter(
        (ticket) =>
          ticket.assignedManagerId &&
          ticket.assignedManagerId !== profile.id &&
          ticket.claimedAt &&
          Date.now() - ticket.claimedAt.getTime() <= 45_000,
      )
      .map((ticket) => {
        const latestUnreadMessage = ticket.messages[0];
        const createdAt = ticket.claimedAt ?? latestUnreadMessage?.createdAt ?? new Date();

        return {
          notificationKey: `ticket-claimed:${ticket.id}:${createdAt.toISOString()}`,
          ticketId: ticket.id,
          title: ticket.title?.trim() || ticket.clientName?.trim() || 'Клиент',
          clientName: ticket.clientName?.trim() || null,
          tradePointName: ticket.tradePointName?.trim() || null,
          messageId: latestUnreadMessage?.id ?? `claimed:${ticket.id}`,
          messageText: latestUnreadMessage?.content ?? 'Чат уже взят в работу',
          createdAt,
          avatarColor: ticket.avatarColor,
          avatarEmoji: ticket.avatarEmoji,
          scopeStatus: 'claimed_by_other_recently' as const,
          waitSeconds: 0,
          assignedManagerId: ticket.assignedManagerId,
          assignedManagerName: ticket.assignedManagerName,
        };
      });

    return {
      items: [...items, ...recentlyClaimedByOther].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      ),
    };
  }

  async getSupplierNotificationCandidates(profileId: string) {
    const profile = await this.ensureSettingsProfile(profileId, 'supplier');
    await this.ensureSupplierOperationalState();
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
          avatarColor: true,
          avatarEmoji: true,
          messages: {
            where: {
              senderType: 'manager',
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
              assignedSupplierProfileName: true,
              claimRequiredAt: true,
              claimMissedAt: true,
              claimedAt: true,
              lastManagerMessageAt: true,
              lastSupplierReplyAt: true,
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
          notificationKey: `supplier-message:${ticket.id}:${latestUnreadMessage.id}`,
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
          tradePointName: ticket.tradePointName?.trim() || null,
          avatarColor: ticket.avatarColor,
          avatarEmoji: ticket.avatarEmoji,
          scopeStatus:
            latestActiveRequest?.assignedSupplierProfileId === profile.id
              ? 'owned_active'
              : latestActiveRequest?.claimMissedAt
                ? 'missed_unclaimed'
                : 'new_unclaimed',
          waitSeconds:
            latestActiveRequest?.assignedSupplierProfileId === profile.id
              ? Math.max(
                  Math.floor(
                    (Date.now() -
                      (latestActiveRequest?.lastManagerMessageAt?.getTime() ??
                        latestUnreadMessage.createdAt.getTime())) /
                      1000,
                  ),
                  0,
                )
              : Math.max(
                  Math.floor(
                    (Date.now() -
                      (latestActiveRequest?.claimRequiredAt?.getTime() ??
                        latestUnreadMessage.createdAt.getTime())) /
                      1000,
                  ),
                  0,
                ),
          assignedSupplierProfileId:
            latestActiveRequest?.assignedSupplierProfileId ?? null,
          assignedSupplierProfileName:
            latestActiveRequest?.assignedSupplierProfileName ?? null,
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
          claimRequiredAt: true,
          claimMissedAt: true,
          claimedAt: true,
          assignedSupplierProfileId: true,
          assignedSupplierProfileName: true,
          ticket: {
            select: {
              tradePointName: true,
              title: true,
              clientName: true,
              avatarColor: true,
              avatarEmoji: true,
            },
          },
        },
      });

      requests.forEach((request) => {
        items.push({
          notificationKey: `supplier-request:${request.id}:${request.createdAt.toISOString()}`,
          ticketId: request.ticketId,
          requestId: request.id,
          title:
            request.ticket?.tradePointName?.trim() ||
            request.ticket?.title?.trim() ||
            request.ticket?.clientName?.trim() ||
            request.supplierName?.trim() ||
            'Новый запрос поставщику',
          messageId: `request:${request.id}`,
          messageText: request.requestText,
          createdAt: request.createdAt,
          tradePointName: request.ticket?.tradePointName?.trim() || null,
          avatarColor: request.ticket?.avatarColor,
          avatarEmoji: request.ticket?.avatarEmoji,
          scopeStatus: request.claimMissedAt
            ? 'missed_unclaimed'
            : 'new_unclaimed',
          waitSeconds: Math.max(
            Math.floor(
              (Date.now() -
                (request.claimRequiredAt?.getTime() ?? request.createdAt.getTime())) /
                1000,
            ),
            0,
          ),
          assignedSupplierProfileId: request.assignedSupplierProfileId,
          assignedSupplierProfileName: request.assignedSupplierProfileName,
          kind: 'request',
        });
      });
    }

    const recentlyClaimedByOther = await this.prisma.supplierRequest.findMany({
      where: {
        supplierId: supplierScopeId,
        assignedSupplierProfileId: {
          not: null,
        },
        NOT: {
          assignedSupplierProfileId: profile.id,
        },
        claimedAt: {
          gte: new Date(Date.now() - 45_000),
        },
        status: {
          notIn: ['closed', 'cancelled'],
        },
      },
      select: {
        id: true,
        ticketId: true,
        supplierName: true,
        requestText: true,
        claimedAt: true,
        assignedSupplierProfileId: true,
        assignedSupplierProfileName: true,
        ticket: {
          select: {
            tradePointName: true,
            title: true,
            clientName: true,
            avatarColor: true,
            avatarEmoji: true,
          },
        },
      },
      orderBy: {
        claimedAt: 'desc',
      },
      take: 5,
    });

    recentlyClaimedByOther.forEach((request) => {
      if (!request.claimedAt) {
        return;
      }

      items.push({
        notificationKey: `supplier-claimed:${request.id}:${request.claimedAt.toISOString()}`,
        ticketId: request.ticketId,
        requestId: request.id,
        title:
          request.ticket?.tradePointName?.trim() ||
          request.ticket?.title?.trim() ||
          request.ticket?.clientName?.trim() ||
          request.supplierName?.trim() ||
          'Запрос поставщику',
        messageId: `claimed:${request.id}`,
        messageText: request.requestText,
        createdAt: request.claimedAt,
        tradePointName: request.ticket?.tradePointName?.trim() || null,
        avatarColor: request.ticket?.avatarColor,
        avatarEmoji: request.ticket?.avatarEmoji,
        scopeStatus: 'claimed_by_other_recently',
        waitSeconds: 0,
        assignedSupplierProfileId: request.assignedSupplierProfileId,
        assignedSupplierProfileName: request.assignedSupplierProfileName,
        kind: 'request',
      });
    });

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
