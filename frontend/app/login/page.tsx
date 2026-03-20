"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { managerAccounts, readAuthSession, writeAuthSession } from "@/lib/auth";

const supplierCredentials = {
  supplier: {
    password: "supplier123",
    role: "supplier" as const,
  },
};

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

    router.replace(existingSession.role === "manager" ? "/" : "/supplier");
  }, [router]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

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

    if (login === "supplier") {
      if (password !== supplierCredentials.supplier.password) {
        setError("Неверный логин или пароль");
        return;
      }

      writeAuthSession({
        login,
        role: supplierCredentials.supplier.role,
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
          Войдите как manager или supplier для тестирования ролей.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1E1E1E] mb-1">
              Login
            </label>
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none text-[#1E1E1E]"
              placeholder="manager или supplier"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1E1E1E] mb-1">
              Password
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
          <p className="mt-1">supplier / supplier123</p>
        </div>
      </div>
    </main>
  );
}
