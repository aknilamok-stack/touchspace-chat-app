"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import {
  adminAccounts,
  managerAccounts,
  readAuthSession,
  supplierAccounts,
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
      existingSession.passwordChangeRequired
        ? "/change-password"
        : existingSession.role === "admin"
        ? "/admin"
        : existingSession.role === "manager"
          ? "/"
          : "/supplier",
    );
  }, [router]);

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
            role: "admin" | "manager" | "supplier" | "client";
            fullName: string;
            email?: string | null;
            supplierId?: string | null;
            passwordChangeRequired?: boolean;
          };
        };

        writeAuthSession({
          login: payload.user.login,
          role: payload.user.role,
          userId: payload.user.id,
          fullName: payload.user.fullName,
          email: payload.user.email ?? undefined,
          passwordChangeRequired: payload.user.passwordChangeRequired ?? false,
          adminId: payload.user.role === "admin" ? payload.user.id : undefined,
          adminName: payload.user.role === "admin" ? payload.user.fullName : undefined,
          managerId: payload.user.role === "manager" ? payload.user.id : undefined,
          managerName: payload.user.role === "manager" ? payload.user.fullName : undefined,
          supplierId:
            payload.user.role === "supplier"
              ? payload.user.supplierId ?? payload.user.id
              : undefined,
          supplierName: payload.user.role === "supplier" ? payload.user.fullName : undefined,
        });

        router.replace(
          payload.user.passwordChangeRequired
            ? "/change-password"
            : payload.user.role === "admin"
              ? "/admin"
              : payload.user.role === "manager"
                ? "/"
                : "/supplier",
        );
        return;
      }
    } catch (requestError) {
      console.error("Ошибка backend auth:", requestError);
    }

    const matchedAdmin = adminAccounts.find((account) => account.login === login);

    if (matchedAdmin) {
      if (password !== matchedAdmin.password) {
        setError("Неверный логин или пароль");
        return;
      }

      writeAuthSession({
        login: matchedAdmin.login,
        role: "admin",
        adminId: matchedAdmin.id,
        adminName: matchedAdmin.name,
      });

      router.replace("/admin");
      return;
    }

    const matchedManager = managerAccounts.find((account) => account.login === login);

    if (matchedManager) {
      if (password !== matchedManager.password) {
        setError("Неверный логин или пароль");
        return;
      }

      writeAuthSession({
        login: matchedManager.login,
        role: "manager",
        managerId: matchedManager.id,
        managerName: matchedManager.name,
      });

      router.replace("/");
      return;
    }

    const matchedSupplier = supplierAccounts.find((account) => account.login === login);

    if (matchedSupplier) {
      if (password !== matchedSupplier.password) {
        setError("Неверный логин или пароль");
        return;
      }

      writeAuthSession({
        login,
        role: "supplier",
        supplierId: matchedSupplier.id,
        supplierName: matchedSupplier.name,
      });

      router.replace("/supplier");
      return;
    }

    setError("Неверный логин или пароль");
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
          Войдите как администратор, менеджер или поставщик для тестирования ролей.
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
              placeholder="admin, manager или supplier"
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

        <div className="mt-6 rounded-2xl bg-[#F8FAFD] p-4 text-sm text-gray-600">
          <p>anna / manager123</p>
          <p className="mt-1">ekaterina / manager123</p>
          <p className="mt-1">mikhail / manager123</p>
          <p className="mt-1">admin / admin123</p>
          <p className="mt-1">supplier / supplier123</p>
        </div>
      </div>
    </main>
  );
}
