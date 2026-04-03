"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type InternalRole =
  | "admin"
  | "manager"
  | "manager_supervisor"
  | "supplier"
  | "supplier_supervisor";

const roleOptions: Array<{ value: InternalRole; label: string }> = [
  { value: "manager", label: "Менеджер" },
  { value: "manager_supervisor", label: "Управленец менеджеров" },
  { value: "supplier", label: "Поставщик" },
  { value: "supplier_supervisor", label: "Управленец поставщиков" },
  { value: "admin", label: "Администратор" },
];

const emptyCreateForm = {
  fullName: "",
  email: "",
  password: "",
  role: "manager" as InternalRole,
  companyName: "",
  status: "active",
};

const buildGeneratedPassword = () =>
  Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4).toUpperCase();

const roleNeedsCompany = (role: string) =>
  role === "supplier" || role === "supplier_supervisor";

const roleNeedsFullName = (role: string) => role !== "admin";

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
    email: "",
    authLogin: "",
    role: "manager" as InternalRole,
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
          email: result.email ?? "",
          authLogin: result.authLogin ?? "",
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
    setMessage(null);
    setError(null);

    try {
      const result = await adminApi.createUser({
        fullName: createForm.fullName,
        email: createForm.email,
        password: createForm.password || undefined,
        role: createForm.role,
        companyName: roleNeedsCompany(createForm.role) ? createForm.companyName : undefined,
        status: createForm.status,
      });
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
    setMessage(null);
    setError(null);

    try {
      await adminApi.updateUser(selectedId, {
        ...editForm,
        companyName: roleNeedsCompany(editForm.role) ? editForm.companyName : null,
      });
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
    setMessage(null);
    setError(null);

    try {
      const result = await adminApi.reissueUserPassword(selectedId);
      setIssuedCredentials(result.credentials ?? null);
      setMessage("Временный пароль перевыпущен");
      const updated = await adminApi.getUser(selectedId);
      setDetail(updated);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не удалось перевыпустить пароль",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const metrics = useMemo(
    () => [
      { label: "Всего профилей", value: String(payload?.total ?? 0) },
      {
        label: "Менеджеры",
        value: String(
          (payload?.items ?? []).filter((item: any) => item.role === "manager").length,
        ),
      },
      {
        label: "Управленцы",
        value: String(
          (payload?.items ?? []).filter((item: any) =>
            item.role === "manager_supervisor" || item.role === "supplier_supervisor",
          ).length,
        ),
      },
      {
        label: "Поставщики",
        value: String((payload?.items ?? []).filter((item: any) => item.role === "supplier").length),
      },
    ],
    [payload],
  );

  return (
    <AdminPage
      title="Пользователи и доступы"
      description="Админ может вручную создавать администраторов, менеджеров, управленцев менеджеров, поставщиков и управленцев поставщиков. Для supplier-ролей компания обязательна, а сотрудники поставщика автоматически привязываются к управленцу своей компании."
    >
      {message ? <AdminMessage tone="success">{message}</AdminMessage> : null}
      {error ? <AdminMessage tone="error">{error}</AdminMessage> : null}
      {issuedCredentials ? (
        <AdminMessage tone="success">
          Логин: <span className="font-semibold">{issuedCredentials.login}</span> · пароль:{" "}
          <span className="font-semibold">{issuedCredentials.temporaryPassword}</span>
        </AdminMessage>
      ) : null}

      <AdminCards items={metrics} />

      <AdminToolbar>
        <AdminSelect value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}>
          <option value="">Все роли</option>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
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
              { key: "email", label: "Email / логин" },
              { key: "role", label: "Роль" },
              { key: "status", label: "Статус" },
              { key: "companyName", label: "Компания" },
              { key: "supervisorName", label: "Управленец" },
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

              if (key === "role") {
                return getRoleLabel(row.role);
              }

              if (key === "email") {
                return row.email ?? row.authLogin ?? "нет данных";
              }

              return row[key] ?? "нет данных";
            }}
          />
        </AdminPanel>

        <div className="grid gap-4">
          <AdminPanel title="Редактирование пользователя">
            {detail ? (
              <div className="grid gap-3">
                {roleNeedsFullName(editForm.role) ? (
                  <AdminInput
                    value={editForm.fullName}
                    onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
                    placeholder="Имя"
                  />
                ) : null}
                <AdminInput
                  value={editForm.email}
                  onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email / логин"
                  type="email"
                />
                <AdminInput
                  value={editForm.authLogin}
                  onChange={(event) => setEditForm((current) => ({ ...current, authLogin: event.target.value }))}
                  placeholder="Отдельный логин при необходимости"
                />
                <AdminSelect
                  value={editForm.role}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, role: event.target.value as InternalRole }))
                  }
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
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
                {roleNeedsCompany(editForm.role) ? (
                  <AdminInput
                    value={editForm.companyName}
                    onChange={(event) => setEditForm((current) => ({ ...current, companyName: event.target.value }))}
                    placeholder="Компания"
                  />
                ) : null}
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
                  <p className="mt-1"><span className="font-medium text-slate-950">Компания:</span> {detail.companyName ?? "нет данных"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Управленец:</span> {detail.supervisor?.fullName ?? "нет данных"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Подчинённых:</span> {detail.supervisedProfiles?.length ?? 0}</p>
                  <p className="mt-1"><span className="font-medium text-slate-950">Смена пароля:</span> {detail.passwordChangeRequired ? "требуется при входе" : "не требуется"}</p>
                </div>
                <AdminButton onClick={() => void handleUpdate()} disabled={submitting}>
                  Сохранить изменения
                </AdminButton>
                <AdminButton tone="secondary" onClick={() => void handleReissuePassword()} disabled={submitting}>
                  Перевыпустить пароль
                </AdminButton>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Выберите пользователя слева.</p>
            )}
          </AdminPanel>

          <AdminPanel title="Создать пользователя">
            <form className="grid gap-3" onSubmit={handleCreate}>
              <AdminSelect
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, role: event.target.value as InternalRole }))
                }
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
              {roleNeedsFullName(createForm.role) ? (
                <AdminInput
                  value={createForm.fullName}
                  onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Имя в интерфейсе"
                  required
                />
              ) : null}
              <AdminInput
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email / логин"
                type="email"
                required
              />
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <AdminInput
                  value={createForm.password}
                  onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Пароль или оставьте пустым для генерации"
                  type="text"
                />
                <AdminButton
                  type="button"
                  tone="secondary"
                  onClick={() =>
                    setCreateForm((current) => ({
                      ...current,
                      password: buildGeneratedPassword(),
                    }))
                  }
                >
                  Сгенерировать
                </AdminButton>
              </div>
              <AdminSelect
                value={createForm.status}
                onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="active">Активен</option>
                <option value="inactive">Неактивен</option>
                <option value="blocked">Заблокирован</option>
                <option value="pending_approval">Ожидает подтверждения</option>
              </AdminSelect>
              {roleNeedsCompany(createForm.role) ? (
                <AdminInput
                  value={createForm.companyName}
                  onChange={(event) => setCreateForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="Компания"
                  required
                />
              ) : null}
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
