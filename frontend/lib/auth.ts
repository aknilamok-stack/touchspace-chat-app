export type UserRole = "manager" | "supplier";
export type ManagerPresence = "online" | "break" | "offline";

export type AuthSession = {
  login: string;
  role: UserRole;
  managerId?: string;
  managerName?: string;
};

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

export const authStorageKey = "touchspace_auth";

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

const managerStatusStorageKey = "touchspace_manager_statuses";

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
