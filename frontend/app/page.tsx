"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  clearAuthSession,
  type ManagerPresence,
  managerAccounts,
  readManagerStatuses,
  readAuthSession,
  writeManagerStatus,
  writeAuthSession,
} from "@/lib/auth";

const suppliers = ["Karelia", "Pergo", "LabArte", "Alpine Floor"];

type MessageRole = "client" | "manager" | "supplier" | "system";

type ApiMessage = {
  id: string;
  content: string;
  senderType: string;
  status: string;
  createdAt: string;
};

type ApiSupplierRequest = {
  id: string;
  ticketId: string;
  supplierId: string | null;
  supplierName: string;
  status: string;
  requestText: string;
  slaMinutes: number | null;
  createdByManagerId: string | null;
  responseStartedAt: string | null;
  firstResponseAt: string | null;
  responseTime: number | null;
  responseBreached: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

type ApiTicket = {
  id: string;
  title: string;
  status?: string;
  pinned?: boolean;
  invitedManagerNames?: string[];
  assignedManagerId?: string | null;
  assignedManagerName?: string | null;
  lastResolvedByManagerId?: string | null;
  lastResolvedByManagerName?: string | null;
  firstResponseStartedAt?: string | null;
  firstResponseAt?: string | null;
  firstResponseTime?: number | null;
  firstResponseBreached?: boolean;
  messages?: ApiMessage[];
  supplierRequests?: ApiSupplierRequest[];
};

type ChatMessage = {
  id: string;
  text: string;
  from: MessageRole;
  status: string;
  time: string;
  createdAt: string;
  supplierName?: string;
};

type ChatSupplierRequest = {
  id: string;
  supplierName: string;
  status: string;
  requestText: string;
  slaMinutes: number | null;
  createdAt: string;
  createdAtRaw: string;
  responseStartedAt: string | null;
  firstResponseAt: string | null;
  responseTime: number | null;
  responseBreached: boolean;
};

type ChatItem = {
  id: string;
  title: string;
  status: string;
  headerStatus: string;
  rawStatus: string;
  pinned: boolean;
  invitedManagerNames: string[];
  assignedManagerId: string | null;
  assignedManagerName: string | null;
  lastResolvedByManagerId: string | null;
  lastResolvedByManagerName: string | null;
  firstResponseStartedAt: string | null;
  firstResponseAt: string | null;
  firstResponseTime: number | null;
  firstResponseBreached: boolean;
  clientName: string;
  messages: ChatMessage[];
  supplierRequests: ChatSupplierRequest[];
};

type SlaVisual = {
  label: string;
  status: string;
  time: string;
  progress: string;
  bar: string;
  tone: string;
};

const initialChats: ChatItem[] = [];
const appFontFamily = "Montserrat, ui-sans-serif, system-ui, sans-serif";
const QUICK_REPLIES = [
  "Здравствуйте! Чем могу помочь?",
  "Уточню информацию, одну минуту",
  "Передаю запрос поставщику",
  "Спасибо за ожидание",
  "Можете уточнить номер заказа?",
];
const EMOJI_REACTIONS = ["🙂", "😊", "😉", "🤝", "👍", "✅", "🔥", "❤️", "😂", "🙏"];
const BASE_MANAGERS = managerAccounts.map(({ id, name }) => ({ id, name }));
const managerStatusLabels: Record<ManagerPresence, string> = {
  online: "В сети",
  break: "На перерыве",
  offline: "Не в сети",
};
const managerStatusDots: Record<ManagerPresence, string> = {
  online: "bg-[#34C759]",
  break: "bg-[#FFB340]",
  offline: "bg-[#C7C7CC]",
};
const statusLabels: Record<string, string> = {
  open: "Новый",
  new: "Новый",
  resolved: "Решён",
  closed: "Закрыт",
  pending: "Ожидает",
  in_progress: "В работе",
  answered: "Ответ получен",
  cancelled: "Отменён",
  waiting_supplier: "Ждём поставщика",
  waiting_client: "Ждём клиента",
};

const getStatusLabel = (status?: string) => {
  if (!status) {
    return "Открыт";
  }

  return statusLabels[status] ?? status;
};

const getMessageStatusLabel = (status?: string) => {
  if (status === "read") {
    return "Прочитано";
  }

  if (status === "delivered") {
    return "Доставлено";
  }

  return "Отправлено";
};

const getChatPreview = (chat: ChatItem) => {
  const lastMessage = chat.messages.at(-1);

  if (!lastMessage) {
    return "Новое обращение без сообщений";
  }

  return lastMessage.text.length > 48
    ? `${lastMessage.text.slice(0, 48)}...`
    : lastMessage.text;
};

const getUnreadCount = (chat: ChatItem) => {
  let unreadCount = 0;

  for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
    const message = chat.messages[index];

    if (message.from === "manager" || message.from === "system") {
      break;
    }

    unreadCount += 1;
  }

  return unreadCount;
};

const getLastNonSystemMessage = (chat: ChatItem) => {
  for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
    const message = chat.messages[index];

    if (message.from !== "system") {
      return message;
    }
  }

  return null;
};

