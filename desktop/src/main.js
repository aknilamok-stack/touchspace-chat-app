const {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  Notification,
  screen,
  shell,
  nativeTheme,
  ipcMain,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");

process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "true" : "false";

const isDev = !app.isPackaged;
const defaultRemoteUrl = "https://app.aknila.ru/login";
const startUrl = process.env.DESKTOP_START_URL || defaultRemoteUrl;
const shellOrigin = new URL(startUrl).origin;
const desktopSessionPartition = `persist:touchspace-workspace:${new URL(startUrl).host
  .replace(/[^a-z0-9.-]+/gi, "-")
  .toLowerCase()}`;
const windowIconPath = path.join(__dirname, "..", "assets", "icon.png");
const shouldOpenDevTools = process.env.DESKTOP_OPEN_DEVTOOLS === "true";

let mainWindow = null;
let notificationWindow = null;
let notificationWindowReady = false;
let pendingNotificationPayload = null;
let lastUnreadAttentionCount = 0;
let lastDockBounceId = -1;
let isAppQuitting = false;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function getDesktopAuthSessionPath() {
  return path.join(app.getPath("userData"), "touchspace-auth-session.json");
}

function readDesktopAuthSession() {
  try {
    const filePath = getDesktopAuthSessionPath();

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const rawValue = fs.readFileSync(filePath, "utf8").trim();
    return rawValue || null;
  } catch {
    return null;
  }
}

function writeDesktopAuthSession(rawValue) {
  try {
    fs.writeFileSync(getDesktopAuthSessionPath(), rawValue, "utf8");
    return true;
  } catch {
    return false;
  }
}

function clearDesktopAuthSession() {
  try {
    const filePath = getDesktopAuthSessionPath();

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  } catch {
    return false;
  }
}

function createMenu() {
  const template = [
    {
      label: "TouchSpace",
      submenu: [
        {
          label: "Открыть рабочую зону",
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              void mainWindow.loadURL(startUrl);
            }
          },
        },
        {
          label: "Перезагрузить",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            mainWindow?.reload();
          },
        },
        { type: "separator" },
        {
          label: "Выйти",
          accelerator: "CmdOrCtrl+Q",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Редактирование",
      submenu: [
        { role: "undo", label: "Отменить" },
        { role: "redo", label: "Повторить" },
        { type: "separator" },
        { role: "cut", label: "Вырезать" },
        { role: "copy", label: "Копировать" },
        { role: "paste", label: "Вставить" },
        { role: "pasteAndMatchStyle", label: "Вставить без форматирования" },
        { role: "delete", label: "Удалить" },
        { role: "selectAll", label: "Выделить всё" },
      ],
    },
    {
      label: "Окно",
      submenu: [
        { role: "minimize", label: "Свернуть" },
        { role: "togglefullscreen", label: "Во весь экран" },
      ],
    },
    {
      label: "Помощь",
      submenu: [
        {
          label: "Открыть TouchSpace в браузере",
          click: () => void shell.openExternal(startUrl),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createEditableContextMenu(window, params, popupOptions = {}) {
  const menu = Menu.buildFromTemplate([
    { role: "undo", label: "Отменить", enabled: params.editFlags.canUndo },
    { role: "redo", label: "Повторить", enabled: params.editFlags.canRedo },
    { type: "separator" },
    { role: "cut", label: "Вырезать", enabled: params.editFlags.canCut },
    { role: "copy", label: "Копировать", enabled: params.editFlags.canCopy },
    { role: "paste", label: "Вставить", enabled: params.editFlags.canPaste },
    {
      role: "pasteAndMatchStyle",
      label: "Вставить без форматирования",
      enabled: params.editFlags.canPaste,
    },
    { role: "delete", label: "Удалить" },
    { type: "separator" },
    { role: "selectAll", label: "Выделить всё" },
  ]);

  menu.popup({
    window,
    ...popupOptions,
  });
}

function parseUnreadCountFromTitle(title) {
  if (typeof title !== "string") {
    return 0;
  }

  const match = title.match(/^\((\d+)\)/);

  if (!match) {
    return 0;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function clearDesktopAttention() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(false);
  }

  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(0);
  }

  if (process.platform === "darwin" && app.dock && lastDockBounceId !== -1) {
    app.dock.cancelBounce(lastDockBounceId);
    lastDockBounceId = -1;
  }

  lastUnreadAttentionCount = 0;
}

function getOverlayNotificationBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const width = 560;
  const height = 344;
  const margin = 24;

  return {
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - margin),
    y: Math.round(workArea.y + workArea.height - height - margin),
  };
}

function hideOverlayNotificationWindow() {
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    return;
  }

  notificationWindow.hide();
}

function focusMainWindow(targetUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (!targetUrl) {
    return;
  }

  try {
    const parsedTarget = new URL(targetUrl, startUrl);

    if (parsedTarget.origin === shellOrigin) {
      void mainWindow.loadURL(parsedTarget.toString());
    }
  } catch {
    return;
  }
}

function sendOverlayNotificationPayload() {
  if (
    !notificationWindow ||
    notificationWindow.isDestroyed() ||
    !notificationWindowReady ||
    !pendingNotificationPayload
  ) {
    return;
  }

  notificationWindow.webContents.send(
    "desktop:overlay-notification-data",
    pendingNotificationPayload,
  );
}

function createNotificationWindow() {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    return notificationWindow;
  }

  const bounds = getOverlayNotificationBounds();

  notificationWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    roundedCorners: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "notification-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
    },
  });

  notificationWindow.setAlwaysOnTop(true, "screen-saver");
  notificationWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  notificationWindow.on("close", (event) => {
    if (isAppQuitting) {
      return;
    }

    event.preventDefault();
    notificationWindow?.hide();
  });

  notificationWindow.on("closed", () => {
    notificationWindow = null;
    notificationWindowReady = false;
  });

  notificationWindow.webContents.on("did-finish-load", () => {
    notificationWindowReady = true;
    sendOverlayNotificationPayload();
  });

  void notificationWindow.loadFile(path.join(__dirname, "notification.html"));
  return notificationWindow;
}

