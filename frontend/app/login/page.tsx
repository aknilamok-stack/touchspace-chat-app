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
  const [error, setError] = useState("");

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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1E1E1E] mb-1">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none text-[#1E1E1E]"
              placeholder="Введите пароль"
            />
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
