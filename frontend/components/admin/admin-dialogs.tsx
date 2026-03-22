"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime, formatDuration } from "@/lib/admin-format";
import {
  AdminButton,
  AdminCards,
  AdminInput,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminSelect,
  AdminStatusBadge,
  AdminTable,
  AdminToolbar,
  getRoleLabel,
} from "@/components/admin/admin-ui";

export function AdminDialogs() {
  const [filters, setFilters] = useState({
    status: "",
    managerId: "",
    supplierId: "",
    supplierEscalated: "",
    slaBreached: "",
  });
  const [payload, setPayload] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadDialogs = async () => {
    try {
      const result = await adminApi.getDialogs(filters);
      setPayload(result);
      setError(null);
      const nextSelectedId =
        selectedId && result.items.some((item: any) => item.id === selectedId)
          ? selectedId
          : result.items[0]?.id ?? null;
      setSelectedId(nextSelectedId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить диалоги");
    }
  };

  useEffect(() => {
    void loadDialogs();
  }, [filters.status, filters.managerId, filters.supplierId, filters.supplierEscalated, filters.slaBreached]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void adminApi
      .getDialog(selectedId)
      .then((result) => setDetail(result))
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть диалог"),
      );
  }, [selectedId]);

  return (
    <AdminPage
      title="Все диалоги и контроль истории"
      description="Рабочий read-only экран для разбора переписки, эскалаций на поставщика и нарушений SLA с просмотром всей ленты сообщений."
    >
      {message ? <AdminMessage tone="success">{message}</AdminMessage> : null}
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <AdminCards
        items={[
          { label: "Всего диалогов", value: String(payload?.total ?? 0) },
          {
            label: "Эскалации поставщику",
            value: String((payload?.items ?? []).filter((item: any) => item.supplierEscalated).length),
          },
          {
            label: "Нарушения SLA",
            value: String((payload?.items ?? []).filter((item: any) => item.slaBreached).length),
            tone: "warn",
          },
          { label: "Выбранный диалог", value: selectedId ?? "нет данных" },
        ]}
      />

      <AdminToolbar>
        <AdminSelect value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">Все статусы</option>
          <option value="new">Новый</option>
          <option value="in_progress">В работе</option>
          <option value="waiting_supplier">Ожидает поставщика</option>
          <option value="waiting_client">Ожидает клиента</option>
          <option value="resolved">Решён</option>
        </AdminSelect>
        <AdminInput value={filters.managerId} onChange={(event) => setFilters((current) => ({ ...current, managerId: event.target.value }))} placeholder="ID менеджера" />
        <AdminInput value={filters.supplierId} onChange={(event) => setFilters((current) => ({ ...current, supplierId: event.target.value }))} placeholder="ID поставщика" />
        <AdminSelect value={filters.supplierEscalated} onChange={(event) => setFilters((current) => ({ ...current, supplierEscalated: event.target.value }))}>
          <option value="">Эскалация поставщику: все</option>
          <option value="true">Только с эскалацией</option>
          <option value="false">Без эскалации</option>
        </AdminSelect>
        <AdminSelect value={filters.slaBreached} onChange={(event) => setFilters((current) => ({ ...current, slaBreached: event.target.value }))}>
          <option value="">SLA: все</option>
          <option value="true">Только с нарушением</option>
          <option value="false">Без нарушений</option>
        </AdminSelect>
        <AdminButton tone="secondary" onClick={() => void loadDialogs()}>
          Обновить
        </AdminButton>
      </AdminToolbar>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
        <AdminPanel title="Список диалогов">
          <AdminTable
            columns={[
              { key: "id", label: "ID" },
              { key: "clientName", label: "Клиент" },
              { key: "managerName", label: "Менеджер" },
              { key: "supplierName", label: "Поставщик" },
              { key: "status", label: "Статус" },
              { key: "lastMessageAt", label: "Последнее сообщение" },
              { key: "flags", label: "Флаги" },
            ]}
            rows={payload?.items ?? []}
            rowKey={(row) => row.id}
            selectedRowKey={selectedId}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle="Диалогов пока нет"
            emptyDescription="Когда в системе появятся чаты, админ сможет просматривать их здесь."
            renderCell={(row, key) => {
              if (key === "status") {
                return <AdminStatusBadge value={row.status} />;
              }

              if (key === "lastMessageAt") {
                return formatDateTime(row.lastMessageAt);
              }

              if (key === "flags") {
                return [row.supplierEscalated ? "эскалация поставщику" : null, row.slaBreached ? "нарушение SLA" : null]
                  .filter(Boolean)
                  .join(", ") || "без флагов";
              }

              return row[key] ?? "нет данных";
            }}
          />
        </AdminPanel>

        <AdminPanel title="Карточка диалога">
          {detail ? (
            <div className="grid gap-4">
              <div className="flex justify-end">
                <AdminButton
                  onClick={() => {
                    if (!selectedId) {
                      return;
                    }

                    setAiLoading(true);
                    setMessage(null);
                    setError(null);

                    void adminApi
                      .analyzeDialogAi(selectedId)
                      .then(async () => {
                        const refreshedDialog = await adminApi.getDialog(selectedId);
                        setDetail(refreshedDialog);
                        setMessage("AI-анализ диалога сформирован и сохранён");
                      })
                      .catch((requestError) => {
                        setError(
                          requestError instanceof Error
                            ? requestError.message
                            : "Не удалось выполнить AI-анализ",
                        );
                      })
                      .finally(() => {
                        setAiLoading(false);
                      });
                  }}
                  disabled={aiLoading}
                >
                  {aiLoading ? "AI анализирует..." : "Сгенерировать AI-анализ"}
                </AdminButton>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p><span className="font-medium text-slate-950">Название:</span> {detail.title}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Клиент:</span> {detail.clientName ?? "нет данных"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Менеджер:</span> {detail.assignedManagerName ?? "нет данных"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Поставщик:</span> {detail.supplierName ?? "нет данных"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">1-й ответ:</span> {formatDuration(detail.metrics?.firstResponseTime)}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Ответ поставщика:</span> {formatDuration(detail.metrics?.supplierResponseTime)}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-4 text-sm text-slate-700">
                <p className="text-sm font-semibold text-slate-950">AI-анализ</p>
                <p className="mt-3"><span className="font-medium text-slate-950">Категория:</span> {detail.ai?.topicCategory ?? "нет данных"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Тональность:</span> {detail.ai?.sentiment ?? "нет данных"}</p>
                <p className="mt-1 leading-6"><span className="font-medium text-slate-950">Сводка:</span> {detail.ai?.aiSummary ?? "AI-сводка ещё не сформирована"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Теги:</span> {(detail.ai?.aiTags ?? []).join(", ") || "нет данных"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Сигналы:</span> {(detail.ai?.insightFlags ?? []).join(", ") || "нет данных"}</p>
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-slate-950">История сообщений</p>
                {(detail.messages ?? []).map((message: any) => (
                  <div key={message.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-slate-900">{getRoleLabel(message.senderRole ?? message.senderType)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(message.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{message.content}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-slate-950">Запросы поставщику</p>
                {(detail.supplierRequests ?? []).map((request: any) => (
                  <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-slate-900">{request.supplierName}</p>
                      <AdminStatusBadge value={request.status} />
                    </div>
                    <p className="mt-2 leading-6">{request.requestText}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      создан {formatDateTime(request.createdAt)} | первый ответ {formatDateTime(request.firstResponseAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Выберите диалог слева.</p>
          )}
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
