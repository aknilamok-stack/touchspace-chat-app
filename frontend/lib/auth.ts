export type UserRole = "admin" | "client" | "manager" | "supplier";
export type ManagerPresence = "online" | "break" | "offline";

export type AuthSession = {
  login: string;
  role: UserRole;
  userId?: string;
  fullName?: string;
  email?: string;
  passwordChangeRequired?: boolean;
  adminId?: string;
  adminName?: string;
  managerId?: string;
  managerName?: string;
  supplierId?: string;
  supplierName?: string;
};

export const adminAccounts = [
  { login: "admin", password: "admin123", id: "admin_touchspace", name: "TouchSpace Admin" },
] as const;

export const managerAccounts = [
  { login: "manager", password: "manager123", id: "manager_anna", name: "Анна" },
  { login: "anna", password: "manager123", id: "manager_anna", name: "Анна" },
  {
    login: "ekaterina",
    password: "manager123",
    id: "manager_ekaterina",
    name: "Екатерина",
  },
  { login: "mikhail", password: "manager123", id: "manager_mikhail", name: "Михаил" },
] as const;

export const supplierAccounts = [
  { login: "supplier", password: "supplier123", id: "supplier_karelia", name: "Karelia" },
] as const;

export const authStorageKey = "touchspace_auth";
const clientSessionStorageKey = "touchspace_client_session";
const managerStatusStorageKey = "touchspace_manager_statuses";

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(authStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AuthSession;
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

export function writeAuthSession(session: AuthSession) {
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage.removeItem(authStorageKey);
}

export function readManagerStatuses(): Record<string, ManagerPresence> {
  if (typeof window === "undefined") {
    return {};
  }

  const rawValue = window.localStorage.getItem(managerStatusStorageKey);

  if (!rawValue) {
    return {};
  }

  try {
    return JSON.parse(rawValue) as Record<string, ManagerPresence>;
  } catch {
    window.localStorage.removeItem(managerStatusStorageKey);
    return {};
  }
}

export function writeManagerStatus(managerId: string, status: ManagerPresence) {
  const currentStatuses = readManagerStatuses();
  currentStatuses[managerId] = status;
  window.localStorage.setItem(managerStatusStorageKey, JSON.stringify(currentStatuses));
}

export type ClientSession = {
  clientId: string;
  clientName: string;
  tradePointId?: string;
  tradePointName?: string;
  platformUserId?: string;
  platformUserName?: string;
  email?: string;
};

export function writeClientSession(session: ClientSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(clientSessionStorageKey, JSON.stringify(session));
}

export function getOrCreateClientSession(): ClientSession {
  if (typeof window === "undefined") {
    return {
      clientId: "client_browser",
      clientName: "Клиент",
    };
  }

  const rawValue = window.localStorage.getItem(clientSessionStorageKey);

  if (rawValue) {
    try {
      return JSON.parse(rawValue) as ClientSession;
    } catch {
      window.localStorage.removeItem(clientSessionStorageKey);
    }
  }

  const session = {
    clientId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `client_${crypto.randomUUID()}`
        : `client_${Date.now()}`,
    clientName: "Клиент",
  } satisfies ClientSession;

  writeClientSession(session);
  return session;
}
