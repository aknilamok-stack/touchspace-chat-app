import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from './prisma.service';
import { isManagerRole, isSupplierRole } from './role.utils';

type DemoAccount = {
  aliases: string[];
  password: string;
  profile: {
    id: string;
    authLogin: string;
    fullName: string;
    role:
      | 'admin'
      | 'manager'
      | 'supplier'
      | 'manager_supervisor'
      | 'supplier_supervisor';
    supplierId?: string | null;
  };
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly demoAccounts: DemoAccount[] = [
    {
      aliases: ['admin'],
      password: 'admin123',
      profile: {
        id: 'admin_touchspace',
        authLogin: 'admin',
        fullName: 'TouchSpace Admin',
        role: 'admin',
      },
    },
    {
      aliases: ['manager', 'anna'],
      password: 'manager123',
      profile: {
        id: 'manager_anna',
        authLogin: 'anna',
        fullName: 'Анна',
        role: 'manager',
      },
    },
    {
      aliases: ['ekaterina'],
      password: 'manager123',
      profile: {
        id: 'manager_ekaterina',
        authLogin: 'ekaterina',
        fullName: 'Екатерина',
        role: 'manager',
      },
    },
    {
      aliases: ['mikhail'],
      password: 'manager123',
      profile: {
        id: 'manager_mikhail',
        authLogin: 'mikhail',
        fullName: 'Михаил',
        role: 'manager',
      },
    },
    {
      aliases: ['supplier'],
      password: 'supplier123',
      profile: {
        id: 'supplier_karelia',
        authLogin: 'supplier',
        fullName: 'Karelia',
        role: 'supplier',
        supplierId: 'supplier_karelia',
      },
    },
    {
      aliases: ['managerlead', 'manager.supervisor'],
      password: 'managerlead123',
      profile: {
        id: 'manager_supervisor_touchspace',
        authLogin: 'managerlead',
        fullName: 'Управленец менеджеров',
        role: 'manager_supervisor',
      },
    },
    {
      aliases: ['supplierlead', 'supplier.supervisor'],
      password: 'supplierlead123',
      profile: {
        id: 'supplier_supervisor_karelia',
        authLogin: 'supplierlead',
        fullName: 'Управленец поставщика',
        role: 'supplier_supervisor',
        supplierId: 'supplier_karelia',
      },
    },
  ];

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

  private findDemoAccount(login: string) {
    return this.demoAccounts.find((account) => account.aliases.includes(login));
  }

  private async ensureDemoProfile(account: DemoAccount) {
    const existingProfile = await this.prisma.profile.findUnique({
      where: { id: account.profile.id },
    });

    const data = {
      fullName: account.profile.fullName,
      role: account.profile.role,
      authLogin: account.profile.authLogin,
      supplierId: account.profile.supplierId ?? null,
      status: 'active',
      approvalStatus: 'approved',
      isActive: true,
      passwordHash:
        existingProfile?.passwordHash ?? this.hashPassword(account.password),
      passwordChangeRequired: false,
    };

    return this.prisma.profile.upsert({
      where: { id: account.profile.id },
      create: {
        id: account.profile.id,
        ...data,
      },
      update: data,
    });
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
    const demoAccount = this.findDemoAccount(normalizedLogin);

    let profile = await this.prisma.profile.findFirst({
      where: {
        OR: [{ authLogin: normalizedLogin }, { email: normalizedLogin }],
      },
    });

    const passwordMatchesProfile = profile
      ? this.verifyPassword(password, profile.passwordHash)
      : false;

    if (!passwordMatchesProfile) {
      if (!demoAccount || demoAccount.password !== password) {
        throw new UnauthorizedException('Неверный логин или пароль');
      }

      profile = await this.ensureDemoProfile(demoAccount);
    }

    if (!profile) {
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
        managerStatus: isManagerRole(profile.role) ? 'online' : undefined,
        managerPresenceHeartbeatAt:
          isManagerRole(profile.role) ? new Date() : undefined,
        supplierStatus: isSupplierRole(profile.role) ? 'online' : undefined,
        supplierPresenceHeartbeatAt:
          isSupplierRole(profile.role) ? new Date() : undefined,
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
        chatAccessEnabled: profile.chatAccessEnabled,
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
