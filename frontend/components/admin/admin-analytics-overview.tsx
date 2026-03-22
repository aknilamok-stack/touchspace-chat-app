"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDuration } from "@/lib/admin-format";
import {
  AdminButton,
  AdminCards,
  AdminEmpty,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminSelect,
  AdminTable,
  AdminToolbar,
} from "@/components/admin/admin-ui";

export function AdminAnalyticsOverview() {
  const [preset, setPreset] = useState("month");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await adminApi.getAnalyticsOverview({ preset });
      setData(result);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить аналитику");
    }
  };

  useEffect(() => {
    void load();
  }, [preset]);

  return (
    <AdminPage
      title="Общая аналитика"
      description="Рабочая аналитика, считаемая на backend: объём диалогов, среднее время ответа и закрытия, эскалации и топ причин."
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
          { label: "Диалоги за период", value: String(data?.metrics?.dialogs ?? 0) },
          { label: "Новые / решённые", value: `${data?.metrics?.newDialogs ?? 0} / ${data?.metrics?.resolvedDialogs ?? 0}` },
          { label: "Среднее 1-го ответа", value: formatDuration(data?.metrics?.avgFirstResponseMs) },
          { label: "Среднее закрытия", value: formatDuration(data?.metrics?.avgCloseTimeMs) },
          { label: "Доля эскалаций", value: String(data?.metrics?.escalatedShare ?? 0) },
          { label: "Сообщений на диалог", value: String(data?.metrics?.avgMessagesPerDialog ?? 0) },
          { label: "Просроченные", value: String(data?.metrics?.overdueDialogs ?? 0), tone: "warn" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminPanel title="Распределение по дням">
          <AdminTable
            columns={[
              { key: "date", label: "День" },
              { key: "count", label: "Диалоги" },
            ]}
            rows={data?.charts?.dialogsByDay ?? []}
            rowKey={(row) => row.date}
            emptyTitle="Нет данных"
            emptyDescription="В этом периоде нет диалогов."
          />
        </AdminPanel>

        <AdminPanel title="Топ причин">
          {(data?.charts?.topTopics ?? []).length > 0 ? (
            <div className="grid gap-3">
              {data.charts.topTopics.map((item: any) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-sm font-semibold text-sky-800">{item.count}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty title="Топ причин пока пуст" description="Нужна история обращений." />
          )}
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
