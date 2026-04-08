const { contextBridge, ipcRenderer } = require("electron");

function isTextInput(element) {
  if (!element) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  const supportedTypes = new Set([
    "text",
    "password",
    "search",
    "email",
    "url",
    "tel",
    "number",
  ]);

  return supportedTypes.has((element.type || "text").toLowerCase());
}

function getEditableTarget(target) {
  if (isTextInput(target)) {
    return target;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return target;
  }

  return null;
}

function getSelectedTextFromInput(element) {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? start;
  return element.value.slice(start, end);
}

function replaceSelectedText(element, nextText) {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? start;
  element.setRangeText(nextText, start, end, "end");
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function installEditingShortcutFallback() {
  window.addEventListener(
    "keydown",
    (event) => {
      const isMac = process.platform === "darwin";
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (!modifierPressed || event.altKey || !event.key) {
        return;
      }

      const target = getEditableTarget(event.target);

      if (!target) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "a") {
        event.preventDefault();

        if (isTextInput(target)) {
          target.focus();
          target.select();
          return;
        }

        document.execCommand("selectAll");
        return;
      }

      if (key === "c") {
        if (!navigator.clipboard?.writeText) {
          return;
        }

        event.preventDefault();
        const selectedText = isTextInput(target)
          ? getSelectedTextFromInput(target)
          : window.getSelection()?.toString() ?? "";

        void navigator.clipboard.writeText(selectedText);
        return;
      }

      if (key === "x") {
        if (!navigator.clipboard?.writeText) {
          return;
        }

        event.preventDefault();
        const selectedText = isTextInput(target)
          ? getSelectedTextFromInput(target)
          : window.getSelection()?.toString() ?? "";

        void navigator.clipboard.writeText(selectedText).then(() => {
          if (isTextInput(target)) {
            replaceSelectedText(target, "");
            return;
          }

          document.execCommand("delete");
        });
        return;
      }

      if (key === "v") {
        if (!navigator.clipboard?.readText) {
          return;
        }

        event.preventDefault();
        void navigator.clipboard.readText().then((clipboardText) => {
          if (isTextInput(target)) {
            target.focus();
            replaceSelectedText(target, clipboardText);
            return;
          }

          document.execCommand("insertText", false, clipboardText);
        });
      }
    },
    true,
  );
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installEditingShortcutFallback, {
    once: true,
  });
} else {
  installEditingShortcutFallback();
}

contextBridge.exposeInMainWorld("touchspaceDesktop", {
  platform: process.platform,
  isDesktopShell: true,
  isPackaged: process.env.ELECTRON_IS_PACKAGED === "true",
  getMeta: async () => ipcRenderer.invoke("desktop:get-meta"),
  openExternal: async (url) => ipcRenderer.invoke("desktop:open-external", url),
  authStorage: {
    get: () => ipcRenderer.sendSync("desktop:auth-storage:get"),
    set: (rawValue) => ipcRenderer.sendSync("desktop:auth-storage:set", rawValue),
    clear: () => ipcRenderer.sendSync("desktop:auth-storage:clear"),
  },
});
