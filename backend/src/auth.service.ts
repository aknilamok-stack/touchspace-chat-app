import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
  }

  private verifyPassword(
    password: string,
    storedHash: string | null | undefined,
  ) {
    if (!storedHash) {
      return false;
    }

    const [salt, key] = storedHash.split(':');

    if (!salt || !key) {
      return false;
    }

    const derivedKey = scryptSync(password, salt, 64);
    const storedKey = Buffer.from(key, 'hex');

    if (derivedKey.length !== storedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, storedKey);
  }

  private sanitizeLoginCandidate(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._-]+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  }

  private async buildUniqueLogin(baseValue: string) {
    const sanitizedBase =
      this.sanitizeLoginCandidate(baseValue) || `user.${Date.now()}`;
    let candidate = sanitizedBase;
    let counter = 1;

    while (
      await this.prisma.profile.findFirst({ where: { authLogin: candidate } })
    ) {
      candidate = `${sanitizedBase}.${counter}`;
      counter += 1;
    }

    return candidate;
  }

  private generateTemporaryPassword() {
    return randomBytes(6).toString('base64url');
  }

  async issueCredentialsForProfile(
    profileId: string,
    preferredLogin?: string | null,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new BadRequestException(`Profile with id "${profileId}" not found`);
    }

    const loginBase =
      preferredLogin?.trim() ||
      profile.email?.trim() ||
      `${profile.role}.${profile.fullName}` ||
      `user.${profile.id}`;

    const login =
      profile.authLogin?.trim() || (await this.buildUniqueLogin(loginBase));
    const temporaryPassword = this.generateTemporaryPassword();

    await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        authLogin: login,
        passwordHash: this.hashPassword(temporaryPassword),
        passwordChangeRequired: true,
        passwordIssuedAt: new Date(),
      },
    });

    return {
      login,
      temporaryPassword,
      passwordChangeRequired: true,
    };
  }

  async login(login: string, password: string) {
    const normalizedLogin = this.sanitizeLoginCandidate(login);

    const profile = await this.prisma.profile.findFirst({
      where: {
        OR: [{ authLogin: normalizedLogin }, { email: normalizedLogin }],
      },
    });

    if (!profile || !this.verifyPassword(password, profile.passwordHash)) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (
      profile.status === 'blocked' ||
      profile.status === 'inactive' ||
      profile.approvalStatus === 'rejected' ||
      profile.approvalStatus === 'pending' ||
      !profile.isActive
    ) {
      throw new ForbiddenException(
        'Доступ пользователя не активирован или заблокирован администратором',
      );
    }

    const sessionToken = randomUUID();

    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        lastLoginAt: new Date(),
        activeSessionToken: sessionToken,
        activeSessionIssuedAt: new Date(),
        managerStatus: profile.role === 'manager' ? 'online' : undefined,
        managerPresenceHeartbeatAt:
          profile.role === 'manager' ? new Date() : undefined,
        supplierStatus: profile.role === 'supplier' ? 'online' : undefined,
        supplierPresenceHeartbeatAt:
          profile.role === 'supplier' ? new Date() : undefined,
      },
    });

    return {
      user: {
        id: profile.id,
        login: profile.authLogin ?? normalizedLogin,
        role: profile.role,
        fullName: profile.fullName,
        email: profile.email,
        supplierId: profile.supplierId,
        passwordChangeRequired: profile.passwordChangeRequired,
        sessionToken,
      },
    };
  }

  async validateSession(userId: string, sessionToken: string) {
    const normalizedUserId = userId?.trim();
    const normalizedSessionToken = sessionToken?.trim();

    if (!normalizedUserId || !normalizedSessionToken) {
      throw new BadRequestException('userId и sessionToken обязательны');
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        activeSessionToken: true,
      },
    });

    if (!profile || !profile.activeSessionToken) {
      return {
        valid: false,
        reason: 'session_missing',
      };
    }

    if (profile.activeSessionToken !== normalizedSessionToken) {
      return {
        valid: false,
        reason: 'other_device_login',
      };
    }

    return {
      valid: true,
    };
  }

  async logout(userId: string, sessionToken?: string) {
    const normalizedUserId = userId?.trim();
    const normalizedSessionToken = sessionToken?.trim();

    if (!normalizedUserId) {
      throw new BadRequestException('userId обязателен');
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        activeSessionToken: true,
      },
    });

    if (!profile) {
      return {
        ok: true,
      };
    }

    if (
      normalizedSessionToken &&
      profile.activeSessionToken &&
      profile.activeSessionToken !== normalizedSessionToken
    ) {
      return {
        ok: true,
      };
    }

    await this.prisma.profile.update({
      where: { id: normalizedUserId },
      data: {
        activeSessionToken: null,
        activeSessionIssuedAt: null,
      },
    });

    return {
      ok: true,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
    });

    if (!profile) {
      throw new BadRequestException(`Profile with id "${userId}" not found`);
    }

    if (!this.verifyPassword(currentPassword, profile.passwordHash)) {
      throw new UnauthorizedException('Текущий пароль введён неверно');
    }

    if (newPassword.trim().length < 8) {
      throw new BadRequestException(
        'Новый пароль должен быть не короче 8 символов',
      );
    }

    await this.prisma.profile.update({
      where: { id: userId },
      data: {
        passwordHash: this.hashPassword(newPassword),
        passwordChangeRequired: false,
      },
    });

    return {
      ok: true,
    };
  }
}
