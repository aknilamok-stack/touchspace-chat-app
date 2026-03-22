"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/admin-format";
import {
  AdminButton,
  AdminCards,
  AdminInput,
  AdminMessage,
  AdminPage,
  AdminPanel,
  AdminSelect,
  AdminStatusBadge,
  AdminTable,
  AdminToolbar,
  getRoleLabel,
} from "@/components/admin/admin-ui";

const emptyCreateForm = {
  fullName: "",
  email: "",
  role: "manager",
  companyName: "",
  status: "active",
};

export function AdminUsers() {
  const [filters, setFilters] = useState({
    role: "",
    status: "",
    company: "",
  });
  const [payload, setPayload] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editForm, setEditForm] = useState({
    fullName: "",
    role: "manager",
    status: "active",
    companyName: "",
    approvalStatus: "approved",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issuedCredentials, setIssuedCredentials] = useState<null | {
    login: string;
    temporaryPassword: string;
  }>(null);

  const loadUsers = async () => {
    try {
      const result = await adminApi.getUsers(filters);
      setPayload(result);
      setError(null);
      const nextSelectedId =
        selectedId && result.items.some((item: any) => item.id === selectedId)
          ? selectedId
          : result.items[0]?.id ?? null;
      setSelectedId(nextSelectedId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить пользователей");
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [filters.role, filters.status, filters.company]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void adminApi
      .getUser(selectedId)
      .then((result) => {
        setDetail(result);
        setEditForm({
          fullName: result.fullName ?? "",
          role: result.role ?? "manager",
          status: result.status ?? "active",
          companyName: result.companyName ?? "",
          approvalStatus: result.approvalStatus ?? "approved",
        });
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть пользователя");
      });
  }, [selectedId]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await adminApi.createUser(createForm);
      setCreateForm(emptyCreateForm);
      setIssuedCredentials(result.credentials ?? null);
      setMessage("Пользователь создан. Доступ выдан.");
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать пользователя");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedId) {
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.updateUser(selectedId, editForm);
      setMessage("Пользователь обновлён");
      await loadUsers();
      const updated = await adminApi.getUser(selectedId);
      setDetail(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось обновить пользователя");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReissuePassword = async () => {
    if (!selectedId) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminApi.reissueUserPassword(selectedId);
      setIssuedCredentials(result.credentials ?? null);
      setMessage("Временный пароль перевыпущен");
      const updated = await adminApi.getUser(selectedId);
      setDetail(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось перевыпустить пароль",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminPage
      title="Пользователи и доступы"
      description="Рабочий каталог всех профилей с фильтрами, ручным созданием и обновлением ролей и статусов без редактирования основной платформы."
    >
      {message ? <AdminMessage tone="success">{message}</AdminMessage> : null}
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}
      {issuedCredentials ? (
        <AdminMessage tone="success">
          Логин: <span className="font-semibold">{issuedCredentials.login}</span> · временный пароль:{" "}
          <span className="font-semibold">{issuedCredentials.temporaryPassword}</span>
        </AdminMessage>
      ) : null}

      <AdminCards
        items={[
          { label: "Всего профилей", value: String(payload?.total ?? 0) },
          {
            label: "Менеджеры",
            value: String((payload?.items ?? []).filter((item: any) => item.role === "manager").length),
          },
          {
            label: "Поставщики",
            value: String((payload?.items ?? []).filter((item: any) => item.role === "supplier").length),
          },
          {
            label: "Заблокированы",
            value: String((payload?.items ?? []).filter((item: any) => item.status === "blocked").length),
            tone: "warn",
          },
        ]}
      />

      <AdminToolbar>
        <AdminSelect value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}>
          <option value="">Все роли</option>
          <option value="admin">Администраторы</option>
          <option value="manager">Менеджеры</option>
          <option value="supplier">Поставщики</option>
          <option value="client">Клиенты</option>
        </AdminSelect>
        <AdminSelect value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
          <option value="blocked">Заблокированные</option>
          <option value="pending_approval">Ожидают подтверждения</option>
        </AdminSelect>
        <AdminInput
          value={filters.company}
          onChange={(event) => setFilters((current) => ({ ...current, company: event.target.value }))}
          placeholder="Фильтр по компании"
        />
        <AdminButton tone="secondary" onClick={() => void loadUsers()}>
          Обновить
        </AdminButton>
      </AdminToolbar>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
        <AdminPanel title="Список пользователей">
          <AdminTable
            columns={[
              { key: "fullName", label: "Имя" },
              { key: "email", label: "Email" },
              { key: "role", label: "Роль" },
              { key: "status", label: "Статус" },
              { key: "companyName", label: "Компания" },
              { key: "lastLoginAt", label: "Последний вход" },
            ]}
            rows={payload?.items ?? []}
            rowKey={(row) => row.id}
            selectedRowKey={selectedId}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle="Пользователей пока нет"
            emptyDescription="Создайте первый профиль через правую панель."
            renderCell={(row, key) => {
              if (key === "status") {
                return <AdminStatusBadge value={row.status} />;
              }

              if (key === "lastLoginAt") {
                return formatDateTime(row.lastLoginAt);
              }

              if (key === "role") {
                return getRoleLabel(row.role);
              }

              return row[key] ?? "нет данных";
            }}
          />
        </AdminPanel>

        <div className="grid gap-4">
          <AdminPanel title="Редактирование пользователя">
            {detail ? (
              <div className="grid gap-3">
                <AdminInput
                  value={editForm.fullName}
                  onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Имя"
                />
                <AdminSelect
                  value={editForm.role}
                  onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))}
                >
                  <option value="admin">Администратор</option>
                  <option value="manager">Менеджер</option>
                  <option value="supplier">Поставщик</option>
                  <option value="client">Клиент</option>
                </AdminSelect>
                <AdminSelect
                  value={editForm.status}
                  onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="active">Активен</option>
                  <option value="inactive">Неактивен</option>
                  <option value="blocked">Заблокирован</option>
                  <option value="pending_approval">Ожидает подтверждения</option>
                </AdminSelect>
                <AdminInput
                  value={editForm.companyName}
                  onChange={(event) => setEditForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="Компания"
                />
                <AdminSelect
                  value={editForm.approvalStatus}
                  onChange={(event) => setEditForm((current) => ({ ...current, approvalStatus: event.target.value }))}
                >
                  <option value="approved">Подтверждён</option>
                  <option value="pending">На проверке</option>
                  <option value="rejected">Отклонён</option>
                </AdminSelect>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p><span className="font-medium text-slate-950">Создан:</span> {formatDateTime(detail.createdAt)}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Email:</span> {detail.email ?? "нет данных"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Логин:</span> {detail.authLogin ?? detail.email ?? "ещё не выдан"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Смена пароля:</span> {detail.passwordChangeRequired ? "требуется при входе" : "не требуется"}</p>
                </div>
                <AdminButton onClick={() => void handleUpdate()} disabled={submitting}>
                  Сохранить изменения
                </AdminButton>
                <AdminButton tone="secondary" onClick={() => void handleReissuePassword()} disabled={submitting}>
                  Перевыпустить временный пароль
                </AdminButton>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Выберите пользователя слева.</p>
            )}
          </AdminPanel>

          <AdminPanel title="Создать пользователя">
            <form className="grid gap-3" onSubmit={handleCreate}>
              <AdminInput
                value={createForm.fullName}
                onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Имя"
                required
              />
              <AdminInput
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                type="email"
                required
              />
              <AdminSelect
                value={createForm.role}
                onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="manager">Менеджер</option>
                <option value="supplier">Поставщик</option>
                <option value="admin">Администратор</option>
                <option value="client">Клиент</option>
              </AdminSelect>
              <AdminSelect
                value={createForm.status}
                onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="active">Активен</option>
                <option value="inactive">Неактивен</option>
                <option value="blocked">Заблокирован</option>
                <option value="pending_approval">Ожидает подтверждения</option>
              </AdminSelect>
              <AdminInput
                value={createForm.companyName}
                onChange={(event) => setCreateForm((current) => ({ ...current, companyName: event.target.value }))}
                placeholder="Компания"
              />
              <AdminButton type="submit" disabled={submitting}>
                Создать пользователя
              </AdminButton>
            </form>
          </AdminPanel>
        </div>
      </div>
    </AdminPage>
  );
}
