"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/admin-format";
import {
  AdminButton,
  AdminInput,
  AdminMessage,
  AdminPanel,
  AdminSelect,
  getStatusLabel,
} from "@/components/admin/admin-ui";

const attentionCards = [
  {
    key: "dialogsWithoutAnswer",
    label: "Ждут менеджера больше 2 минут",
    detail: "активные диалоги сейчас",
    tone: "bg-rose-50 border-rose-200 text-rose-900",
  },
  {
    key: "supplierOverdue",
    label: "Активные просрочки поставщика",
    detail: "незакрытые запросы сейчас",
    tone: "bg-amber-50 border-amber-200 text-amber-900",
  },
] as const;

const kpiTone: Record<string, string> = {
  default: "border-slate-200 bg-white",
  good: "border-emerald-200 bg-emerald-50/70",
  warn: "border-amber-200 bg-amber-50/80",
};

const teamStatusMeta = {
  online: {
    label: "Онлайн",
    badge: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
  },
  break: {
    label: "Перерыв",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  offline: {
    label: "Оффлайн",
    badge: "bg-slate-200 text-slate-700",
    dot: "bg-slate-400",
  },
};

const compactEmpty = (text: string) => (
  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
    {text}
  </p>
);

const periodOptions = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "custom", label: "Произвольный" },
];

