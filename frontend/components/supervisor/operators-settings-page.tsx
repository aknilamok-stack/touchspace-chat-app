"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import { readAuthSession, type AuthSession } from "@/lib/auth";

type SupervisorScope = "manager_supervisor" | "supplier_supervisor";
type OperatorStatus = "online" | "break" | "offline";

type OperatorItem = {
  id: string;
  fullName: string;
  authLogin?: string | null;
  email?: string | null;
  role: string;
  supplierId?: string | null;
  status: OperatorStatus;
  lastSeenAt?: string | null;
  lastLoginAt?: string | null;
  passwordChangeRequired?: boolean;
  chatAccessEnabled: boolean;
};

type OperatorsResponse = {
  items?: OperatorItem[];
};

type ResetPasswordResponse = {
  credentials?: {
    login: string;
    temporaryPassword: string;
  };
};

const operatorStatusLabel: Record<OperatorStatus, string> = {
  online: "В сети",
  break: "На перерыве",
  offline: "Не в сети",
};

const operatorStatusTone: Record<OperatorStatus, string> = {
  online: "bg-[#34C759]",
  break: "bg-[#FFB340]",
  offline: "bg-[#C7C7CC]",
};

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Нет данных";

export function OperatorsSettingsPage({
  scope,
  title,
  subtitle,
  backHref,
}: {
  scope: SupervisorScope;
  title: string;
  subtitle: string;
  backHref: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"operators">("operators");
  const [savingOperatorId, setSavingOperatorId] = useState("");
  const [togglingOperatorId, setTogglingOperatorId] = useState("");
  const [resettingOperatorId, setResettingOperatorId] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [credentialsMessage, setCredentialsMessage] = useState("");
  const [draftAuthLogins, setDraftAuthLogins] = useState<Record<string, string>>({});
  const [draftEmails, setDraftEmails] = useState<Record<string, string>>({});

  const pageAccent = scope === "manager_supervisor" ? "text-[#0A84FF]" : "text-[#0F9F6E]";
  const buttonAccent =
    scope === "manager_supervisor"
      ? "bg-[#0A84FF] hover:bg-[#0077F2]"
      : "bg-[#0F9F6E] hover:bg-[#0C8A5F]";

  const loadOperators = async (currentSession: AuthSession) => {
    if (!currentSession.userId) {
      throw new Error("Не удалось определить управленца.");
    }

    const response = await fetch(
      apiUrl(`/supervisors/operators?supervisorId=${encodeURIComponent(currentSession.userId)}`)
    );

    if (!response.ok) {
      throw new Error("Не удалось загрузить операторов");
    }

    const payload = (await response.json()) as OperatorsResponse;
    const nextItems = Array.isArray(payload.items) ? payload.items : [];

    setOperators(nextItems);
    setDraftAuthLogins(
      Object.fromEntries(nextItems.map((item) => [item.id, item.authLogin ?? ""]))
    );
    setDraftEmails(Object.fromEntries(nextItems.map((item) => [item.id, item.email ?? ""])));
  };

  useEffect(() => {
    const currentSession = readAuthSession();

    if (!currentSession || currentSession.role !== scope) {
      router.replace("/login");
      return;
    }

    setSession(currentSession);
    loadOperators(currentSession)
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить операторов")
      )
      .finally(() => setLoading(false));
  }, [router, scope]);

  const operatorsCountLabel = useMemo(() => `${operators.length} операторов`, [operators.length]);

  const handleToggleChatAccess = async (operatorId: string, enabled: boolean) => {
    if (!session?.userId) {
      return;
    }

    setTogglingOperatorId(operatorId);
    setError("");
    setInfoMessage("");

    try {
      const response = await fetch(apiUrl(`/supervisors/operators/${operatorId}/chat-access`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supervisorId: session.userId,
          enabled,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить доступ к чатам");
      }

      setOperators((currentOperators) =>
        currentOperators.map((item) =>
          item.id === operatorId ? { ...item, chatAccessEnabled: enabled } : item
        )
      );
      setInfoMessage(
        enabled
          ? "Оператор снова может отвечать и получать уведомления."
          : "Оператор переведён в режим чтения без уведомлений."
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Не удалось обновить доступ к чатам"
      );
    } finally {
      setTogglingOperatorId("");
    }
  };

  const handleSaveAccount = async (operatorId: string) => {
    if (!session?.userId) {
      return;
    }

    setSavingOperatorId(operatorId);
    setError("");
    setInfoMessage("");
    setCredentialsMessage("");

    try {
      const response = await fetch(apiUrl(`/supervisors/operators/${operatorId}/account`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supervisorId: session.userId,
          authLogin: draftAuthLogins[operatorId]?.trim(),
          email: draftEmails[operatorId]?.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { operator?: Pick<OperatorItem, "id" | "authLogin" | "email" | "fullName">; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          (typeof payload?.message === "string" && payload.message) ||
            "Не удалось обновить логин и email"
        );
      }

      setOperators((currentOperators) =>
        currentOperators.map((item) =>
          item.id === operatorId
            ? {
                ...item,
                authLogin: payload?.operator?.authLogin ?? item.authLogin,
                email: payload?.operator?.email ?? item.email,
              }
            : item
        )
      );
      setInfoMessage("Данные оператора обновлены.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Не удалось обновить логин и email"
      );
    } finally {
      setSavingOperatorId("");
    }
  };

  const handleResetPassword = async (operatorId: string) => {
    if (!session?.userId) {
      return;
    }

    setResettingOperatorId(operatorId);
    setError("");
    setInfoMessage("");
    setCredentialsMessage("");

    try {
      const response = await fetch(
        apiUrl(`/supervisors/operators/${operatorId}/reissue-password`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            supervisorId: session.userId,
          }),
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | (ResetPasswordResponse & { message?: string })
        | null;

      if (!response.ok || !payload?.credentials) {
        throw new Error(
          (typeof payload?.message === "string" && payload.message) ||
            "Не удалось сбросить пароль"
        );
      }

      setCredentialsMessage(
        `Новый временный пароль: ${payload.credentials.login} / ${payload.credentials.temporaryPassword}`
      );
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "Не удалось сбросить пароль"
      );
    } finally {
      setResettingOperatorId("");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] px-6 py-8 text-[#6C6C70]">
        Загружаем настройки...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F6F8] px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="inline-flex items-center gap-2 rounded-full border border-[#D9DFEA] bg-white px-4 py-2 text-sm font-medium text-[#1E1E1E] transition hover:bg-[#F9FBFF]"
        >
          <span aria-hidden="true">←</span>
          <span>Назад</span>
        </button>

        <div className="mt-5 rounded-[28px] border border-[#E3E8F2] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${pageAccent}`}>
            Настройки управленца
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-semibold text-[#1E1E1E]">{title}</h1>
              <p className="mt-2 text-sm text-[#6C6C70]">{subtitle}</p>
            </div>
            <div className="rounded-full bg-[#F5F7FB] px-4 py-2 text-sm font-medium text-[#4E5562]">
              {operatorsCountLabel}
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("operators")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === "operators"
                  ? `${buttonAccent} text-white`
                  : "bg-[#F2F4F8] text-[#5F6673] hover:bg-[#E9EEF7]"
              }`}
            >
              Операторы
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[18px] border border-[#F3D0D0] bg-[#FFF4F4] px-4 py-3 text-sm text-[#C43D3D]">
            {error}
          </div>
        ) : null}

        {infoMessage ? (
          <div className="mt-4 rounded-[18px] border border-[#D6E9DB] bg-[#F3FFF6] px-4 py-3 text-sm text-[#1B7A3C]">
            {infoMessage}
          </div>
        ) : null}

        {credentialsMessage ? (
          <div className="mt-4 rounded-[18px] border border-[#DCE7FF] bg-[#F5F9FF] px-4 py-3 text-sm text-[#1E1E1E]">
            {credentialsMessage}
          </div>
        ) : null}

        <section className="mt-6 space-y-4">
          {operators.map((operator) => {
            const showLastSeen = operator.status !== "online";

            return (
              <article
                key={operator.id}
                className="rounded-[24px] border border-[#E3E8F2] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-3 w-3 rounded-full ${operatorStatusTone[operator.status]}`}
                      />
                      <h2 className="text-lg font-semibold text-[#1E1E1E]">
                        {operator.fullName}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-[#6C6C70]">
                      Статус: {operatorStatusLabel[operator.status]}
                    </p>
                    {showLastSeen ? (
                      <p className="mt-1 text-xs text-[#8E8E93]">
                        Последний вход: {formatDateTime(operator.lastLoginAt || operator.lastSeenAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-[220px] rounded-[18px] border border-[#E8EDF4] bg-[#FBFCFE] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8E8E93]">
                          Доступ к чатам
                        </p>
                        <p className="mt-1 text-sm text-[#5F6673]">
                          {operator.chatAccessEnabled
                            ? "Может писать и получать уведомления"
                            : "Только чтение без уведомлений"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={togglingOperatorId === operator.id}
                        onClick={() =>
                          void handleToggleChatAccess(
                            operator.id,
                            !operator.chatAccessEnabled
                          )
                        }
                        className={`relative inline-flex h-8 w-[62px] items-center rounded-full px-1 transition ${
                          operator.chatAccessEnabled ? "bg-[#34C759]" : "bg-[#D1D1D6]"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-[14px] shadow-[0_4px_10px_rgba(15,23,42,0.16)] transition ${
                            operator.chatAccessEnabled
                              ? "translate-x-[30px] text-[#F5C542]"
                              : "translate-x-0 text-[#9A9AA1]"
                          }`}
                        >
                          ⚡
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#8E8E93]">
                      Логин
                    </span>
                    <input
                      value={draftAuthLogins[operator.id] ?? ""}
                      onChange={(event) =>
                        setDraftAuthLogins((current) => ({
                          ...current,
                          [operator.id]: event.target.value,
                        }))
                      }
                      className="w-full rounded-[16px] border border-[#D6DCE7] bg-white px-4 py-3 text-sm text-[#1E1E1E] outline-none"
                      placeholder="login@example.com"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#8E8E93]">
                      Email
                    </span>
                    <input
                      value={draftEmails[operator.id] ?? ""}
                      onChange={(event) =>
                        setDraftEmails((current) => ({
                          ...current,
                          [operator.id]: event.target.value,
                        }))
                      }
                      className="w-full rounded-[16px] border border-[#D6DCE7] bg-white px-4 py-3 text-sm text-[#1E1E1E] outline-none"
                      placeholder="email@example.com"
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={savingOperatorId === operator.id}
                    onClick={() => void handleSaveAccount(operator.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${buttonAccent}`}
                  >
                    {savingOperatorId === operator.id ? "Сохраняем..." : "Сохранить логин и email"}
                  </button>

                  <button
                    type="button"
                    disabled={resettingOperatorId === operator.id}
                    onClick={() => void handleResetPassword(operator.id)}
                    className="rounded-full border border-[#D6DCE7] bg-white px-4 py-2 text-sm font-semibold text-[#1E1E1E] transition hover:bg-[#F7F9FC] disabled:opacity-60"
                  >
                    {resettingOperatorId === operator.id ? "Сбрасываем..." : "Сбросить пароль"}
                  </button>
                </div>
              </article>
            );
          })}

          {operators.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[#D6DCE7] bg-white px-5 py-8 text-center text-sm text-[#8E8E93]">
              Операторы пока не найдены.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
