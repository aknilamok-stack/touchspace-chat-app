const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("touchspaceDesktopNotification", {
  onData: (callback) => {
    ipcRenderer.on("desktop:overlay-notification-data", (_, payload) => {
      callback(payload);
    });
  },
  act: async (action, url) =>
    ipcRenderer.invoke("desktop:overlay-notification-action", {
      action,
      url,
    }),
});