const getChatTone = (chat: ChatItem) => {
  if (chat.rawStatus === "resolved") {
    return {
      label: "Решён",
      dot: "bg-[#34C759]",
      pill: "bg-[#ECFFF1] text-[#1F8B4C]",
    };
  }

  if (chat.rawStatus === "closed") {
    return {
      label: "Закрыт",
      dot: "bg-[#C7C7CC]",
      pill: "bg-[#F2F2F7] text-[#8E8E93]",
    };
  }

  if (chat.rawStatus === "waiting_supplier") {
    return {
      label: "Ждём поставщика",
      dot: "bg-[#FFB340]",
      pill: "bg-[#FFF5E8] text-[#B7791F]",
    };
  }

  if (chat.rawStatus === "waiting_client") {
    return {
      label: "Ждём клиента",
      dot: "bg-[#FFB340]",
      pill: "bg-[#FFF5E8] text-[#B7791F]",
    };
  }

  if (chat.rawStatus === "in_progress") {
    return {
      label: "В работе",
      dot: "bg-[#0A84FF]",
      pill: "bg-[#EEF6FF] text-[#0A84FF]",
    };
  }

  return {
    label: "Новый",
    dot: "bg-[#8E8E93]",
    pill: "bg-[#F2F2F7] text-[#6C6C70]",
  };
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

const getSlaTone = (progressRatio: number) => {
  if (progressRatio < 0.5) {
    return {
      bar: "bg-[#34C759]",
      tone: "text-[#1F8B4C]",
      status: "В норме",
    };
  }

  if (progressRatio < 0.75) {
    return {
      bar: "bg-[#FFB340]",
      tone: "text-[#B7791F]",
      status: "Риск SLA",
    };
  }

  return {
    bar: "bg-[#FD6868]",
    tone: "text-[#D64545]",
    status: "Критично",
  };
};

const buildSlaVisual = ({
  label,
  startedAt,
  firstResponseAt,
  durationMs,
  breached,
  slaMs,
  now,
  inactiveText,
}: {
  label: string;
  startedAt?: string | null;
  firstResponseAt?: string | null;
  durationMs?: number | null;
  breached?: boolean;
  slaMs: number;
  now: number;
  inactiveText: string;
}): SlaVisual => {
  if (!startedAt) {
    return {
      label,
      status: "Не активирован",
      time: inactiveText,
      progress: "0%",
      bar: "bg-[#D1D1D6]",
      tone: "text-[#8E8E93]",
    };
  }

  if (firstResponseAt && durationMs !== null && durationMs !== undefined) {
    const ratio = Math.min(durationMs / slaMs, 1);
    const tone = breached
      ? { bar: "bg-[#FD6868]", tone: "text-[#D64545]", status: "Просрочено" }
      : getSlaTone(ratio);

    return {
      label,
      status: breached ? "Ответ с просрочкой" : "Ответ получен",
      time: `Ответ за ${formatDuration(durationMs)}`,
      progress: `${Math.max(ratio * 100, 8)}%`,
      bar: tone.bar,
      tone: tone.tone,
    };
  }

  const elapsedMs = Math.max(now - new Date(startedAt).getTime(), 0);
  const remainingMs = slaMs - elapsedMs;

  if (remainingMs <= 0) {
    return {
      label,
      status: "Просрочено",
      time: `Просрочка ${formatDuration(Math.abs(remainingMs))}`,
      progress: "100%",
      bar: "bg-[#FD6868]",
      tone: "text-[#D64545]",
    };
  }

  const ratio = Math.min(elapsedMs / slaMs, 1);
  const tone = getSlaTone(ratio);

  return {
    label,
    status: tone.status,
    time: `Осталось ${formatDuration(remainingMs)}`,
    progress: `${Math.max(ratio * 100, 8)}%`,
    bar: tone.bar,
    tone: tone.tone,
  };
};

const getStatusBadgeClass = (rawStatus?: string) => {
  if (rawStatus === "resolved") {
    return "bg-[#ECFFF1] text-[#1F8B4C]";
  }

  if (rawStatus === "waiting_supplier" || rawStatus === "waiting_client") {
    return "bg-[#FFF5E8] text-[#B7791F]";
  }

  if (rawStatus === "in_progress") {
    return "bg-[#EEF6FF] text-[#0A84FF]";
  }

  return "bg-[#F2F2F7] text-[#6C6C70]";
};

const formatMessage = (msg: ApiMessage): ChatMessage => ({
  id: msg.id,
  text: msg.content,
  from:
    msg.senderType === "client"
      ? "client"
      : msg.senderType === "supplier"
        ? "supplier"
        : msg.senderType === "system"
          ? "system"
          : "manager",
  status: msg.status,
  time: new Date(msg.createdAt).toLocaleTimeString(),
  createdAt: msg.createdAt,
});

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

const formatSupplierRequest = (
  request: ApiSupplierRequest
): ChatSupplierRequest => ({
  id: request.id,
  supplierName: request.supplierName,
  status: request.status,
  requestText: request.requestText,
  slaMinutes: request.slaMinutes,
  createdAt: new Date(request.createdAt).toLocaleString(),
  createdAtRaw: request.createdAt,
  responseStartedAt: request.responseStartedAt,
  firstResponseAt: request.firstResponseAt,
  responseTime: request.responseTime,
  responseBreached: request.responseBreached,
});

const extractApiErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  const responseText = await response.text();

  if (!responseText) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(responseText) as { message?: string | string[] };

    if (Array.isArray(parsed.message)) {
      return parsed.message.join(", ");
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    return responseText;
  }

  return responseText;
};

const formatTicket = (ticket: ApiTicket): ChatItem => ({
  id: ticket.id,
  title: ticket.title,
  status: getStatusLabel(ticket.status || "open"),
  headerStatus: getStatusLabel(ticket.status || "open"),
  rawStatus: ticket.status || "open",
  pinned: ticket.pinned ?? false,
  invitedManagerNames: ticket.invitedManagerNames ?? [],
  assignedManagerId: ticket.assignedManagerId ?? null,
  assignedManagerName: ticket.assignedManagerName ?? null,
  lastResolvedByManagerId: ticket.lastResolvedByManagerId ?? null,
  lastResolvedByManagerName: ticket.lastResolvedByManagerName ?? null,
  firstResponseStartedAt: ticket.firstResponseStartedAt ?? null,
  firstResponseAt: ticket.firstResponseAt ?? null,
  firstResponseTime: ticket.firstResponseTime ?? null,
  firstResponseBreached: ticket.firstResponseBreached ?? false,
  clientName: "Реселлер",
  messages: Array.isArray(ticket.messages) ? ticket.messages.map(formatMessage) : [],
  supplierRequests: Array.isArray(ticket.supplierRequests)
    ? ticket.supplierRequests.map(formatSupplierRequest)
    : [],
});

