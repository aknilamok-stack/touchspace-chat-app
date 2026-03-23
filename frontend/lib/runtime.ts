export type DesktopRuntimeMeta = {
  isDesktopShell: boolean;
  isPackaged: boolean;
  platform: string;
  startUrl?: string;
};

declare global {
  interface Window {
    touchspaceDesktop?: {
      isDesktopShell: boolean;
      isPackaged: boolean;
      platform: string;
      getMeta: () => Promise<DesktopRuntimeMeta>;
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}

export const isDesktopShell = () =>
  typeof window !== "undefined" && Boolean(window.touchspaceDesktop?.isDesktopShell);

export const readDesktopRuntimeMeta = async (): Promise<DesktopRuntimeMeta | null> => {
  if (typeof window === "undefined" || !window.touchspaceDesktop) {
    return null;
  }

  try {
    return await window.touchspaceDesktop.getMeta();
  } catch {
    return {
      isDesktopShell: true,
      isPackaged: false,
      platform: "unknown",
    };
  }
};
