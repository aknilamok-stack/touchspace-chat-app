"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime, formatNumber } from "@/lib/admin-format";
import {
  AdminButton,
  AdminInput,
  AdminMessage,
  AdminPage,
  AdminSelect,
  AdminStatusBadge,
  AdminTable,
} from "@/components/admin/admin-ui";

type SupplierCompany = {
  supplierScopeId: string;
  supplierCompanyName: string;
  employeesCount: number;
  employees: Array<{
    id: string;
    fullName: string;
    role: string;
  }>;
};

type SupplierApiKey = {
  id: string;
  name: string;
  supplierScopeId: string;
  supplierCompanyName: string;
  keyPreview: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

const buildInstruction = (apiKey: string) => `Base URL:
https://chat.touchspace.biz/api/external/supplier

Заголовок для всех запросов:
Authorization: Bearer ${apiKey}

Доступные запросы:
GET /api/external/supplier/employees
GET /api/external/supplier/analytics
GET /api/external/supplier/analytics/employees
GET /api/external/supplier/dialogs
GET /api/external/supplier/dialogs/{dialogId}/messages

Примеры с периодом:
GET /api/external/supplier/analytics?dateFrom=2026-06-01&dateTo=2026-06-15
GET /api/external/supplier/analytics/employees?dateFrom=2026-06-01&dateTo=2026-06-15
GET /api/external/supplier/dialogs?dateFrom=2026-06-01&dateTo=2026-06-15`;

export function AdminSupplierApiKeys() {
  const [payload, setPayload] = useState<{
    companies: SupplierCompany[];
    items: SupplierApiKey[];
  } | null>(null);
  const [form, setForm] = useState({
    supplierScopeId: "",
    name: "",
  });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<null | {
    apiKey: string;
    supplierCompanyName: string;
  }>(null);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const result = await adminApi.getSupplierApiKeys();
      setPayload(result);
      setError(null);

      if (!form.supplierScopeId && result?.companies?.[0]?.supplierScopeId) {
        setForm((current) => ({
          ...current,
          supplierScopeId: result.companies[0].supplierScopeId,
        }));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить API-ключи");
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const companies = payload?.companies ?? [];
  const keys = useMemo(() => {
    const items = payload?.items ?? [];
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [item.name, item.supplierCompanyName, item.keyPreview]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [payload, query]);

  const selectedCompany = companies.find(
    (company) => company.supplierScopeId === form.supplierScopeId,
  );
  const activeKeysCount = (payload?.items ?? []).filter((item) => item.isActive).length;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    setCreatedKey(null);

    try {
      const result = await adminApi.createSupplierApiKey({
        supplierScopeId: form.supplierScopeId,
        name: form.name,
      });

      setCreatedKey({
        apiKey: result.apiKey,
        supplierCompanyName: result.item.supplierCompanyName,
      });
      setInstructionOpen(false);
      setMessage("API-ключ создан. Скопируй его сейчас, потом он целиком не показывается.");
      setForm((current) => ({ ...current, name: "" }));
      await loadKeys();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать API-ключ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setMessage(null);
    setError(null);

    try {
      await adminApi.revokeSupplierApiKey(id);
      setMessage("API-ключ отключён");
      await loadKeys();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось отключить ключ");
    } finally {
      setRevokingId(null);
    }
  };

  const copyText = async (text: string, successMessage: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setError("Буфер обмена недоступен в этом браузере");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Не удалось скопировать");
    }
  };

  return (
    <AdminPage
      title="API поставщиков"
      description="Выдача ключей для Битрикса поставщиков. Ключ привязан к компании поставщика и автоматически видит новых сотрудников этой компании."
    >
      {message ? <AdminMessage tone="success">{message}</AdminMessage> : null}
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      {createdKey ? (
        <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-[0_16px_44px_rgba(16,185,129,0.12)]">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Новый ключ для {createdKey.supplierCompanyName}
          </p>
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-mono text-sm text-slate-950">
            {createdKey.apiKey}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <AdminButton
              type="button"
              onClick={() => void copyText(createdKey.apiKey, "Ключ скопирован")}
            >
              Скопировать ключ
            </AdminButton>
            <AdminButton
              type="button"
              tone="secondary"
              onClick={() => setInstructionOpen(true)}
            >
              Открыть инструкцию
            </AdminButton>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Компаний поставщиков
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {formatNumber(companies.length)}
          </p>
        </article>
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Активных ключей
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {formatNumber(activeKeysCount)}
          </p>
        </article>
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Все ключи
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {formatNumber(payload?.items.length ?? 0)}
          </p>
        </article>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
        <form onSubmit={handleCreate} className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_auto]">
          <AdminSelect
            value={form.supplierScopeId}
            onChange={(event) =>
              setForm((current) => ({ ...current, supplierScopeId: event.target.value }))
            }
            required
          >
            {companies.length === 0 ? (
              <option value="">Нет поставщиков</option>
            ) : null}
            {companies.map((company) => (
              <option key={company.supplierScopeId} value={company.supplierScopeId}>
                {company.supplierCompanyName} · сотрудников: {company.employeesCount}
              </option>
            ))}
          </AdminSelect>
          <AdminInput
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder={
              selectedCompany
                ? `Например: Bitrix ${selectedCompany.supplierCompanyName}`
                : "Название ключа"
            }
          />
          <AdminButton type="submit" disabled={submitting || companies.length === 0}>
            {submitting ? "Создаю..." : "Создать ключ"}
          </AdminButton>
        </form>
        {selectedCompany ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-950">{selectedCompany.supplierCompanyName}</p>
            <p className="mt-2">
              Ключ будет видеть всех текущих и будущих сотрудников этой компании. Сейчас в компании:{" "}
              {selectedCompany.employees.map((employee) => employee.fullName).join(", ")}.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
        <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <AdminInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по поставщику, названию или хвостику ключа"
          />
          <AdminButton type="button" tone="secondary" onClick={() => void loadKeys()}>
            Обновить
          </AdminButton>
        </div>
        <AdminTable
          columns={[
            { key: "name", label: "Название" },
            { key: "supplierCompanyName", label: "Поставщик" },
            { key: "keyPreview", label: "Ключ" },
            { key: "isActive", label: "Статус" },
            { key: "lastUsedAt", label: "Последний запрос" },
            { key: "createdAt", label: "Создан" },
            { key: "actions", label: "Действия" },
          ]}
          rows={keys}
          rowKey={(row) => row.id}
          emptyTitle="Ключей пока нет"
          emptyDescription="Выберите поставщика выше и создайте первый ключ для его Битрикса."
          renderCell={(row: SupplierApiKey, key) => {
            if (key === "isActive") {
              return <AdminStatusBadge value={row.isActive ? "active" : "blocked"} />;
            }

            if (key === "lastUsedAt") {
              return row.lastUsedAt ? formatDateTime(row.lastUsedAt) : "не использовался";
            }

            if (key === "createdAt") {
              return formatDateTime(row.createdAt);
            }

            if (key === "actions") {
              return row.isActive ? (
                <AdminButton
                  type="button"
                  tone="danger"
                  disabled={revokingId === row.id}
                  onClick={() => void handleRevoke(row.id)}
                >
                  {revokingId === row.id ? "Отключаю..." : "Отключить"}
                </AdminButton>
              ) : (
                "Отключён"
              );
            }

            return row[key as keyof SupplierApiKey] as string;
          }}
        />
      </section>
      {instructionOpen && createdKey ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Инструкция для Битрикса
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                  API поставщика {createdKey.supplierCompanyName}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Передайте поставщику этот текст. Ключ дает доступ только к данным его компании.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInstructionOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-2xl leading-none text-slate-500 transition hover:bg-slate-100"
                aria-label="Закрыть инструкцию"
              >
                ×
              </button>
            </div>
            <pre className="mt-5 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-50">
              {buildInstruction(createdKey.apiKey)}
            </pre>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <AdminButton
                type="button"
                tone="secondary"
                onClick={() => setInstructionOpen(false)}
              >
                Закрыть
              </AdminButton>
              <AdminButton
                type="button"
                onClick={() =>
                  void copyText(
                    buildInstruction(createdKey.apiKey),
                    "Инструкция для Битрикса скопирована",
                  )
                }
              >
                Скопировать
              </AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
