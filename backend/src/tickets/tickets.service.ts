import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InviteManagerDto } from './dto/invite-manager.dto';
import { AssignManagerDto } from './dto/assign-manager.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { TypingService } from '../typing.service';
import { ProfilesService } from '../profiles.service';
import { ChatAiService } from '../chat-ai.service';
import { readJsonStringArray } from '../prisma-json.util';
import { resolveTicketClientContext } from './client-context.util';

type TicketViewer = {
  viewerType?: string;
  viewerId?: string;
};

type ContactType = 'email' | 'phone';

type TicketPageViewPayload = {
  tradePointId?: string;
  tradePointName?: string;
  pageUrl?: string;
  pagePath?: string;
  pageTitle?: string;
  pageName?: string;
  routeType?: string;
  entityId?: string;
  entityName?: string;
  referrer?: string;
  timestamp?: string;
  sourceType?: string;
};

type ResolvedContactValue = {
  value: string;
  normalizedValue: string;
};

const CLIENT_AVATAR_COLORS = [
  '#FF6B6B',
  '#FF8E3C',
  '#FFB340',
  '#FFD166',
  '#7BC96F',
  '#34C759',
  '#1CC8A0',
  '#21C7D9',
  '#0A84FF',
  '#4D7CFE',
  '#6C63FF',
  '#8B5CF6',
  '#C084FC',
  '#EC4899',
  '#F06292',
  '#A3A3A3',
  '#6B7280',
  '#22A699',
];