const ratingMeta: Record<number, { emoji: string; label: string; tone: string }> = {
  3: {
    emoji: "😄",
    label: "Хорошо",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  2: {
    emoji: "😐",
    label: "Нормально",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  1: {
    emoji: "☹️",
    label: "Плохо",
    tone: "border-rose-200 bg-rose-50 text-rose-900",
  },
};

export function AdminOverview() {
  const [period, setPeriod] = useState("week");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [showRatingDetails, setShowRatingDetails] = useState(false);

  const load = async () => {
    try {
      const result = await adminApi.getOverview({
        preset: period === "custom" ? undefined : period,
        dateFrom: period === "custom" ? dateFrom || undefined : undefined,
        dateTo: period === "custom" ? dateTo || undefined : undefined,
      });
      setData(result);
      setUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить обзор");
    }
  };

  useEffect(() => {
    void load();
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void load();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [period, dateFrom, dateTo]);

  const currentKpis = useMemo(
    () => [
      {
        label: "Ждут ответа менеджера",
        value: formatNumber(data?.metrics?.waitingManagerDialogs),
        hint: "последним написал клиент",
        tone: "warn",
      },
      {
        label: "Ждут ответа поставщика",
        value: formatNumber(data?.metrics?.waitingSupplierDialogs),
        hint: "есть активный запрос поставщику",
        tone: "warn",
      },
      {
        label: "Ждут ответа клиента",
        value: formatNumber(data?.metrics?.waitingClientDialogs),
        hint: "последним ответил менеджер",
        tone: "default",
      },
      {
        label: "Менеджеров онлайн",
        value: formatNumber(data?.metrics?.onlineManagers),
        hint: "доступны сейчас",
        tone: "good",
      },
    ],
    [data],
  );

  const periodKpis = useMemo(
    () => [
      {
        label: "Поступило",
        value: formatNumber(data?.metrics?.requestsInPeriod),
        hint: "первичные и повторные обращения",
        tone: "default",
      },
      {
        label: "Решено из поступивших",
        value: formatNumber(data?.metrics?.resolvedIncomingRequests),
        hint: "из обращений выбранного периода",
        tone: "good",
      },
      {
        label: "Осталось из поступивших",
        value: formatNumber(data?.metrics?.unresolvedIncomingRequests),
        hint: "ещё не решены",
        tone: "warn",
      },
      {
        label: "Закрыто из старого остатка",
        value: formatNumber(data?.metrics?.resolvedOldBacklogInPeriod),
        hint: "поступили до выбранного периода",
        tone: "good",
      },
    ],
    [data],
  );

  const chartPoints = data?.charts?.dialogsByDay ?? [];
  const maxChartValue = Math.max(...chartPoints.map((item: any) => item.count), 1);
  const activityMetrics = [
    {
      label: "Торговых точек обратились",
      value: formatNumber(data?.metrics?.activeTradePoints),
      hint: "за выбранный период",
    },
    {
      label: "Среднее обращений в день",
      value: formatNumber(data?.metrics?.avgDialogsPerDay),
      hint: "за выбранный период",
    },
    {
      label: "Запросов поставщикам создано",
      value: formatNumber(data?.metrics?.totalSupplierRequests),
      hint: "включая запросы из старых диалогов",
    },
  ];
  const ratings = data?.ratings ?? {};
  const ratingSummary = [
    {
      rating: 3,
      value: ratings.good ?? data?.metrics?.ratingsGood ?? 0,
    },
    {
      rating: 2,
      value: ratings.neutral ?? data?.metrics?.ratingsNeutral ?? 0,
    },
    {
      rating: 1,
      value: ratings.bad ?? data?.metrics?.ratingsBad ?? 0,
    },
  ];

  return (
    <section className="grid gap-4">
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <section className="rounded-[24px] border border-slate-200/80 bg-white/92 px-5 py-4 shadow-[0_16px_40px_rgba(148,163,184,0.14)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[30px] font-semibold tracking-tight text-slate-950">Главная</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
              <span>Период:</span>
              <AdminSelect
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="rounded-none border-0 bg-transparent px-0 py-0 text-xs font-medium focus:bg-transparent"
                aria-label="Период главной"
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            {period === "custom" ? (
              <>
                <AdminInput
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="rounded-full px-3 py-1.5 text-xs"
                  aria-label="Дата с"
                />
                <AdminInput
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="rounded-full px-3 py-1.5 text-xs"
                  aria-label="Дата по"
                />
              </>
            ) : null}
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              Live: автообновление 10 сек
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
              Обновлено: {formatDateTime(updatedAt)}
            </span>
            <AdminButton tone="secondary" onClick={() => void load()}>
              Обновить
            </AdminButton>
          </div>
        </div>
      </section>

      <AdminPanel title="Требует внимания сейчас">
        <div className="grid gap-3 md:grid-cols-2">
          {attentionCards.map((item) => (
            <div key={item.key} className={`rounded-[22px] border px-4 py-4 ${item.tone}`}>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {formatNumber(data?.attention?.[item.key] ?? 0)}
              </p>
              <p className="mt-2 text-xs opacity-75">{item.detail}</p>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel title="Текущая очередь">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {currentKpis.map((item) => (
            <article
              key={item.label}
              className={`rounded-[22px] border px-5 py-5 shadow-[0_10px_28px_rgba(148,163,184,0.08)] ${kpiTone[item.tone]}`}
            >
              <p className="text-sm font-medium text-slate-600">{item.label}</p>
              <p className="mt-4 text-[34px] font-semibold tracking-tight text-slate-950">{item.value}</p>
              <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
            </article>
          ))}
        </section>
      </AdminPanel>

      <AdminPanel title="За выбранный период">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {periodKpis.map((item) => (
            <article
              key={item.label}
              className={`rounded-[22px] border px-5 py-5 shadow-[0_10px_28px_rgba(148,163,184,0.08)] ${kpiTone[item.tone]}`}
            >
              <p className="text-sm font-medium text-slate-600">{item.label}</p>
              <p className="mt-4 text-[34px] font-semibold tracking-tight text-slate-950">{item.value}</p>
              <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
            </article>
          ))}
        </section>
      </AdminPanel>

      <AdminPanel title="Охват за выбранный период">
        <div className="grid gap-3 md:grid-cols-3">
          {activityMetrics.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-medium text-slate-600">{item.label}</p>
              <p className="mt-3 text-[30px] font-semibold tracking-tight text-slate-950">{item.value}</p>
              <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel
        title="Оценки клиентов"
        actions={
          <AdminButton
            tone="secondary"
            onClick={() => setShowRatingDetails((current) => !current)}
          >
            {showRatingDetails ? "Скрыть" : "Подробнее"}
          </AdminButton>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-sm font-medium text-slate-600">Всего оценок за период</p>
              <div className="mt-3 flex items-end gap-3">
                <p className="text-[38px] font-semibold tracking-tight text-slate-950">
                  {formatNumber(ratings.total ?? data?.metrics?.ratingsTotal ?? 0)}
                </p>
                <p className="pb-2 text-sm text-slate-500">
                  средняя:{" "}
                  <span className="font-semibold text-slate-900">
                    {ratings.total ? Number(ratings.avgRating ?? 0).toFixed(1) : "—"}
                  </span>
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {ratingSummary.map((item) => {
                const meta = ratingMeta[item.rating];

                return (
                  <div
                    key={item.rating}
                    className={`rounded-[22px] border px-4 py-4 ${meta.tone}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-3xl leading-none">{meta.emoji}</span>
                      <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold">
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-4 text-[32px] font-semibold tracking-tight">
                      {formatNumber(item.value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {showRatingDetails ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <div className="overflow-hidden rounded-[20px] border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1.2fr)_80px_80px_80px_90px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                  <span>Менеджер</span>
                  <span>😄</span>
                  <span>😐</span>
                  <span>☹️</span>
                  <span>Средняя</span>
                </div>
                <div className="grid">
                  {(ratings.managers ?? []).length > 0 ? (
                    ratings.managers.map((item: any) => (
                      <div
                        key={item.managerId}
                        className="grid grid-cols-[minmax(0,1.2fr)_80px_80px_80px_90px] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-950">{item.managerName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Всего оценок: {formatNumber(item.total)}
                          </p>
                        </div>
                        <span className="font-semibold text-emerald-700">{formatNumber(item.good)}</span>
                        <span className="font-semibold text-amber-700">{formatNumber(item.neutral)}</span>
                        <span className="font-semibold text-rose-700">{formatNumber(item.bad)}</span>
                        <span className="font-semibold text-slate-900">
                          {item.total ? Number(item.avgRating ?? 0).toFixed(1) : "—"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-5 text-sm text-slate-500">
                      За выбранный период оценок пока нет.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">Последние оценки</p>
                  <Link href="/admin/dialogs" className="text-xs font-semibold text-sky-700 hover:text-sky-900">
                    Все диалоги
                  </Link>
                </div>
                <div className="mt-3 grid gap-2">
                  {(ratings.recent ?? []).length > 0 ? (
                    ratings.recent.map((item: any) => {
                      const meta = ratingMeta[item.rating as 1 | 2 | 3] ?? ratingMeta[2];

                      return (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {item.clientName ?? item.title}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                Менеджер: {item.managerName}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                Чат: {item.title}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>
                              {meta.emoji} {meta.label}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-400">
                            {formatDateTime(item.ratingSubmittedAt ?? item.resolvedAt ?? item.createdAt)}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    compactEmpty("Пока нет оцененных диалогов за выбранный период.")
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </AdminPanel>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <AdminPanel title="Проблемные диалоги сейчас">
          {(data?.lists?.problematicDialogs ?? []).length > 0 ? (
            <div className="grid gap-3">
              {data.lists.problematicDialogs.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        Компания: {item.supplierCompanyName ?? item.supplierName ?? "не указана"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Поставщик: {item.supplierContactName ?? "не указан"}
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800">
                      {item.issue}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Менеджер: {item.managerName}</span>
                    <span>Статус: {getStatusLabel(item.status)}</span>
                    <span>Диалог: {item.title}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            compactEmpty("Сейчас критичных диалогов не найдено.")
          )}
        </AdminPanel>

        <AdminPanel title="Команда: сейчас и за период">
          {(data?.lists?.team ?? []).length > 0 ? (
            <div className="overflow-x-auto rounded-[20px] border border-slate-200">
              <div className="grid min-w-[680px] grid-cols-[minmax(0,1.3fr)_100px_100px_110px_80px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                <span>Менеджер</span>
                <span>Статус</span>
                <span>В работе</span>
                <span>Решено за период</span>
                <span>SLA-риск</span>
              </div>
              <div className="grid">
                {data.lists.team.map((item: any) => {
                  const meta = teamStatusMeta[item.status as keyof typeof teamStatusMeta] ?? teamStatusMeta.offline;

                  return (
                    <div
                      key={item.id}
                      className="grid min-w-[680px] grid-cols-[minmax(0,1.3fr)_100px_100px_110px_80px] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{item.fullName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.overloaded ? "Есть перегрузка" : "Нагрузка в норме"}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${meta.badge}`}>
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center font-medium text-slate-900">
                        {item.dialogsInProgress}
                      </div>
                      <div className="flex items-center font-medium text-slate-900">
                        {item.resolvedInRange}
                      </div>
                      <div className="flex items-center font-medium text-slate-900">
                        {item.slaRisk > 0 ? item.slaRisk : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            compactEmpty("Когда менеджеры начнут работать в системе, здесь появится живая загрузка команды.")
          )}
        </AdminPanel>
      </section>

      <AdminPanel title="Динамика обращений за выбранный период">
        {chartPoints.length > 0 ? (
          <div className="grid gap-5">
            <div className="grid h-[210px] grid-cols-7 items-end gap-3">
              {chartPoints.map((item: any) => {
                const barHeight = Math.max((item.count / maxChartValue) * 100, item.count > 0 ? 10 : 4);

                return (
                  <div key={item.date} className="flex h-full flex-col justify-end gap-3">
                    <div className="flex-1 rounded-[18px] bg-slate-100 p-2">
                      <div
                        className="w-full rounded-[14px] bg-[linear-gradient(180deg,#0A84FF_0%,#38BDF8_100%)]"
                        style={{ height: `${barHeight}%`, minHeight: item.count > 0 ? "18px" : "6px" }}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-semibold text-slate-950">{item.count}</p>
                      <p className="text-xs text-slate-500">{item.date.slice(5).replace("-", ".")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-slate-500">
              Короткий обзор тренда по входящим диалогам. Детальная аналитика вынесена в отдельные вкладки.
            </p>
          </div>
        ) : (
          compactEmpty("За выбранный период пока нет движения по диалогам.")
        )}
      </AdminPanel>
    </section>
  );
}