function showOverlayNotificationWindow(payload) {
  pendingNotificationPayload = payload;
  const overlay = createNotificationWindow();

  if (!overlay) {
    return false;
  }

  const bounds = getOverlayNotificationBounds();
  overlay.setBounds(bounds);
  sendOverlayNotificationPayload();
  overlay.showInactive();
  return true;
}

function requestDesktopAttention(unreadCount) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(unreadCount);
  }

  if (mainWindow.isFocused()) {
    lastUnreadAttentionCount = unreadCount;
    return;
  }

  if (process.platform === "darwin" && app.dock) {
    if (lastDockBounceId !== -1) {
      app.dock.cancelBounce(lastDockBounceId);
    }

    lastDockBounceId = app.dock.bounce("informational");
  }

  mainWindow.flashFrame(true);
  lastUnreadAttentionCount = unreadCount;
}

function syncDesktopAttentionFromTitle(title) {
  const unreadCount = parseUnreadCountFromTitle(title);

  if (unreadCount <= 0) {
    clearDesktopAttention();
    return;
  }

  if (unreadCount > lastUnreadAttentionCount) {
    requestDesktopAttention(unreadCount);
    return;
  }

  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(unreadCount);
  }

  lastUnreadAttentionCount = unreadCount;
}

function registerEditingShortcuts(window) {
  window.webContents.on("before-input-event", (event, input) => {
    const modifierPressed = process.platform === "darwin" ? input.meta : input.control;

    if (!modifierPressed || !input.key) {
      return;
    }

    const normalizedCode = (input.code || "").toLowerCase();

    if (normalizedCode === "keya") {
      event.preventDefault();
      window.webContents.selectAll();
      return;
    }

    if (normalizedCode === "keyc") {
      event.preventDefault();
      window.webContents.copy();
      return;
    }

    if (normalizedCode === "keyx") {
      event.preventDefault();
      window.webContents.cut();
      return;
    }

    if (normalizedCode === "keyv") {
      event.preventDefault();
      if (input.shift && process.platform === "darwin") {
        window.webContents.pasteAndMatchStyle();
        return;
      }

      window.webContents.paste();
      return;
    }

    if (normalizedCode === "keyz") {
      event.preventDefault();
      if (input.shift) {
        window.webContents.redo();
        return;
      }

      window.webContents.undo();
      return;
    }

    if (normalizedCode === "keyy" && process.platform !== "darwin") {
      event.preventDefault();
      window.webContents.redo();
    }
  });
}

