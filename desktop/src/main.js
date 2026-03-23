const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  shell,
  nativeTheme,
  ipcMain,
} = require("electron");
const path = require("node:path");

process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? "true" : "false";

const isDev = !app.isPackaged;
const defaultRemoteUrl = "https://touchspace-chat-app-git-main-aknilamok-stacks-projects.vercel.app/login";
const startUrl = process.env.DESKTOP_START_URL || defaultRemoteUrl;
const shellOrigin = new URL(startUrl).origin;

let mainWindow = null;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
    },
  });

  Menu.setApplicationMenu(createMenu());

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
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

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  void mainWindow.loadURL(startUrl);
}

app.whenReady().then(() => {
  ipcMain.handle("desktop:get-meta", () => ({
    isDesktopShell: true,
    isPackaged: app.isPackaged,
    platform: process.platform,
    startUrl,
  }));

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
  if (Notification.isSupported() && isDev) {
    // no-op hook reserved for later native unread badge/sync logic
  }
});
