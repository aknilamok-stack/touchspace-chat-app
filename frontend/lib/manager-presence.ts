"use client";

import { apiUrl } from "@/lib/api";
import type { ManagerPresence } from "@/lib/auth";

type ManagerStatusRecord = {
  id: string;
  fullName: string;
  managerStatus: string | null;
  lastLoginAt?: string | null;
};

type SupplierStatusRecord = {
  id: string;
  fullName: string;
  supplierId?: string | null;
  supplierStatus: string | null;
  lastLoginAt?: string | null;
};

export type SupplierPresenceRecord = {
  id: string;
  fullName: string;
  supplierId: string | null;
  status: ManagerPresence;
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

export async function fetchManagerStatusRecords() {
  const response = await fetch(apiUrl("/profiles/manager-statuses"));

  if (!response.ok) {
    throw new Error("Не удалось загрузить статусы менеджеров");
  }

  const payload = (await response.json()) as ManagerStatusRecord[];

  return payload.map((manager) => ({
    id: manager.id,
    fullName: manager.fullName,
    status:
      manager.managerStatus === "online" ||
      manager.managerStatus === "break" ||
      manager.managerStatus === "offline"
        ? manager.managerStatus
        : "offline",
    lastLoginAt: manager.lastLoginAt ?? null,
  })) as Array<{
    id: string;
    fullName: string;
    status: ManagerPresence;
    lastLoginAt?: string | null;
  }>;
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

export async function fetchSupplierStatuses() {
  const response = await fetch(apiUrl("/profiles/supplier-statuses"));

  if (!response.ok) {
    throw new Error("Не удалось загрузить статусы поставщиков");
  }

  const payload = (await response.json()) as SupplierStatusRecord[];

  return payload.reduce<Record<string, ManagerPresence>>((accumulator, supplier) => {
    const status = supplier.supplierStatus;

    if (status === "online" || status === "break" || status === "offline") {
      accumulator[supplier.id] = status;
    }

    return accumulator;
  }, {});
}

export async function fetchSupplierStatusRecords(): Promise<SupplierPresenceRecord[]> {
  const response = await fetch(apiUrl("/profiles/supplier-statuses"));

  if (!response.ok) {
    throw new Error("Не удалось загрузить статусы поставщиков");
  }

  const payload = (await response.json()) as SupplierStatusRecord[];

  return payload.map((supplier) => ({
    id: supplier.id,
    fullName: supplier.fullName,
    supplierId: supplier.supplierId?.trim() || null,
    status:
      supplier.supplierStatus === "online" ||
      supplier.supplierStatus === "break" ||
      supplier.supplierStatus === "offline"
        ? supplier.supplierStatus
        : "offline",
    lastLoginAt: supplier.lastLoginAt ?? null,
  }));
}

export async function updateSupplierPresence(
  supplierId: string,
  fullName: string,
  supplierStatus: ManagerPresence,
) {
  const response = await fetch(apiUrl(`/profiles/${supplierId}/supplier-status`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName,
      supplierStatus,
    }),
  });

  if (!response.ok) {
    throw new Error("Не удалось обновить статус поставщика");
  }

  return response.json();
}
