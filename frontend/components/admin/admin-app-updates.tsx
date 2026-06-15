"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/admin-format";
import {
  AdminButton,
  AdminInput,
  AdminMessage,
  AdminPage,
} from "@/components/admin/admin-ui";

const defaultForm = {
  latestVersion: "0.1.1",
  macUrl: "https://chat.touchspace.biz/downloads/TouchSpace-Workspace-mac.dmg",
  windowsUrl: "https://chat.touchspace.biz/downloads/touchspace-windows.exe",
  title: "Доступно обновление TouchSpace Workspace",
  message: "Обновите приложение, чтобы получить последние исправления уведомлений и стабильности.",
  releaseNotes: "",
  required: false,
};

export function AdminAppUpdates() {
  const [form, setForm] = useState(defaultForm);
  const [payload, setPayload] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"save" | "notify" | null>(null);

  const loadUpdate = async () => {
    try {
      const result = await adminApi.getDesktopAppUpdate();
      setPayload(result);
      setForm({
        latestVersion: result.latestVersion ?? defaultForm.latestVersion,
        macUrl: result.macUrl ?? defaultForm.macUrl,
        windowsUrl: result.windowsUrl ?? defaultForm.windowsUrl,
        title: result.title ?? defaultForm.title,
        message: result.message ?? defaultForm.message,
        releaseNotes: result.releaseNotes ?? "",
        required: Boolean(result.required),
      });
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить настройки обновления");
    }
  };

  useEffect(() => {
    void loadUpdate();
  }, []);

  const saveUpdate = async (notifyNow: boolean) => {
    setSubmitting(notifyNow ? "notify" : "save");
    setMessage(null);
    setError(null);

    try {
      const result = await adminApi.updateDesktopAppUpdate({
        ...form,
        notifyNow,
      });
      setPayload(result);
      setMessage(
        notifyNow
          ? "Уведомление об обновлении отправлено"
          : "Настройки обновления сохранены",
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить обновление");
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveUpdate(false);
  };

  return (
    <AdminPage
      title="Обновление приложения"
      description="Настройка уведомления для установленного приложения TouchSpace Workspace на Mac и Windows."
    >
      {message ? <AdminMessage tone="success">{message}</AdminMessage> : null}
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Последняя версия
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">
            {payload?.latestVersion ?? form.latestVersion}
          </p>
        </article>
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Последняя отправка
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {payload?.notifiedAt ? formatDateTime(payload.notifiedAt) : "ещё не отправляли"}
          </p>
        </article>
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Режим
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {form.required ? "Обязательное обновление" : "Мягкое уведомление"}
          </p>
        </article>
      </section>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_44px_rgba(148,163,184,0.12)]"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Версия
            <AdminInput
              value={form.latestVersion}
              onChange={(event) =>
                setForm((current) => ({ ...current, latestVersion: event.target.value }))
              }
              placeholder="0.1.1"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700 xl:col-span-2">
            Заголовок
            <AdminInput
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              required
            />
          </label>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Текст уведомления
          <textarea
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({ ...current, message: event.target.value }))
            }
            className="min-h-28 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
            required
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Что изменилось
          <textarea
            value={form.releaseNotes}
            onChange={(event) =>
              setForm((current) => ({ ...current, releaseNotes: event.target.value }))
            }
            className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
            placeholder="Например: улучшили уведомления и стабильность приложения"
          />
        </label>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Ссылка Mac
            <AdminInput
              value={form.macUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, macUrl: event.target.value }))
              }
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Ссылка Windows
            <AdminInput
              value={form.windowsUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, windowsUrl: event.target.value }))
              }
              required
            />
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.required}
            onChange={(event) =>
              setForm((current) => ({ ...current, required: event.target.checked }))
            }
            className="h-4 w-4 accent-sky-600"
          />
          Обязательное обновление
        </label>

        <div className="flex flex-wrap justify-end gap-3">
          <AdminButton type="submit" tone="secondary" disabled={Boolean(submitting)}>
            {submitting === "save" ? "Сохраняю..." : "Сохранить"}
          </AdminButton>
          <AdminButton
            type="button"
            disabled={Boolean(submitting)}
            onClick={() => void saveUpdate(true)}
          >
            {submitting === "notify" ? "Отправляю..." : "Сохранить и отправить уведомление"}
          </AdminButton>
        </div>
      </form>
    </AdminPage>
  );
}
