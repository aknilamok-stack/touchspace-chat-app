const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("touchspaceDesktop", {
  platform: process.platform,
  isDesktopShell: true,
  isPackaged: process.env.ELECTRON_IS_PACKAGED === "true",
  getMeta: async () => ipcRenderer.invoke("desktop:get-meta"),
  openExternal: async (url) => ipcRenderer.invoke("desktop:open-external", url),
});
