"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import {
  getHomePathForRole,
  isManagerRole,
  isSupplierRole,
  readAuthSession,
  writeAuthSession,
} from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");

  const handlePastePassword = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      setError("Вставка из буфера недоступна в этом браузере.");
      return;
    }

    try {
      const clipboardText = await navigator.clipboard.readText();
      setPassword(clipboardText);
      setError("");
    } catch (clipboardError) {
      console.error("Не удалось прочитать буфер обмена:", clipboardError);
      setError("Не удалось вставить пароль из буфера обмена.");
    }
  };

  useEffect(() => {
    const existingSession = readAuthSession();

    if (!existingSession) {
      return;
    }

    router.replace(
      existingSession.passwordChangeRequired ? "/change-password" : getHomePathForRole(existingSession.role),
    );
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("reason") === "other-device") {
      setError("Выполнен вход с другого устройства. Пожалуйста, войдите снова.");
      return;
    }

    if (params.get("reason") === "reauth-required") {
      setError("Сессия устарела. Пожалуйста, войдите заново через сервер.");
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      const authResponse = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          login,
          password,
        }),
      });

      if (authResponse.ok) {
        const payload = (await authResponse.json()) as {
          user: {
            id: string;
            login: string;
            role:
              | "admin"
              | "manager"
              | "supplier"
              | "client"
              | "manager_supervisor"
              | "supplier_supervisor";
            fullName: string;
            email?: string | null;
            supplierId?: string | null;
            chatAccessEnabled?: boolean;
            passwordChangeRequired?: boolean;
            sessionToken?: string;
          };
        };

        writeAuthSession({
          login: payload.user.login,
          role: payload.user.role,
          chatAccessEnabled: payload.user.chatAccessEnabled ?? true,
          sessionToken: payload.user.sessionToken,
          userId: payload.user.id,
          fullName: payload.user.fullName,
          email: payload.user.email ?? undefined,
          passwordChangeRequired: payload.user.passwordChangeRequired ?? false,
          adminId: payload.user.role === "admin" ? payload.user.id : undefined,
          adminName: payload.user.role === "admin" ? payload.user.fullName : undefined,
          managerId: isManagerRole(payload.user.role) ? payload.user.id : undefined,
          managerName: isManagerRole(payload.user.role) ? payload.user.fullName : undefined,
          supplierId:
            isSupplierRole(payload.user.role)
              ? payload.user.supplierId ?? payload.user.id
              : undefined,
          supplierName: isSupplierRole(payload.user.role) ? payload.user.fullName : undefined,
        });

        router.replace(payload.user.passwordChangeRequired ? "/change-password" : getHomePathForRole(payload.user.role));
        return;
      }

      const errorPayload = (await authResponse.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;

      const backendMessage = Array.isArray(errorPayload?.message)
        ? errorPayload?.message[0]
        : errorPayload?.message;

      setError(backendMessage || "Неверный логин или пароль");
      return;
    } catch (requestError) {
      console.error("Ошибка backend auth:", requestError);
      setError("Не удалось выполнить вход через сервер. Проверь backend и попробуй снова.");
      return;
    }
  };

  return (
    <main className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0A84FF]">
          TouchSpace Chat
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1E1E1E]">
          Вход в систему
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Войдите под логином и паролем, которые были выданы администратором.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1E1E1E] mb-1">
              Логин
            </label>
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none text-[#1E1E1E]"
              placeholder="Введите логин"
              autoComplete="username"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-[#1E1E1E]">
                Пароль
              </label>
              <button
                type="button"
                onClick={() => void handlePastePassword()}
                className="text-xs font-medium text-[#0A84FF] transition hover:text-[#0066CC]"
              >
                Вставить
              </button>
            </div>
            <div className="relative">
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-14 outline-none text-[#1E1E1E]"
                placeholder="Введите пароль"
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setPasswordVisible((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-500 transition hover:text-[#1E1E1E]"
              >
                {passwordVisible ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                    <path d="M9.4 5.5A10.7 10.7 0 0 1 12 5c5.5 0 9.4 5 10 7-.3 1-1.4 2.7-3.1 4.3" />
                    <path d="M6.2 6.3C3.9 8 2.4 10.2 2 12c.6 2 4.5 7 10 7 1.7 0 3.2-.4 4.5-1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#0A84FF] py-3 font-medium text-white"
          >
            Войти
          </button>
        </form>

      </div>
    </main>
  );
}
