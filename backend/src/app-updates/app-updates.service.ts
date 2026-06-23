import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

type DesktopUpdateInput = {
  latestVersion?: string;
  macUrl?: string;
  windowsUrl?: string;
  title?: string;
  message?: string;
  releaseNotes?: string | null;
  required?: boolean;
  notifyNow?: boolean;
  createdByAdminId?: string;
};

type DesktopUpdateCheckInput = {
  version?: string;
  platform?: string;
};

type DesktopUpdateCheckPayload = {
  updateAvailable: boolean;
  shouldNotify: boolean;
  required: boolean;
  currentVersion: string;
  latestVersion: string;
  title: string;
  message: string;
  releaseNotes: string;
  downloadUrl: string;
  macUrl: string;
  windowsUrl: string;
  notificationToken: string;
  notifiedAt: Date | null;
};

const defaultDesktopUpdate = {
  id: 'desktop',
  latestVersion: '0.1.1',
  macUrl: 'https://chat.touchspace.biz/downloads/TouchSpace-Workspace-mac.dmg',
  windowsUrl: 'https://chat.touchspace.biz/downloads/touchspace-windows.exe',
  title: 'Доступно обновление TouchSpace Workspace',
  message:
    'Обновите приложение, чтобы получить последние исправления уведомлений и стабильности.',
  releaseNotes: '',
  required: false,
};

@Injectable()
export class AppUpdatesService {
  private readonly desktopCheckCache = new Map<
    string,
    { expiresAt: number; payload: DesktopUpdateCheckPayload }
  >();

  constructor(private readonly prisma: PrismaService) {}

  private normalizeVersion(value?: string | null) {
    return value?.trim() || '';
  }

  private parseVersion(value?: string | null) {
    return this.normalizeVersion(value)
      .split('.')
      .map((part) => Number.parseInt(part.replace(/\D.*$/, ''), 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  }

  private isVersionGreater(latestVersion: string, currentVersion: string) {
    const latest = this.parseVersion(latestVersion);
    const current = this.parseVersion(currentVersion);
    const length = Math.max(latest.length, current.length, 3);

    for (let index = 0; index < length; index += 1) {
      const left = latest[index] ?? 0;
      const right = current[index] ?? 0;

      if (left > right) {
        return true;
      }

      if (left < right) {
        return false;
      }
    }

    return false;
  }

  private getDownloadUrl(
    platform?: string | null,
    update: { macUrl: string; windowsUrl: string } = defaultDesktopUpdate,
  ) {
    const normalizedPlatform = platform?.trim().toLowerCase() || '';

    if (normalizedPlatform === 'win32' || normalizedPlatform === 'windows') {
      return update.windowsUrl;
    }

    return update.macUrl;
  }

  private async getOrCreateDesktopUpdate() {
    const existing = await this.prisma.desktopAppUpdate.findUnique({
      where: { id: 'desktop' },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.desktopAppUpdate.create({
      data: {
        ...defaultDesktopUpdate,
        notificationToken: randomUUID(),
      },
    });
  }

  async getDesktopUpdateForAdmin() {
    return this.getOrCreateDesktopUpdate();
  }

  async updateDesktopUpdate(input: DesktopUpdateInput) {
    const latestVersion = this.normalizeVersion(input.latestVersion);
    const macUrl = input.macUrl?.trim();
    const windowsUrl = input.windowsUrl?.trim();
    const title = input.title?.trim();
    const message = input.message?.trim();

    if (!latestVersion) {
      throw new BadRequestException('Укажите версию приложения');
    }

    if (!macUrl || !windowsUrl) {
      throw new BadRequestException('Укажите ссылки на Mac и Windows');
    }

    if (!title || !message) {
      throw new BadRequestException('Укажите заголовок и текст уведомления');
    }

    const now = new Date();

    const updated = await this.prisma.desktopAppUpdate.upsert({
      where: { id: 'desktop' },
      create: {
        id: 'desktop',
        latestVersion,
        macUrl,
        windowsUrl,
        title,
        message,
        releaseNotes: input.releaseNotes?.trim() || null,
        required: Boolean(input.required),
        notificationToken: randomUUID(),
        notifiedAt: input.notifyNow ? now : null,
        createdByAdminId: input.createdByAdminId?.trim() || null,
      },
      update: {
        latestVersion,
        macUrl,
        windowsUrl,
        title,
        message,
        releaseNotes: input.releaseNotes?.trim() || null,
        required: Boolean(input.required),
        ...(input.notifyNow
          ? {
              notificationToken: randomUUID(),
              notifiedAt: now,
            }
          : {}),
        createdByAdminId: input.createdByAdminId?.trim() || null,
      },
    });

    this.desktopCheckCache.clear();
    return updated;
  }

  async checkDesktopUpdate(input: DesktopUpdateCheckInput) {
    const currentVersion = this.normalizeVersion(input.version) || '0.1.0';
    const platform = input.platform?.trim().toLowerCase() || 'unknown';
    const cacheKey = `${currentVersion}:${platform}`;
    const now = Date.now();
    const cached = this.desktopCheckCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const update = await this.getOrCreateDesktopUpdate();
    const updateAvailable = this.isVersionGreater(
      update.latestVersion,
      currentVersion,
    );

    const payload = {
      updateAvailable,
      shouldNotify: updateAvailable && Boolean(update.notifiedAt),
      required: update.required && updateAvailable,
      currentVersion,
      latestVersion: update.latestVersion,
      title: update.title,
      message: update.message,
      releaseNotes: update.releaseNotes ?? '',
      downloadUrl: this.getDownloadUrl(input.platform, update),
      macUrl: update.macUrl,
      windowsUrl: update.windowsUrl,
      notificationToken: update.notificationToken,
      notifiedAt: update.notifiedAt,
    };

    this.desktopCheckCache.set(cacheKey, {
      expiresAt: now + 60_000,
      payload,
    });

    return payload;
  }
}
