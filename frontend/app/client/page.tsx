"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

const clientActiveTicketStorageKey = "touchspace_client_active_ticket_id";
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
};

type Message = {
  id: string;
  content: string;
  senderType: string;
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
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftText, setDraftText] = useState("");
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState("");
  const [replyMap, setReplyMap] = useState<Record<string, ReplyMeta>>({});
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const lastTypingSentAtRef = useRef(0);

  const isResolved = activeTicket?.status === "resolved";
  const widgetStatusText = isResolved ? "Ваш вопрос решён?" : "Операторы онлайн";
  const hasMessages = messages.length > 0;
  const showQuickActions = !hasMessages && !activeTicket;

  const fetchTicketById = async (ticketId: string): Promise<Ticket | null> => {
    const response = await fetch("http://localhost:3001/tickets");

    if (!response.ok) {
      throw new Error("Не удалось загрузить список обращений");
    }

    const tickets = (await response.json()) as Ticket[];
    return tickets.find((ticket) => ticket.id === ticketId) ?? null;
  };

  const sendTyping = async (ticketId: string) => {
    await fetch(`http://localhost:3001/tickets/${ticketId}/typing`, {
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
    window.localStorage.removeItem(clientActiveTicketStorageKey);
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

  const loadTicketContext = async (ticket: Ticket) => {
    setIsLoadingContext(true);
    setError("");

    try {
      const messagesResponse = await fetch(
        `http://localhost:3001/tickets/${ticket.id}/messages?viewerType=client&markAsRead=true`
      );

      if (!messagesResponse.ok) {
        throw new Error("Не удалось загрузить данные обращения");
      }

      const messagesData = (await messagesResponse.json()) as Message[];
      setMessages(messagesData);
    } catch (loadError) {
      console.error("Ошибка загрузки обращения:", loadError);
      setError("Не удалось загрузить данные обращения");
    } finally {
      setIsLoadingContext(false);
    }
  };

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
        await loadTicketContext(restoredTicket);
      } catch (restoreError) {
        console.error("Ошибка восстановления active ticket:", restoreError);
        clearActiveTicket();
        setError("Не удалось восстановить последнее обращение");
      }
    };

    void restoreTicket();
  }, []);

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
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [activeTicket]);

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

    try {
      const derivedTitle =
        firstMessage.trim().slice(0, 48) || "Новое обращение клиента";

      const ticketResponse = await fetch("http://localhost:3001/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: derivedTitle,
        }),
      });

      if (!ticketResponse.ok) {
        throw new Error("Не удалось создать обращение");
      }

      const newTicket = (await ticketResponse.json()) as Ticket;

      const messageResponse = await fetch("http://localhost:3001/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: newTicket.id,
          content: firstMessage,
          senderType: "client",
        }),
      });

      if (!messageResponse.ok) {
        throw new Error("Обращение создано, но первое сообщение не сохранилось");
      }

      setActiveTicket(newTicket);
      setIsWidgetOpen(true);
      window.localStorage.setItem(clientActiveTicketStorageKey, newTicket.id);
      await loadTicketContext(newTicket);
      setDraftText("");
      setAttachmentName("");
    } catch (createError) {
      console.error("Ошибка создания обращения:", createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать обращение"
      );
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const contentToSend = overrideText ?? draftText;

    if (!contentToSend.trim()) {
      return;
    }

    if (!activeTicket) {
      await handleCreateTicket(contentToSend);
      return;
    }

    setIsSendingMessage(true);
    setError("");

    try {
      const response = await fetch("http://localhost:3001/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: activeTicket.id,
          content: contentToSend,
          senderType: "client",
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить сообщение");
      }

      await loadTicketContext(activeTicket);
      setDraftText("");
      setAttachmentName("");
      setShowEmojiPicker(false);
      lastTypingSentAtRef.current = 0;

      const createdMessage = (await response.json()) as Message;

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
          message.senderType === "supplier"
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

        return [];
      }),
    [messages]
  );

  return (
    <main
      className="min-h-screen bg-transparent"
      style={{ fontFamily: widgetFontFamily }}
    >
      {!isWidgetOpen ? (
        <button
          onClick={() => setIsWidgetOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[#0A84FF] text-[26px] text-white shadow-[0_20px_50px_rgba(10,132,255,0.35)] transition hover:scale-105 hover:bg-[#0077F2]"
          aria-label="Открыть чат"
        >
          💬
        </button>
      ) : (
        <div className="fixed bottom-6 right-6 z-40 flex h-[72vh] min-h-[496px] w-[336px] max-h-[620px] flex-col overflow-hidden rounded-[22px] border border-[#DCE3F0] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
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
              onClick={() => setIsWidgetOpen(false)}
              className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm text-white transition hover:bg-white/25"
              aria-label="Закрыть чат"
            >
              ✕
            </button>

            <div className="relative z-10 pl-9 pr-2">
              <p className="text-[16px] font-semibold leading-tight">Напишите ваше сообщение</p>
              <p className="mt-1 text-[12px] text-white/80">{widgetStatusText}</p>
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
                                : "rounded-tl-[6px] bg-white text-[#1E1E1E]"
                            }`}
                          >
                            <p className="text-xs opacity-60">
                              {message.senderType === "client" ? "Вы" : "Поддержка"}
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
                  onClick={handleSendMessage}
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
