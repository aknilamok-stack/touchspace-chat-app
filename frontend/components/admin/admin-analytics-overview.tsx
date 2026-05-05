"use client";

import { useEffect, useMemo, useState } from "react";
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
  AdminToolbar,
} from "@/components/admin/admin-ui";

type DistributionRow = {
  label: string;
  count: number;
};

const monthLabels = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const buildYearDistribution = (rows: Array<{ date: string; count: number }>) => {
  const monthCounts = Array.from({ length: 12 }, () => 0);

  for (const row of rows) {
    const monthIndex = Number(row.date.slice(5, 7)) - 1;

    if (monthIndex >= 0 && monthIndex < 12) {
      monthCounts[monthIndex] += row.count ?? 0;
    }
  }

  return monthCounts.map((count, index) => ({
    label: monthLabels[index],
    count,
  }));
};

export function AdminAnalyticsOverview() {
  const [preset, setPreset] = useState("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [distributionPreset, setDistributionPreset] = useState("week");
  const [distributionDateFrom, setDistributionDateFrom] = useState("");
  const [distributionDateTo, setDistributionDateTo] = useState("");
  const [distributionYear, setDistributionYear] = useState(String(new Date().getFullYear()));
  const [distributionRows, setDistributionRows] = useState<DistributionRow[]>([]);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const distributionQuery = useMemo(() => {
    if (distributionPreset === "year") {
      const safeYear = /^\d{4}$/.test(distributionYear) ? distributionYear : String(new Date().getFullYear());

      return {
        dateFrom: `${safeYear}-01-01`,
        dateTo: `${safeYear}-12-31`,
      };
    }

    return buildPeriodQuery({
      preset: distributionPreset,
      dateFrom: distributionDateFrom,
      dateTo: distributionDateTo,
    });
  }, [distributionDateFrom, distributionDateTo, distributionPreset, distributionYear]);

  const load = async () => {
    try {
      const result = await adminApi.getAnalyticsOverview(buildPeriodQuery({ preset, dateFrom, dateTo }));
      setData(result);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить аналитику");
    }
  };

  const loadDistribution = async () => {
    try {
      const result = await adminApi.getAnalyticsOverview(distributionQuery);
      const rows = result?.charts?.dialogsByDay ?? [];

      setDistributionRows(
        distributionPreset === "year"
          ? buildYearDistribution(rows)
          : rows
              .map((row: any) => ({
                label: row.date,
                count: row.count ?? 0,
              }))
              .reverse(),
      );
      setDistributionError(null);
    } catch (requestError) {
      setDistributionError(requestError instanceof Error ? requestError.message : "Не удалось загрузить распределение");
    }
  };

  useEffect(() => {
    void load();
  }, [preset, dateFrom, dateTo]);

  useEffect(() => {
    void loadDistribution();
  }, [distributionQuery, distributionPreset]);

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
        <AdminPanel title="Распределение диалогов">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <AdminPeriodSelect
              value={distributionPreset}
              onChange={setDistributionPreset}
              options={[
                { value: "week", label: "Неделя" },
                { value: "month", label: "Месяц" },
                { value: "year", label: "Год" },
                { value: "custom", label: "Произвольный" },
              ]}
            />
            {distributionPreset === "year" ? (
              <AdminInput
                type="number"
                min="2020"
                max="2100"
                value={distributionYear}
                onChange={(event) => setDistributionYear(event.target.value)}
                aria-label="Год"
                className="w-[130px]"
              />
            ) : null}
            {distributionPreset === "custom" ? (
              <>
                <AdminInput
                  type="date"
                  value={distributionDateFrom}
                  onChange={(event) => setDistributionDateFrom(event.target.value)}
                  aria-label="Дата с"
                />
                <AdminInput
                  type="date"
                  value={distributionDateTo}
                  onChange={(event) => setDistributionDateTo(event.target.value)}
                  aria-label="Дата по"
                />
              </>
            ) : null}
            <AdminButton tone="secondary" onClick={() => void loadDistribution()}>
              Обновить
            </AdminButton>
          </div>

          {distributionError ? <AdminMessage tone="error">{distributionError}</AdminMessage> : null}

          {distributionRows.length > 0 ? (
            <div className={distributionRows.length > 7 ? "max-h-[536px] overflow-y-auto pr-1" : ""}>
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 px-4 pb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                <span>{distributionPreset === "year" ? "Месяц" : "День"}</span>
                <span>Диалоги</span>
              </div>
              <div className="grid gap-3">
                {distributionRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-800"
                  >
                    <span className="font-medium">{row.label}</span>
                    <span className="font-semibold text-slate-950">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <AdminEmpty title="Нет данных" description="В этом периоде нет диалогов." />
          )}
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
