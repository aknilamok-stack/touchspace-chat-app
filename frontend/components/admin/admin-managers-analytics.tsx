"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDuration, formatDateTime } from "@/lib/admin-format";
import {
  AdminButton,
  AdminCards,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminSelect,
  AdminStatusBadge,
  AdminTable,
  AdminToolbar,
} from "@/components/admin/admin-ui";

export function AdminManagersAnalytics() {
  const [preset, setPreset] = useState("month");
  const [payload, setPayload] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await adminApi.getManagersAnalytics({ preset });
      setPayload(result);
      setError(null);
      setSelectedId((current) =>
        current && result.items.some((item: any) => item.id === current)
          ? current
          : result.items[0]?.id ?? null,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить аналитику менеджеров");
    }
  };

  useEffect(() => {
    void load();
  }, [preset]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void load();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [preset]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    const loadDetail = async () => {
      try {
        const result = await adminApi.getManagerAnalyticsDetail(selectedId, { preset });
        setDetail(result);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть менеджера");
      }
    };

    void loadDetail();

    const intervalId = window.setInterval(() => {
      void loadDetail();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [selectedId, preset]);

  return (
    <AdminPage
      title="Аналитика по менеджерам"
      description="Рабочий срез эффективности менеджеров: обработанные и активные диалоги, время первого ответа, просрочки и эскалации к поставщикам."
      actions={
        <AdminToolbar>
          <AdminSelect value={preset} onChange={(event) => setPreset(event.target.value)}>
            <option value="day">День</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </AdminSelect>
          <AdminButton tone="secondary" onClick={() => void load()}>
            Обновить
          </AdminButton>
        </AdminToolbar>
      }
    >
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <AdminCards
        items={[
          { label: "Менеджеров в отчёте", value: String(payload?.items?.length ?? 0) },
          { label: "Сейчас online", value: String(payload?.livePresence?.online ?? 0), tone: "good" },
          { label: "На перерыве", value: String(payload?.livePresence?.break ?? 0), tone: "warn" },
          {
            label: "Обработано диалогов",
            value: String((payload?.items ?? []).reduce((sum: number, item: any) => sum + (item.handledDialogs ?? 0), 0)),
          },
          {
            label: "SLA просрочки",
            value: String((payload?.items ?? []).reduce((sum: number, item: any) => sum + (item.slaBreaches ?? 0), 0)),
            tone: "warn",
          },
        ]}
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.9fr)]">
        <AdminPanel title="Менеджеры">
          <AdminTable
            columns={[
              { key: "fullName", label: "Менеджер" },
              { key: "presenceStatus", label: "Live" },
              { key: "handledDialogs", label: "Обработано" },
              { key: "dialogsInWork", label: "В работе" },
              { key: "avgFirstResponseMs", label: "1-й ответ" },
              { key: "slaBreaches", label: "SLA" },
              { key: "escalationsToSupplier", label: "Эскалации" },
            ]}
            rows={payload?.items ?? []}
            rowKey={(row) => row.id}
            selectedRowKey={selectedId}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle="Нет аналитики по менеджерам"
            emptyDescription="Пока нет данных за выбранный период."
            renderCell={(row, key) => {
              if (key === "presenceStatus") {
                return <AdminStatusBadge value={row.presenceStatus ?? "offline"} />;
              }

              if (key === "avgFirstResponseMs") {
                return formatDuration(row.avgFirstResponseMs);
              }

              return row[key];
            }}
          />
        </AdminPanel>

        <AdminPanel title="Карточка менеджера">
          {detail ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p><span className="font-medium text-slate-950">Имя:</span> {detail.manager.fullName}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Статус:</span> <AdminStatusBadge value={detail.manager.status} /></p>
                <p className="mt-1"><span className="font-medium text-slate-950">Live presence:</span> <AdminStatusBadge value={detail.manager.presenceStatus ?? "offline"} /></p>
                <p className="mt-1"><span className="font-medium text-slate-950">Обработано:</span> {detail.metrics.handledDialogs}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">1-й ответ:</span> {formatDuration(detail.metrics.avgFirstResponseMs)}</p>
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-slate-950">Последние диалоги</p>
                {(detail.dialogs ?? []).map((dialog: any) => (
                  <div key={dialog.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-slate-900">{dialog.title}</p>
                      <AdminStatusBadge value={dialog.status} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(dialog.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Выберите менеджера слева.</p>
          )}
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
