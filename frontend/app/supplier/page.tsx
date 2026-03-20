"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearAuthSession,
  managerAccounts,
  type ManagerPresence,
  readAuthSession,
  readManagerStatuses,
} from "@/lib/auth";

const supplierName = "Karelia";
const supplierStatusStorageKey = "touchspace_supplier_status";
const supplierPinnedRequestsStorageKey = "touchspace_supplier_pinned_requests";
const supplierStatusLabels: Record<ManagerPresence, string> = {
  online: "В сети",
  break: "На перерыве",
  offline: "Не в сети",
};
const supplierStatusDots: Record<ManagerPresence, string> = {
  online: "bg-[#34C759]",
  break: "bg-[#FFB340]",
  offline: "bg-[#C7C7CC]",
};
const QUICK_REPLIES = [
  "Добрый день! Чем могу помочь?",
  "Минуту, уточню ваш запрос",
  "Проверяю наличие и срок поставки",
  "Можете уточнить номер заказа?",
  "Благодарю, информацию передал",
];
const EMOJI_REACTIONS = ["🙂", "😊", "😉", "🤝", "👍", "✅", "🔥", "❤️", "😂", "🙏"];

type SupplierRequest = {
  id: string;
  ticketId: string;
  supplierName: string;
  requestText: string;
  status: string;
  slaMinutes?: number | null;
  createdByManagerId?: string | null;
  firstResponseAt?: string | null;
  responseTime?: number | null;
  responseBreached?: boolean;
  createdAt: string;
};

type TicketMessage = {
  id: string;
  content: string;
  senderType: string;
  status: string;
  ticketId: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  title: string;
  status?: string;
  pinned?: boolean;
  clientId?: string | null;
  assignedManagerId?: string | null;
  assignedManagerName?: string | null;
  invitedManagerNames?: string[];
};

type SupplierQueueTab = "requires_reply" | "new" | "in_progress" | "completed";

type SupplierRequestCard = {
  request: SupplierRequest;
  queueTab: SupplierQueueTab;
  managerName: string;
  pinned: boolean;
  lastActivityAt: string;
  lastVisibleMessage: TicketMessage | null;
};

type SupplierPanelStatus = {
  label: string;
  badgeClassName: string;
  cardClassName: string;
  accentClassName: string;
};

type SupplierSlaVisual = {
  label: string;
  status: string;
  time: string;
  progress: string;
  bar: string;
  tone: string;
};

const appFontFamily = "Montserrat, ui-sans-serif, system-ui, sans-serif";
const getMessageDayKey = (createdAt: string) => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatMessageDayLabel = (createdAt: string) =>
  new Date(createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const getMessageStatusLabel = (status?: string) => {
  if (status === "read") {
    return "Прочитано";
  }

  if (status === "delivered") {
    return "Доставлено";
  }

  return "Отправлено";
};

const formatTimeLabel = (createdAt: string) =>
  new Date(createdAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatDateTimeLabel = (createdAt: string) =>
  new Date(createdAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const supplierQueueTabs: Array<{
  id: SupplierQueueTab;
  label: string;
  activeClassName: string;
  badgeClassName: string;
}> = [
  {
    id: "requires_reply",
    label: "Требует ответа",
    activeClassName: "bg-[#FF6B6B] text-white shadow-[0_10px_22px_rgba(255,107,107,0.24)]",
    badgeClassName: "bg-[#FFE6E6] text-[#D63E3E]",
  },
  {
    id: "new",
    label: "Новые",
    activeClassName: "bg-[#0A84FF] text-white shadow-[0_10px_22px_rgba(10,132,255,0.24)]",
    badgeClassName: "bg-[#EAF3FF] text-[#0A84FF]",
  },
  {
    id: "in_progress",
    label: "В работе",
    activeClassName: "bg-[#FFB340] text-white shadow-[0_10px_22px_rgba(255,179,64,0.22)]",
    badgeClassName: "bg-[#FFF4DE] text-[#B7791F]",
  },
  {
    id: "completed",
    label: "Завершённые",
    activeClassName: "bg-[#8E8E93] text-white shadow-[0_10px_22px_rgba(142,142,147,0.2)]",
    badgeClassName: "bg-[#F2F2F7] text-[#6C6C70]",
  },
];

const managerNameById = Object.fromEntries(
  managerAccounts.map((manager) => [manager.id, manager.name])
);
const uniqueManagers = Array.from(
  new Map(managerAccounts.map((manager) => [manager.id, manager])).values()
);

const areRequestsEqual = (
  left: SupplierRequest[],
  right: SupplierRequest[]
) =>
  left.length === right.length &&
  left.every((request, index) => {
    const nextRequest = right[index];

    return (
      request.id === nextRequest?.id &&
      request.status === nextRequest.status &&
      request.requestText === nextRequest.requestText &&
      request.createdAt === nextRequest.createdAt
    );
  });

const areMessageMapsEqual = (
  left: Record<string, TicketMessage[]>,
  right: Record<string, TicketMessage[]>
) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => areMessagesEqual(left[key] ?? [], right[key] ?? []));
};

const getVisibleMessagesForRequest = (
  request: SupplierRequest,
  messages: TicketMessage[]
) => {
  const requestStartedAt = new Date(request.createdAt).getTime();

  return messages.filter((message) => {
    const messageCreatedAt = new Date(message.createdAt).getTime();

    if (messageCreatedAt < requestStartedAt) {
      return false;
    }

    return message.senderType === "client" || message.senderType === "supplier";
  });
};

const getSupplierQueueTab = (
  request: SupplierRequest,
  visibleMessages: TicketMessage[],
  ticketStatus?: string
): SupplierQueueTab => {
  if (
    ticketStatus === "resolved" ||
    request.status === "closed" ||
    request.status === "cancelled" ||
    request.status === "resolved"
  ) {
    return "completed";
  }

  const hasSupplierReply =
    visibleMessages.some((message) => message.senderType === "supplier") ||
    Boolean(request.firstResponseAt);

  if (!hasSupplierReply) {
    return "new";
  }

  const lastVisibleMessage = visibleMessages[visibleMessages.length - 1];

  if (lastVisibleMessage?.senderType === "client") {
    return "requires_reply";
  }

  return "in_progress";
};

const buildSupplierRequestCards = (
  requests: SupplierRequest[],
  ticketMessagesByTicketId: Record<string, TicketMessage[]>,
  pinnedRequestIds: string[],
  ticketsById: Record<string, Ticket>
) =>
  requests
    .map((request) => {
      const requestMessages = ticketMessagesByTicketId[request.ticketId] ?? [];
      const visibleMessages = getVisibleMessagesForRequest(request, requestMessages);
      const lastVisibleMessage = visibleMessages[visibleMessages.length - 1] ?? null;
      const ticketStatus = ticketsById[request.ticketId]?.status;

      return {
        request,
        queueTab: getSupplierQueueTab(request, visibleMessages, ticketStatus),
        managerName:
          (request.createdByManagerId
            ? managerNameById[request.createdByManagerId]
            : undefined) ?? "Не указан",
        pinned: pinnedRequestIds.includes(request.id),
        lastActivityAt: lastVisibleMessage?.createdAt ?? request.createdAt,
        lastVisibleMessage,
      } satisfies SupplierRequestCard;
    })
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime()
    );

