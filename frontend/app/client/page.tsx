"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { getOrCreateClientSession, writeClientSession } from "@/lib/auth";

const clientActiveTicketStorageKey = "touchspace_client_active_ticket_id";
const clientSeenMessageMapStorageKey = "touchspace_client_seen_message_map";
const widgetFontFamily = "Montserrat, ui-sans-serif, system-ui, sans-serif";
const QUICK_ACTIONS = [
  "Привет!",
  "У меня вопрос",
  "Вы можете помочь?",
  "Уточнить срок доставки",
  "Узнать наличие",
];
const EMOJI_REACTIONS = ["🙂", "😊", "😉", "🙏", "👍", "🔥", "❤️", "😂"];
type ReplyMeta = {
  replyToId: string;
  replyToContent: string;
};

type Ticket = {
  id: string;
  title: string;
  status?: string;
  aiEnabled?: boolean;
  currentHandlerType?: string;
  conversationMode?: string;
};

type Message = {
  id: string;
  content: string;
  senderType: string;
  messageType?: string;
  status: string;
  ticketId: string;
  createdAt: string;
};

type ClientVisibleMessage = Message & {
  displayContent: string;
};

const getMessageStatusChecks = (status?: string) =>
  status === "read" ? "✓✓" : "✓";

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

export default function ClientPage() {
  const [clientSession, setClientSession] = useState(() => getOrCreateClientSession());
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftText, setDraftText] = useState("");
  const [isWidgetOpen, setIsWidgetOpen] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState("");
  const [replyMap, setReplyMap] = useState<Record<string, ReplyMeta>>({});
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [aiTypingStartedAt, setAiTypingStartedAt] = useState<number | null>(null);
  const [showAiTimeoutHint, setShowAiTimeoutHint] = useState(false);
  const [preferredAiMode, setPreferredAiMode] = useState(false);
  const [error, setError] = useState("");
  const [isEmbeddedWidget, setIsEmbeddedWidget] = useState(false);
  const [hostWidgetOpen, setHostWidgetOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentAtRef = useRef(0);

  const isResolved = activeTicket?.status === "resolved";
  const aiModeActive = activeTicket?.aiEnabled ?? preferredAiMode;
  const shouldMarkMessagesAsRead = !isEmbeddedWidget || hostWidgetOpen;
  const widgetStatusText = isResolved
    ? "Ваш вопрос решён?"
    : aiModeActive
      ? "Сейчас отвечает AI-помощник"
      : "Операторы онлайн";
  const hasMessages = messages.length > 0;
  const showQuickActions = !hasMessages && !activeTicket;
  const widgetVisible = isEmbeddedWidget || isWidgetOpen;

  const fetchTicketById = async (ticketId: string): Promise<Ticket | null> => {
    const response = await fetch(
      apiUrl(
        `/tickets?viewerType=client&viewerId=${encodeURIComponent(clientSession.clientId)}`
      )
    );

    if (!response.ok) {
      throw new Error("Не удалось загрузить список обращений");
    }

    const tickets = (await response.json()) as Ticket[];
    return tickets.find((ticket) => ticket.id === ticketId) ?? null;
  };

  const sendTyping = async (ticketId: string) => {
    await fetch(apiUrl(`/tickets/${ticketId}/typing`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderType: "client",
      }),
    });
  };

  const clearActiveTicket = () => {
    setActiveTicket(null);
    setMessages([]);
    setReplyMap({});
    setReplyTarget(null);
    setPreferredAiMode(false);
    setIsAiTyping(false);
    setAiTypingStartedAt(null);
    setShowAiTimeoutHint(false);
    window.localStorage.removeItem(clientActiveTicketStorageKey);
  };

  const requestHostClose = () => {
    if (!isEmbeddedWidget || typeof window === "undefined") {
      setIsWidgetOpen(false);
      return;
    }

    window.parent?.postMessage({ type: "touchspace-widget-close" }, "*");
  };

  const readSeenMessageMap = () => {
    if (typeof window === "undefined") {
      return {} as Record<string, string>;
    }

    const rawValue = window.localStorage.getItem(clientSeenMessageMapStorageKey);

    if (!rawValue) {
      return {} as Record<string, string>;
    }

    try {
      return JSON.parse(rawValue) as Record<string, string>;
    } catch {
      window.localStorage.removeItem(clientSeenMessageMapStorageKey);
      return {} as Record<string, string>;
    }
  };

  const writeSeenMessageMap = (nextValue: Record<string, string>) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      clientSeenMessageMapStorageKey,
      JSON.stringify(nextValue)
    );
  };

  const readReplyMap = (ticketId: string) => {
    if (typeof window === "undefined") {
      return {};
    }

    const rawValue = window.localStorage.getItem("touchspace_client_reply_map");

    if (!rawValue) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawValue) as Record<string, Record<string, ReplyMeta>>;
      return parsed[ticketId] ?? {};
    } catch {
      window.localStorage.removeItem("touchspace_client_reply_map");
      return {};
    }
  };

  const writeReplyMap = (ticketId: string, nextReplyMap: Record<string, ReplyMeta>) => {
    if (typeof window === "undefined") {
      return;
    }

    const rawValue = window.localStorage.getItem("touchspace_client_reply_map");
    const parsed = rawValue
      ? (JSON.parse(rawValue) as Record<string, Record<string, ReplyMeta>>)
      : {};

    parsed[ticketId] = nextReplyMap;
    window.localStorage.setItem("touchspace_client_reply_map", JSON.stringify(parsed));
  };

  const loadTicketContext = async (ticket: Ticket, markAsRead = shouldMarkMessagesAsRead) => {
    setIsLoadingContext(true);
    setError("");

    try {
      const messagesResponse = await fetch(
        apiUrl(
          `/tickets/${ticket.id}/messages?viewerType=client&viewerId=${encodeURIComponent(
            clientSession.clientId
          )}&markAsRead=${markAsRead ? "true" : "false"}`
        )
      );

      if (!messagesResponse.ok) {
        throw new Error("Не удалось загрузить данные обращения");
      }

      const messagesData = (await messagesResponse.json()) as Message[];
      setMessages(messagesData);
      setPreferredAiMode(ticket.aiEnabled ?? false);

      const lastNonSystemMessage = [...messagesData]
        .reverse()
        .find((message) => message.senderType !== "system");

      const shouldShowAiTyping =
        Boolean(ticket.aiEnabled) &&
        ticket.currentHandlerType === "ai" &&
        lastNonSystemMessage?.senderType === "client";

      setIsAiTyping(shouldShowAiTyping);
      if (!shouldShowAiTyping) {
        setAiTypingStartedAt(null);
        setShowAiTimeoutHint(false);
      }
    } catch (loadError) {
      console.error("Ошибка загрузки обращения:", loadError);
      setError("Не удалось загрузить данные обращения");
    } finally {
      setIsLoadingContext(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setIsEmbeddedWidget(params.get("embed") === "1");

    const tradePointId = params.get("tradePointId")?.trim();
    const tradePointName = params.get("tradePointName")?.trim();
    const platformUserId = params.get("userId")?.trim();
    const platformUserName = params.get("userName")?.trim();
    const email = params.get("email")?.trim();

    if (!tradePointId || !tradePointName) {
      return;
    }

    const nextSession = {
      clientId: tradePointId,
      clientName: tradePointName,
      tradePointId,
      tradePointName,
      platformUserId: platformUserId || undefined,
      platformUserName: platformUserName || undefined,
      email: email || undefined,
    };

    if (
      clientSession.clientId !== nextSession.clientId ||
      clientSession.clientName !== nextSession.clientName
    ) {
      writeClientSession(nextSession);
      setClientSession(nextSession);
      window.localStorage.removeItem(clientActiveTicketStorageKey);
      setActiveTicket(null);
      setMessages([]);
      setReplyMap({});
      setReplyTarget(null);
    }
  }, [clientSession.clientId, clientSession.clientName]);

  useEffect(() => {
    if (!isEmbeddedWidget || typeof window === "undefined") {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "touchspace-widget-visibility") {
        setHostWidgetOpen(Boolean(event.data.open));
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isEmbeddedWidget]);

  useEffect(() => {
    const savedTicketId = window.localStorage.getItem(clientActiveTicketStorageKey);

    if (!savedTicketId) {
      return;
    }

    const restoreTicket = async () => {
      try {
        const restoredTicket = await fetchTicketById(savedTicketId);

        if (!restoredTicket) {
          clearActiveTicket();
          return;
        }

        setActiveTicket(restoredTicket);
        setIsWidgetOpen(true);
        await loadTicketContext(restoredTicket, shouldMarkMessagesAsRead);
      } catch (restoreError) {
        console.error("Ошибка восстановления active ticket:", restoreError);
        clearActiveTicket();
        setError("Не удалось восстановить последнее обращение");
      }
    };

    void restoreTicket();
  }, [shouldMarkMessagesAsRead]);

  useEffect(() => {
    if (activeTicket || typeof window === "undefined") {
      return;
    }

    const restoreLatestTicket = async () => {
      try {
        const response = await fetch(
          apiUrl(
            `/tickets?viewerType=client&viewerId=${encodeURIComponent(clientSession.clientId)}`
          )
        );

        if (!response.ok) {
          return;
        }

        const tickets = (await response.json()) as Ticket[];

        if (!tickets.length) {
          return;
        }

        const latestTicket =
          tickets.find((ticket) => ticket.status !== "resolved" && ticket.status !== "closed") ??
          tickets[0];

        setActiveTicket(latestTicket);
        await loadTicketContext(latestTicket, shouldMarkMessagesAsRead);
      } catch (restoreError) {
        console.error("Ошибка восстановления последнего обращения:", restoreError);
      }
    };

    void restoreLatestTicket();
  }, [activeTicket, clientSession.clientId, shouldMarkMessagesAsRead]);

  useEffect(() => {
    if (!activeTicket) {
      return;
    }

    window.localStorage.setItem(clientActiveTicketStorageKey, activeTicket.id);
    setReplyMap(readReplyMap(activeTicket.id));
  }, [activeTicket]);

  useEffect(() => {
    if (!activeTicket) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const refreshActiveTicket = async () => {
        try {
          const freshTicket = await fetchTicketById(activeTicket.id);

          if (!freshTicket) {
            clearActiveTicket();
            setError("Текущее обращение больше не найдено");
            return;
          }

          setActiveTicket(freshTicket);
          await loadTicketContext(freshTicket);
        } catch (pollingError) {
          console.error("Ошибка polling client ticket:", pollingError);
        }
      };

      void refreshActiveTicket();
    }, isAiTyping ? 1200 : 4000);

    return () => window.clearInterval(intervalId);
  }, [activeTicket, isAiTyping, shouldMarkMessagesAsRead]);

  useEffect(() => {
    if (!isEmbeddedWidget || !activeTicket || typeof window === "undefined") {
      return;
    }

    const nonClientMessages = messages.filter(
      (message) => message.senderType !== "client" && message.senderType !== "system"
    );

    const lastSeenMap = readSeenMessageMap();
    const lastSeenMessageId = lastSeenMap[clientSession.clientId] ?? "";
    const lastSeenIndex = nonClientMessages.findIndex(
      (message) => message.id === lastSeenMessageId
    );
    const unreadCount =
      lastSeenIndex >= 0
        ? nonClientMessages.slice(lastSeenIndex + 1).length
        : nonClientMessages.length;

    window.parent?.postMessage(
      {
        type: "touchspace-widget-unread",
        unreadCount: shouldMarkMessagesAsRead ? 0 : unreadCount,
      },
      "*"
    );

    if (shouldMarkMessagesAsRead && nonClientMessages.length > 0) {
      const nextSeenMap = {
        ...lastSeenMap,
        [clientSession.clientId]: nonClientMessages[nonClientMessages.length - 1].id,
      };
      writeSeenMessageMap(nextSeenMap);
      window.parent?.postMessage(
        {
          type: "touchspace-widget-unread",
          unreadCount: 0,
        },
        "*"
      );
    }
  }, [messages, activeTicket, isEmbeddedWidget, clientSession.clientId, shouldMarkMessagesAsRead]);

  useEffect(() => {
    if (!isAiTyping) {
      setAiTypingStartedAt(null);
      setShowAiTimeoutHint(false);
      return;
    }

    setAiTypingStartedAt((current) => current ?? Date.now());
  }, [isAiTyping]);

  useEffect(() => {
    if (!isAiTyping || !aiTypingStartedAt) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowAiTimeoutHint(true);
    }, 8000);

    return () => window.clearTimeout(timeoutId);
  }, [isAiTyping, aiTypingStartedAt]);

  useEffect(() => {
    if (!activeTicket?.id || !draftText.trim()) {
      return;
    }

    const now = Date.now();

    if (now - lastTypingSentAtRef.current < 1000) {
      return;
    }

    lastTypingSentAtRef.current = now;

    void sendTyping(activeTicket.id).catch((typingError) => {
      console.error("Ошибка отправки typing-события:", typingError);
    });
  }, [draftText, activeTicket?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isWidgetOpen]);

  useEffect(() => {
    if (!composerRef.current) {
      return;
    }

    composerRef.current.style.height = "0px";
    composerRef.current.style.height = `${Math.min(
      composerRef.current.scrollHeight,
      116
    )}px`;
  }, [draftText]);

  useEffect(() => {
    if (!showEmojiPicker || !emojiPickerRef.current) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showEmojiPicker]);

  const handleCreateTicket = async (firstMessage: string) => {
    if (!firstMessage.trim()) {
      return;
    }

    setIsCreatingTicket(true);
    setError("");
    setIsAiTyping(preferredAiMode);
    if (preferredAiMode) {
      setAiTypingStartedAt(Date.now());
      setShowAiTimeoutHint(false);
    }

    try {
      const derivedTitle =
        firstMessage.trim().slice(0, 48) || "Новое обращение клиента";

      const ticketResponse = await fetch(apiUrl("/tickets/with-first-message"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: derivedTitle,
          firstMessage,
          senderType: "client",
          senderId: clientSession.clientId,
          senderName: clientSession.clientName,
          clientId: clientSession.clientId,
          clientName: clientSession.clientName,
          aiEnabled: preferredAiMode,
        }),
      });

      if (!ticketResponse.ok) {
        throw new Error("Не удалось создать обращение");
      }

      const newTicket = (await ticketResponse.json()) as Ticket;
      setActiveTicket(newTicket);
      setIsWidgetOpen(true);
      window.localStorage.setItem(clientActiveTicketStorageKey, newTicket.id);
      await loadTicketContext(newTicket, true);
      setDraftText("");
      setAttachmentName("");
    } catch (createError) {
      console.error("Ошибка создания обращения:", createError);
      setIsAiTyping(false);
      setAiTypingStartedAt(null);
      setShowAiTimeoutHint(false);
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать обращение"
      );
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleToggleAiMode = async () => {
    if (!activeTicket) {
      setPreferredAiMode((current) => !current);
      return;
    }

    setIsTogglingAi(true);
    setError("");

    try {
      const response = await fetch(
        apiUrl(`/tickets/${activeTicket.id}/ai/${activeTicket.aiEnabled ? "disable" : "enable"}`),
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось переключить AI-режим");
      }

      const updatedTicket = (await response.json()) as Ticket;
      setActiveTicket(updatedTicket);
      setPreferredAiMode(updatedTicket.aiEnabled ?? false);
      setShowAiTimeoutHint(false);
      await loadTicketContext(updatedTicket, shouldMarkMessagesAsRead);
    } catch (toggleError) {
      console.error("Ошибка переключения AI-режима:", toggleError);
      setError("Не удалось переключить AI-помощника");
    } finally {
      setIsTogglingAi(false);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const contentToSend = overrideText ?? draftText;

    if (!contentToSend.trim()) {
      return;
    }

    if (!activeTicket) {
      setDraftText("");
      setAttachmentName("");
      setShowEmojiPicker(false);
      await handleCreateTicket(contentToSend);
      return;
    }

    setIsSendingMessage(true);
    setError("");
    setDraftText("");
    setAttachmentName("");
    setShowEmojiPicker(false);
    lastTypingSentAtRef.current = 0;

    const optimisticMessageId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticMessageId,
      content: contentToSend,
      senderType: "client",
      messageType: "text",
      status: "sent",
      ticketId: activeTicket.id,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);

    if (activeTicket.aiEnabled) {
      setIsAiTyping(true);
      setAiTypingStartedAt(Date.now());
      setShowAiTimeoutHint(false);
    }

    try {
      const response = await fetch(apiUrl("/messages"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: activeTicket.id,
          content: contentToSend,
          senderType: "client",
          senderId: clientSession.clientId,
          senderName: clientSession.clientName,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить сообщение");
      }

      const createdMessage = (await response.json()) as Message;

      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticMessageId ? createdMessage : message
        )
      );

      void loadTicketContext(activeTicket, shouldMarkMessagesAsRead);

      if (replyTarget) {
        const nextReplyMap = {
          ...replyMap,
          [createdMessage.id]: {
            replyToId: replyTarget.id,
            replyToContent: replyTarget.content,
          },
        };

        setReplyMap(nextReplyMap);
        writeReplyMap(activeTicket.id, nextReplyMap);
        setReplyTarget(null);
      }
    } catch (sendError) {
      console.error("Ошибка отправки сообщения:", sendError);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessageId)
      );
      setIsAiTyping(false);
      setAiTypingStartedAt(null);
      setShowAiTimeoutHint(false);
      setError("Не удалось отправить сообщение");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const visibleMessages = useMemo<ClientVisibleMessage[]>(
    () =>
      messages.flatMap((message) => {
        if (
          message.senderType === "client" ||
          message.senderType === "manager" ||
          message.senderType === "supplier" ||
          message.senderType === "ai"
        ) {
          return [
            {
              ...message,
              displayContent: message.content,
            },
          ];
        }

        if (message.senderType !== "system") {
          return [];
        }

        if (message.content.startsWith("Запрошен поставщик:")) {
          return [
            {
              ...message,
              displayContent: "Запрос передан поставщику. Ожидайте.",
            },
          ];
        }

        if (message.content.includes("переведён в статус: closed")) {
          return [
            {
              ...message,
              displayContent: "Поставщик завершил диалог. Менеджер TouchSpace подключен.",
            },
          ];
        }

        if (message.content.includes("AI-помощник")) {
          return [
            {
              ...message,
              displayContent: message.content,
            },
          ];
        }

        if (message.content.includes("AI передал диалог менеджеру")) {
          return [
            {
              ...message,
              displayContent: "AI передал диалог менеджеру TouchSpace.",
            },
          ];
        }

        return [
          {
            ...message,
            displayContent: message.content,
          },
        ];
      }),
    [messages]
  );

  return (
    <main
      className="min-h-screen bg-transparent"
      style={{ fontFamily: widgetFontFamily }}
    >
      {!widgetVisible ? (
        <button
          onClick={() => setIsWidgetOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[#0A84FF] text-[26px] text-white shadow-[0_20px_50px_rgba(10,132,255,0.35)] transition hover:scale-105 hover:bg-[#0077F2]"
          aria-label="Открыть чат"
        >
          💬
        </button>
      ) : (
        <div
          className={`flex flex-col overflow-hidden border border-[#DCE3F0] bg-white ${
            isEmbeddedWidget
              ? "h-full w-full rounded-none shadow-none"
              : "fixed bottom-6 right-6 z-40 h-[72vh] min-h-[496px] w-[336px] max-h-[620px] rounded-[22px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
          }`}
        >
          <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0A84FF,#5B5CF6)] px-4 pb-4 pt-3 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
              <Image
                src="/icons/otpravit.svg"
                alt=""
                width={24}
                height={24}
                className="absolute right-5 top-4 h-6 w-6 rotate-[18deg]"
              />
              <Image
                src="/icons/smail.svg"
                alt=""
                width={22}
                height={22}
                className="absolute right-16 top-7 h-5 w-5 -rotate-12"
              />
              <Image
                src="/icons/otpravit.svg"
                alt=""
                width={20}
                height={20}
                className="absolute right-10 top-14 h-5 w-5 rotate-45"
              />
              <Image
                src="/icons/smail.svg"
                alt=""
                width={18}
                height={18}
                className="absolute right-28 top-3 h-4 w-4 rotate-[24deg]"
              />
            </div>
            <button
              onClick={() => requestHostClose()}
              className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm text-white transition hover:bg-white/25"
              aria-label="Закрыть чат"
            >
              ✕
            </button>

            <div className="relative z-10 pl-9 pr-2">
              <p className="text-[16px] font-semibold leading-tight">Напишите ваше сообщение</p>
              <p className="mt-1 text-[12px] text-white/80">{widgetStatusText}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void handleToggleAiMode()}
                  disabled={isTogglingAi}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                    aiModeActive
                      ? "bg-white text-[#0A84FF]"
                      : "bg-white/12 text-white hover:bg-white/20"
                  } disabled:opacity-60`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      aiModeActive ? "bg-[#34C759]" : "bg-white/60"
                    }`}
                  />
                  {isTogglingAi
                    ? "Переключаем..."
                    : aiModeActive
                      ? "AI-помощник включён"
                      : "Включить AI-помощника"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-[#F7F8FB]">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {!hasMessages ? (
                <>
                  <div className="flex justify-start">
                    <div className="max-w-[82%] rounded-[18px] rounded-tl-[6px] bg-white px-4 py-3 text-sm leading-6 text-[#1E1E1E] shadow-sm">
                      <p className="font-medium text-[#6C6C70]">Поддержка</p>
                      <p className="mt-1">Здравствуйте! Чем можем помочь?</p>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="rounded-full bg-[#EEF1F5] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8E8E93]">
                      Сегодня
                    </div>
                  </div>
                </>
              ) : null}

              {visibleMessages.map((message, index) => {
                const previousMessage = visibleMessages[index - 1];
                const shouldShowDateSeparator =
                  !previousMessage ||
                  getMessageDayKey(previousMessage.createdAt) !==
                    getMessageDayKey(message.createdAt);

                return (
                  <div key={message.id}>
                    {shouldShowDateSeparator ? (
                      <div className="mb-3 flex justify-center">
                        <div className="rounded-full bg-[#EEF1F5] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8E8E93]">
                          {formatMessageDayLabel(message.createdAt)}
                        </div>
                      </div>
                    ) : null}

                    {message.senderType === "system" ? (
                      <div className="flex justify-center">
                        <div className="max-w-[88%] rounded-full border border-[#E5E5EA] bg-[#F7F7FA] px-4 py-2.5 text-center text-xs text-[#8E8E93]">
                          {message.displayContent}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`flex ${
                          message.senderType === "client"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`group flex items-center gap-2 ${
                            message.senderType === "client" ? "flex-row-reverse" : ""
                          }`}
                          onMouseEnter={() => setHoveredMessageId(message.id)}
                          onMouseLeave={() => setHoveredMessageId("")}
                        >
                          <button
                            onClick={() => setReplyTarget(message)}
                            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm text-[#8E8E93] shadow-sm transition ${
                              hoveredMessageId === message.id
                                ? "opacity-100"
                                : "pointer-events-none opacity-0"
                            } hover:bg-[#F5F8FF] hover:text-[#0A84FF]`}
                            aria-label="Ответить"
                          >
                            ↩
                            {hoveredMessageId === message.id ? (
                              <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-[#E5E5EA] bg-white px-3 py-2 text-xs text-[#1E1E1E] shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                                Ответить
                              </span>
                            ) : null}
                          </button>

                          <div
                            className={`max-w-[82%] rounded-[18px] px-4 py-3 text-sm leading-6 shadow-sm ${
                              message.senderType === "client"
                                ? "rounded-tr-[6px] bg-[#0A84FF] text-white"
                                : message.senderType === "ai"
                                  ? "rounded-tl-[6px] border border-[#D9E8FF] bg-[#EFF6FF] text-[#0B3B78]"
                                : "rounded-tl-[6px] bg-white text-[#1E1E1E]"
                            }`}
                          >
                            <p className="text-xs opacity-60">
                              {message.senderType === "client"
                                ? "Вы"
                                : message.senderType === "ai"
                                  ? "AI-помощник"
                                  : "Поддержка"}
                            </p>
                            {replyMap[message.id] ? (
                              <div
                                className={`mt-2 rounded-[14px] border px-3 py-2 text-xs ${
                                  message.senderType === "client"
                                    ? "border-white/20 bg-white/10 text-white/80"
                                    : "border-[#E3E7EF] bg-[#F7F8FB] text-[#6C6C70]"
                                }`}
                              >
                                <p className="font-medium">Ответ на сообщение</p>
                                <p className="mt-1 line-clamp-2">
                                  {replyMap[message.id].replyToContent}
                                </p>
                              </div>
                            ) : null}
                            <p className="mt-1 break-words">{message.displayContent}</p>
                            <div
                              className={`mt-2 flex items-center gap-2 text-[10px] ${
                                message.senderType === "client"
                                  ? "justify-end text-white/70"
                                  : message.senderType === "ai"
                                    ? "justify-end text-[#4C6A92]"
                                  : "justify-end text-[#8E8E93]"
                              }`}
                            >
                              <p>{new Date(message.createdAt).toLocaleTimeString()}</p>
                              {message.senderType === "client" ? (
                                <p className="text-[11px] font-semibold tracking-[-0.02em]">
                                  {getMessageStatusChecks(message.status)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isAiTyping ? (
                <div className="grid gap-2">
                  <div className="flex justify-start">
                    <div className="max-w-[82%] rounded-[18px] rounded-tl-[6px] border border-[#D9E8FF] bg-[#EFF6FF] px-4 py-3 text-sm text-[#0B3B78] shadow-sm">
                      <p className="text-xs opacity-60">AI-помощник</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[#77A6E8] [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[#77A6E8] [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[#77A6E8]" />
                        </div>
                        <span className="text-xs text-[#4C6A92]">AI-помощник печатает...</span>
                      </div>
                    </div>
                  </div>

                  {showAiTimeoutHint ? (
                    <div className="flex justify-start">
                      <div className="max-w-[88%] rounded-[16px] border border-[#FFE1A6] bg-[#FFF7E8] px-4 py-3 text-xs leading-5 text-[#8A5A00] shadow-sm">
                        <p className="font-medium text-[#7A4F00]">
                          AI отвечает дольше обычного.
                        </p>
                        <p className="mt-1">
                          Можно не ждать и сразу подключить менеджера TouchSpace.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleToggleAiMode()}
                          disabled={isTogglingAi}
                          className="mt-3 rounded-full bg-[#0A84FF] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#0077F2] disabled:opacity-60"
                        >
                          Подключить менеджера
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>

            {showQuickActions ? (
              <div className="border-t border-[#E7E9EF] bg-white px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      onClick={() => {
                        void handleSendMessage(action);
                      }}
                      className="rounded-full border border-[#77D68C] px-3 py-1.5 text-xs font-medium text-[#22A447] transition hover:bg-[#F4FFF7]"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-[#E7E9EF] bg-white px-4 py-4">
              {replyTarget ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-[16px] border border-[#DCE7FF] bg-[#F5F9FF] px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#0A84FF]">Ответ на сообщение</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[#5A6270]">
                      {replyTarget.content}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyTarget(null)}
                    className="shrink-0 text-sm text-[#8E8E93] transition hover:text-[#1E1E1E]"
                  >
                    ×
                  </button>
                </div>
              ) : null}

              {attachmentName ? (
                <div className="mb-3 flex">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#D8D8DE] bg-[#F7F7FA] px-3 py-1.5 text-xs text-[#1E1E1E]">
                    <span className="max-w-[180px] truncate">{attachmentName}</span>
                    <button
                      onClick={() => setAttachmentName("")}
                      className="text-[#8E8E93] transition hover:text-[#1E1E1E]"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : null}

              {showEmojiPicker ? (
                <div
                  ref={emojiPickerRef}
                  className="mb-3 rounded-[18px] border border-[#E4E6EB] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                >
                  <div className="mb-2 text-[12px] font-medium text-[#6C6C70]">
                    Смайлики
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {EMOJI_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setDraftText((prev) => `${prev}${emoji}`);
                          setShowEmojiPicker(false);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FBFBFD] text-xl transition hover:bg-[#EEF6FF]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-end gap-3 rounded-[24px] border border-[#E3E5EA] bg-white px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
                <div className="min-w-0 flex-1">
                  <textarea
                    ref={composerRef}
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    rows={1}
                    className="min-h-[40px] max-h-[116px] w-full resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-6 text-[#1E1E1E] outline-none placeholder:text-[#8E8E93]"
                    placeholder="Напишите сообщение..."
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-[#E5F0FF]"
                    aria-label="Смайлики"
                  >
                    <Image
                      src="/icons/smail.svg"
                      alt="Смайлики"
                      width={18}
                      height={18}
                      className="h-[18px] w-[18px]"
                    />
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-[#E5F0FF]"
                    aria-label="Вложить файл"
                  >
                    <Image
                      src="/icons/skrepka.svg"
                      alt="Вложить файл"
                      width={18}
                      height={18}
                      className="h-[18px] w-[18px]"
                    />
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
                  onClick={() => {
                    void handleSendMessage();
                  }}
                  disabled={
                    !draftText.trim() || isCreatingTicket || isSendingMessage || isResolved
                  }
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#0A84FF] shadow-[0_12px_22px_rgba(10,132,255,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0077F2] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                  aria-label="Отправить"
                >
                  <Image
                    src="/icons/otpravit.svg"
                    alt="Отправить"
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px]"
                  />
                </button>
              </div>

              {isResolved ? (
                <div className="mt-3 rounded-[18px] border border-[#E6F3EA] bg-[#F4FFF7] px-3 py-3">
                  <p className="text-sm font-medium text-[#1E1E1E]">
                    Ваш вопрос решён?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => clearActiveTicket()}
                      className="flex-1 rounded-full border border-[#DCE7FF] px-3 py-2 text-sm font-medium text-[#0A84FF]"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setDraftText("У меня остался вопрос")}
                      className="flex-1 rounded-full bg-[#0A84FF] px-3 py-2 text-sm font-medium text-white"
                    >
                      Нет
                    </button>
                  </div>
                </div>
              ) : null}

              {error ? <p className="mt-3 text-sm text-[#FD6868]">{error}</p> : null}
              {isLoadingContext ? (
                <p className="mt-2 text-xs text-[#8E8E93]">Обновляем чат...</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
