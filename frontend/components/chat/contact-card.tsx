"use client";

import { useState } from "react";

export type ChatContactItem = {
  id: string;
  type: "email" | "phone";
  value: string;
  label?: string | null;
  source: "manual" | "profile";
  sourceLabel: string;
  editable: boolean;
};

type ContactDraft = {
  type: "email" | "phone";
  value: string;
};

type ContactCardProps = {
  contacts: ChatContactItem[];
  canManage: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string;
  title?: string;
  onAdd?: (draft: ContactDraft) => Promise<void>;
  onUpdate?: (contactId: string, draft: ContactDraft) => Promise<void>;
  onDelete?: (contactId: string) => Promise<void>;
};

const defaultDraft: ContactDraft = {
  type: "email",
  value: "",
};

const typeLabel: Record<ContactDraft["type"], string> = {
  email: "Email",
  phone: "Телефон",
};

const typeBadgeClassName: Record<ContactDraft["type"], string> = {
  email: "bg-[#EEF6FF] text-[#0A84FF]",
  phone: "bg-[#ECFFF1] text-[#1F8B4C]",
};

export function ContactCard({
  contacts,
  canManage,
  isLoading = false,
  isSaving = false,
  error,
  title = "Контакты",
  onAdd,
  onUpdate,
  onDelete,
}: ContactCardProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(defaultDraft);
  const [editingContactId, setEditingContactId] = useState("");

  const startAdd = () => {
    setEditingContactId("");
    setDraft(defaultDraft);
    setIsFormOpen(true);
  };

  const startEdit = (contact: ChatContactItem) => {
    setEditingContactId(contact.id);
    setDraft({
      type: contact.type,
      value: contact.value,
    });
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingContactId("");
    setDraft(defaultDraft);
    setIsFormOpen(false);
  };

  const handleSubmit = async () => {
    if (!draft.value.trim()) {
      return;
    }

    if (editingContactId) {
      await onUpdate?.(editingContactId, draft);
    } else {
      await onAdd?.(draft);
    }

    resetForm();
  };

  const submitLabel = editingContactId ? "Сохранить" : "Добавить";

  return (
    <div className="mb-4 rounded-[24px] border border-[#E5E5EA] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#1E1E1E]">{title}</p>
        {contacts.length ? (
          <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-xs text-[#6C6C70]">
            {contacts.length}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-[#8E8E93]">Загружаем контакты...</p>
        ) : contacts.length ? (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="rounded-[18px] border border-[#ECECF1] bg-[#FCFCFD] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeBadgeClassName[contact.type]}`}
                    >
                      {typeLabel[contact.type]}
                    </span>
                    <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-[11px] text-[#6C6C70]">
                      {contact.sourceLabel}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-sm font-medium text-[#1E1E1E]">
                    {contact.value}
                  </p>
                </div>

                {canManage && contact.editable ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(contact)}
                      className="rounded-full bg-[#F2F2F7] px-3 py-1.5 text-xs font-medium text-[#1E1E1E] transition hover:bg-[#E6EEF9]"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete?.(contact.id)}
                      className="rounded-full bg-[#FFF1F0] px-3 py-1.5 text-xs font-medium text-[#D63E3E] transition hover:bg-[#FFE5E1]"
                    >
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#D8D9E0] bg-[#FBFBFD] px-4 py-5 text-center">
            <p className="text-sm font-medium text-[#1E1E1E]">Контактов нет</p>
            <p className="mt-1 text-xs leading-5 text-[#8E8E93]">
              {canManage
                ? "Добавьте email или телефон, чтобы они были под рукой в этом диалоге."
                : "Для этого диалога пока не добавлены email или телефон."}
            </p>
          </div>
        )}
      </div>

      {canManage ? (
        <>
          {!isFormOpen ? (
            <button
              type="button"
              onClick={startAdd}
              className="mt-4 w-full rounded-2xl border border-[#D9E5FA] bg-[#F5F9FF] py-3 text-sm font-medium text-[#0A84FF] transition hover:bg-[#ECF4FF]"
            >
              Добавить телефон или email
            </button>
          ) : (
            <div className="mt-4 rounded-[20px] border border-[#E5E5EA] bg-[#FBFBFD] p-3">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 max-[420px]:grid-cols-1">
                <select
                  value={draft.type}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      type: event.target.value as ContactDraft["type"],
                    }))
                  }
                  className="rounded-2xl border border-[#D1D1D6] bg-white px-3 py-3 text-sm text-[#1E1E1E] outline-none"
                >
                  <option value="email">Email</option>
                  <option value="phone">Телефон</option>
                </select>

                <input
                  value={draft.value}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      value: event.target.value,
                    }))
                  }
                  placeholder={draft.type === "email" ? "name@company.ru" : "+7 999 123-45-67"}
                  className="w-full rounded-2xl border border-[#D1D1D6] bg-white px-3 py-3 text-sm text-[#1E1E1E] outline-none"
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={isSaving || !draft.value.trim()}
                  className="rounded-2xl bg-[#0A84FF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0077F2] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Сохраняем..." : submitLabel}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl bg-[#F2F2F7] px-4 py-2.5 text-sm font-medium text-[#6C6C70] transition hover:bg-[#E8E8EE]"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[#D63E3E]">{error}</p> : null}
    </div>
  );
}