function createWindow() {
  nativeTheme.themeSource = "light";

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "TouchSpace Workspace",
    backgroundColor: "#eff4ff",
    show: false,
    autoHideMenuBar: false,
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
      partition: desktopSessionPartition,
    },
  });

  Menu.setApplicationMenu(createMenu());
  registerEditingShortcuts(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("focus", () => {
    clearDesktopAttention();
    hideOverlayNotificationWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;

    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.destroy();
    }

    notificationWindow = null;
    notificationWindowReady = false;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);

    if (parsed.origin !== shellOrigin && !url.startsWith("file://")) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("context-menu", (event, params) => {
    if (params.isEditable || params.selectionText) {
      event.preventDefault();
      createEditableContextMenu(mainWindow, params);
    }
  });

  if (isDev && shouldOpenDevTools) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    mainWindow?.setTitle(title);
    syncDesktopAttentionFromTitle(title);
  });

  void mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(windowIconPath);
  }

  ipcMain.handle("desktop:get-meta", () => ({
    isDesktopShell: true,
    isPackaged: app.isPackaged,
    platform: process.platform,
    startUrl,
  }));

  ipcMain.handle("desktop:show-notification", async (_, payload) => {
    if (!payload?.title) {
      return false;
    }

    return showOverlayNotificationWindow({
      title: String(payload.title),
      body: typeof payload.body === "string" ? payload.body : "",
      url:
        typeof payload.url === "string" && payload.url.trim()
          ? payload.url.trim()
          : startUrl,
      primaryLabel:
        typeof payload.primaryLabel === "string" && payload.primaryLabel.trim()
          ? payload.primaryLabel.trim()
          : "Открыть",
      secondaryLabel:
        typeof payload.secondaryLabel === "string" && payload.secondaryLabel.trim()
          ? payload.secondaryLabel.trim()
          : "Позже",
      header:
        typeof payload.header === "string" && payload.header.trim()
          ? payload.header.trim()
          : "Входящее сообщение",
    });
  });

  ipcMain.handle("desktop:overlay-notification-action", (_, payload) => {
    const action = payload?.action;

    if (action === "primary") {
      focusMainWindow(
        typeof payload?.url === "string" && payload.url.trim()
          ? payload.url.trim()
          : startUrl,
      );
      hideOverlayNotificationWindow();
      return true;
    }

    hideOverlayNotificationWindow();
    return true;
  });

  ipcMain.on("desktop:auth-storage:get", (event) => {
    event.returnValue = readDesktopAuthSession();
  });

  ipcMain.on("desktop:auth-storage:set", (event, rawValue) => {
    event.returnValue =
      typeof rawValue === "string" && rawValue.trim()
        ? writeDesktopAuthSession(rawValue)
        : false;
  });

  ipcMain.on("desktop:auth-storage:clear", (event) => {
    event.returnValue = clearDesktopAuthSession();
  });

  ipcMain.on("desktop:clipboard:read-text", (event) => {
    event.returnValue = clipboard.readText();
  });

  ipcMain.on("desktop:clipboard:write-text", (event, value) => {
    clipboard.writeText(typeof value === "string" ? value : "");
    event.returnValue = true;
  });

  ipcMain.handle("desktop:show-edit-context-menu", (event, payload) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) {
      return false;
    }

    createEditableContextMenu(
      window,
      {
        editFlags: {
          canUndo: true,
          canRedo: true,
          canCut: true,
          canCopy: Boolean(payload?.hasSelection),
          canPaste: true,
        },
      },
      typeof payload?.x === "number" && typeof payload?.y === "number"
        ? { x: Math.round(payload.x), y: Math.round(payload.y) }
        : {},
    );

    return true;
  });

  ipcMain.handle("desktop:open-external", async (_, url) => {
    if (typeof url !== "string" || !url.trim()) {
      return false;
    }

    await shell.openExternal(url);
    return true;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isAppQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("second-instance", () => {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
});

app.on("web-contents-created", (_, contents) => {
  contents.session.setPermissionRequestHandler((_, permission, callback) => {
    if (permission === "notifications") {
      callback(true);
      return;
    }

    callback(false);
  });
});

app.on("browser-window-focus", () => {
  clearDesktopAttention();
});
