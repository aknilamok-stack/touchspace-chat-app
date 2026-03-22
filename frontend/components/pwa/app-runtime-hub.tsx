"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import { readAuthSession } from "@/lib/auth";
import {
  enablePushNotifications,
  getInternalProfileId,
  sendTestPush,
} from "@/lib/push-notifications";
import { usePathname } from "next/navigation";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NotificationSettingsPayload = {
  counters?: Record<string, number>;
};

export function AppRuntimeHub() {
  const pathname = usePathname();
  const [isInstalled, setIsInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [subscriptionState, setSubscriptionState] = useState<"idle" | "subscribing" | "enabled" | "error">("idle");
  const [message, setMessage] = useState("");
  const [counters, setCounters] = useState<Record<string, number>>({});

  const session = useMemo(() => readAuthSession(), [pathname]);
  const isInternalRole = session?.role === "admin" || session?.role === "manager" || session?.role === "supplier";
  const shouldShow = isInternalRole && pathname !== "/login" && pathname !== "/client";

  const profileId = getInternalProfileId(session);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!shouldShow || typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Не удалось зарегистрировать service worker:", error);
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [shouldShow]);

  useEffect(() => {
    if (!shouldShow || !profileId || !session?.role) {
      return;
    }

    fetch(apiUrl(`/notifications/settings?profileId=${encodeURIComponent(profileId)}&role=${encodeURIComponent(session.role)}`))
      .then((response) => response.json() as Promise<NotificationSettingsPayload>)
      .then((payload) => setCounters(payload.counters ?? {}))
      .catch(() => setCounters({}));
  }, [shouldShow, profileId, session?.role]);

  const handleInstall = async () => {
    if (!installPromptEvent) {
      setMessage("Установить приложение можно через меню браузера или системную кнопку установки.");
      return;
    }

    await installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  };

  const handleEnableNotifications = async () => {
    if (!profileId || !session?.role) {
      setMessage("Не удалось определить текущего пользователя для подписки на уведомления.");
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setMessage("Браузер не поддерживает desktop notifications.");
      return;
    }

    setSubscriptionState("subscribing");
    setMessage("");

    try {
      const result = await enablePushNotifications(session);
      setPermission(result.permission);

      if (!result.enabled) {
        setSubscriptionState("idle");
        setMessage(
          result.permission === "denied"
            ? "Уведомления запрещены в браузере. Разреши их в настройках сайта."
            : "Разрешение на уведомления не выдано.",
        );
        return;
      }

      setSubscriptionState("enabled");
      setMessage("Уведомления включены. Теперь можно отправить тестовый push.");
    } catch (error) {
      console.error("Ошибка подписки на push:", error);
      setSubscriptionState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось включить уведомления на этом устройстве.");
    }
  };

  const handleSendTest = async () => {
    if (!profileId || !session?.role) {
      return;
    }

    await sendTestPush(session);

    setMessage("Тестовое уведомление отправлено.");
  };

  const countersSummary = Object.values(counters).reduce((sum, value) => sum + value, 0);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex max-w-sm flex-col gap-3">
      <div className="pointer-events-auto rounded-[24px] border border-slate-200/80 bg-white/95 p-4 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
          TouchSpace App
        </p>
        <p className="mt-2 text-sm font-semibold">Установка и уведомления</p>
        <div className="mt-3 grid gap-2 text-xs text-slate-600">
          <p>Режим приложения: {isInstalled ? "установлено как app-window" : "ещё не установлено"}</p>
          <p>Desktop notifications: {permission === "granted" ? "включены" : permission === "denied" ? "запрещены" : "ещё не включены"}</p>
          <p>Ожидают внимания: {countersSummary}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!isInstalled ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Установить приложение
            </button>
          ) : null}

          {permission !== "granted" ? (
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              disabled={subscriptionState === "subscribing"}
              className="rounded-full bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              {subscriptionState === "subscribing" ? "Подключаем..." : "Включить уведомления"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSendTest()}
              className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Отправить тестовый push
            </button>
          )}

          <Link
            href="/settings"
            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Настройки
          </Link>
        </div>

        {message ? (
          <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
