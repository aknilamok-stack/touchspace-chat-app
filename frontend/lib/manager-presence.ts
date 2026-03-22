"use client";

import { apiUrl } from "@/lib/api";
import type { ManagerPresence } from "@/lib/auth";

type ManagerStatusRecord = {
  id: string;
  fullName: string;
  managerStatus: string | null;
  lastLoginAt?: string | null;
};

export async function fetchManagerStatuses() {
  const response = await fetch(apiUrl("/profiles/manager-statuses"));

  if (!response.ok) {
    throw new Error("Не удалось загрузить статусы менеджеров");
  }

  const payload = (await response.json()) as ManagerStatusRecord[];

  return payload.reduce<Record<string, ManagerPresence>>((accumulator, manager) => {
    const status = manager.managerStatus;

    if (status === "online" || status === "break" || status === "offline") {
      accumulator[manager.id] = status;
    }

    return accumulator;
  }, {});
}

export async function updateManagerPresence(
  managerId: string,
  fullName: string,
  managerStatus: ManagerPresence,
) {
  const response = await fetch(apiUrl(`/profiles/${managerId}/manager-status`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName,
      managerStatus,
    }),
  });

  if (!response.ok) {
    throw new Error("Не удалось обновить статус менеджера");
  }

  return response.json();
}
