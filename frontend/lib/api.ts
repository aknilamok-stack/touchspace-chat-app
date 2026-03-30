const fallbackApiBaseUrl = "http://localhost:3001";

const normalizeBaseUrl = (value?: string | null) => value?.trim().replace(/\/$/, "") ?? "";

const isClearlyStaleApiHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname.endsWith(".vercel.app") ||
  hostname.endsWith(".onrender.com");

const deriveBrowserApiBaseUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, origin } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return fallbackApiBaseUrl;
  }

  if (hostname.startsWith("app.")) {
    return `${protocol}//api.${hostname.slice(4)}`;
  }

  return origin;
};

export const getApiBaseUrl = () => {
  const configuredBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

  if (typeof window === "undefined") {
    return configuredBaseUrl || fallbackApiBaseUrl;
  }

  if (configuredBaseUrl) {
    try {
      const configuredUrl = new URL(configuredBaseUrl);

      if (!isClearlyStaleApiHost(configuredUrl.hostname)) {
        return configuredBaseUrl;
      }
    } catch {
      // Ignore malformed env value and fall back to runtime detection.
    }
  }

  return deriveBrowserApiBaseUrl() || configuredBaseUrl || fallbackApiBaseUrl;
};

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${getApiBaseUrl()}${normalizedPath}`;
};
