import type { Request } from 'express';

export type ViewerContext = {
  viewerType?: string;
  viewerId?: string;
};

const readValue = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }

  return value?.trim() || undefined;
};

export const getViewerContext = (
  request: Request,
  fallback?: ViewerContext,
): ViewerContext => ({
  viewerType:
    readValue(request.headers['x-touchspace-viewer-type'] as string | string[] | undefined) ??
    fallback?.viewerType,
  viewerId:
    readValue(request.headers['x-touchspace-viewer-id'] as string | string[] | undefined) ??
    fallback?.viewerId,
});