const CLIENT_AVATAR_EMOJIS = [
  '🦊',
  '🐺',
  '🐻',
  '🐼',
  '🦉',
  '🦁',
  '🐯',
  '🐨',
  '🦔',
  '🐸',
  '🦋',
  '🐝',
  '🌵',
  '🌿',
  '🍀',
  '🌻',
  '🌷',
  '🍎',
  '🍐',
  '🍊',
  '🍋',
  '🍇',
  '🍒',
  '🥝',
];

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typingService: TypingService,
    private readonly profilesService: ProfilesService,
    private readonly chatAiService: ChatAiService,
  ) {}

  private async createSystemMessage(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ticketId: string,
    content: string,
  ) {
    return tx.message.create({
      data: {
        ticketId,
        content,
        senderType: 'system',
        senderRole: 'system',
        status: 'sent',
        deliveryStatus: 'sent',
        messageType: 'system',
      },
    });
  }

  private buildTicketWhere(viewer?: TicketViewer) {
    const viewerId = viewer?.viewerId?.trim();
    const viewerType = viewer?.viewerType?.trim();

    if (!viewerType || !viewerId) {
      return undefined;
    }

    if (viewerType === 'client') {
      return { clientId: viewerId };
    }

    if (viewerType === 'supplier') {
      return {
        OR: [
          { supplierId: viewerId },
          {
            supplierRequests: {
              some: {
                supplierId: viewerId,
              },
            },
          },
        ],
      };
    }

    if (viewerType === 'manager') {
      return {
        OR: [
          { assignedManagerId: null },
          { assignedManagerId: viewerId },
          { invitedManagerIds: { path: '$', array_contains: viewerId } },
          { lastResolvedByManagerId: viewerId },
        ],
      };
    }

    return undefined;
  }

  private normalizeContactValue(
    type: ContactType,
    rawValue: string,
  ): ResolvedContactValue {
    const trimmedValue = rawValue?.trim();

    if (!trimmedValue) {
      throw new BadRequestException('Contact value is required');
    }

    if (type === 'email') {
      const normalizedValue = trimmedValue.toLowerCase();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(normalizedValue)) {
        throw new BadRequestException('Некорректный email');
      }

      return {
        value: normalizedValue,
        normalizedValue,
      };
    }

    const sanitizedValue = trimmedValue.replace(/[^\d+()\s-]/g, '');
    const normalizedValue = sanitizedValue.replace(/[^\d+]/g, '');
    const digitsCount = normalizedValue.replace(/\D/g, '').length;

    if (digitsCount < 5) {
      throw new BadRequestException('Некорректный телефон');
    }

    return {
      value: sanitizedValue,
      normalizedValue,
    };
  }

  private buildProfileContactId(profileId: string, type: ContactType) {
    return `profile:${profileId}:${type}`;
  }

  private parseProfileContactId(
    contactId: string,
  ): { profileId: string; type: ContactType } | null {
    const [scope, profileId, type] = contactId.split(':');

    if (
      scope !== 'profile' ||
      !profileId ||
      (type !== 'email' && type !== 'phone')
    ) {
      return null;
    }

    return {
      profileId,
      type,
    };
  }

  private normalizeClientVisualIdentityKey(...values: Array<string | null | undefined>) {
    const sourceValue = values.find((value) => value?.trim())?.trim();

    if (!sourceValue) {
      return '';
    }

    return sourceValue.toLowerCase().replace(/\s+/g, ' ');
  }

  private getClientVisualIdentityDisplayName(...values: Array<string | null | undefined>) {
    return values.find((value) => value?.trim())?.trim() ?? null;
  }

  private async ensureClientVisualIdentity(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    clientKey: string,
    displayName: string | null,
  ) {
    if (!clientKey) {
      return {
        avatarColor: null,
        avatarEmoji: null,
      };
    }

    const existingIdentity = await tx.clientVisualIdentity.findUnique({
      where: { key: clientKey },
    });

    if (existingIdentity) {
      if (displayName && existingIdentity.displayName !== displayName) {
        await tx.clientVisualIdentity.update({
          where: { key: clientKey },
          data: { displayName },
        });
      }

      return {
        avatarColor: existingIdentity.avatarColor,
        avatarEmoji: existingIdentity.avatarEmoji,
      };
    }

    const usedPairs = await tx.clientVisualIdentity.findMany({
      select: {
        avatarColor: true,
        avatarEmoji: true,
      },
    });
    const usedPairKeys = new Set(
      usedPairs.map(({ avatarColor, avatarEmoji }) => `${avatarColor}::${avatarEmoji}`),
    );

    let avatarColor = '';
    let avatarEmoji = '';

    for (const color of CLIENT_AVATAR_COLORS) {
      for (const emoji of CLIENT_AVATAR_EMOJIS) {
        const pairKey = `${color}::${emoji}`;

        if (!usedPairKeys.has(pairKey)) {
          avatarColor = color;
          avatarEmoji = emoji;
          break;
        }
      }

      if (avatarColor && avatarEmoji) {
        break;
      }
    }

    if (!avatarColor || !avatarEmoji) {
      const fallbackIndex = usedPairs.length;
      avatarColor = `hsl(${(fallbackIndex * 47) % 360} 72% 56%)`;
      avatarEmoji = CLIENT_AVATAR_EMOJIS[fallbackIndex % CLIENT_AVATAR_EMOJIS.length];
    }

    await tx.clientVisualIdentity.create({
      data: {
        key: clientKey,
        displayName,
        avatarColor,
        avatarEmoji,
      },
    });

    return {
      avatarColor,
      avatarEmoji,
    };
  }

  private async getTicketWithContactsContext(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        clientId: true,
        clientName: true,
        tradePointExternalId: true,
        tradePointName: true,
        clientEmail: true,
        clientPhone: true,
        currentUserId: true,
        currentUserEmail: true,
        currentUserPhone: true,
        currentUserXmlId: true,
        isSuperuser: true,
        superuserId: true,
        superuserEmail: true,
        superuserPhone: true,
        canonicalEmail: true,
        canonicalEmailSource: true,
        lockedBySuperuser: true,
        supplierId: true,
        clientProfile: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        supplierProfile: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
    }

    return ticket;
  }

  private async assertManagerContactAccess(
    ticketId: string,
    managerId?: string,
    managerName?: string,
  ) {
    const normalizedManagerId = managerId?.trim();
    const normalizedManagerName = managerName?.trim();

    if (!normalizedManagerId || !normalizedManagerName) {
      throw new BadRequestException('managerId and managerName are required');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        assignedManagerId: true,
        invitedManagerIds: true,
        lastResolvedByManagerId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
    }

    const invitedManagerIds = readJsonStringArray(ticket.invitedManagerIds);
    const hasAccess =
      ticket.assignedManagerId === null ||
      ticket.assignedManagerId === normalizedManagerId ||
      invitedManagerIds.includes(normalizedManagerId) ||
      ticket.lastResolvedByManagerId === normalizedManagerId;

    if (!hasAccess) {
      throw new ConflictException(
        'Менеджер не может изменять контакты этого диалога',
      );
    }

    await this.profilesService.ensureProfile({
      id: normalizedManagerId,
      fullName: normalizedManagerName,
      role: 'manager',
    });

    return {
      managerId: normalizedManagerId,
      managerName: normalizedManagerName,
    };
  }

  private normalizePageViewString(value?: string | null) {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
  }

  private resolvePageViewVisitedAt(timestamp?: string) {
    const normalizedTimestamp = this.normalizePageViewString(timestamp);

    if (!normalizedTimestamp) {
      return new Date();
    }

    const parsedDate = new Date(normalizedTimestamp);

    if (Number.isNaN(parsedDate.getTime())) {
      return new Date();
    }

    return parsedDate;
  }

  private formatPageViewItem(pageView: {
    id: string;
    pageUrl: string;
    pagePath: string;
    pageTitle: string | null;
    pageName: string | null;
    routeType: string | null;
    entityId: string | null;
    entityName: string | null;
    referrer: string | null;
    sourceType: string;
    visitedAt: Date;
  }) {
    return {
      id: pageView.id,
      pageUrl: pageView.pageUrl,
      pagePath: pageView.pagePath,
      pageTitle: pageView.pageTitle,
      pageName: pageView.pageName,
      routeType: pageView.routeType,
      entityId: pageView.entityId,
      entityName: pageView.entityName,
      referrer: pageView.referrer,
      sourceType: pageView.sourceType,
      visitedAt: pageView.visitedAt.toISOString(),
    };
  }

  private buildAutoContacts(
    ticket: Awaited<ReturnType<TicketsService['getTicketWithContactsContext']>>,
  ) {
    const contacts: Array<{
      id: string;
      type: ContactType;
      value: string;
      normalizedValue: string;
      label: string | null;
      source: 'profile';
      sourceLabel: string;
      editable: boolean;
    }> = [];

    const resolvedEmail =
      ticket.canonicalEmail?.trim() ||
      ticket.clientEmail?.trim() ||
      ticket.clientProfile?.email?.trim() ||
      '';
    const resolvedPhone =
      ticket.superuserPhone?.trim() ||
      ticket.currentUserPhone?.trim() ||
      ticket.clientPhone?.trim() ||
      ticket.clientProfile?.phone?.trim() ||
      '';
    const emailSourceLabel = ticket.canonicalEmail?.trim()
      ? ticket.canonicalEmailSource === 'superuser'
        ? 'Email суперпользователя'
        : ticket.canonicalEmailSource === 'employee_fallback'
          ? 'Email сотрудника'
          : 'Основной email клиента'
      : ticket.clientEmail?.trim()
        ? 'Из данных клиента'
        : ticket.clientProfile?.email?.trim()
          ? 'Из профиля клиента'
          : null;
    const phoneSourceLabel = ticket.superuserPhone?.trim()
      ? 'Телефон суперпользователя'
      : ticket.currentUserPhone?.trim()
        ? 'Телефон текущего пользователя'
        : ticket.clientPhone?.trim()
          ? 'Из данных клиента'
          : ticket.clientProfile?.phone?.trim()
            ? 'Из профиля клиента'
            : null;

    if (resolvedEmail && emailSourceLabel) {
      const normalizedEmail = this.normalizeContactValue(
        'email',
        resolvedEmail,
      );
      contacts.push({
        id: ticket.clientProfile?.id
          ? this.buildProfileContactId(ticket.clientProfile.id, 'email')
          : `ticket:${ticket.id}:email`,
        type: 'email',
        value: normalizedEmail.value,
        normalizedValue: normalizedEmail.normalizedValue,
        label: null,
        source: 'profile',
        sourceLabel: emailSourceLabel,
        editable: false,
      });
    }

    if (resolvedPhone && phoneSourceLabel) {
      const normalizedPhone = this.normalizeContactValue(
        'phone',
        resolvedPhone,
      );
      contacts.push({
        id: ticket.clientProfile?.id
          ? this.buildProfileContactId(ticket.clientProfile.id, 'phone')
          : `ticket:${ticket.id}:phone`,
        type: 'phone',
        value: normalizedPhone.value,
        normalizedValue: normalizedPhone.normalizedValue,
        label: null,
        source: 'profile',
        sourceLabel: phoneSourceLabel,
        editable: false,
      });
    }

    return contacts;
  }

  async getContacts(ticketId: string, viewer?: TicketViewer) {
    const ticket = await this.getTicketWithContactsContext(ticketId);

    const ticketWhere = this.buildTicketWhere(viewer);

    if (ticketWhere) {
      const accessibleTicket = await this.prisma.ticket.findFirst({
        where: {
          id: ticketId,
          ...ticketWhere,
        },
        select: {
          id: true,
        },
      });

      if (!accessibleTicket) {
        throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
      }
    }

    const manualContacts = await this.prisma.ticketContact.findMany({
      where: {
        ticketId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const dedupeKeys = new Set<string>();
    const autoContacts = this.buildAutoContacts(ticket).filter((contact) => {
      const dedupeKey = `${contact.type}:${contact.normalizedValue}`;

      if (dedupeKeys.has(dedupeKey)) {
        return false;
      }

      dedupeKeys.add(dedupeKey);
      return true;
    });
    const manualContactItems = manualContacts
      .filter((contact) => {
        const dedupeKey = `${contact.type}:${contact.normalizedValue}`;

        if (dedupeKeys.has(dedupeKey)) {
          return false;
        }

        dedupeKeys.add(dedupeKey);
        return true;
      })
      .map((contact) => ({
        id: contact.id,
        type: contact.type as ContactType,
        value: contact.value,
        normalizedValue: contact.normalizedValue,
        label: contact.label,
        source: 'manual' as const,
        sourceLabel: 'Добавлено вручную',
        editable: true,
      }));

    return {
      items: [...autoContacts, ...manualContactItems],
    };
  }

  async getPageViews(ticketId: string, viewer?: TicketViewer) {
    const ticketWhere = this.buildTicketWhere(viewer);

    if (ticketWhere) {
      const accessibleTicket = await this.prisma.ticket.findFirst({
        where: {
          id: ticketId,
          ...ticketWhere,
        },
        select: {
          id: true,
        },
      });

      if (!accessibleTicket) {
        throw new NotFoundException(`Ticket with id "${ticketId}" not found`);
      }
    }

    const pageViews = await this.prisma.ticketPageView.findMany({
      where: {
        ticketId,
      },
      orderBy: {
        visitedAt: 'desc',
      },
      take: 10,
    });

    return {
      current: pageViews[0] ? this.formatPageViewItem(pageViews[0]) : null,
      items: pageViews.map((pageView) => this.formatPageViewItem(pageView)),
    };
  }

  async recordPageView(payload: TicketPageViewPayload) {
    const tradePointId = this.normalizePageViewString(payload.tradePointId);
    const pageUrl = this.normalizePageViewString(payload.pageUrl);
    const pagePath = this.normalizePageViewString(payload.pagePath);
    const pageTitle = this.normalizePageViewString(payload.pageTitle);

    if (!tradePointId || !pageUrl || !pagePath) {
      throw new BadRequestException(
        'tradePointId, pageUrl and pagePath are required',
      );
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: {
        clientId: tradePointId,
      },
      orderBy: [
        { resolvedAt: 'asc' },
        { lastMessageAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      select: {
        id: true,
        clientId: true,
        tradePointName: true,
        lastMessageAt: true,
      },
    });

    if (!ticket) {
      return {
        recorded: false,
        reason: 'ticket_not_found',
      };
    }

    const lastPageView = await this.prisma.ticketPageView.findFirst({
      where: {
        ticketId: ticket.id,
      },
      orderBy: {
        visitedAt: 'desc',
      },
      select: {
        pagePath: true,
        pageTitle: true,
        visitedAt: true,
      },
    });

    const visitedAt = this.resolvePageViewVisitedAt(payload.timestamp);

    if (
      lastPageView &&
      lastPageView.pagePath === pagePath &&
      (lastPageView.pageTitle ?? null) === pageTitle &&
      visitedAt.getTime() - lastPageView.visitedAt.getTime() <= 3000
    ) {
      return {
        recorded: false,
        reason: 'duplicate',
      };
    }

    const savedPageView = await this.prisma.ticketPageView.create({
      data: {
        ticketId: ticket.id,
        tradePointId,
        pageUrl,
        pagePath,
        pageTitle,
        pageName: this.normalizePageViewString(payload.pageName),
        routeType: this.normalizePageViewString(payload.routeType),
        entityId: this.normalizePageViewString(payload.entityId),
        entityName: this.normalizePageViewString(payload.entityName),
        referrer: this.normalizePageViewString(payload.referrer),
        sourceType:
          this.normalizePageViewString(payload.sourceType) ?? 'page_view',
        visitedAt,
      },
    });

    const tradePointName = this.normalizePageViewString(payload.tradePointName);

    if (tradePointName && tradePointName !== ticket.tradePointName) {
      await this.prisma.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          tradePointName,
        },
      });
    }

    return {
      recorded: true,
      ticketId: ticket.id,
      current: this.formatPageViewItem(savedPageView),
    };
  }

  async addContact(
    ticketId: string,
    managerId: string,
    managerName: string,
    type: ContactType,
    value: string,
    label?: string | null,
  ) {
    const manager = await this.assertManagerContactAccess(
      ticketId,
      managerId,
      managerName,
    );
    const resolvedValue = this.normalizeContactValue(type, value);

    await this.prisma.ticketContact.create({
      data: {
        ticketId,
        type,
        value: resolvedValue.value,
        normalizedValue: resolvedValue.normalizedValue,
        label: label?.trim() || null,
        createdByProfileId: manager.managerId,
      },
    });

    return this.getContacts(ticketId, {
      viewerType: 'manager',
      viewerId: manager.managerId,
    });
  }

  async updateContact(
    ticketId: string,
    contactId: string,
    managerId: string,
    managerName: string,
    type?: ContactType,
    value?: string,
    label?: string | null,
  ) {
    const manager = await this.assertManagerContactAccess(
      ticketId,
      managerId,
      managerName,
    );
    const profileContact = this.parseProfileContactId(contactId);

    if (profileContact) {
      const ticket = await this.getTicketWithContactsContext(ticketId);
      const primaryProfile =
        ticket.clientProfile?.id === profileContact.profileId
          ? ticket.clientProfile
          : ticket.supplierProfile?.id === profileContact.profileId
            ? ticket.supplierProfile
            : null;

      if (!primaryProfile) {
        throw new NotFoundException(`Contact with id "${contactId}" not found`);
      }

      const nextType = type ?? profileContact.type;

      if (!value?.trim()) {
        throw new BadRequestException('Contact value is required');
      }

      if (nextType !== profileContact.type) {
        throw new BadRequestException('Нельзя менять тип контакта профиля');
      }

      const resolvedValue = this.normalizeContactValue(nextType, value);

      await this.prisma.profile.update({
        where: {
          id: primaryProfile.id,
        },
        data:
          nextType === 'email'
            ? {
                email: resolvedValue.value,
              }
            : {
                phone: resolvedValue.value,
              },
      });

      return this.getContacts(ticketId, {
        viewerType: 'manager',
        viewerId: manager.managerId,
      });
    }

    const existingContact = await this.prisma.ticketContact.findFirst({
      where: {
        id: contactId,
        ticketId,
      },
      select: {
        id: true,
        type: true,
        value: true,
      },
    });

    if (!existingContact) {
      throw new NotFoundException(`Contact with id "${contactId}" not found`);
    }

    const nextType = (type ?? existingContact.type) as ContactType;
    const updateData: Record<string, unknown> = {};

    if (type) {
      updateData.type = nextType;
    }

    if (typeof label === 'string') {
      updateData.label = label.trim() || null;
    }

    if (typeof value === 'string') {
      const resolvedValue = this.normalizeContactValue(nextType, value);
      updateData.value = resolvedValue.value;
      updateData.normalizedValue = resolvedValue.normalizedValue;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getContacts(ticketId, {
        viewerType: 'manager',
        viewerId: manager.managerId,
      });
    }

    if (type && typeof value !== 'string') {
      const resolvedValue = this.normalizeContactValue(
        nextType,
        existingContact.value,
      );
      updateData.value = resolvedValue.value;
      updateData.normalizedValue = resolvedValue.normalizedValue;
    }

    await this.prisma.ticketContact.update({
      where: {
        id: contactId,
      },
      data: updateData,
    });

    return this.getContacts(ticketId, {
      viewerType: 'manager',
      viewerId: manager.managerId,
    });
  }

  async deleteContact(
    ticketId: string,
    contactId: string,
    managerId: string,
    managerName: string,
  ) {
    const manager = await this.assertManagerContactAccess(
      ticketId,
      managerId,
      managerName,
    );
    const profileContact = this.parseProfileContactId(contactId);

    if (profileContact) {
      const ticket = await this.getTicketWithContactsContext(ticketId);
      const primaryProfile =
        ticket.clientProfile?.id === profileContact.profileId
          ? ticket.clientProfile
          : ticket.supplierProfile?.id === profileContact.profileId
            ? ticket.supplierProfile
            : null;

      if (!primaryProfile) {
        throw new NotFoundException(`Contact with id "${contactId}" not found`);
      }

      await this.prisma.profile.update({
        where: {
          id: primaryProfile.id,
        },
        data:
          profileContact.type === 'email'
            ? {
                email: null,
              }
            : {
                phone: null,
              },
      });

      return this.getContacts(ticketId, {
        viewerType: 'manager',
        viewerId: manager.managerId,
      });
    }

    const existingContact = await this.prisma.ticketContact.findFirst({
      where: {
        id: contactId,
        ticketId,
      },
      select: {
        id: true,
      },
    });

    if (!existingContact) {
      throw new NotFoundException(`Contact with id "${contactId}" not found`);
    }

    await this.prisma.ticketContact.delete({
      where: {
        id: contactId,
      },
    });

    return this.getContacts(ticketId, {
      viewerType: 'manager',
      viewerId: manager.managerId,
    });
  }

  async create(
    title = 'Тестовый тикет',
    clientId?: string,
    clientName?: string,
  ) {
    const now = new Date();
    const clientVisualIdentityKey = this.normalizeClientVisualIdentityKey(
      clientId,
      clientName,
      title,
    );
    const clientVisualDisplayName = this.getClientVisualIdentityDisplayName(
      clientId,
      clientName,
      title,
    );

    await this.profilesService.ensureProfile({
      id: clientId,
      fullName: clientName,
      role: clientId ? 'client' : null,
    });

    return this.prisma.$transaction(async (tx) => {
      const { avatarColor, avatarEmoji } = await this.ensureClientVisualIdentity(
        tx,
        clientVisualIdentityKey,
        clientVisualDisplayName,
      );

      return tx.ticket.create({
        data: {
          title,
          status: 'new',
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiEnabled: false,
          aiResolved: false,
          invitedManagerIds: [],
          invitedManagerNames: [],
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: null,
          lastResolvedByManagerName: null,
          clientId: clientId ?? null,
          clientName: clientName ?? null,
          clientEmail: null,
          clientPhone: null,
          avatarColor,
          avatarEmoji,
          supplierId: null,
          supplierName: null,
          firstResponseStartedAt: now,
          firstResponseAt: null,
          firstResponseTime: null,
          firstResponseBreached: false,
          lastMessageAt: null,
        },
      });
    });
  }

  async createWithFirstMessage(
    title: string,
    firstMessage: string,
    senderType: string,
    senderId?: string,
    senderName?: string,
    clientId?: string,
    clientName?: string,
    tradePointId?: string,
    tradePointExternalId?: string,
    tradePointName?: string,
    currentUserId?: string,
    currentUserEmail?: string,
    currentUserPhone?: string,
    currentUserXmlId?: string,
    isSuperuser?: boolean,
    superuserId?: string,
    superuserEmail?: string,
    superuserPhone?: string,
    canonicalEmail?: string,
    canonicalEmailSource?: string,
    clientEmail?: string,
    clientPhone?: string,
    aiEnabled = false,
  ) {
    const createdTicket = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const isClientStart = senderType === 'client';
      const clientContext = resolveTicketClientContext({
        clientId,
        clientName,
        tradePointId,
        tradePointExternalId,
        tradePointName,
        currentUserId,
        currentUserEmail,
        currentUserPhone,
        currentUserXmlId,
        isSuperuser,
        superuserId,
        superuserEmail,
        superuserPhone,
        canonicalEmail,
        canonicalEmailSource,
        clientEmail,
        clientPhone,
      });
      const normalizedClientId = clientContext.clientId;
      const normalizedClientName = clientContext.clientName;
      const firstResponseTime = senderType === 'manager' ? 0 : null;
      const clientVisualIdentityKey = this.normalizeClientVisualIdentityKey(
        normalizedClientId,
        normalizedClientName,
        title,
      );
      const clientVisualDisplayName = this.getClientVisualIdentityDisplayName(
        normalizedClientId,
        normalizedClientName,
        title,
      );

      await this.profilesService.ensureProfile({
        id: normalizedClientId,
        fullName: normalizedClientName,
        role: normalizedClientId ? 'client' : null,
      });

      if (senderId) {
        await this.profilesService.ensureProfile({
          id: senderId,
          fullName: senderName,
          role: senderType,
        });
      }

      const { avatarColor, avatarEmoji } = await this.ensureClientVisualIdentity(
        tx,
        clientVisualIdentityKey,
        clientVisualDisplayName,
      );

      const ticket = await tx.ticket.create({
        data: {
          title,
          status: isClientStart ? 'new' : 'in_progress',
          conversationMode: aiEnabled ? 'ai' : 'manager',
          currentHandlerType: aiEnabled ? 'ai' : 'manager',
          aiEnabled,
          aiActivatedAt: aiEnabled ? now : null,
          aiResolved: false,
          invitedManagerIds: [],
          invitedManagerNames: [],
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: null,
          lastResolvedByManagerName: null,
          clientId: normalizedClientId,
          clientName: normalizedClientName,
          tradePointExternalId: clientContext.tradePointExternalId,
          tradePointName: clientContext.tradePointName,
          clientEmail: clientContext.clientEmail,
          clientPhone: clientContext.clientPhone,
          currentUserId: clientContext.currentUserId,
          currentUserEmail: clientContext.currentUserEmail,
          currentUserPhone: clientContext.currentUserPhone,
          currentUserXmlId: clientContext.currentUserXmlId,
          isSuperuser: clientContext.isSuperuser,
          superuserId: clientContext.superuserId,
          superuserEmail: clientContext.superuserEmail,
          superuserPhone: clientContext.superuserPhone,
          canonicalEmail: clientContext.canonicalEmail,
          canonicalEmailSource: clientContext.canonicalEmailSource,
          lockedBySuperuser: clientContext.lockedBySuperuser,
          avatarColor,
          avatarEmoji,
          supplierId: senderType === 'supplier' ? (senderId ?? null) : null,
          supplierName: senderType === 'supplier' ? (senderName ?? null) : null,
          firstResponseStartedAt: isClientStart ? now : null,
          firstResponseAt: senderType === 'manager' ? now : null,
          firstResponseTime,
          firstResponseBreached: false,
          lastMessageAt: now,
        },
      });

      const message = await tx.message.create({
        data: {
          ticketId: ticket.id,
          content: firstMessage,
          senderType,
          senderRole: senderType,
          senderProfileId: senderId ?? null,
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'text',
        },
      });

      if (aiEnabled) {
        await this.createSystemMessage(
          tx,
          ticket.id,
          'AI-помощник подключён к диалогу',
        );
      }

      return {
        ...ticket,
        messages: [message],
      };
    });

    if (aiEnabled) {
      void this.chatAiService.persistAiTurn(createdTicket.id).catch((error) => {
        console.error('Ошибка AI-ответа в createWithFirstMessage:', error);
      });
    }

    return this.prisma.ticket.findUnique({
      where: { id: createdTicket.id },
    });
  }

  async findAll(viewer?: TicketViewer) {
    return this.prisma.ticket.findMany({
      where: this.buildTicketWhere(viewer),
      orderBy: [
        { pinned: 'desc' },
        { lastMessageAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async updateTyping(id: string, senderType: string, previewText?: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    this.typingService.setTyping(id, senderType, previewText);

    return {
      ok: true,
    };
  }

  async getTyping(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    return this.typingService.getTyping(id);
  }

  async togglePinned(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true, pinned: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (!ticket.pinned) {
      const pinnedTicketsCount = await this.prisma.ticket.count({
        where: { pinned: true },
      });

      if (pinnedTicketsCount >= 3) {
        throw new BadRequestException('Можно закрепить максимум 3 чата');
      }
    }

    return this.prisma.ticket.update({
      where: { id },
      data: {
        pinned: !ticket.pinned,
      },
    });
  }

  async resolve(id: string, resolveTicketDto: ResolveTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: resolveTicketDto.managerId,
      fullName: resolveTicketDto.managerName,
      role: 'manager',
    });

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: 'resolved',
          assignedManagerId: null,
          assignedManagerName: null,
          lastResolvedByManagerId: resolveTicketDto.managerId,
          lastResolvedByManagerName: resolveTicketDto.managerName,
          lastResolvedByRole: resolveTicketDto.resolverRole ?? 'manager',
          managerRating: null,
          managerRatingSubmittedAt: null,
          resolvedAt: now,
          closedAt: now,
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async reopen(id: string, assignManagerDto: AssignManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: assignManagerDto.managerId,
      fullName: assignManagerDto.managerName,
      role: 'manager',
    });

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: 'in_progress',
          assignedManagerId: assignManagerDto.managerId,
          assignedManagerName: assignManagerDto.managerName,
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiEnabled: false,
          handedToManagerAt: now,
          resolvedAt: null,
          closedAt: null,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Менеджер ${assignManagerDto.managerName} снова открыл диалог`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async rateManager(id: string, rating: number) {
    if (![1, 2, 3].includes(rating)) {
      throw new BadRequestException('Оценка должна быть 1, 2 или 3');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        managerRatingSubmittedAt: true,
        lastResolvedByRole: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (ticket.lastResolvedByRole !== 'manager') {
      throw new BadRequestException(
        'Оценка доступна только для диалога, завершённого менеджером',
      );
    }

    if (ticket.managerRatingSubmittedAt) {
      throw new ConflictException('Оценка уже отправлена');
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          managerRating: rating,
          managerRatingSubmittedAt: now,
          lastMessageAt: now,
        },
      });

      await this.createSystemMessage(tx, id, 'Спасибо за оценку');

      return updatedTicket;
    });
  }

  async inviteManager(id: string, inviteManagerDto: InviteManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        invitedManagerIds: true,
        invitedManagerNames: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    const invitedManagerIds = readJsonStringArray(ticket.invitedManagerIds);
    const invitedManagerNames = readJsonStringArray(ticket.invitedManagerNames);

    await this.profilesService.ensureProfile({
      id: inviteManagerDto.managerId,
      fullName: inviteManagerDto.managerName,
      role: 'manager',
    });

    if (invitedManagerIds.includes(inviteManagerDto.managerId)) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          invitedManagerIds: [...invitedManagerIds, inviteManagerDto.managerId],
          invitedManagerNames: [
            ...invitedManagerNames,
            inviteManagerDto.managerName,
          ],
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `В диалог приглашён менеджер ${inviteManagerDto.managerName}`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async assignManager(id: string, assignManagerDto: AssignManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        assignedManagerId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: assignManagerDto.managerId,
      fullName: assignManagerDto.managerName,
      role: 'manager',
    });

    if (ticket.assignedManagerId === assignManagerDto.managerId) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          assignedManagerId: assignManagerDto.managerId,
          assignedManagerName: assignManagerDto.managerName,
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiEnabled: false,
          handedToManagerAt: now,
        },
      });

      await tx.message.create({
        data: {
          ticketId: id,
          content: `Диалог передан менеджеру ${assignManagerDto.managerName}`,
          senderType: 'system',
          senderRole: 'system',
          status: 'sent',
          deliveryStatus: 'sent',
          messageType: 'system',
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });

      return updatedTicket;
    });
  }

  async claimIncoming(id: string, assignManagerDto: AssignManagerDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        aiEnabled: true,
        assignedManagerId: true,
        assignedManagerName: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    await this.profilesService.ensureProfile({
      id: assignManagerDto.managerId,
      fullName: assignManagerDto.managerName,
      role: 'manager',
    });

    if (ticket.aiEnabled) {
      throw new ConflictException(
        'Диалог сейчас ведёт AI и его нельзя взять как обычный входящий',
      );
    }

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      throw new ConflictException(
        'Диалог уже закрыт и недоступен для взятия в работу',
      );
    }

    if (ticket.assignedManagerId === assignManagerDto.managerId) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    if (
      ticket.assignedManagerId &&
      ticket.assignedManagerId !== assignManagerDto.managerId
    ) {
      throw new ConflictException(
        `Диалог уже взят в работу менеджером ${ticket.assignedManagerName ?? 'другим менеджером'}`,
      );
    }

    const now = new Date();
    const updateResult = await this.prisma.ticket.updateMany({
      where: {
        id,
        assignedManagerId: null,
        aiEnabled: false,
        status: {
          notIn: ['resolved', 'closed'],
        },
      },
      data: {
        assignedManagerId: assignManagerDto.managerId,
        assignedManagerName: assignManagerDto.managerName,
        status: 'in_progress',
        conversationMode: 'manager',
        currentHandlerType: 'manager',
        handedToManagerAt: now,
      },
    });

    if (updateResult.count === 0) {
      const latestTicket = await this.prisma.ticket.findUnique({
        where: { id },
        select: {
          assignedManagerId: true,
          assignedManagerName: true,
        },
      });

      throw new ConflictException(
        `Диалог уже взят в работу менеджером ${latestTicket?.assignedManagerName ?? 'другим менеджером'}`,
      );
    }

    await this.prisma.message.create({
      data: {
        ticketId: id,
        content: `Диалог взят в работу менеджером ${assignManagerDto.managerName}`,
        senderType: 'system',
        senderRole: 'system',
        status: 'sent',
        deliveryStatus: 'sent',
        messageType: 'system',
      },
    });

    await this.prisma.ticket.update({
      where: { id },
      data: {
        lastMessageAt: now,
      },
    });

    return this.prisma.ticket.findUnique({
      where: { id },
    });
  }

  async enableAiMode(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true, aiEnabled: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    if (ticket.aiEnabled) {
      return this.prisma.ticket.findUnique({
        where: { id },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.ticket.update({
        where: { id },
        data: {
          aiEnabled: true,
          conversationMode: 'ai',
          currentHandlerType: 'ai',
          aiActivatedAt: now,
          aiResolved: false,
        },
      });

      await this.createSystemMessage(tx, id, 'AI-помощник подключён к диалогу');

      return tx.ticket.update({
        where: { id },
        data: {
          lastMessageAt: now,
        },
      });
    });
  }

  async disableAiMode(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with id "${id}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.ticket.update({
        where: { id },
        data: {
          aiEnabled: false,
          conversationMode: 'manager',
          currentHandlerType: 'manager',
          aiDeactivatedAt: now,
          handedToManagerAt: now,
          aiResolved: false,
        },
      });

      await this.createSystemMessage(
        tx,
        id,
        'AI-помощник отключён. Диалог снова ведёт менеджер',
      );

      return tx.ticket.update({
        where: { id },
        data: {
          status: 'new',
          lastMessageAt: now,
        },
      });
    });
  }
}