const fetchTicketMessagesSnapshot = async (
  ticketId: string
): Promise<TicketMessage[]> => {
  const response = await fetch(`http://localhost:3001/tickets/${ticketId}/messages`);

  if (!response.ok) {
    throw new Error("Не удалось загрузить сообщения тикета");
  }

  return response.json();
};

const fetchMessagesMapForRequests = async (requests: SupplierRequest[]) => {
  const uniqueTicketIds = [...new Set(requests.map((request) => request.ticketId))];
  const ticketEntries = await Promise.all(
    uniqueTicketIds.map(async (ticketId) => [
      ticketId,
      await fetchTicketMessagesSnapshot(ticketId),
    ] as const)
  );

  return Object.fromEntries(ticketEntries);
};

const fetchTicketsMap = async () => {
  const response = await fetch("http://localhost:3001/tickets");

  if (!response.ok) {
    throw new Error("Не удалось загрузить тикеты");
  }

  const tickets = (await response.json()) as Ticket[];

  return Object.fromEntries(tickets.map((ticket) => [ticket.id, ticket]));
};

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(Math.floor(durationMs / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин ${seconds} сек`;
  }

  return `${seconds} сек`;
};

const buildSupplierPanelStatus = ({
  request,
  ticketStatus,
  queueTab,
}: {
  request: SupplierRequest;
  ticketStatus?: string;
  queueTab?: SupplierQueueTab;
}): SupplierPanelStatus => {
  if (
    ticketStatus === "resolved" ||
    request.status === "closed" ||
    request.status === "cancelled" ||
    request.status === "resolved"
  ) {
    return {
      label: "Завершён",
      badgeClassName: "bg-[#ECFFF1] text-[#1F8B4C]",
      cardClassName: "border-[#D9F3E3] bg-[#F7FFF9]",
      accentClassName: "bg-[#34C759]",
    };
  }

  if (ticketStatus === "waiting_client") {
    return {
      label: "Ждём клиента",
      badgeClassName: "bg-[#FFF5E8] text-[#B7791F]",
      cardClassName: "border-[#F4E3C2] bg-[#FFFBF4]",
      accentClassName: "bg-[#FFB340]",
    };
  }

  if (queueTab === "requires_reply" || queueTab === "new") {
    return {
      label: "Требует ответа",
      badgeClassName: "bg-[#FFE7E7] text-[#D64545]",
      cardClassName: "border-[#FFD3D3] bg-[#FFF8F8]",
      accentClassName: "bg-[#FF3B30]",
    };
  }

  return {
    label: "В работе",
    badgeClassName: "bg-[#EEF6FF] text-[#0A84FF]",
    cardClassName: "border-[#DCE7FF] bg-[#F7FAFF]",
    accentClassName: "bg-[#0A84FF]",
  };
};

const buildSupplierSlaVisual = ({
  request,
  now,
}: {
  request: SupplierRequest;
  now: number;
}): SupplierSlaVisual => {
  const slaMs = Math.max((request.slaMinutes ?? 60) * 60 * 1000, 60 * 1000);
  const startedAt = new Date(request.createdAt).getTime();

  if (request.firstResponseAt && request.responseTime !== null && request.responseTime !== undefined) {
    return {
      label: "Ответ поставщика",
      status: request.responseBreached ? "Ответ просрочен" : "Ответ получен",
      time: `Ответ за ${formatDuration(request.responseTime)}`,
      progress: "100%",
      bar: request.responseBreached ? "bg-[#FD6868]" : "bg-[#34C759]",
      tone: request.responseBreached ? "text-[#D64545]" : "text-[#1F8B4C]",
    };
  }

  const elapsedMs = Math.max(now - startedAt, 0);
  const remainingMs = slaMs - elapsedMs;
  const ratio = Math.min(elapsedMs / slaMs, 1);

  if (remainingMs <= 0) {
    return {
      label: "Ответ поставщика",
      status: "Ответ просрочен",
      time: `Просрочка ${formatDuration(Math.abs(remainingMs))}`,
      progress: "100%",
      bar: "bg-[#FD6868]",
      tone: "text-[#D64545]",
    };
  }

  if (ratio >= 0.75) {
    return {
      label: "Ответ поставщика",
      status: "Скоро дедлайн",
      time: `${formatDuration(remainingMs)} осталось`,
      progress: `${Math.max(ratio * 100, 8)}%`,
      bar: "bg-[#FD6868]",
      tone: "text-[#D64545]",
    };
  }

  if (ratio >= 0.5) {
    return {
      label: "Ответ поставщика",
      status: "Нужно ответить",
      time: `${formatDuration(remainingMs)} осталось`,
      progress: `${Math.max(ratio * 100, 8)}%`,
      bar: "bg-[#FFB340]",
      tone: "text-[#B7791F]",
    };
  }

  return {
    label: "Ответ поставщика",
    status: "В норме",
    time: `${formatDuration(remainingMs)} осталось`,
    progress: `${Math.max(ratio * 100, 8)}%`,
    bar: "bg-[#34C759]",
    tone: "text-[#1F8B4C]",
  };
};

const areMessagesEqual = (
  left: TicketMessage[],
  right: TicketMessage[]
) =>
  left.length === right.length &&
  left.every((message, index) => {
    const nextMessage = right[index];

    return (
      message.id === nextMessage?.id &&
      message.content === nextMessage.content &&
      message.status === nextMessage.status &&
      message.senderType === nextMessage.senderType &&
      message.createdAt === nextMessage.createdAt
    );
  });

export default function SupplierPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [supplierStatus, setSupplierStatus] = useState<ManagerPresence>("online");
  const [isSupplierMenuOpen, setIsSupplierMenuOpen] = useState(false);
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>([]);
  const [pinnedRequestIds, setPinnedRequestIds] = useState<string[]>([]);
  const [ticketsById, setTicketsById] = useState<Record<string, Ticket>>({});
  const [activeQueueTab, setActiveQueueTab] = useState<SupplierQueueTab>("requires_reply");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [ticketMessagesByTicketId, setTicketMessagesByTicketId] = useState<
    Record<string, TicketMessage[]>
  >({});
  const [hoveredHeaderAction, setHoveredHeaderAction] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedInvitedManagerId, setSelectedInvitedManagerId] = useState<string>(
    managerAccounts[0]?.id ?? ""
  );
  const [selectedTransferManagerId, setSelectedTransferManagerId] = useState<string>(
    managerAccounts[0]?.id ?? ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [replyText, setReplyText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [quickReplySearch, setQuickReplySearch] = useState("");
  const [hoveredComposerAction, setHoveredComposerAction] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isTogglingPinned, setIsTogglingPinned] = useState(false);
  const [isInvitingManager, setIsInvitingManager] = useState(false);
  const [isTransferringDialog, setIsTransferringDialog] = useState(false);
  const [isResolvingTicket, setIsResolvingTicket] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [messagesError, setMessagesError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [pinError, setPinError] = useState("");
  const [inviteManagerError, setInviteManagerError] = useState("");
  const [transferDialogError, setTransferDialogError] = useState("");
  const supplierMenuRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const quickRepliesRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedRequest =
    supplierRequests.find((request) => request.id === selectedRequestId) ?? null;
  const selectedTicket = selectedRequest ? ticketsById[selectedRequest.ticketId] ?? null : null;
  const selectedManagerName =
    (selectedRequest?.createdByManagerId
      ? managerNameById[selectedRequest.createdByManagerId]
      : undefined) ??
    selectedTicket?.assignedManagerName ??
    "Менеджер";
  const managerStatuses = readManagerStatuses();
  const availableManagers = uniqueManagers.map((manager) => ({
    ...manager,
    status: managerStatuses[manager.id] ?? "online",
  }));
  const firstOnlineManagerId =
    availableManagers.find((manager) => manager.status === "online")?.id ??
    availableManagers[0]?.id ??
    "";
  const visibleSupplierMessages = selectedRequest
    ? getVisibleMessagesForRequest(selectedRequest, ticketMessages)
    : [];
  const supplierRequestCards = buildSupplierRequestCards(
    supplierRequests,
    ticketMessagesByTicketId,
    pinnedRequestIds,
    ticketsById
  );
  const selectedRequestCard =
    selectedRequest
      ? supplierRequestCards.find((card) => card.request.id === selectedRequest.id) ?? null
      : null;
  const selectedClientLabel =
    selectedTicket?.clientId?.trim() ||
    selectedTicket?.title?.trim() ||
    `Ticket #${selectedRequest?.ticketId ?? ""}`;
  const now = Date.now();
  const supplierPanelStatus = selectedRequest
    ? buildSupplierPanelStatus({
        request: selectedRequest,
        ticketStatus: selectedTicket?.status,
        queueTab: selectedRequestCard?.queueTab,
      })
    : null;
  const supplierSla = selectedRequest
    ? buildSupplierSlaVisual({
        request: selectedRequest,
        now,
      })
    : null;
  const isSupplierDialogResolved =
    selectedTicket?.status === "resolved" || selectedRequestCard?.queueTab === "completed";
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const activeTabRequests = supplierRequestCards.filter((card) => {
    if (card.queueTab !== activeQueueTab) {
      return false;
    }

    if (!normalizedSearchQuery) {
      return true;
    }

    return [
      card.request.supplierName,
      card.request.requestText,
      card.managerName,
      card.request.ticketId,
      ticketsById[card.request.ticketId]?.clientId ?? "",
      ticketsById[card.request.ticketId]?.title ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearchQuery);
  });
  const queueCounts = supplierQueueTabs.reduce<Record<SupplierQueueTab, number>>(
    (accumulator, tab) => {
      accumulator[tab.id] = supplierRequestCards.filter(
        (card) => card.queueTab === tab.id
      ).length;
      return accumulator;
    },
    {
      requires_reply: 0,
      new: 0,
      in_progress: 0,
      completed: 0,
    }
  );
  const filteredQuickReplies = QUICK_REPLIES.filter((phrase) =>
    phrase.toLowerCase().includes(quickReplySearch.trim().toLowerCase())
  );

  const readSupplierStatus = (): ManagerPresence => {
    if (typeof window === "undefined") {
      return "online";
    }

    const rawValue = window.localStorage.getItem(supplierStatusStorageKey);

    if (
      rawValue === "online" ||
      rawValue === "break" ||
      rawValue === "offline"
    ) {
      return rawValue;
    }

    return "online";
  };

  const writeSupplierStatus = (status: ManagerPresence) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(supplierStatusStorageKey, status);
  };

  const readPinnedRequestIds = () => {
    if (typeof window === "undefined") {
      return [];
    }

    const rawValue = window.localStorage.getItem(supplierPinnedRequestsStorageKey);

    if (!rawValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(rawValue) as unknown;

      return Array.isArray(parsedValue)
        ? parsedValue.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      window.localStorage.removeItem(supplierPinnedRequestsStorageKey);
      return [];
    }
  };

  const writePinnedRequestIds = (nextPinnedRequestIds: string[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      supplierPinnedRequestsStorageKey,
      JSON.stringify(nextPinnedRequestIds)
    );
  };

  const fetchSupplierRequests = async (): Promise<SupplierRequest[]> => {
    const response = await fetch(
      `http://localhost:3001/supplier-requests?supplierName=${encodeURIComponent(
        supplierName
      )}`
    );

    if (response.ok) {
      return response.json();
    }

    const ticketsResponse = await fetch("http://localhost:3001/tickets");

    if (!ticketsResponse.ok) {
      throw new Error("Не удалось загрузить запросы поставщику");
    }

    const tickets = (await ticketsResponse.json()) as Ticket[];
    const supplierRequestsByTicket = await Promise.all(
      tickets.map(async (ticket) => {
        const ticketRequestsResponse = await fetch(
          `http://localhost:3001/tickets/${ticket.id}/supplier-requests`
        );

        if (!ticketRequestsResponse.ok) {
          return [];
        }

        const ticketRequests =
          (await ticketRequestsResponse.json()) as SupplierRequest[];

        return ticketRequests.filter(
          (request) => request.supplierName === supplierName
        );
      })
    );

    return supplierRequestsByTicket
      .flat()
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
  };

  const fetchTicketMessages = async (ticketId: string): Promise<TicketMessage[]> => {
    const response = await fetch(
      `http://localhost:3001/tickets/${ticketId}/messages?viewerType=supplier&markAsRead=true`
    );

    if (!response.ok) {
      throw new Error("Не удалось загрузить сообщения тикета");
    }

    return response.json();
  };

  const syncSupplierRequests = (requests: SupplierRequest[]) => {
    setSupplierRequests((currentRequests) =>
      areRequestsEqual(currentRequests, requests) ? currentRequests : requests
    );
  };

  useEffect(() => {
    const session = readAuthSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.role !== "supplier") {
      router.replace("/");
      return;
    }

    setAuthReady(true);
    setSupplierStatus(readSupplierStatus());
    setPinnedRequestIds(readPinnedRequestIds());
  }, [router]);

  useEffect(() => {
    if (!isSupplierMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!supplierMenuRef.current) {
        return;
      }

      if (!supplierMenuRef.current.contains(event.target as Node)) {
        setIsSupplierMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSupplierMenuOpen]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    const loadSupplierRequests = async () => {
      setIsLoadingRequests(true);
      setRequestsError("");

      try {
        const data = await fetchSupplierRequests();
        const ticketsMap = await fetchTicketsMap();
        const messagesMap = await fetchMessagesMapForRequests(data);
        syncSupplierRequests(data);
        setTicketsById(ticketsMap);
        setTicketMessagesByTicketId((currentMap) =>
          areMessageMapsEqual(currentMap, messagesMap) ? currentMap : messagesMap
        );
      } catch (error) {
        console.error("Ошибка загрузки supplier requests:", error);
        setRequestsError("Не удалось загрузить запросы поставщику");
      } finally {
        setIsLoadingRequests(false);
      }
    };

    void loadSupplierRequests();
  }, [authReady]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (!selectedRequest) {
      setTicketMessages([]);
      setReplyText("");
      setReplyError("");
      return;
    }

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      setMessagesError("");

      try {
        const data = await fetchTicketMessages(selectedRequest.ticketId);
        setTicketMessages((currentMessages) =>
          areMessagesEqual(currentMessages, data) ? currentMessages : data
        );
        setTicketMessagesByTicketId((currentMap) => {
          const nextMap = {
            ...currentMap,
            [selectedRequest.ticketId]: data,
          };

          return areMessageMapsEqual(currentMap, nextMap) ? currentMap : nextMap;
        });
      } catch (error) {
        console.error("Ошибка загрузки контекста тикета:", error);
        setMessagesError("Не удалось загрузить сообщения тикета");
      } finally {
        setIsLoadingMessages(false);
      }
    };

    void loadMessages();
  }, [authReady, selectedRequest]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const refreshSupplierWorkspace = async () => {
        try {
          const requests = await fetchSupplierRequests();
          const ticketsMap = await fetchTicketsMap();
          const messagesMap = await fetchMessagesMapForRequests(requests);
          const nextRequestCards = buildSupplierRequestCards(
            requests,
            messagesMap,
            pinnedRequestIds,
            ticketsMap
          );
          syncSupplierRequests(requests);
          setTicketsById(ticketsMap);
          setTicketMessagesByTicketId((currentMap) =>
            areMessageMapsEqual(currentMap, messagesMap) ? currentMap : messagesMap
          );

          const freshSelectedRequest =
            requests.find((request) => request.id === selectedRequestId) ??
            nextRequestCards[0]?.request ??
            null;

          if (!freshSelectedRequest) {
            setTicketMessages([]);
            return;
          }

          const messages = await fetchTicketMessages(freshSelectedRequest.ticketId);
          setTicketMessages((currentMessages) =>
            areMessagesEqual(currentMessages, messages) ? currentMessages : messages
          );
        } catch (pollingError) {
          console.error("Ошибка polling supplier page:", pollingError);
        }
      };

      void refreshSupplierWorkspace();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [authReady, pinnedRequestIds, selectedRequestId]);

  useEffect(() => {
    setSelectedRequestId((currentSelectedRequestId) => {
      if (
        currentSelectedRequestId &&
        supplierRequestCards.some((card) => card.request.id === currentSelectedRequestId)
      ) {
        return currentSelectedRequestId;
      }

      return supplierRequestCards[0]?.request.id ?? "";
    });
  }, [supplierRequestCards]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticketMessages.length]);

  useEffect(() => {
    if (!quickRepliesRef.current || (!showQuickReplies && !showEmojiPicker)) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!quickRepliesRef.current?.contains(event.target as Node)) {
        setShowQuickReplies(false);
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showQuickReplies, showEmojiPicker]);

  useEffect(() => {
    if (!composerTextareaRef.current) {
      return;
    }

    composerTextareaRef.current.style.height = "0px";
    composerTextareaRef.current.style.height = `${Math.min(
      composerTextareaRef.current.scrollHeight,
      132
    )}px`;
  }, [replyText]);

  const handleLogout = () => {
    clearAuthSession();
    router.replace("/login");
  };

  const handleChangeSupplierStatus = (status: ManagerPresence) => {
    setSupplierStatus(status);
    writeSupplierStatus(status);
    setIsSupplierMenuOpen(false);
  };

  const handleTogglePinned = async () => {
    if (!selectedRequest || isTogglingPinned) {
      return;
    }

    setIsTogglingPinned(true);
    setPinError("");

    try {
      setPinnedRequestIds((currentPinnedRequestIds) => {
        const isPinned = currentPinnedRequestIds.includes(selectedRequest.id);

        if (!isPinned && currentPinnedRequestIds.length >= 3) {
          throw new Error("Можно закрепить максимум 3 чата");
        }

        const nextPinnedRequestIds = isPinned
          ? currentPinnedRequestIds.filter((requestId) => requestId !== selectedRequest.id)
          : [selectedRequest.id, ...currentPinnedRequestIds];

        writePinnedRequestIds(nextPinnedRequestIds);
        return nextPinnedRequestIds;
      });
    } catch (error) {
      console.error("Ошибка обновления закрепления:", error);
      setPinError(
        error instanceof Error ? error.message : "Не удалось обновить закрепление"
      );
    } finally {
      setIsTogglingPinned(false);
    }
  };

  const handleInviteManager = async () => {
    if (!selectedRequest) {
      return;
    }

    const manager = availableManagers.find(
      (availableManager) => availableManager.id === selectedInvitedManagerId
    );

    if (!manager || manager.status !== "online") {
      setInviteManagerError("Выберите менеджера со статусом «В сети»");
      return;
    }

    setIsInvitingManager(true);
    setInviteManagerError("");

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${selectedRequest.ticketId}/invite-manager`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: manager.id,
            managerName: manager.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось пригласить менеджера");
      }

      const updatedTicket = (await response.json()) as Ticket;
      setTicketsById((current) => ({
        ...current,
        [updatedTicket.id]: updatedTicket,
      }));
      setIsInviteModalOpen(false);
    } catch (error) {
      console.error("Ошибка приглашения менеджера:", error);
      setInviteManagerError("Не удалось пригласить менеджера");
    } finally {
      setIsInvitingManager(false);
    }
  };

  const handleTransferDialog = async () => {
    if (!selectedRequest) {
      return;
    }

    const manager = availableManagers.find(
      (availableManager) => availableManager.id === selectedTransferManagerId
    );

    if (!manager || manager.status !== "online") {
      setTransferDialogError("Выберите менеджера со статусом «В сети»");
      return;
    }

    setIsTransferringDialog(true);
    setTransferDialogError("");

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${selectedRequest.ticketId}/assign-manager`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: manager.id,
            managerName: manager.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось передать диалог");
      }

      const updatedTicket = (await response.json()) as Ticket;
      setTicketsById((current) => ({
        ...current,
        [updatedTicket.id]: updatedTicket,
      }));
      setIsTransferModalOpen(false);
    } catch (error) {
      console.error("Ошибка передачи диалога:", error);
      setTransferDialogError("Не удалось передать диалог");
    } finally {
      setIsTransferringDialog(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedRequest || isResolvingTicket || selectedTicket?.status === "resolved") {
      return;
    }

    setIsResolvingTicket(true);

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${selectedRequest.ticketId}/resolve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: selectedRequest.createdByManagerId ?? selectedTicket?.assignedManagerId ?? "manager_anna",
            managerName: selectedManagerName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось отметить диалог как решённый");
      }

      const updatedTicket = (await response.json()) as Ticket;
      setTicketsById((current) => ({
        ...current,
        [updatedTicket.id]: updatedTicket,
      }));
      setActiveQueueTab("completed");
      setReplyText("");
      setAttachmentName("");
      setShowQuickReplies(false);
      setShowEmojiPicker(false);
    } catch (error) {
      console.error("Ошибка завершения диалога:", error);
    } finally {
      setIsResolvingTicket(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedRequest || !replyText.trim() || isSupplierDialogResolved) {
      return;
    }

    setIsSendingReply(true);
    setReplyError("");

    try {
      const response = await fetch("http://localhost:3001/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: selectedRequest.ticketId,
          content: replyText,
          senderType: "supplier",
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить ответ поставщика");
      }

      const data = await fetchTicketMessages(selectedRequest.ticketId);
      setTicketMessages(data);
      setTicketMessagesByTicketId((currentMap) => {
        const nextMap = {
          ...currentMap,
          [selectedRequest.ticketId]: data,
        };

        return areMessageMapsEqual(currentMap, nextMap) ? currentMap : nextMap;
      });
      setReplyText("");
      setAttachmentName("");
    } catch (error) {
      console.error("Ошибка отправки ответа поставщика:", error);
      setReplyError("Не удалось отправить ответ поставщика");
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleAddQuickReply = () => {
    const nextPhrase = window.prompt("Введите новую быструю фразу");

    if (!nextPhrase?.trim()) {
      return;
    }

    setReplyText(nextPhrase.trim());
    setShowQuickReplies(false);
    setQuickReplySearch("");
  };

  if (!authReady) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] flex items-center justify-center text-gray-500">
        Проверяем доступ...
      </main>
    );
  }

  return (
    <main
      className="h-screen overflow-hidden bg-[#F5F5F7]"
      style={{ fontFamily: appFontFamily }}
    >
      <div className="flex h-full min-w-0 overflow-hidden">
        <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-[#E5E5EA] bg-[#FBFBFD] px-4 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8E8E93]">
            TouchSpace
          </p>
          <h1 className="mt-2 text-[22px] font-semibold text-[#1E1E1E]">
            {supplierName}
          </h1>
          <p className="mt-1 text-[13px] text-[#8E8E93]">
            Очередь обращений
          </p>

          <div ref={supplierMenuRef} className="relative mt-4">
            <button
              onClick={() => setIsSupplierMenuOpen((prev) => !prev)}
              className="flex w-full items-center gap-2.5 rounded-[16px] border border-[#E9EAF0] bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:border-[#DCE7FF] hover:bg-[#FCFDFF]"
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF6FF]">
                <Image
                  src="/icons/menedger.svg"
                  alt="Поставщик"
                  width={16}
                  height={16}
                  className="h-4 w-4"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(38%) sepia(98%) saturate(2437%) hue-rotate(204deg) brightness(102%) contrast(101%)",
                  }}
                />
                <span
                  className={`absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${supplierStatusDots[supplierStatus]}`}
                />
              </div>

              <div className="min-w-0 flex-1 text-left leading-none">
                <p className="truncate text-[14px] font-semibold text-[#1E1E1E]">
                  {supplierName}
                </p>
                <p className="mt-0.5 text-[11px] text-[#8E8E93]">
                  {supplierStatusLabels[supplierStatus]}
                </p>
              </div>

              <span className="shrink-0 text-[11px] text-[#AEAEB2]">▾</span>
            </button>

            {isSupplierMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[210px] rounded-[18px] border border-[#E5E5EA] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                {(["online", "break", "offline"] as ManagerPresence[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleChangeSupplierStatus(status)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      supplierStatus === status ? "bg-[#F3F8FF]" : "hover:bg-[#F7F8FB]"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${supplierStatusDots[status]}`} />
                    <p className="text-[13px] font-medium text-[#1E1E1E]">
                      {supplierStatusLabels[status]}
                    </p>
                  </button>
                ))}

                <div className="my-2 h-px bg-[#EEF0F4]" />

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[#FD6868] transition hover:bg-[#FFF4F4]"
                >
                  <span>Выйти</span>
                  <span className="text-xs">↗</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="rounded-[12px] bg-[#F2F2F5] p-1">
              <div className="grid grid-cols-2 gap-1">
              {supplierQueueTabs.map((tab) => {
                const isActive = activeQueueTab === tab.id;
                const count = queueCounts[tab.id];

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveQueueTab(tab.id)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition ${
                      isActive
                        ? "bg-white text-[#1E1E1E] shadow-[0_2px_6px_rgba(15,23,42,0.06)]"
                        : "bg-transparent text-[#6C6C70] hover:text-[#1E1E1E]"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.id !== "completed" ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                          isActive ? tab.badgeClassName : "bg-white text-[#8E8E93]"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              </div>
            </div>

            <div>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-2xl border border-[#D1D1D6] bg-white px-4 py-3 text-sm text-[#1E1E1E] outline-none placeholder:text-[#8E8E93]"
                placeholder="Поиск по клиенту, диалогу или запросу..."
              />
            </div>

            {isLoadingRequests && (
              <p className="text-sm text-gray-500">Загружаем запросы...</p>
            )}

            {requestsError && (
              <p className="text-sm text-red-500">{requestsError}</p>
            )}

            {pinError && (
              <p className="text-sm text-red-500">{pinError}</p>
            )}

            {!isLoadingRequests &&
              !requestsError &&
              activeTabRequests.map((card) => (
                <button
                  key={card.request.id}
                  onClick={() => setSelectedRequestId(card.request.id)}
                  className={`w-full rounded-[14px] border bg-white p-[14px] text-left transition ${
                    selectedRequestId === card.request.id
                      ? "border-[2px] border-[#0A84FF] shadow-[0_10px_24px_rgba(10,132,255,0.08)]"
                      : "border-[#E8E8ED] hover:-translate-y-0.5 hover:border-[#D8E4FF] hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                  }`}
                >
                  <div
                    className={`${
                      card.queueTab === "requires_reply"
                        ? "border-l-[3px] border-[#FF3B30] pl-3"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-full bg-[#EEF4FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0A84FF]">
                          {card.managerName !== "Не указан"
                            ? `от менеджера ${card.managerName}`
                            : "от менеджера"}
                        </div>
                        {card.pinned ? (
                          <span className="text-sm leading-none" title="Закреплён">
                            📌
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 truncate text-[15px] font-semibold text-[#1E1E1E]">
                        {card.request.supplierName}
                      </p>
                    </div>

                    <p className="shrink-0 text-[12px] font-medium text-[#8E8E93]">
                      {formatTimeLabel(card.lastActivityAt)}
                    </p>
                    </div>

                    <p className="mt-2 line-clamp-2 text-[14px] leading-6 text-[#1E1E1E]">
                      {card.request.requestText}
                    </p>

                    <div className="mt-3 flex items-center justify-start gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        supplierQueueTabs.find((tab) => tab.id === card.queueTab)?.badgeClassName ??
                        "bg-[#F2F2F7] text-[#6C6C70]"
                      }`}
                    >
                      {supplierQueueTabs.find((tab) => tab.id === card.queueTab)?.label}
                    </span>
                    </div>
                  </div>
                </button>
              ))}

            {!isLoadingRequests &&
              !requestsError &&
              supplierRequests.length > 0 &&
              activeTabRequests.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-[#D8D8DE] bg-white/70 p-5 text-sm leading-6 text-[#8E8E93]">
                  {searchQuery.trim()
                    ? "Ничего не найдено по текущему запросу."
                    : "Нет диалогов."}
                </div>
              )}

            {!isLoadingRequests &&
              !requestsError &&
              supplierRequests.length === 0 && (
                <p className="text-sm text-gray-500">
                  Для этого поставщика пока нет назначенных запросов.
                </p>
              )}
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 overflow-hidden bg-[#F7F7FA]">
          {selectedRequest ? (
            <>
              <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F7FA]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-[#E5E5EA] bg-white px-6 py-5">
                  <div className="min-w-0">
                    <p className="truncate text-[18px] font-semibold text-[#1E1E1E]">
                      {selectedClientLabel}
                    </p>
                    <p className="mt-1 text-[13px] text-[#8E8E93]">
                      Ticket #{selectedRequest.ticketId} • от менеджера {selectedManagerName}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-[12px] bg-[#F2F2F5] p-1.5">
                    <div className="relative">
                      <button
                        onClick={handleTogglePinned}
                        disabled={isTogglingPinned}
                        onMouseEnter={() => setHoveredHeaderAction("pin")}
                        onMouseLeave={() => setHoveredHeaderAction(null)}
                        className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition duration-200 hover:bg-[#E5F0FF] ${
                          selectedRequestCard?.pinned ? "bg-[#595FFF]" : "bg-transparent"
                        }`}
                      >
                        <Image
                          src="/icons/zakrepit.svg"
                          alt="Закрепить"
                          width={18}
                          height={18}
                          className={`h-[18px] w-[18px] ${
                            selectedRequestCard?.pinned ? "brightness-0 invert" : "opacity-70"
                          }`}
                        />
                      </button>
                      {hoveredHeaderAction === "pin" ? (
                        <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                          {selectedRequestCard?.pinned ? "Открепить чат" : "Закрепить чат"}
                        </div>
                      ) : null}
                    </div>

                    <div className="relative">
                      <button
                        onClick={() => {
                          setSelectedInvitedManagerId(firstOnlineManagerId);
                          setInviteManagerError("");
                          setIsInviteModalOpen(true);
                        }}
                        onMouseEnter={() => setHoveredHeaderAction("invite")}
                        onMouseLeave={() => setHoveredHeaderAction(null)}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] transition duration-200 hover:bg-[#E5F0FF]"
                      >
                        <Image
                          src="/icons/dobavit.svg"
                          alt="Пригласить"
                          width={18}
                          height={18}
                          className="h-[18px] w-[18px] opacity-70"
                        />
                      </button>
                      {hoveredHeaderAction === "invite" ? (
                        <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                          Пригласить менеджера
                        </div>
                      ) : null}
                    </div>

                    <div className="relative">
                      <button
                        onClick={() => {
                          setSelectedTransferManagerId(firstOnlineManagerId);
                          setTransferDialogError("");
                          setIsTransferModalOpen(true);
                        }}
                        onMouseEnter={() => setHoveredHeaderAction("transfer")}
                        onMouseLeave={() => setHoveredHeaderAction(null)}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] transition duration-200 hover:bg-[#E5F0FF]"
                      >
                        <Image
                          src="/icons/priglasit.svg"
                          alt="Передать"
                          width={18}
                          height={18}
                          className="h-[18px] w-[18px] opacity-70"
                        />
                      </button>
                      {hoveredHeaderAction === "transfer" ? (
                        <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                          Передать
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <button
                        onClick={handleResolveTicket}
                        disabled={isResolvingTicket || selectedTicket?.status === "resolved"}
                        onMouseEnter={() => setHoveredHeaderAction("resolve")}
                        onMouseLeave={() => setHoveredHeaderAction(null)}
                        className="flex items-center gap-2 rounded-[10px] bg-[#E9F7EF] px-4 py-2 text-sm font-semibold text-[#34C759] transition duration-200 hover:scale-[1.02] active:scale-95 disabled:cursor-default disabled:opacity-80"
                      >
                        <Image
                          src="/icons/reshen.svg"
                          alt="Решён"
                          width={16}
                          height={16}
                          className="h-4 w-4"
                          style={{
                            filter:
                              "brightness(0) saturate(100%) invert(58%) sepia(78%) saturate(2475%) hue-rotate(317deg) brightness(103%) contrast(98%)",
                          }}
                        />
                        <span>{isResolvingTicket ? "Сохраняем..." : "Решён"}</span>
                      </button>
                      {hoveredHeaderAction === "resolve" ? (
                        <div className="absolute right-0 top-[calc(100%+8px)] z-20 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                          Отметить как решённый
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                  <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4">
                    <div className="flex justify-center py-1">
                      <div className="rounded-full bg-[#F2F2F7] px-4 py-1.5 text-xs font-medium text-[#8E8E93]">
                        {formatMessageDayLabel(selectedRequest.createdAt)}
                      </div>
                    </div>

                    <div className="flex justify-center py-2">
                      <div className="w-full max-w-[560px] rounded-full border border-[#E5E5EA] bg-[#F7F7FA] px-5 py-3 text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8E8E93]">
                          Запрос менеджера
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#6C6C70]">
                          {selectedRequest.requestText}
                        </p>
                        <p className="mt-2 text-[10px] text-[#AEAEB2]">
                          {new Date(selectedRequest.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    {isLoadingMessages && (
                      <p className="text-sm text-gray-500">Загружаем сообщения...</p>
                    )}

                    {messagesError && (
                      <p className="text-sm text-red-500">{messagesError}</p>
                    )}

                    {!isLoadingMessages &&
                      !messagesError &&
                      visibleSupplierMessages.map((message, index) => {
                        const previousMessage = visibleSupplierMessages[index - 1];
                        const shouldShowDateSeparator =
                          !previousMessage ||
                          getMessageDayKey(previousMessage.createdAt) !==
                            getMessageDayKey(message.createdAt);

                        return (
                          <div key={message.id}>
                            {shouldShowDateSeparator && (
                              <div className="flex justify-center py-1">
                                <div className="rounded-full bg-[#F2F2F7] px-4 py-1.5 text-xs font-medium text-[#8E8E93]">
                                  {formatMessageDayLabel(message.createdAt)}
                                </div>
                              </div>
                            )}

                            <div
                              className={`flex ${
                                message.senderType === "supplier"
                                  ? "justify-end"
                                  : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-[46%] min-w-[112px] rounded-[20px] px-4 py-3 text-base leading-6 shadow-sm transition ${
                                  message.senderType === "supplier"
                                    ? "bg-[#0A84FF] text-white shadow-[0_10px_24px_rgba(10,132,255,0.24)]"
                                    : "bg-[#EFEFF4] text-[#1E1E1E]"
                                }`}
                              >
                                <div className="space-y-1.5">
                                  <p className="mb-1 text-xs opacity-60">
                                    {message.senderType === "client" && "Клиент"}
                                    {message.senderType === "supplier" && "Поставщик"}
                                  </p>
                                  <p className="break-words">{message.content}</p>
                                  <div
                                    className={`flex items-center gap-3 text-[10px] ${
                                      message.senderType === "supplier"
                                        ? "justify-between text-white/65"
                                        : "justify-end text-[#8E8E93]"
                                    }`}
                                  >
                                    {message.senderType === "supplier" ? (
                                      <p className="min-w-0 truncate text-left">
                                        {getMessageStatusLabel(message.status)}
                                      </p>
                                    ) : null}
                                    <p className="shrink-0">
                                      {new Date(message.createdAt).toLocaleTimeString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                    {!isLoadingMessages && !messagesError && visibleSupplierMessages.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        После запроса менеджера здесь будут видны только сообщения клиента и поставщика.
                      </p>
                    ) : null}

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="border-t border-[#E5E5EA] bg-white px-6 py-5">
                  <div className="mx-auto w-full max-w-3xl">
                    {isSupplierDialogResolved ? (
                      <div className="rounded-[24px] border border-[#E5E5EA] bg-[#F7F7FA] px-5 py-4 text-center shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                        <p className="text-sm font-medium text-[#1E1E1E]">
                          Вы закончили диалог
                        </p>
                        <p className="mt-1 text-xs text-[#8E8E93]">
                          Пока диалог завершён, новое сообщение клиенту отправить нельзя.
                        </p>
                      </div>
                    ) : attachmentName ? (
                      <div className="mb-3 flex">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#D8D8DE] bg-[#F7F7FA] px-3 py-1.5 text-sm text-[#1E1E1E]">
                          <span className="max-w-[240px] truncate">{attachmentName}</span>
                          <button
                            onClick={() => setAttachmentName("")}
                            className="text-[#8E8E93] transition hover:text-[#1E1E1E]"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {!isSupplierDialogResolved ? (
                      <div className="flex items-end gap-3 rounded-[28px] border border-[#E3E5EA] bg-white px-5 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
                      <div className="min-w-0 flex-1">
                        <textarea
                          ref={composerTextareaRef}
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSendReply();
                            }
                          }}
                          rows={1}
                          className="min-h-[40px] max-h-[132px] w-full resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-6 text-[#1E1E1E] outline-none placeholder:text-[#8E8E93]"
                          placeholder="Напишите сообщение..."
                        />
                      </div>

                      <div ref={quickRepliesRef} className="relative flex items-center gap-2">
                        {showQuickReplies ? (
                          <div className="absolute bottom-[calc(100%+14px)] right-24 z-20 w-[340px] rounded-[20px] border border-[#E4E6EB] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                            <div className="mb-3 px-1 text-[13px] font-semibold text-[#1E1E1E]">
                              Быстрые фразы
                            </div>
                            <input
                              value={quickReplySearch}
                              onChange={(event) => setQuickReplySearch(event.target.value)}
                              className="mb-3 w-full rounded-xl border border-[#E5E5EA] bg-[#FBFBFD] px-3 py-2 text-sm text-[#1E1E1E] outline-none placeholder:text-[#8E8E93]"
                              placeholder="Поиск по фразам..."
                            />
                            <div className="max-h-[240px] space-y-1 overflow-y-auto">
                              {filteredQuickReplies.map((phrase) => (
                                <button
                                  key={phrase}
                                  onClick={() => {
                                    setReplyText(phrase);
                                    setShowQuickReplies(false);
                                    setQuickReplySearch("");
                                  }}
                                  className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-[#1E1E1E] transition hover:bg-[#F5F8FF]"
                                >
                                  {phrase}
                                </button>
                              ))}
                              {filteredQuickReplies.length === 0 ? (
                                <div className="rounded-xl px-3 py-4 text-sm text-[#8E8E93]">
                                  Ничего не найдено
                                </div>
                              ) : null}
                            </div>
                            <button
                              onClick={handleAddQuickReply}
                              className="mt-3 w-full rounded-xl border border-[#DCE7FF] bg-[#F5F9FF] px-3 py-2.5 text-sm font-medium text-[#0A84FF] transition hover:bg-[#ECF4FF]"
                            >
                              + Добавить фразу
                            </button>
                          </div>
                        ) : null}

                        {showEmojiPicker ? (
                          <div className="absolute bottom-[calc(100%+14px)] right-10 z-20 w-[300px] rounded-[20px] border border-[#E4E6EB] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                            <div className="mb-3 px-1 text-[13px] font-semibold text-[#1E1E1E]">
                              Смайлики
                            </div>
                            <div className="grid grid-cols-5 gap-2">
                              {EMOJI_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => {
                                    setReplyText((prev) => `${prev}${emoji}`);
                                    setShowEmojiPicker(false);
                                  }}
                                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FBFBFD] text-xl transition hover:bg-[#EEF6FF]"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <button
                          onClick={() => {
                            setShowQuickReplies((prev) => !prev);
                            setShowEmojiPicker(false);
                          }}
                          onMouseEnter={() => setHoveredComposerAction("quick")}
                          onMouseLeave={() => setHoveredComposerAction(null)}
                          className={`relative flex h-[38px] w-[38px] items-center justify-center rounded-xl transition ${
                            showQuickReplies
                              ? "bg-[#E5F0FF]"
                              : "bg-transparent hover:bg-[#E5F0FF]"
                          }`}
                        >
                          <Image
                            src="/icons/fraza.svg"
                            alt="Быстрые фразы"
                            width={18}
                            height={18}
                            className="h-[18px] w-[18px]"
                            style={{
                              filter:
                                showQuickReplies || hoveredComposerAction === "quick"
                                  ? "brightness(0) saturate(100%) invert(38%) sepia(98%) saturate(2437%) hue-rotate(204deg) brightness(102%) contrast(101%)"
                                  : "brightness(0) saturate(100%) invert(59%) sepia(7%) saturate(205%) hue-rotate(202deg) brightness(91%) contrast(90%)",
                            }}
                          />
                          {hoveredComposerAction === "quick" && !showQuickReplies ? (
                            <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-[#E5E5EA] bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                              Быстрые фразы
                            </div>
                          ) : null}
                        </button>

                        <button
                          onClick={() => {
                            setShowEmojiPicker((prev) => !prev);
                            setShowQuickReplies(false);
                          }}
                          onMouseEnter={() => setHoveredComposerAction("emoji")}
                          onMouseLeave={() => setHoveredComposerAction(null)}
                          className={`relative flex h-[38px] w-[38px] items-center justify-center rounded-xl transition ${
                            showEmojiPicker
                              ? "bg-[#E5F0FF]"
                              : "bg-transparent hover:bg-[#E5F0FF]"
                          }`}
                        >
                          <Image
                            src="/icons/smail.svg"
                            alt="Смайлики"
                            width={18}
                            height={18}
                            className="h-[18px] w-[18px]"
                            style={{
                              filter:
                                showEmojiPicker || hoveredComposerAction === "emoji"
                                  ? "brightness(0) saturate(100%) invert(38%) sepia(98%) saturate(2437%) hue-rotate(204deg) brightness(102%) contrast(101%)"
                                  : "brightness(0) saturate(100%) invert(59%) sepia(7%) saturate(205%) hue-rotate(202deg) brightness(91%) contrast(90%)",
                            }}
                          />
                          {hoveredComposerAction === "emoji" && !showEmojiPicker ? (
                            <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-[#E5E5EA] bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                              Смайлики
                            </div>
                          ) : null}
                        </button>

                        <button
                          onClick={() => fileInputRef.current?.click()}
                          onMouseEnter={() => setHoveredComposerAction("file")}
                          onMouseLeave={() => setHoveredComposerAction(null)}
                          className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl transition hover:bg-[#E5F0FF]"
                        >
                          <Image
                            src="/icons/skrepka.svg"
                            alt="Вложить файл"
                            width={18}
                            height={18}
                            className="h-[18px] w-[18px]"
                            style={{
                              filter:
                                hoveredComposerAction === "file"
                                  ? "brightness(0) saturate(100%) invert(38%) sepia(98%) saturate(2437%) hue-rotate(204deg) brightness(102%) contrast(101%)"
                                  : "brightness(0) saturate(100%) invert(59%) sepia(7%) saturate(205%) hue-rotate(202deg) brightness(91%) contrast(90%)",
                            }}
                          />
                          {hoveredComposerAction === "file" ? (
                            <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-[#E5E5EA] bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                              Вложить файл
                            </div>
                          ) : null}
                        </button>

                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            setAttachmentName(file?.name ?? "");
                            event.target.value = "";
                          }}
                        />
                      </div>

                      <button
                        onClick={handleSendReply}
                        disabled={isSendingReply || !replyText.trim()}
                        onMouseEnter={() => setHoveredComposerAction("send")}
                        onMouseLeave={() => setHoveredComposerAction(null)}
                        className="relative flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#0A84FF] shadow-[0_12px_22px_rgba(10,132,255,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0077F2] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                      >
                        <Image
                          src="/icons/otpravit.svg"
                          alt="Отправить"
                          width={19}
                          height={19}
                          className="h-[19px] w-[19px]"
                        />
                        {hoveredComposerAction === "send" ? (
                          <div className="absolute bottom-[calc(100%+10px)] right-0 z-20 whitespace-nowrap rounded-[10px] border border-[#E5E5EA] bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                            Отправить
                          </div>
                        ) : null}
                      </button>
                    </div>
                    ) : null}

                    {replyError ? (
                      <p className="mt-3 text-sm text-red-500">{replyError}</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[#E5E5EA] bg-[#FBFBFD] px-4 py-5">
                {supplierPanelStatus ? (
                  <div
                    className={`mb-4 rounded-[18px] border bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${supplierPanelStatus.cardClassName}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-[#8E8E93]">
                          Статус
                        </p>
                      </div>
                      <span className={`mt-1 h-3 w-3 rounded-full ${supplierPanelStatus.accentClassName}`} />
                    </div>
                    <div className="mt-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${supplierPanelStatus.badgeClassName}`}
                      >
                        {supplierPanelStatus.label}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="mb-4 rounded-[18px] border border-[#E5E5EA] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#8E8E93]">
                    Запрос от менеджера
                  </p>
                  <div className="mt-4 rounded-[16px] bg-[#FBFBFD] p-4">
                    <p className="text-[15px] leading-7 text-[#1E1E1E]">
                      {selectedRequest.requestText}
                    </p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-[#6C6C70]">
                    <p>Менеджер: {selectedManagerName}</p>
                    <p>Передан: {formatDateTimeLabel(selectedRequest.createdAt)}</p>
                  </div>
                </div>

                {supplierSla ? (
                  <div className="mb-4 rounded-[18px] border border-[#E5E5EA] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-[#8E8E93]">
                          SLA
                        </p>
                        <p className="mt-3 text-sm font-medium text-[#1E1E1E]">
                          {supplierSla.label}
                        </p>
                        <p className={`mt-1 text-xs font-medium ${supplierSla.tone}`}>
                          {supplierSla.status}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${supplierSla.tone}`}>
                        {supplierSla.time}
                      </span>
                    </div>

                    <div className="mt-4 h-2 rounded-full bg-[#ECECF1]">
                      <div
                        className={`h-2 rounded-full ${supplierSla.bar}`}
                        style={{ width: supplierSla.progress }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[18px] border border-[#E5E5EA] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#8E8E93]">
                    Контекст
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-[#6C6C70]">
                    <div className="flex items-start justify-between gap-4">
                      <span>Клиент</span>
                      <span className="text-right text-[#1E1E1E]">{selectedClientLabel}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span>Обращение</span>
                      <span className="text-right text-[#1E1E1E]">#{selectedRequest.ticketId}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </>
          ) : (
            <div className="flex h-full flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-[#FBFCFD] p-10 text-center text-gray-500">
              Выберите supplier request слева, чтобы увидеть его контекст.
            </div>
          )}
        </section>
      </div>

      {isInviteModalOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(30,30,30,0.28)] p-6">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8E8E93]">
                  Пригласить менеджера
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[#1E1E1E]">
                  Подключить менеджера к диалогу
                </h3>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="rounded-full bg-[#F2F2F7] px-3 py-2 text-sm text-[#6C6C70]"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {availableManagers.map((manager) => (
                <button
                  key={manager.id}
                  onClick={() =>
                    manager.status === "online"
                      ? setSelectedInvitedManagerId(manager.id)
                      : undefined
                  }
                  disabled={manager.status !== "online"}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedInvitedManagerId === manager.id
                      ? "border-[#CFE1FF] bg-[#F3F8FF]"
                      : manager.status === "online"
                        ? "border-[#E5E5EA] bg-white"
                        : "border-[#E5E5EA] bg-[#F7F7FA] opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${supplierStatusDots[manager.status]}`} />
                      <p className="text-sm font-medium text-[#1E1E1E]">{manager.name}</p>
                    </div>
                    <span className="text-xs text-[#8E8E93]">
                      {supplierStatusLabels[manager.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {inviteManagerError ? (
              <p className="mt-4 text-sm text-red-500">{inviteManagerError}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="rounded-2xl border border-[#D1D1D6] bg-white px-4 py-3 text-sm text-[#6C6C70]"
              >
                Отмена
              </button>
              <button
                onClick={handleInviteManager}
                disabled={
                  isInvitingManager ||
                  availableManagers.find((manager) => manager.id === selectedInvitedManagerId)
                    ?.status !== "online"
                }
                className="rounded-2xl bg-[#0A84FF] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isInvitingManager ? "Приглашаем..." : "Пригласить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTransferModalOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(30,30,30,0.28)] p-6">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8E8E93]">
                  Передать диалог
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[#1E1E1E]">
                  Выберите нового ответственного
                </h3>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="rounded-full bg-[#F2F2F7] px-3 py-2 text-sm text-[#6C6C70]"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {availableManagers.map((manager) => (
                <button
                  key={manager.id}
                  onClick={() =>
                    manager.status === "online"
                      ? setSelectedTransferManagerId(manager.id)
                      : undefined
                  }
                  disabled={manager.status !== "online"}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedTransferManagerId === manager.id
                      ? "border-[#CFE1FF] bg-[#F3F8FF]"
                      : manager.status === "online"
                        ? "border-[#E5E5EA] bg-white"
                        : "border-[#E5E5EA] bg-[#F7F7FA] opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${supplierStatusDots[manager.status]}`} />
                      <p className="text-sm font-medium text-[#1E1E1E]">{manager.name}</p>
                    </div>
                    <span className="text-xs text-[#8E8E93]">
                      {supplierStatusLabels[manager.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {transferDialogError ? (
              <p className="mt-4 text-sm text-red-500">{transferDialogError}</p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="rounded-2xl border border-[#D1D1D6] bg-white px-4 py-3 text-sm text-[#6C6C70]"
              >
                Отмена
              </button>
              <button
                onClick={handleTransferDialog}
                disabled={
                  isTransferringDialog ||
                  availableManagers.find((manager) => manager.id === selectedTransferManagerId)
                    ?.status !== "online"
                }
                className="rounded-2xl bg-[#0A84FF] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isTransferringDialog ? "Передаём..." : "Передать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