export default function Home() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [currentManagerId, setCurrentManagerId] = useState("");
  const [currentManagerName, setCurrentManagerName] = useState("");
  const [currentManagerStatus, setCurrentManagerStatus] =
    useState<ManagerPresence>("online");
  const [isManagerMenuOpen, setIsManagerMenuOpen] = useState(false);
  const [managerStatuses, setManagerStatuses] = useState<Record<string, ManagerPresence>>({});
  const [activeChatId, setActiveChatId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [quickReplySearch, setQuickReplySearch] = useState("");
  const [hoveredComposerAction, setHoveredComposerAction] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [chatData, setChatData] = useState<ChatItem[]>(initialChats);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredHeaderAction, setHoveredHeaderAction] = useState<string | null>(null);
  const [filter, setFilter] = useState<"incoming" | "in_progress" | "all">("incoming");

  const [isSupplierFormOpen, setIsSupplierFormOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(suppliers[0]);
  const [supplierRequestText, setSupplierRequestText] = useState("");
  const [isLoadingSupplierRequests, setIsLoadingSupplierRequests] = useState(false);
  const [supplierRequestsError, setSupplierRequestsError] = useState("");
  const [isCreatingSupplierRequest, setIsCreatingSupplierRequest] = useState(false);
  const [createSupplierRequestError, setCreateSupplierRequestError] = useState("");
  const [isTogglingPinned, setIsTogglingPinned] = useState(false);
  const [isResolvingTicket, setIsResolvingTicket] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedInvitedManagerId, setSelectedInvitedManagerId] = useState(
    BASE_MANAGERS[0].id
  );
  const [isInvitingManager, setIsInvitingManager] = useState(false);
  const [inviteManagerError, setInviteManagerError] = useState("");
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTransferManagerId, setSelectedTransferManagerId] = useState(
    BASE_MANAGERS[0].id
  );
  const [isTransferringDialog, setIsTransferringDialog] = useState(false);
  const [transferDialogError, setTransferDialogError] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState<number | null>(null);
  const [resolveToast, setResolveToast] = useState("");
  const [resolvedHighlight, setResolvedHighlight] = useState<{
    ticketId: string;
    until: number;
  } | null>(null);
  const [isClientTyping, setIsClientTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const quickRepliesRef = useRef<HTMLDivElement | null>(null);
  const managerMenuRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const knownTicketIdsRef = useRef<Set<string>>(new Set());
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const notificationsInitializedRef = useRef(false);
  const isWindowFocusedRef = useRef(true);

  const activeChat = chatData.find((chat) => chat.id === activeChatId);
  const availableManagers = BASE_MANAGERS.map((manager) => ({
    ...manager,
    status: managerStatuses[manager.id] ?? "online",
  }));
  const firstOnlineManagerId =
    availableManagers.find((manager) => manager.status === "online")?.id ??
    availableManagers[0]?.id ??
    "";
  const filteredQuickReplies = QUICK_REPLIES.filter((phrase) =>
    phrase.toLowerCase().includes(quickReplySearch.trim().toLowerCase())
  );

  useEffect(() => {
    const session = readAuthSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    if (session.role !== "manager") {
      router.replace("/supplier");
      return;
    }

    const fallbackManager =
      managerAccounts.find((account) => account.login === session.login) ??
      managerAccounts[0];
    const nextManagerId = session.managerId ?? fallbackManager.id;
    const nextManagerName = session.managerName ?? fallbackManager.name;

    if (!session.managerId || !session.managerName) {
      writeAuthSession({
        ...session,
        managerId: nextManagerId,
        managerName: nextManagerName,
      });
    }

    const storedStatuses = readManagerStatuses();

    setCurrentManagerId(nextManagerId);
    setCurrentManagerName(nextManagerName);
    setManagerStatuses(storedStatuses);
    setCurrentManagerStatus(storedStatuses[nextManagerId] ?? "online");
    setAuthReady(true);
  }, [router]);

  const fetchMessages = async (
    ticketId: string,
    markAsRead = false
  ): Promise<ApiMessage[]> => {
    const response = await fetch(
      `http://localhost:3001/tickets/${ticketId}/messages?viewerType=manager&markAsRead=${markAsRead ? "true" : "false"}`
    );
    if (!response.ok) {
      throw new Error("Не удалось загрузить сообщения");
    }
    return response.json();
  };

  const fetchTickets = async (): Promise<ApiTicket[]> => {
    const response = await fetch("http://localhost:3001/tickets");
    if (!response.ok) {
      throw new Error("Не удалось загрузить тикеты");
    }
    return response.json();
  };

  const syncMessagesForTickets = useCallback(async (ticketIds: string[]) => {
    const messageResults = await Promise.all(
      ticketIds.map(async (ticketId) => {
        try {
          const messages = await fetchMessages(ticketId, false);
          return { ticketId, messages };
        } catch (error) {
          console.error(`Ошибка загрузки сообщений тикета ${ticketId}:`, error);
          return null;
        }
      })
    );

    messageResults.forEach((result) => {
      if (!result) {
        return;
      }

      applyMessagesToTicket(result.ticketId, result.messages);
    });
  }, []);

  const syncTickets = (tickets: ApiTicket[]) => {
    const formattedChats = tickets.map(formatTicket);

    setChatData((prevChats) =>
      formattedChats.map((formattedChat) => {
        const existingChat = prevChats.find((chat) => chat.id === formattedChat.id);

        if (!existingChat) {
          return formattedChat;
        }

        return {
          ...formattedChat,
          messages: existingChat.messages,
          supplierRequests: existingChat.supplierRequests,
        };
      })
    );

    if (formattedChats.length === 0) {
      setActiveChatId("");
      return;
    }

    setActiveChatId((currentActiveChatId) => {
      if (
        currentActiveChatId &&
        formattedChats.some((chat) => chat.id === currentActiveChatId)
      ) {
        return currentActiveChatId;
      }

      return formattedChats[0].id;
    });
  };

  const fetchSupplierRequests = async (
    ticketId: string
  ): Promise<ApiSupplierRequest[]> => {
    const response = await fetch(
      `http://localhost:3001/tickets/${ticketId}/supplier-requests`
    );
    if (!response.ok) {
      throw new Error("Не удалось загрузить запросы поставщику");
    }
    return response.json();
  };

  const fetchTyping = async (
    ticketId: string
  ): Promise<{ clientTyping: boolean }> => {
    const response = await fetch(`http://localhost:3001/tickets/${ticketId}/typing`);

    if (!response.ok) {
      throw new Error("Не удалось загрузить typing-состояние");
    }

    return response.json();
  };

  const applyMessagesToTicket = (ticketId: string, messages: ApiMessage[]) => {
    setChatData((prevChats) =>
      prevChats.map((chat) =>
        chat.id === ticketId
          ? {
              ...chat,
              messages: messages.map(formatMessage),
            }
          : chat
      )
    );
  };

  const applySupplierRequestsToTicket = (
    ticketId: string,
    supplierRequests: ApiSupplierRequest[]
  ) => {
    setChatData((prevChats) =>
      prevChats.map((chat) =>
        chat.id === ticketId
          ? {
              ...chat,
              supplierRequests: supplierRequests.map(formatSupplierRequest),
            }
          : chat
      )
    );
  };

  const isChatMine = useCallback(
    (chat: ChatItem) => {
      if (chat.rawStatus === "resolved") {
        return false;
      }

      if (currentManagerId && chat.assignedManagerId === currentManagerId) {
        return true;
      }

      if (
        currentManagerName &&
        chat.assignedManagerName &&
        chat.assignedManagerName === currentManagerName
      ) {
        return true;
      }

      if (!chat.assignedManagerId) {
        const lastNonSystemMessage = getLastNonSystemMessage(chat);
        return (
          chat.rawStatus !== "new" &&
          lastNonSystemMessage?.from === "manager"
        );
      }

      return false;
    },
    [currentManagerId, currentManagerName]
  );

  const filteredChats = chatData.filter((chat) => {
    if (filter === "all") return true;

    if (filter === "in_progress") {
      return isChatMine(chat);
    }

    return (
      chat.rawStatus === "new" &&
      !chat.assignedManagerId
    );
  });

  const searchedChats = filteredChats.filter((chat) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return true;
    }

    const searchHaystack = [
      chat.title,
      chat.clientName,
      chat.assignedManagerName ?? "",
      chat.lastResolvedByManagerName ?? "",
      chat.invitedManagerNames.join(" "),
      ...chat.messages.map((message) => message.text),
    ]
      .join(" ")
      .toLowerCase();

    return searchHaystack.includes(normalizedQuery);
  });

  const incomingCount = chatData.filter((chat) => {
    return chat.rawStatus === "new" && !chat.assignedManagerId;
  }).length;

  const myCount = chatData.filter((chat) => {
    return isChatMine(chat);
  }).length;

  useEffect(() => {
    const loadInitialTickets = async () => {
      try {
        const data = await fetchTickets();
        syncTickets(data);
        await syncMessagesForTickets(data.map((ticket) => ticket.id));
      } catch (error) {
        console.error("Ошибка загрузки тикетов:", error);
      }
    };

    void loadInitialTickets();
  }, [syncMessagesForTickets]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const refreshManagerData = async () => {
        try {
          const tickets = await fetchTickets();
          syncTickets(tickets);

          await syncMessagesForTickets(tickets.map((ticket) => ticket.id));

          if (!activeChatId) {
            return;
          }

          const supplierRequests = await fetchSupplierRequests(activeChatId);
          applySupplierRequestsToTicket(activeChatId, supplierRequests);
        } catch (pollingError) {
          console.error("Ошибка polling manager page:", pollingError);
        }
      };

      void refreshManagerData();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [authReady, activeChatId, syncMessagesForTickets]);

  useEffect(() => {
    if (!activeChatId) return;

    const loadCurrentMessages = async () => {
      try {
        const messages = await fetchMessages(activeChatId, true);
        applyMessagesToTicket(activeChatId, messages);
      } catch (err) {
        console.error("Ошибка загрузки сообщений:", err);
      }
    };

    void loadCurrentMessages();
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;

    const loadCurrentSupplierRequests = async () => {
      setIsLoadingSupplierRequests(true);
      setSupplierRequestsError("");

      try {
        const supplierRequests = await fetchSupplierRequests(activeChatId);
        applySupplierRequestsToTicket(activeChatId, supplierRequests);
      } catch (error) {
        console.error("Ошибка загрузки запросов поставщику:", error);
        setSupplierRequestsError("Не удалось загрузить запросы поставщику");
      } finally {
        setIsLoadingSupplierRequests(false);
      }
    };

    void loadCurrentSupplierRequests();
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) {
      setIsClientTyping(false);
      return;
    }

    const loadTypingState = async () => {
      try {
        const typingState = await fetchTyping(activeChatId);
        setIsClientTyping(typingState.clientTyping);
      } catch (error) {
        console.error("Ошибка загрузки typing-состояния:", error);
        setIsClientTyping(false);
      }
    };

    void loadTypingState();

    const intervalId = window.setInterval(() => {
      void loadTypingState();
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    setCurrentTimeMs(Date.now());

    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [authReady]);

  useEffect(() => {
    if (!authReady || typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [authReady]);

  useEffect(() => {
    if (!authReady || typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const canShowNotification =
      Notification.permission === "granted" &&
      (document.visibilityState !== "visible" || !isWindowFocusedRef.current);

    if (!notificationsInitializedRef.current) {
      knownTicketIdsRef.current = new Set(chatData.map((chat) => chat.id));
      knownMessageIdsRef.current = new Set(
        chatData.flatMap((chat) => chat.messages.map((message) => message.id))
      );
      notificationsInitializedRef.current = true;
      return;
    }

    chatData.forEach((chat) => {
      if (!knownTicketIdsRef.current.has(chat.id)) {
        if (canShowNotification) {
          new Notification("Новое обращение", {
            body: chat.title || "Новый клиентский диалог",
          });
        }

        knownTicketIdsRef.current.add(chat.id);
      }

      chat.messages.forEach((message) => {
        if (knownMessageIdsRef.current.has(message.id)) {
          return;
        }

        knownMessageIdsRef.current.add(message.id);

        if (message.from === "manager" || message.from === "system") {
          return;
        }

        const isSameVisibleChat =
          document.visibilityState === "visible" &&
          isWindowFocusedRef.current &&
          activeChatId === chat.id;

        if (!canShowNotification || isSameVisibleChat) {
          return;
        }

        const notificationTitle =
          message.from === "supplier"
            ? "Ответ поставщика"
            : "Новое сообщение от клиента";

        new Notification(notificationTitle, {
          body:
            message.text.length > 80
              ? `${message.text.slice(0, 80)}...`
              : message.text,
        });
      });
    });
  }, [chatData, authReady, activeChatId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleFocus = () => {
      isWindowFocusedRef.current = true;
    };

    const handleBlur = () => {
      isWindowFocusedRef.current = false;
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!showQuickReplies && !showEmojiPicker) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!quickRepliesRef.current) {
        return;
      }

      if (!quickRepliesRef.current.contains(event.target as Node)) {
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
    if (!isManagerMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!managerMenuRef.current) {
        return;
      }

      if (!managerMenuRef.current.contains(event.target as Node)) {
        setIsManagerMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isManagerMenuOpen]);

  useEffect(() => {
    if (!composerTextareaRef.current) {
      return;
    }

    composerTextareaRef.current.style.height = "0px";
    composerTextareaRef.current.style.height = `${Math.min(
      composerTextareaRef.current.scrollHeight,
      132
    )}px`;
  }, [messageText]);

  useEffect(() => {
    if (!resolveToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResolveToast("");
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [resolveToast]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChatId) return;

    try {
      const response = await fetch("http://localhost:3001/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: activeChatId,
          content: messageText,
          senderType: "manager",
          managerId: currentManagerId,
          managerName: currentManagerName,
        }),
      });

      const newMessage = await response.json();

      setChatData((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? {
                ...chat,
                status: getStatusLabel("waiting_client"),
                headerStatus: getStatusLabel("waiting_client"),
                rawStatus: "waiting_client",
                assignedManagerId: chat.assignedManagerId ?? currentManagerId,
                assignedManagerName: chat.assignedManagerName ?? currentManagerName,
                messages: [
                  ...chat.messages,
                  {
                    ...formatMessage(newMessage),
                  },
                ],
              }
            : chat
        )
      );

      setFilter("in_progress");
      const refreshedTickets = await fetchTickets();
      syncTickets(refreshedTickets);
      setMessageText("");
      setAttachmentName("");
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);
    }
  };

  const handleAddQuickReply = () => {
    const phrase = window.prompt("Новая быстрая фраза");

    if (!phrase?.trim()) {
      return;
    }

    setMessageText(phrase.trim());
    setShowQuickReplies(false);
  };

  const handleCreateSupplierRequest = async () => {
    if (!supplierRequestText.trim() || !activeChatId) return;

    setIsCreatingSupplierRequest(true);
    setCreateSupplierRequestError("");

    try {
      const response = await fetch("http://localhost:3001/supplier-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: activeChatId,
          supplierName: selectedSupplier,
          requestText: supplierRequestText,
          slaMinutes: 240,
          createdByManagerId: "manager_1",
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось создать запрос поставщику");
      }

      setChatData((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? {
                ...chat,
                status: getStatusLabel("waiting_supplier"),
                headerStatus: getStatusLabel("waiting_supplier"),
                rawStatus: "waiting_supplier",
              }
            : chat
        )
      );

      const [messages, supplierRequests] = await Promise.all([
        fetchMessages(activeChatId),
        fetchSupplierRequests(activeChatId),
      ]);

      applyMessagesToTicket(activeChatId, messages);
      applySupplierRequestsToTicket(activeChatId, supplierRequests);

      setSupplierRequestText("");
      setSelectedSupplier(suppliers[0]);
      setIsSupplierFormOpen(false);
    } catch (error) {
      console.error("Ошибка создания запроса поставщику:", error);
      setCreateSupplierRequestError("Не удалось создать запрос поставщику");
    } finally {
      setIsCreatingSupplierRequest(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    router.replace("/login");
  };

  const handleChangeManagerStatus = (status: ManagerPresence) => {
    if (!currentManagerId) {
      return;
    }

    writeManagerStatus(currentManagerId, status);
    setManagerStatuses((prev) => ({
      ...prev,
      [currentManagerId]: status,
    }));
    setCurrentManagerStatus(status);
    setIsManagerMenuOpen(false);
  };

  const handleTogglePinned = async () => {
    if (!activeChatId) return;

    setIsTogglingPinned(true);

    try {
      const response = await fetch(`http://localhost:3001/tickets/${activeChatId}/pin`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const errorMessage = await extractApiErrorMessage(
          response,
          "Не удалось изменить закрепление"
        );

        if (response.status === 400 && errorMessage.includes("максимум 3")) {
          window.alert("Можно закрепить максимум 3 чата");
          return;
        }

        if (response.status === 404) {
          window.alert("Backend был перезапущен. Обновите страницу и попробуйте ещё раз.");
          return;
        }

        window.alert(errorMessage);
        return;
      }

      const tickets = await fetchTickets();
      syncTickets(tickets);
    } catch (error) {
      console.error("Ошибка изменения закрепления:", error);
      window.alert("Не удалось изменить закрепление. Проверьте подключение к backend.");
    } finally {
      setIsTogglingPinned(false);
    }
  };

  const handleResolveTicket = async () => {
    if (
      !activeChatId ||
      activeChat?.rawStatus === "resolved" ||
      !currentManagerId ||
      !currentManagerName
    )
      return;

    setIsResolvingTicket(true);

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${activeChatId}/resolve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: currentManagerId,
            managerName: currentManagerName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось отметить диалог как решённый");
      }

      const [tickets, messages, supplierRequests] = await Promise.all([
        fetchTickets(),
        fetchMessages(activeChatId),
        fetchSupplierRequests(activeChatId),
      ]);

      syncTickets(tickets);
      applyMessagesToTicket(activeChatId, messages);
      applySupplierRequestsToTicket(activeChatId, supplierRequests);
      setResolveToast("Диалог отмечен как решённый");
      setResolvedHighlight({
        ticketId: activeChatId,
        until: Date.now() + 3 * 60 * 1000,
      });
    } catch (error) {
      console.error("Ошибка завершения диалога:", error);
    } finally {
      setIsResolvingTicket(false);
    }
  };

  const handleStartResolvedDialog = async () => {
    if (!activeChatId || !currentManagerId || !currentManagerName) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${activeChatId}/reopen`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: currentManagerId,
            managerName: currentManagerName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось снова открыть диалог");
      }

      const [tickets, messages, supplierRequests] = await Promise.all([
        fetchTickets(),
        fetchMessages(activeChatId),
        fetchSupplierRequests(activeChatId),
      ]);

      syncTickets(tickets);
      applyMessagesToTicket(activeChatId, messages);
      applySupplierRequestsToTicket(activeChatId, supplierRequests);
      setFilter("in_progress");
      setResolveToast("Диалог снова открыт");

      window.setTimeout(() => {
        composerTextareaRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error("Ошибка повторного открытия диалога:", error);
    }
  };

  const handleInviteManager = async () => {
    if (!activeChatId) return;

    const selectedManager = availableManagers.find(
      (manager) => manager.id === selectedInvitedManagerId
    );

    if (!selectedManager || selectedManager.status !== "online") {
      return;
    }

    setIsInvitingManager(true);
    setInviteManagerError("");

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${activeChatId}/invite-manager`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: selectedManager.id,
            managerName: selectedManager.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось пригласить оператора");
      }

      const [tickets, messages] = await Promise.all([
        fetchTickets(),
        fetchMessages(activeChatId),
      ]);

      syncTickets(tickets);
      applyMessagesToTicket(activeChatId, messages);
      setIsInviteModalOpen(false);
    } catch (error) {
      console.error("Ошибка приглашения оператора:", error);
      setInviteManagerError("Не удалось пригласить оператора");
    } finally {
      setIsInvitingManager(false);
    }
  };

  const handleTransferDialog = async () => {
    if (!activeChatId) return;

    const selectedManager = availableManagers.find(
      (manager) => manager.id === selectedTransferManagerId
    );

    if (!selectedManager || selectedManager.status !== "online") {
      return;
    }

    setIsTransferringDialog(true);
    setTransferDialogError("");

    try {
      const response = await fetch(
        `http://localhost:3001/tickets/${activeChatId}/assign-manager`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            managerId: selectedManager.id,
            managerName: selectedManager.name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось передать диалог");
      }

      const [tickets, messages] = await Promise.all([
        fetchTickets(),
        fetchMessages(activeChatId),
      ]);

      syncTickets(tickets);
      applyMessagesToTicket(activeChatId, messages);
      setIsTransferModalOpen(false);
      setFilter("in_progress");
    } catch (error) {
      console.error("Ошибка передачи диалога:", error);
      setTransferDialogError("Не удалось передать диалог");
    } finally {
      setIsTransferringDialog(false);
    }
  };

  if (!authReady) {
    return (
      <main className="min-h-screen bg-[#F5F5F7] flex items-center justify-center text-gray-500">
        Проверяем доступ...
      </main>
    );
  }

  const latestSupplierRequest = activeChat?.supplierRequests[0] ?? null;
  const nowForSla = currentTimeMs ?? Date.now();
  const isResolveHighlighted =
    Boolean(activeChat?.id) &&
    resolvedHighlight?.ticketId === activeChat?.id &&
    resolvedHighlight.until > nowForSla;
  const managerSla = buildSlaVisual({
    label: "Первая линия",
    startedAt: activeChat?.firstResponseStartedAt,
    firstResponseAt: activeChat?.firstResponseAt,
    durationMs: activeChat?.firstResponseTime,
    breached: activeChat?.firstResponseBreached,
    slaMs: 2 * 60 * 1000,
    now: nowForSla,
    inactiveText: "Ожидает новый тикет",
  });
  const supplierSla = buildSlaVisual({
    label: "Поставщик",
    startedAt: latestSupplierRequest?.responseStartedAt,
    firstResponseAt: latestSupplierRequest?.firstResponseAt,
    durationMs: latestSupplierRequest?.responseTime,
    breached: latestSupplierRequest?.responseBreached,
    slaMs: 60 * 60 * 1000,
    now: nowForSla,
    inactiveText: "Не активирован",
  });

  return (
    <main
      className="h-screen overflow-hidden bg-[#F5F5F7]"
      style={{ fontFamily: appFontFamily }}
    >
      <div className="flex h-full overflow-hidden">
        <aside className="flex h-full w-[300px] flex-col border-r border-[#E5E5EA] bg-[#FBFBFD] px-4 py-5">
          <div className="mb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8E8E93]">
                TouchSpace
              </p>
              <h2 className="mt-2 text-[22px] font-semibold text-[#1E1E1E]">
                Обращения
              </h2>
            </div>

            <div ref={managerMenuRef} className="relative mt-4">
              <button
                onClick={() => setIsManagerMenuOpen((prev) => !prev)}
                className="flex w-full items-center gap-2.5 rounded-[16px] border border-[#E9EAF0] bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:border-[#DCE7FF] hover:bg-[#FCFDFF]"
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF6FF]">
                  <Image
                    src="/icons/menedger.svg"
                    alt="Менеджер"
                    width={16}
                    height={16}
                    className="h-4 w-4"
                    style={{
                      filter:
                        "brightness(0) saturate(100%) invert(38%) sepia(98%) saturate(2437%) hue-rotate(204deg) brightness(102%) contrast(101%)",
                    }}
                  />
                  <span
                    className={`absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${managerStatusDots[currentManagerStatus]}`}
                  />
                </div>

                <div className="min-w-0 flex-1 text-left leading-none">
                  <p className="truncate text-[14px] font-semibold text-[#1E1E1E]">
                    {currentManagerName}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8E8E93]">
                    {managerStatusLabels[currentManagerStatus]}
                  </p>
                </div>

                <span className="shrink-0 text-[11px] text-[#AEAEB2]">▾</span>
              </button>

              {isManagerMenuOpen ? (
                <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-[210px] rounded-[18px] border border-[#E5E5EA] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                  {(["online", "break", "offline"] as ManagerPresence[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleChangeManagerStatus(status)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                        currentManagerStatus === status
                          ? "bg-[#F3F8FF]"
                          : "hover:bg-[#F7F8FB]"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${managerStatusDots[status]}`} />
                      <div>
                        <p className="text-[13px] font-medium text-[#1E1E1E]">
                          {managerStatusLabels[status]}
                        </p>
                      </div>
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
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("incoming")}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === "incoming"
                  ? "bg-[#0A84FF] text-white"
                  : "bg-white text-[#6C6C70]"
              }`}
            >
              <span>Входящие</span>
              {incomingCount > 0 && (
                <span
                  className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                    filter === "incoming"
                      ? "bg-white text-[#0A84FF]"
                      : "bg-[#0A84FF] text-white"
                  }`}
                >
                  {incomingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilter("in_progress")}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === "in_progress"
                  ? "bg-[#0A84FF] text-white"
                  : "bg-white text-[#6C6C70]"
              }`}
            >
              <span>Мои</span>
              {myCount > 0 && (
                <span
                  className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                    filter === "in_progress"
                      ? "bg-white text-[#0A84FF]"
                      : "bg-[#0A84FF] text-white"
                  }`}
                >
                  {myCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === "all"
                  ? "bg-[#0A84FF] text-white"
                  : "bg-white text-[#6C6C70]"
              }`}
            >
              Все
            </button>
          </div>

          <div className="mb-4">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-[#D1D1D6] bg-white px-4 py-3 text-sm text-[#1E1E1E] outline-none placeholder:text-[#8E8E93]"
              placeholder="Поиск по клиенту, диалогу или сообщению..."
            />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {searchedChats.map((chat) => (
              (() => {
                const unreadCount = getUnreadCount(chat);
                const chatTone = getChatTone(chat);
                const isActive = activeChatId === chat.id;

                return (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id);
                      setIsSupplierFormOpen(false);
                    }}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      isActive
                        ? "border-[#CFE1FF] bg-[#F3F8FF] shadow-[0_12px_32px_rgba(10,132,255,0.09)]"
                        : unreadCount > 0
                          ? "border-[#D6E7FF] bg-[#EEF6FF]"
                          : "border-[#E6E6EB] bg-white hover:bg-[#FAFAFC]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${chatTone.dot}`} />
                          {chat.pinned && (
                            <span className="text-xs text-[#8E8E93]" title="Закреплён">
                              📌
                            </span>
                          )}
                          <p
                            className={`truncate text-[15px] text-[#1E1E1E] ${
                              unreadCount > 0 ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {chat.title}
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-[#8E8E93]">{chat.clientName}</p>
                      </div>

                      {unreadCount > 0 && (
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#0A84FF] px-2 text-xs font-semibold text-white">
                          {unreadCount}
                        </span>
                      )}
                    </div>

                    <p
                      className={`mt-3 text-sm leading-5 ${
                        unreadCount > 0 ? "font-medium text-[#1E1E1E]" : "text-[#8E8E93]"
                      }`}
                    >
                      {getChatPreview(chat)}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${chatTone.pill}`}>
                        {chatTone.label}
                      </span>
                      <span className="text-xs text-[#8E8E93]">
                        {chat.rawStatus === "resolved" ? "Решён" : chat.status}
                      </span>
                    </div>
                  </button>
                );
              })()
            ))}
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#F7F7FA]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-[#E5E5EA] bg-white px-6 py-5">
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-[#1E1E1E]">
                {activeChat?.title || "Выберите обращение"}
              </p>
              <p className="mt-1 text-[13px] text-[#8E8E93]">
                {activeChat?.clientName
                  ? `${activeChat.clientName} • клиентский диалог`
                  : "Реселлер • клиентский диалог"}
              </p>
            </div>

            {activeChat ? (
              <div className="flex items-center gap-2 rounded-[12px] bg-[#F2F2F5] p-1.5">
                <div className="relative">
                  <button
                    onClick={handleTogglePinned}
                    disabled={isTogglingPinned}
                    onMouseEnter={() => setHoveredHeaderAction("pin")}
                    onMouseLeave={() => setHoveredHeaderAction(null)}
                    className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition duration-200 hover:bg-[#E5F0FF] ${
                      activeChat.pinned ? "bg-[#595FFF]" : "bg-transparent"
                    }`}
                  >
                    <Image
                      src="/icons/zakrepit.svg"
                      alt="Закрепить"
                      width={18}
                      height={18}
                      className={`h-[18px] w-[18px] ${
                        activeChat.pinned ? "brightness-0 invert" : "opacity-70"
                      }`}
                    />
                  </button>
                  {hoveredHeaderAction === "pin" && (
                    <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)] whitespace-nowrap">
                      {activeChat.pinned ? "Открепить чат" : "Закрепить чат"}
                    </div>
                  )}
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
                  {hoveredHeaderAction === "invite" && (
                    <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)] whitespace-nowrap">
                      Пригласить менеджера
                    </div>
                  )}
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
                  {hoveredHeaderAction === "transfer" && (
                    <div className="absolute left-1/2 top-[calc(100%+8px)] z-20 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_4px_12px_rgba(0,0,0,0.08)] whitespace-nowrap">
                      Передать
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div />
            )}

            {activeChat ? (
              <div className="relative">
                <button
                  onClick={handleResolveTicket}
                  disabled={isResolvingTicket || activeChat.rawStatus === "resolved"}
                  className={`flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition duration-200 hover:scale-[1.02] active:scale-95 disabled:cursor-default disabled:opacity-80 ${
                    isResolveHighlighted
                      ? "bg-[#34C759] text-white shadow-[0_10px_24px_rgba(52,199,89,0.22)]"
                      : "bg-[#E9F7EF] text-[#34C759]"
                  }`}
                >
                  <Image
                    src="/icons/reshen.svg"
                    alt="Решён"
                    width={16}
                    height={16}
                    className="h-4 w-4"
                    style={{
                      filter: isResolveHighlighted
                        ? "brightness(0) saturate(100%) invert(100%)"
                        : "brightness(0) saturate(100%) invert(58%) sepia(78%) saturate(2475%) hue-rotate(317deg) brightness(103%) contrast(98%)",
                    }}
                  />
                  <span>{isResolvingTicket ? "Сохраняем..." : "Решён"}</span>
                </button>
              </div>
            ) : (
              <div />
            )}
          </div>

          {activeChat?.invitedManagerNames.length ? (
            <div className="border-b border-[#EDEDF1] bg-white px-6 py-3">
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2 text-sm text-[#6C6C70]">
                <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-[#8E8E93]">
                  Подключены
                </span>
                <span>{activeChat.invitedManagerNames.join(", ")}</span>
              </div>
            </div>
          ) : null}

          {activeChat?.assignedManagerName || activeChat?.lastResolvedByManagerName ? (
            <div className="border-b border-[#EDEDF1] bg-white px-6 py-3">
              <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 text-sm text-[#6C6C70]">
                {activeChat.assignedManagerName ? (
                  <>
                    <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-[#8E8E93]">
                      Сейчас ведёт
                    </span>
                    <span className="mr-3">
                      {activeChat.assignedManagerName}
                      {activeChat.assignedManagerId === currentManagerId ? " (Вы)" : ""}
                    </span>
                  </>
                ) : null}

                {activeChat.lastResolvedByManagerName ? (
                  <>
                    <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-[#8E8E93]">
                      Ранее вёл
                    </span>
                    <span>
                      {activeChat.lastResolvedByManagerName}
                      {activeChat.lastResolvedByManagerId === currentManagerId ? " (Вы)" : ""}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4">
            {activeChat?.messages.map((message, index) => {
              const previousMessage = activeChat.messages[index - 1];
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

                  {message.from === "system" ? (
                    <div className="flex justify-center py-2">
                      <div className="w-full max-w-[560px] rounded-full border border-[#E5E5EA] bg-[#F7F7FA] px-5 py-3 text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8E8E93]">
                          Системное событие
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#6C6C70]">
                          {message.text}
                        </p>
                        {message.time && (
                          <p className="mt-2 text-[10px] text-[#AEAEB2]">
                            {message.time}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex ${
                        message.from === "manager"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[46%] min-w-[112px] rounded-[20px] px-4 py-3 text-base leading-6 shadow-sm transition ${
                          message.from === "manager"
                            ? "bg-[#0A84FF] text-white shadow-[0_10px_24px_rgba(10,132,255,0.24)]"
                            : message.from === "client"
                              ? "bg-[#EFEFF4] text-[#1E1E1E]"
                              : message.from === "supplier"
                                ? "bg-[#EAF8EF] text-[#166534]"
                                : "bg-[#EFEFF4] text-[#1E1E1E]"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <p className="mb-1 text-xs opacity-60">
                            {message.from === "client" && "Клиент"}
                            {message.from === "manager" && "Менеджер"}
                            {message.from === "supplier" &&
                              "supplierName" in message &&
                              `Поставщик: ${message.supplierName}`}
                          </p>
                          <p className="break-words">{message.text}</p>
                          <div
                            className={`flex items-center gap-3 text-[10px] ${
                              message.from === "manager"
                                ? "justify-between text-white/65"
                                : "justify-end text-[#8E8E93]"
                            }`}
                          >
                            {message.from === "manager" ? (
                              <p className="min-w-0 truncate text-left">
                                {getMessageStatusLabel(message.status)}
                              </p>
                            ) : null}
                            {message.time ? <p className="shrink-0">{message.time}</p> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
            </div>
          </div>

          {resolveToast ? (
            <div className="pointer-events-none absolute right-[352px] top-[104px] z-30">
              <div className="rounded-2xl border border-[#D8F0DE] bg-white px-4 py-3 text-sm font-medium text-[#1F8B4C] shadow-[0_18px_40px_rgba(31,139,76,0.12)]">
                {resolveToast}
              </div>
            </div>
          ) : null}

          {isClientTyping && activeChat?.rawStatus !== "resolved" ? (
            <div className="border-t border-transparent bg-white px-6 pb-1">
              <div className="mx-auto w-full max-w-3xl text-sm text-[#8E8E93]">
                Клиент печатает...
              </div>
            </div>
          ) : null}

          <div className="border-t border-[#E5E5EA] bg-white px-6 py-5">
            <div className="mx-auto w-full max-w-3xl">
              {activeChat?.rawStatus === "resolved" ? (
                <button
                  onClick={handleStartResolvedDialog}
                  className="flex min-h-[72px] w-full items-center justify-center rounded-[28px] border border-[#DCE7FF] bg-white px-6 py-5 text-base font-semibold text-[#0A84FF] shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:bg-[#F7FAFF]"
                >
                  Начать диалог
                </button>
              ) : (
                <>
              {attachmentName ? (
                <div className="mb-3 flex">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#D8D8DE] bg-[#F7F7FA] px-3 py-1.5 text-sm text-[#1E1E1E]">
                    <span className="truncate max-w-[240px]">{attachmentName}</span>
                    <button
                      onClick={() => setAttachmentName("")}
                      className="text-[#8E8E93] transition hover:text-[#1E1E1E]"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-end gap-3 rounded-[28px] border border-[#E3E5EA] bg-white px-5 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
                <div className="min-w-0 flex-1">
                  <textarea
                    ref={composerTextareaRef}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    rows={1}
                    className="min-h-[40px] max-h-[132px] w-full resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-6 text-[#1E1E1E] outline-none placeholder:text-[#8E8E93]"
                    placeholder="Напишите сообщение..."
                  />
                </div>

                <div ref={quickRepliesRef} className="relative flex items-center gap-2">
                  {showQuickReplies && (
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
                              setMessageText(phrase);
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
                  )}

                  {showEmojiPicker && (
                    <div className="absolute bottom-[calc(100%+14px)] right-10 z-20 w-[300px] rounded-[20px] border border-[#E4E6EB] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                      <div className="mb-3 px-1 text-[13px] font-semibold text-[#1E1E1E]">
                        Смайлики
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {EMOJI_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setMessageText((prev) => `${prev}${emoji}`);
                              setShowEmojiPicker(false);
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FBFBFD] text-xl transition hover:bg-[#EEF6FF]"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setShowQuickReplies((prev) => !prev);
                      setShowEmojiPicker(false);
                    }}
                    onMouseEnter={() => setHoveredComposerAction("quick")}
                    onMouseLeave={() => setHoveredComposerAction(null)}
                    className={`relative flex h-[38px] w-[38px] items-center justify-center rounded-xl transition ${
                      showQuickReplies ? "bg-[#E5F0FF]" : "bg-transparent hover:bg-[#E5F0FF]"
                    }`}
                  >
                    <Image
                      src="/icons/fraza.svg"
                      alt="Быстрые фразы"
                      width={18}
                      height={18}
                      className="h-[18px] w-[18px]"
                      style={{
                        filter: showQuickReplies || hoveredComposerAction === "quick"
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
                      showEmojiPicker ? "bg-[#E5F0FF]" : "bg-transparent hover:bg-[#E5F0FF]"
                    }`}
                  >
                    <Image
                      src="/icons/smail.svg"
                      alt="Смайлики"
                      width={18}
                      height={18}
                      className="h-[18px] w-[18px]"
                      style={{
                        filter: showEmojiPicker || hoveredComposerAction === "emoji"
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
                  onClick={handleSendMessage}
                  disabled={!messageText.trim()}
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
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="flex h-full w-[320px] flex-col overflow-y-auto border-l border-[#E5E5EA] bg-[#FBFBFD] px-4 py-5">
          <div className="mb-4 rounded-[24px] border border-[#E5E5EA] bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-[#8E8E93]">
              Статус
            </p>
            <div className="mt-3 flex items-center justify-end">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  getStatusBadgeClass(activeChat?.rawStatus)
                }`}
              >
                {activeChat?.rawStatus === "resolved" ? "Решён" : activeChat?.status || "Открыт"}
              </span>
            </div>
          </div>

          <div className="mb-4 rounded-[24px] border border-[#E5E5EA] bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-[#8E8E93]">
              SLA
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1E1E1E]">{managerSla.label}</p>
                    <p className={`mt-1 text-xs font-medium ${managerSla.tone}`}>
                      {managerSla.status}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${managerSla.tone}`}>
                    {managerSla.time}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#ECECF1]">
                  <div
                    className={`h-2 rounded-full ${managerSla.bar}`}
                    style={{ width: managerSla.progress }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1E1E1E]">{supplierSla.label}</p>
                    <p className={`mt-1 text-xs font-medium ${supplierSla.tone}`}>
                      {supplierSla.status}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${supplierSla.tone}`}>
                    {supplierSla.time}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#ECECF1]">
                  <div
                    className={`h-2 rounded-full ${supplierSla.bar}`}
                    style={{ width: supplierSla.progress }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-[24px] border border-[#E5E5EA] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#1E1E1E]">Поставщик</p>
              {activeChat?.supplierRequests.length ? (
                <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-xs text-[#6C6C70]">
                  {activeChat.supplierRequests.length}
                </span>
              ) : null}
            </div>

            <button
              onClick={() => setIsSupplierFormOpen(!isSupplierFormOpen)}
              className="w-full rounded-2xl bg-[#0A84FF] py-3 text-sm font-medium text-white"
            >
              {isSupplierFormOpen ? "Скрыть форму" : "Запросить поставщика"}
            </button>

            {isSupplierFormOpen && (
              <div className="mt-4 space-y-3 border-t border-[#F0F0F2] pt-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1E1E1E]">
                    Поставщик
                  </label>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full rounded-2xl border border-[#D1D1D6] bg-white px-3 py-3 text-sm outline-none"
                  >
                    {suppliers.map((supplier) => (
                      <option key={supplier} value={supplier}>
                        {supplier}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-[#1E1E1E]">
                    Комментарий
                  </label>
                  <textarea
                    value={supplierRequestText}
                    onChange={(e) => setSupplierRequestText(e.target.value)}
                    className="min-h-[100px] w-full resize-none rounded-2xl border border-[#D1D1D6] px-3 py-3 text-sm outline-none"
                    placeholder="Например: подтвердите наличие и срок поставки по заказу..."
                  />
                </div>

                <button
                  onClick={handleCreateSupplierRequest}
                  disabled={isCreatingSupplierRequest}
                  className="w-full bg-[#111827] text-white rounded-xl py-3 font-medium"
                >
                  {isCreatingSupplierRequest
                    ? "Отправляем..."
                    : "Отправить запрос поставщику"}
                </button>

                {createSupplierRequestError && (
                  <p className="text-sm text-red-500">
                    {createSupplierRequestError}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-[#E5E5EA] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#1E1E1E]">Запросы поставщикам</p>
              <span className="text-xs text-[#8E8E93]">
                {activeChat?.supplierRequests.length || 0}
              </span>
            </div>

            <div className="space-y-4">
              {isLoadingSupplierRequests && (
                <p className="text-sm text-gray-500">Загружаем запросы...</p>
              )}

              {supplierRequestsError && (
                <p className="text-sm text-red-500">{supplierRequestsError}</p>
              )}

              {activeChat?.supplierRequests.length ? (
                activeChat.supplierRequests.map((request) => (
                  <div
                    key={request.id}
                    className="space-y-3 rounded-[20px] border border-[#ECECF1] bg-[#FCFCFD] p-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-[#1E1E1E]">{request.supplierName}</p>
                        <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-[11px] text-[#6C6C70]">
                          {getStatusLabel(request.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Создан: {request.createdAt}
                      </p>
                      {request.slaMinutes !== null && (
                        <p className="text-xs text-[#0A84FF] mt-2">
                          SLA: {request.slaMinutes} мин
                        </p>
                      )}
                      <p className="mt-2 text-xs text-gray-500">
                        {request.requestText}
                      </p>
                    </div>
                  </div>
                ))
              ) : !isLoadingSupplierRequests && !supplierRequestsError ? (
                <p className="text-sm text-gray-500">
                  Пока нет запросов поставщикам
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {isInviteModalOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(30,30,30,0.28)] p-6">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8E8E93]">
                  Пригласить оператора
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
                      <span className={`h-2.5 w-2.5 rounded-full ${managerStatusDots[manager.status]}`} />
                      <p className="text-sm font-medium text-[#1E1E1E]">{manager.name}</p>
                    </div>
                    <span className="text-xs text-[#8E8E93]">
                      {managerStatusLabels[manager.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {inviteManagerError && (
              <p className="mt-4 text-sm text-red-500">{inviteManagerError}</p>
            )}

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
      )}

      {isTransferModalOpen && (
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
                      <span className={`h-2.5 w-2.5 rounded-full ${managerStatusDots[manager.status]}`} />
                      <p className="text-sm font-medium text-[#1E1E1E]">{manager.name}</p>
                    </div>
                    <span className="text-xs text-[#8E8E93]">
                      {managerStatusLabels[manager.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {transferDialogError && (
              <p className="mt-4 text-sm text-red-500">{transferDialogError}</p>
            )}

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
      )}
    </main>
  );
}
