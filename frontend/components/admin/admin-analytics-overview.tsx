"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDuration } from "@/lib/admin-format";
import { buildPeriodLabel, buildPeriodQuery, downloadExcelReport } from "@/lib/excel-report";
import {
  AdminButton,
  AdminCards,
  AdminEmpty,
  AdminInput,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminPeriodSelect,
  AdminTable,
  AdminToolbar,
} from "@/components/admin/admin-ui";

export function AdminAnalyticsOverview() {
  const [preset, setPreset] = useState("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await adminApi.getAnalyticsOverview(buildPeriodQuery({ preset, dateFrom, dateTo }));
      setData(result);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить аналитику");
    }
  };

  useEffect(() => {
    void load();
  }, [preset, dateFrom, dateTo]);

  const downloadReport = () => {
    const periodLabel = buildPeriodLabel({ preset, dateFrom, dateTo });
    const metrics = data?.metrics ?? {};

    downloadExcelReport(`touchspace-general-report-${periodLabel}`, [
      {
        title: `Общий отчет за период: ${periodLabel}`,
        columns: ["Показатель", "Значение"],
        rows: [
          ["Диалоги за период", metrics.dialogs ?? 0],
          ["Новые диалоги", metrics.newDialogs ?? 0],
          ["Решенные диалоги", metrics.resolvedDialogs ?? 0],
          ["Просроченные диалоги", metrics.overdueDialogs ?? 0],
          ["Среднее время первого ответа", formatDuration(metrics.avgFirstResponseMs)],
          ["Среднее время закрытия", formatDuration(metrics.avgCloseTimeMs)],
          ["Доля эскалаций", metrics.escalatedShare ?? 0],
          ["Сообщений на диалог", metrics.avgMessagesPerDialog ?? 0],
        ],
      },
      {
        title: "Распределение по дням",
        columns: ["День", "Диалоги"],
        rows: (data?.charts?.dialogsByDay ?? []).map((item: any) => [item.date, item.count]),
      },
      {
        title: "Топ причин",
        columns: ["Причина", "Количество"],
        rows: (data?.charts?.topTopics ?? []).map((item: any) => [item.label, item.count]),
      },
    ]);
  };

  return (
    <AdminPage
      title="Общая аналитика"
      actions={
        <AdminToolbar>
          <AdminPeriodSelect value={preset} onChange={setPreset} />
          {preset === "custom" ? (
            <>
              <AdminInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <AdminInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </>
          ) : null}
          <AdminButton tone="secondary" onClick={() => void load()}>
            Обновить
          </AdminButton>
          <AdminButton onClick={downloadReport} disabled={!data}>
            Скачать Excel
          </AdminButton>
        </AdminToolbar>
      }
    >
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <AdminCards
        dense
        className="xl:grid-cols-4"
        items={[
          { label: "Диалоги за период", value: String(data?.metrics?.dialogs ?? 0) },
          { label: "Новые / решённые", value: `${data?.metrics?.newDialogs ?? 0} / ${data?.metrics?.resolvedDialogs ?? 0}` },
          { label: "Среднее 1-го ответа", value: formatDuration(data?.metrics?.avgFirstResponseMs) },
          { label: "Среднее закрытия", value: formatDuration(data?.metrics?.avgCloseTimeMs) },
          {
            label: "Доля эскалаций",
            value: String(data?.metrics?.escalatedShare ?? 0),
            hint: "Доля эскалаций показывает, какая часть диалогов за выбранный период была передана поставщику или потребовала подключения поставщика.",
          },
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
