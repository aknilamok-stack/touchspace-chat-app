"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatAttachmentList } from "@/components/chat/attachment-card";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/admin-format";
import { parseChatAttachmentPayloads } from "@/lib/chat-attachments";
import {
  AdminButton,
  AdminCards,
  AdminInput,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminSelect,
  AdminStatusBadge,
  getRoleLabel,
} from "@/components/admin/admin-ui";

const periodOptions = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "custom", label: "Произвольный" },
];

const compactText = (value?: string | null) => {
  if (!value?.trim()) {
    return "нет данных";
  }

  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
};

function MessageBubble({ message }: { message: any }) {
  const attachments = parseChatAttachmentPayloads(message.content);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-slate-900">
          {getRoleLabel(message.senderRole ?? message.senderType)}
        </p>
        <p className="text-xs text-slate-500">{formatDateTime(message.createdAt)}</p>
      </div>
      {attachments.length > 0 ? (
        <ChatAttachmentList attachments={attachments} tone="neutral" className="mt-3" />
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-700">{message.content}</p>
      )}
    </div>
  );
}

export function AdminDialogs() {
  const [filters, setFilters] = useState({
    scope: "active",
    status: "",
    supplierEscalated: "",
    slaBreached: "",
    preset: "week",
    dateFrom: "",
    dateTo: "",
  });
  const [payload, setPayload] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [messagePage, setMessagePage] = useState(1);
  const [clientAiPayload, setClientAiPayload] = useState<any>(null);
  const [fullDialogOpen, setFullDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const detailRequestId = useRef(0);

  const periodQuery = useMemo(
    () => ({
      preset: filters.preset === "custom" ? undefined : filters.preset,
      dateFrom: filters.preset === "custom" ? filters.dateFrom || undefined : undefined,
      dateTo: filters.preset === "custom" ? filters.dateTo || undefined : undefined,
    }),
    [filters.preset, filters.dateFrom, filters.dateTo],
  );

  const loadDialogs = async () => {
    try {
      setDialogsLoading(true);
      const result = await adminApi.getDialogs({
        scope: filters.scope,
        status: filters.status,
        supplierEscalated: filters.supplierEscalated,
        slaBreached: filters.slaBreached,
        page,
        pageSize: 30,
        ...periodQuery,
      });
      setPayload(result);
      setError(null);
      const nextSelectedId =
        selectedId && result.items.some((item: any) => item.id === selectedId)
          ? selectedId
          : result.items[0]?.id ?? null;
      if (nextSelectedId !== selectedId) {
        setDetail(null);
        setMessagePage(1);
      }
      setSelectedId(nextSelectedId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить диалоги");
    } finally {
      setDialogsLoading(false);
    }
  };

  const loadDetail = async (dialogId: string) => {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;

    try {
      setDetailLoading(true);
      const result = await adminApi.getDialog(dialogId, {
        ...periodQuery,
        messagePage,
        messagePageSize: 50,
      });

      if (requestId !== detailRequestId.current) {
        return;
      }

      setDetail(result);
      setClientAiPayload(null);
      setError(null);
    } catch (requestError) {
      if (requestId !== detailRequestId.current) {
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Не удалось открыть диалог");
    } finally {
      if (requestId === detailRequestId.current) {
        setDetailLoading(false);
      }
    }
  };

  const generateClientAiSummary = async () => {
    if (!selectedId) {
      return;
    }

    try {
      setAiLoading(true);
      setMessage(null);
      setError(null);
      const result = await adminApi.generateClientDialogAiSummary(selectedId, periodQuery);
      setClientAiPayload(result);
      setMessage("AI-инсайты по клиенту сформированы");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сформировать AI-инсайты");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    void loadDialogs();
  }, [
    filters.scope,
    filters.status,
    filters.supplierEscalated,
    filters.slaBreached,
    periodQuery,
    page,
  ]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void loadDetail(selectedId);
  }, [selectedId, periodQuery, messagePage]);

  useEffect(() => {
    setPage(1);
    setMessagePage(1);
  }, [
    filters.scope,
    filters.status,
    filters.supplierEscalated,
    filters.slaBreached,
    periodQuery,
  ]);

  const recentMessages = (detail?.messages ?? []).slice(-6);
  const isHistoryScope = filters.scope === "history";
  const dialogsTitle = isHistoryScope
    ? "Диалоги с обращениями за период"
    : "Сейчас в работе";
  const pagination = payload?.pagination;

  return (
    <AdminPage
      title="Список диалогов"
      description="Контроль текущей работы и история первичных и повторных обращений. Раздел не изменяет рабочие диалоги."
    >
      {message ? <AdminMessage tone="success">{message}</AdminMessage> : null}
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <AdminPanel title="Фильтры">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Режим
            <AdminSelect
              value={filters.scope}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  scope: event.target.value,
                  status: "",
                }))
              }
            >
              <option value="active">Сейчас в работе</option>
              <option value="history">Обращения за период</option>
            </AdminSelect>
          </label>
          {isHistoryScope ? (
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              Период обращений
              <AdminSelect
                value={filters.preset}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, preset: event.target.value }))
                }
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
            </label>
          ) : null}
          {isHistoryScope && filters.preset === "custom" ? (
            <>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Дата с
                <AdminInput
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Дата по
                <AdminInput
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                />
              </label>
            </>
          ) : null}
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Статус
            <AdminSelect value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">Все доступные статусы</option>
              <option value="new">Новый</option>
              <option value="in_progress">В работе</option>
              <option value="waiting_supplier">Ожидает поставщика</option>
              <option value="waiting_client">Ожидает клиента</option>
              {isHistoryScope ? <option value="resolved">Решён</option> : null}
              {isHistoryScope ? <option value="closed">Закрыт</option> : null}
            </AdminSelect>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Запрос поставщику
            <AdminSelect value={filters.supplierEscalated} onChange={(event) => setFilters((current) => ({ ...current, supplierEscalated: event.target.value }))}>
              <option value="">Все</option>
              <option value="true">Есть или был запрос</option>
              <option value="false">Запросов не было</option>
            </AdminSelect>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            Нарушение SLA
            <AdminSelect value={filters.slaBreached} onChange={(event) => setFilters((current) => ({ ...current, slaBreached: event.target.value }))}>
              <option value="">Все</option>
              <option value="true">
                {isHistoryScope ? "Было нарушение" : "Есть активное нарушение"}
              </option>
              <option value="false">
                {isHistoryScope ? "Без нарушений" : "Без активного нарушения"}
              </option>
            </AdminSelect>
          </label>
          <div className="flex items-end">
            <AdminButton tone="secondary" onClick={() => void loadDialogs()} disabled={dialogsLoading}>
              {dialogsLoading ? "Обновляю..." : "Обновить"}
            </AdminButton>
          </div>
        </div>
      </AdminPanel>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
        <AdminPanel title={`${dialogsTitle} · ${payload?.total ?? 0}`}>
          {(payload?.items ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    {["Клиент", "Менеджер", "Поставщик", "Статус", "Последнее сообщение", "Флаги"].map((label) => (
                      <th key={label} className="px-4 pb-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.items.map((item: any) => (
                    <tr
                      key={item.id}
                      onClick={() => {
                        setDetail(null);
                        setMessagePage(1);
                        setSelectedId(item.id);
                      }}
                      className={`cursor-pointer bg-slate-50 transition hover:bg-sky-50 ${
                        selectedId === item.id ? "outline outline-1 outline-sky-200" : ""
                      }`}
                    >
                      <td className="rounded-l-2xl px-4 py-4">
                        <p className="text-sm font-semibold text-slate-950">{item.clientName}</p>
                        <p className="mt-1 max-w-[260px] text-xs text-slate-500">{compactText(item.lastMessagePreview)}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700">{item.managerName ?? "не назначен"}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{item.supplierName ?? "не указан"}</td>
                      <td className="px-4 py-4 text-sm text-slate-700"><AdminStatusBadge value={item.status} /></td>
                      <td className="px-4 py-4 text-sm text-slate-700">{formatDateTime(item.lastMessageAt ?? item.createdAt)}</td>
                      <td className="rounded-r-2xl px-4 py-4 text-sm text-slate-600">
                        {[
                          item.activeSupplierRequestsCount > 0
                            ? `активных запросов: ${item.activeSupplierRequestsCount}`
                            : item.supplierEscalated
                              ? "запрос поставщику закрыт"
                              : null,
                          item.managerSlaBreached ? "SLA менеджера" : null,
                          item.supplierSlaBreached ? "SLA поставщика" : null,
                        ].filter(Boolean).join(", ") || "нет"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {isHistoryScope
                ? "Обращений за выбранный период нет."
                : "Сейчас нет незавершённых диалогов."}
            </p>
          )}
          {pagination && pagination.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <AdminButton
                tone="secondary"
                disabled={pagination.page <= 1 || dialogsLoading}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Назад
              </AdminButton>
              <p className="text-sm text-slate-600">
                Страница {pagination.page} из {pagination.totalPages}
              </p>
              <AdminButton
                tone="secondary"
                disabled={pagination.page >= pagination.totalPages || dialogsLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                Далее
              </AdminButton>
            </div>
          ) : null}
        </AdminPanel>

        <div className="grid gap-4">
          <AdminPanel title={detail ? `Клиент: ${detail.displayClientName}` : "Клиент"}>
            {detailLoading && !detail ? (
              <p className="text-sm text-slate-500">Загружаем диалог…</p>
            ) : detail ? (
              <div className="grid gap-4">
                {isHistoryScope ? (
                  <AdminCards
                    items={[
                      { label: "Обращений клиента за период", value: String(detail.clientStats?.requestsTotal ?? 0) },
                      { label: "Решено из обращений", value: String(detail.clientStats?.resolvedRequests ?? 0), tone: "good" },
                      { label: "Осталось из обращений", value: String(detail.clientStats?.unresolvedRequests ?? 0), tone: "warn" },
                      { label: "Запросов поставщику за период", value: String(detail.clientStats?.supplierRequestsCount ?? 0) },
                      { label: "Диалогов с SLA менеджера", value: String(detail.clientStats?.managerSlaBreaches ?? 0), tone: "warn" },
                      { label: "Запросов с SLA поставщика", value: String(detail.clientStats?.supplierSlaBreaches ?? 0), tone: "warn" },
                    ]}
                  />
                ) : null}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <p><span className="font-medium text-slate-950">Текущий диалог:</span> {detail.title}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Менеджер:</span> {detail.assignedManagerName ?? "не назначен"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Поставщик:</span> {detail.supplierName ?? "не указан"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Выберите диалог из списка.</p>
            )}
          </AdminPanel>

          {detail ? (
            <>
              <AdminPanel title="Последние сообщения">
                <div className="grid gap-3">
                  {recentMessages.map((message: any) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  <div className="flex justify-end">
                    <AdminButton
                      tone="secondary"
                      onClick={() => {
                        setMessagePage(1);
                        setFullDialogOpen(true);
                      }}
                    >
                      Открыть переписку
                    </AdminButton>
                  </div>
                </div>
              </AdminPanel>

              <AdminPanel title="AI-инсайты по клиенту">
                <div className="grid gap-4">
                  <div className="flex justify-end">
                    <AdminButton onClick={() => void generateClientAiSummary()} disabled={aiLoading}>
                      {aiLoading ? "AI анализирует..." : "Сгенерировать AI-инсайты"}
                    </AdminButton>
                  </div>
                  {clientAiPayload?.insights ? (
                    <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-950">Сводка</p>
                      <p className="mt-2 leading-6">{clientAiPayload.insights.executiveSummary}</p>
                      {(clientAiPayload.insights.triggerThemes ?? []).length > 0 ? (
                        <div className="mt-4 grid gap-2">
                          {clientAiPayload.insights.triggerThemes.map((item: any) => (
                            <div key={`${item.theme}_${item.count}`} className="rounded-xl bg-white px-3 py-2">
                              <p className="font-medium text-slate-950">{item.theme} · {item.count}</p>
                              <p className="mt-1 text-slate-600">{item.explanation}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {(clientAiPayload.insights.recommendations ?? []).length > 0 ? (
                        <div className="mt-4 grid gap-2">
                          {clientAiPayload.insights.recommendations.map((item: string) => (
                            <p key={item} className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-950">{item}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Нажмите кнопку, чтобы получить AI-анализ по выбранному клиенту за период.</p>
                  )}
                </div>
              </AdminPanel>
            </>
          ) : null}
        </div>
      </div>

      {fullDialogOpen && detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-dialog-title"
            className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-[24px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.3)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p id="admin-dialog-title" className="text-lg font-semibold text-slate-950">{detail.displayClientName}</p>
                <p className="mt-1 text-sm text-slate-500">{detail.title}</p>
              </div>
              <AdminButton
                tone="secondary"
                onClick={() => {
                  setFullDialogOpen(false);
                  setMessagePage(1);
                }}
              >
                Закрыть
              </AdminButton>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid gap-3">
                {detailLoading ? (
                  <p className="text-sm text-slate-500">Загружаем сообщения…</p>
                ) : null}
                {(detail.messages ?? []).map((message: any) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {detail.messagesPagination?.totalPages > 1 ? (
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <AdminButton
                      tone="secondary"
                      disabled={messagePage <= 1 || detailLoading}
                      onClick={() => setMessagePage((current) => Math.max(current - 1, 1))}
                    >
                      Более новые
                    </AdminButton>
                    <p className="text-sm text-slate-600">
                      Сообщения: страница {detail.messagesPagination.page} из{" "}
                      {detail.messagesPagination.totalPages}
                    </p>
                    <AdminButton
                      tone="secondary"
                      disabled={
                        messagePage >= detail.messagesPagination.totalPages ||
                        detailLoading
                      }
                      onClick={() => setMessagePage((current) => current + 1)}
                    >
                      Более ранние
                    </AdminButton>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
