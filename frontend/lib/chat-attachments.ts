import { getApiBaseUrl } from "@/lib/api";

export const CHAT_ATTACHMENT_MAX_SIZE = 15 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_SIZE_MB = Math.round(
  CHAT_ATTACHMENT_MAX_SIZE / (1024 * 1024)
);
export const CHAT_ATTACHMENT_ACCEPT = [
  "image/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
  ".csv",
  ".odt",
  ".ods",
  ".odp",
].join(",");

export type ChatAttachmentPayload = {
  url: string;
  name: string;
  caption: string;
  mimeType: string;
  size?: number;
};

export const parseChatAttachmentPayload = (
  content: string
): ChatAttachmentPayload | null => {
  try {
    const parsed = JSON.parse(content) as {
      url?: string;
      name?: string;
      caption?: string;
      mimeType?: string;
      size?: number;
    };

    if (!parsed?.url || !parsed?.name) {
      return null;
    }

    return {
      url: parsed.url.startsWith("http")
        ? parsed.url
        : `${getApiBaseUrl()}${parsed.url}`,
      name: parsed.name,
      caption: parsed.caption || "",
      mimeType: parsed.mimeType || "",
      size: typeof parsed.size === "number" ? parsed.size : undefined,
    };
  } catch {
    return null;
  }
};

export const formatChatAttachmentSize = (size?: number) => {
  if (!size || Number.isNaN(size)) {
    return "";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const getChatAttachmentKind = (
  attachment: Pick<ChatAttachmentPayload, "mimeType" | "name">
) => {
  const normalizedMime = attachment.mimeType.toLowerCase();
  const extension = attachment.name.split(".").pop()?.toLowerCase() ?? "";

  if (normalizedMime.startsWith("image/")) {
    return "image";
  }

  if (normalizedMime === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    normalizedMime.includes("word") ||
    ["doc", "docx", "odt", "rtf"].includes(extension)
  ) {
    return "document";
  }

  if (
    normalizedMime.includes("sheet") ||
    normalizedMime.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(extension)
  ) {
    return "spreadsheet";
  }

  if (
    normalizedMime.includes("presentation") ||
    ["ppt", "pptx", "odp"].includes(extension)
  ) {
    return "presentation";
  }

  if (normalizedMime.startsWith("text/") || extension === "txt") {
    return "text";
  }

  return "file";
};

export const validateChatAttachmentFile = (file: File) => {
  if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
    return `Файл больше ${CHAT_ATTACHMENT_MAX_SIZE_MB} МБ. Выберите вложение поменьше.`;
  }

  return "";
};
