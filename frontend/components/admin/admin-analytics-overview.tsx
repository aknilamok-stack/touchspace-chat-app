"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/admin-api";
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

type AnalyticsOverview = {
  generatedAt: string;
  metrics: {
    requests: number;
    initialRequests: number;
    repeatRequests: number;
    resolvedRequests: number;
    openRequests: number;
    resolvedBacklog: number;
    escalatedRequests: number;
    escalatedSharePercent: number;
    supplierRequests: number;
    supplierOverdueRequests: number;
    categorizedRequests: number;
    uncategorizedRequests: number;
  };
  charts: {
    requestsByDay: Array<{
      date: string;
      count: number;
      label: string;
    }>;
    topTopics: Array<{
      label: string;
      count: number;
    }>;
  };
};

const formatUpdatedAt = (value?: string) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export function AdminAnalyticsOverview() {
  const [preset, setPreset] = useState("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);

  const load = async () => {
    const requestId = ++requestIdRef.current;

    try {
      setIsLoading(true);
      const result = (await adminApi.getAnalyticsOverview(
        buildPeriodQuery({ preset, dateFrom, dateTo }),
      )) as AnalyticsOverview;

      if (requestId !== requestIdRef.current) {
        return;
      }

      setData(result);
      setError(null);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось загрузить общую аналитику",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void load();
  }, [preset, dateFrom, dateTo]);

  const downloadReport = () => {
    if (!data) {
      return;
    }

    const periodLabel = buildPeriodLabel({ preset, dateFrom, dateTo });
    const { metrics } = data;

    downloadExcelReport(`touchspace-analytics-${periodLabel}`, [
      {
        title: `Обращения за период: ${periodLabel}`,
        columns: ["Показатель", "Значение"],
        rows: [
          ["Всего обращений", metrics.requests],
          ["Первичных", metrics.initialRequests],
          ["Повторных", metrics.repeatRequests],
          ["Решено из обращений периода", metrics.resolvedRequests],
          ["Ещё в работе из обращений периода", metrics.openRequests],
          ["Решено старых обращений", metrics.resolvedBacklog],
          ["Обращений с запросом поставщику", metrics.escalatedRequests],
          ["Доля обращений с поставщиком, %", metrics.escalatedSharePercent],
          ["Запросов поставщикам", metrics.supplierRequests],
          ["Просрочено поставщиками", metrics.supplierOverdueRequests],
          ["С заполненной причиной", metrics.categorizedRequests],
          ["Без заполненной причины", metrics.uncategorizedRequests],
        ],
      },
      {
        title: "Обращения по дням",
        columns: ["День", "Обращения"],
        rows: data.charts.requestsByDay.map((item) => [item.date, item.count]),
      },
    ]);
  };

  const metrics = data?.metrics;
  const equationIsValid =
    Boolean(metrics) &&
    metrics!.requests === metrics!.resolvedRequests + metrics!.openRequests;

  return (
    <AdminPage
      title="Общая аналитика"
      description="Показатели считаются по первичным и повторным обращениям клиентов, а не по дате создания карточки чата."
      actions={
        <AdminToolbar>
          <AdminPeriodSelect value={preset} onChange={setPreset} />
          {preset === "custom" ? (
            <>
              <AdminInput
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                aria-label="Дата начала периода"
              />
              <AdminInput
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                aria-label="Дата окончания периода"
              />
            </>
          ) : null}
          <AdminButton tone="secondary" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? "Обновляем…" : "Обновить"}
          </AdminButton>
          <AdminButton onClick={downloadReport} disabled={!data || isLoading}>
            Скачать Excel
          </AdminButton>
        </AdminToolbar>
      }
    >
      {error ? (
        <AdminMessage tone="error">
          {error}. Проверьте соединение и нажмите «Обновить».
        </AdminMessage>
      ) : null}

      {isLoading && !data ? (
        <AdminMessage>Собираем обращения за выбранный период…</AdminMessage>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>
              Период:{" "}
              <span className="font-semibold text-slate-900">
                {buildPeriodLabel({ preset, dateFrom, dateTo })}
              </span>
            </p>
            <p>Обновлено {formatUpdatedAt(data.generatedAt)}</p>
          </div>

          <AdminPanel title="Обращения выбранного периода">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-sm font-medium text-slate-300">Всего обращений</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">
                  {metrics!.requests}
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Первичных — {metrics!.initialRequests}, повторных — {metrics!.repeatRequests}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-950">
                  <p className="text-sm font-medium">Решено</p>
                  <p className="mt-2 text-3xl font-semibold">{metrics!.resolvedRequests}</p>
                  <p className="mt-2 text-xs leading-5 text-emerald-800">
                    Из обращений периода
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4 text-amber-950">
                  <p className="text-sm font-medium">Ещё в работе</p>
                  <p className="mt-2 text-3xl font-semibold">{metrics!.openRequests}</p>
                  <p className="mt-2 text-xs leading-5 text-amber-800">
                    Из обращений периода
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {metrics!.requests} обращений = {metrics!.resolvedRequests} решено +{" "}
              {metrics!.openRequests} ещё в работе
              {equationIsValid ? "." : ". Данные требуют повторной проверки."}
            </p>
          </AdminPanel>

          <AdminCards
            dense
            className="xl:grid-cols-3"
            items={[
              {
                label: "Решено из старых",
                value: String(metrics!.resolvedBacklog),
                hint: "Обращения начались до выбранного периода, но были решены внутри него. Они не входят в общее число обращений периода.",
              },
              {
                label: "С запросом поставщику",
                value: `${metrics!.escalatedRequests} · ${metrics!.escalatedSharePercent}%`,
                hint: "Количество и доля обращений периода, в которых менеджер направил хотя бы один запрос поставщику.",
              },
              {
                label: "Просрочки поставщика",
                value: `${metrics!.supplierOverdueRequests} из ${metrics!.supplierRequests}`,
                tone: metrics!.supplierOverdueRequests > 0 ? "warn" : "good",
                hint: "Просроченные запросы поставщикам среди запросов, относящихся к обращениям выбранного периода.",
              },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <AdminPanel title="Обращения по дням">
              {data.charts.requestsByDay.some((row) => row.count > 0) ? (
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="w-full border-separate border-spacing-y-2 text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">Дата</th>
                        <th className="px-3 py-2 text-right font-medium">Обращений</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.charts.requestsByDay].reverse().map((row) => (
                        <tr key={row.date} className="bg-slate-50 text-slate-900">
                          <td className="rounded-l-xl px-3 py-3">{row.label}</td>
                          <td className="rounded-r-xl px-3 py-3 text-right font-semibold">
                            {row.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <AdminEmpty
                  title="Обращений нет"
                  description="За выбранный период не зафиксировано первичных или повторных обращений."
                />
              )}
            </AdminPanel>

            <AdminPanel title="Причины обращений">
              {metrics!.categorizedRequests > 0 ? (
                <div className="grid gap-3">
                  {data.charts.topTopics.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      <p className="text-sm font-semibold text-sky-800">{item.count}</p>
                    </div>
                  ))}
                  <p className="text-sm leading-6 text-slate-600">
                    Классифицировано {metrics!.categorizedRequests} из {metrics!.requests}.
                    Без категории — {metrics!.uncategorizedRequests}.
                  </p>
                </div>
              ) : (
                <AdminEmpty
                  title="Причины пока не классифицированы"
                  description={`У ${metrics!.uncategorizedRequests} из ${metrics!.requests} обращений периода причина не заполнена. Названия чатов не используются как подмена причины.`}
                />
              )}
            </AdminPanel>
          </div>
        </>
      ) : null}
    </AdminPage>
  );
}
