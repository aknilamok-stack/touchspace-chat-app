"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { readDesktopRuntimeMeta } from "@/lib/runtime";

type DesktopUpdatePayload = {
  updateAvailable: boolean;
  shouldNotify?: boolean;
  required: boolean;
  currentVersion: string;
  latestVersion: string;
  title: string;
  message: string;
  releaseNotes?: string;
  downloadUrl: string;
  notificationToken: string;
};

const dismissedStorageKey = "touchspace-desktop-update-dismissed-token";

export function DesktopUpdatePrompt() {
  const [update, setUpdate] = useState<DesktopUpdatePayload | null>(null);
  const checkingRef = useRef(false);

  const openDownload = useCallback(async () => {
    if (!update?.downloadUrl) {
      return;
    }

    if (typeof window !== "undefined" && window.touchspaceDesktop?.openExternal) {
      await window.touchspaceDesktop.openExternal(update.downloadUrl);
      return;
    }

    window.open(update.downloadUrl, "_blank", "noopener,noreferrer");
  }, [update]);

  const checkUpdate = useCallback(async (force = false) => {
    if (checkingRef.current) {
      return;
    }

    const meta = await readDesktopRuntimeMeta();

    if (!meta?.isDesktopShell) {
      return;
    }

    checkingRef.current = true;

    try {
      const version = meta.version?.trim() || "0.1.0";
      const platform = meta.platform?.trim() || "unknown";
      const url = new URL(apiUrl("/app-updates/desktop/check"));
      url.searchParams.set("version", version);
      url.searchParams.set("platform", platform);

      const response = await fetch(url.toString(), { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as DesktopUpdatePayload;
      const dismissedToken =
        typeof window !== "undefined"
          ? window.localStorage.getItem(dismissedStorageKey)
          : null;

      if (
        payload.updateAvailable &&
        (force || payload.shouldNotify || payload.required) &&
        (force || payload.required || dismissedToken !== payload.notificationToken)
      ) {
        setUpdate(payload);
      }
    } catch {
      return;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkUpdate();
    const interval = window.setInterval(() => void checkUpdate(), 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [checkUpdate]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.touchspaceDesktop?.onCheckForUpdate) {
      return;
    }

    window.touchspaceDesktop.onCheckForUpdate(() => {
      void checkUpdate(true);
    });
  }, [checkUpdate]);

  if (!update) {
    return null;
  }

  const postpone = () => {
    if (update.required) {
      return;
    }

    window.localStorage.setItem(dismissedStorageKey, update.notificationToken);
    setUpdate(null);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div className="w-full max-w-lg rounded-[28px] border border-sky-100 bg-white p-6 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              TouchSpace Workspace
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {update.title}
            </h2>
          </div>
          {!update.required ? (
            <button
              type="button"
              onClick={postpone}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-2xl leading-none text-slate-500 transition hover:bg-slate-100"
              aria-label="Закрыть обновление"
            >
              ×
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">{update.message}</p>

        {update.releaseNotes?.trim() ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {update.releaseNotes}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Ваша версия: {update.currentVersion}. Новая версия: {update.latestVersion}.
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {!update.required ? (
            <button
              type="button"
              onClick={postpone}
              className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
            >
              Позже
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void openDownload()}
            className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Обновить приложение
          </button>
        </div>
      </div>
    </div>
  );
}
