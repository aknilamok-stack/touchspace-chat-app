"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/admin-format";
import {
  AdminCards,
  AdminEmpty,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminTable,
} from "@/components/admin/admin-ui";

export function AdminOverview() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await adminApi.getOverview();
      setData(result);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить обзор");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void load();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <AdminPage
      title="Операционный обзор TouchSpace"
      description="Главный экран для контроля регистрации новых участников, загрузки чатов и качества ответов по всей демо-пилотной системе."
    >
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <AdminCards
        items={[
          { label: "Всего диалогов", value: formatNumber(data?.metrics?.totalDialogs) },
          { label: "Новые", value: formatNumber(data?.metrics?.newDialogs) },
          { label: "В работе", value: formatNumber(data?.metrics?.inProgressDialogs) },
          {
            label: "Решённые",
            value: formatNumber(data?.metrics?.resolvedDialogs),
            tone: "good",
          },
          {
            label: "1-й ответ менеджера",
            value: formatDuration(data?.metrics?.avgFirstResponseMs),
          },
          {
            label: "Ответ поставщика",
            value: formatDuration(data?.metrics?.avgSupplierResponseMs),
          },
          {
            label: "Менеджеры online",
            value: formatNumber(data?.metrics?.onlineManagers),
            tone: "good",
          },
          {
            label: "Регистрации на проверке",
            value: formatNumber(data?.metrics?.pendingRegistrations),
            tone: "warn",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
        <AdminPanel title="Live presence менеджеров">
          {(data?.charts?.liveManagers ?? []).length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.charts.liveManagers.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-slate-900">{item.fullName}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.presenceStatus === "online"
                      ? "bg-emerald-100 text-emerald-800"
                      : item.presenceStatus === "break"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}>
                    {item.presenceStatus === "online"
                      ? "В сети"
                      : item.presenceStatus === "break"
                        ? "На перерыве"
                        : "Не в сети"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty
              title="Нет менеджеров"
              description="Когда в системе будут активные менеджеры, здесь появится live presence."
            />
          )}
        </AdminPanel>

        <AdminPanel title="Последние взятия в работу">
          {(data?.charts?.claimAuditTrail ?? []).length > 0 ? (
            <div className="grid gap-3">
              {data.charts.claimAuditTrail.map((item: any) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-900">{item.managerName}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(item.claimedAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.title}</p>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty
              title="Claim-событий пока нет"
              description="Когда менеджеры начнут брать новые диалоги в работу, здесь появится живая лента."
            />
          )}
        </AdminPanel>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <AdminPanel title="Динамика диалогов по дням">
          {(data?.charts?.dialogsByDay ?? []).length > 0 ? (
            <AdminTable
              columns={[
                { key: "date", label: "День" },
                { key: "count", label: "Диалоги" },
              ]}
              rows={data.charts.dialogsByDay}
              rowKey={(row) => row.date}
              emptyTitle="Нет данных по дням"
              emptyDescription="Когда в системе появятся диалоги, здесь будет серверная динамика."
            />
          ) : (
            <AdminEmpty
              title="Нет данных по дням"
              description="Пока в выбранном периоде нет диалогов."
            />
          )}
        </AdminPanel>

        <div className="grid gap-4">
          <AdminPanel title="Нагрузка по менеджерам">
            <div className="grid gap-3">
              {(data?.charts?.managerLoad ?? []).map((item: any) => (
                <div
                  key={item.entityId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-900">{item.entityId}</p>
                    <p className="text-sm font-semibold text-sky-800">
                      {formatNumber(item.dialogs)} диалога
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel title="Нагрузка по поставщикам">
            <div className="grid gap-3">
              {(data?.charts?.supplierLoad ?? []).map((item: any) => (
                <div
                  key={item.entityId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-900">{item.entityId}</p>
                    <p className="text-sm font-semibold text-sky-800">
                      {formatNumber(item.dialogs)} диалога
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AdminPanel>
        </div>
      </div>

      <AdminPanel title="Топ причин обращений">
        {(data?.charts?.topReasons ?? []).length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.charts.topReasons.map((item: any) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(item.count)}</p>
                <p className="mt-2 text-xs text-slate-500">Позже этот блок можно заменить AI-категоризацией обращений</p>
              </div>
            ))}
          </div>
        ) : (
          <AdminEmpty
            title="Причины пока не выделены"
            description="Как только накопится поток диалогов, backend начнёт показывать основные причины обращений."
          />
        )}
      </AdminPanel>
    </AdminPage>
  );
}
