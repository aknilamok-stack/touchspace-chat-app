"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDuration, formatDateTime } from "@/lib/admin-format";
import { buildPeriodQuery } from "@/lib/excel-report";
import {
  AdminButton,
  AdminCards,
  AdminInput,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminPeriodSelect,
  AdminSelect,
  AdminStatusBadge,
  AdminTable,
  AdminToolbar,
} from "@/components/admin/admin-ui";

export function AdminSuppliersAnalytics() {
  const [preset, setPreset] = useState("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [payload, setPayload] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportSupplierName, setExportSupplierName] = useState("");
  const [exportSupplierOptions, setExportSupplierOptions] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const load = async () => {
    try {
      const result = await adminApi.getSuppliersAnalytics({
        ...buildPeriodQuery({ preset, dateFrom, dateTo }),
        companyName,
      });
      setPayload(result);
      setError(null);
      setSelectedId((current) =>
        current && result.items.some((item: any) => item.id === current)
          ? current
          : result.items[0]?.id ?? null,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить аналитику поставщиков");
    }
  };

  useEffect(() => {
    void load();
  }, [preset, dateFrom, dateTo, companyName]);

  useEffect(() => {
    void adminApi
      .getSupplierDialogExportOptions()
      .then(setExportSupplierOptions)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось загрузить список поставщиков",
        ),
      );
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void adminApi
      .getSupplierAnalyticsDetail(selectedId, buildPeriodQuery({ preset, dateFrom, dateTo }))
      .then((result) => setDetail(result))
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть поставщика"),
      );
  }, [selectedId, preset, dateFrom, dateTo]);

  const downloadDialogExport = async () => {
    try {
      setIsExporting(true);
      setError(null);
      const { blob, filename } = await adminApi.downloadSupplierDialogExport({
        ...buildPeriodQuery({ preset, dateFrom, dateTo }),
        supplierName: exportSupplierName,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сформировать Excel-отчёт",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AdminPage
      title="Аналитика по поставщикам"
      description="Рабочий срез эффективности поставщиков: сколько запросов получили, сколько ответили и где нарушают SLA."
      actions={
        <AdminToolbar>
          <AdminPeriodSelect value={preset} onChange={setPreset} />
          <AdminSelect value={companyName} onChange={(event) => setCompanyName(event.target.value)}>
            <option value="">Все компании</option>
            {(payload?.companies ?? []).map((company: string) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </AdminSelect>
          {preset === "custom" ? (
            <>
              <AdminInput type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <AdminInput type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </>
          ) : null}
          <AdminButton tone="secondary" onClick={() => void load()}>
            Обновить
          </AdminButton>
        </AdminToolbar>
      }
    >
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <AdminPanel title="Выгрузка диалогов поставщиков">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-2">
            <label htmlFor="supplier-dialog-export" className="text-sm font-medium text-slate-900">
              Поставщик для отчёта
            </label>
            <AdminSelect
              id="supplier-dialog-export"
              value={exportSupplierName}
              onChange={(event) => setExportSupplierName(event.target.value)}
            >
              <option value="">Все поставщики</option>
              {exportSupplierOptions.map((supplierName) => (
                <option key={supplierName} value={supplierName}>
                  {supplierName}
                </option>
              ))}
            </AdminSelect>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Период берётся из фильтра страницы. Excel содержит сводку, список запросов и переписку от запроса менеджера до решения поставщиком. Для открытых запросов — до момента формирования.
            </p>
          </div>
          <AdminButton
            onClick={() => void downloadDialogExport()}
            disabled={isExporting}
          >
            {isExporting ? "Формируем Excel…" : "Сформировать Excel"}
          </AdminButton>
        </div>
      </AdminPanel>

      <AdminCards
        items={[
          { label: "Поставщиков в отчёте", value: String(payload?.items?.length ?? 0) },
          {
            label: "Всего запросов",
            value: String((payload?.items ?? []).reduce((sum: number, item: any) => sum + (item.receivedRequests ?? 0), 0)),
          },
          {
            label: "SLA просрочки",
            value: String((payload?.items ?? []).reduce((sum: number, item: any) => sum + (item.slaBreaches ?? 0), 0)),
            tone: "warn",
          },
        ]}
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.9fr)]">
        <AdminPanel title={companyName ? `Поставщики компании ${companyName}` : "Поставщики"}>
          <AdminTable
            columns={[
              { key: "fullName", label: "Поставщик" },
              { key: "companyName", label: "Компания" },
              { key: "receivedRequests", label: "Получено" },
              { key: "answeredRequests", label: "Ответили" },
              { key: "avgResponseMs", label: "Средний ответ" },
              { key: "slaBreaches", label: "SLA" },
              { key: "relatedDialogs", label: "Диалоги" },
            ]}
            rows={payload?.items ?? []}
            rowKey={(row) => row.id}
            selectedRowKey={selectedId}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle="Нет аналитики по поставщикам"
            emptyDescription="Пока нет данных за выбранный период."
            renderCell={(row, key) => {
              if (key === "avgResponseMs") {
                return formatDuration(row.avgResponseMs);
              }

              if (key === "companyName") {
                return row.companyName || "не указана";
              }

              return row[key];
            }}
          />
        </AdminPanel>

        <AdminPanel title="Карточка поставщика">
          {detail ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p><span className="font-medium text-slate-950">Имя:</span> {detail.supplier.fullName}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Компания:</span> {detail.supplier.companyName || "не указана"}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Статус:</span> <AdminStatusBadge value={detail.supplier.status} /></p>
                <p className="mt-1"><span className="font-medium text-slate-950">Получено:</span> {detail.metrics.receivedRequests}</p>
                <p className="mt-1"><span className="font-medium text-slate-950">Средний ответ:</span> {formatDuration(detail.metrics.avgResponseMs)}</p>
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-slate-950">Последние запросы</p>
                {(detail.requests ?? []).map((request: any) => (
                  <div key={request.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-slate-900">{request.ticket.title}</p>
                      <AdminStatusBadge value={request.status} />
                    </div>
                    <p className="mt-2 leading-6">{request.requestText}</p>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(request.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Выберите поставщика слева.</p>
          )}
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
