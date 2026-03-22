import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

type AdminHeadersRequest = Request & {
  adminContext?: {
    adminId: string;
    adminName?: string;
  };
};

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminHeadersRequest>();
    const roleHeader = request.headers['x-touchspace-admin-role'];
    const adminIdHeader = request.headers['x-touchspace-admin-id'];
    const adminNameHeader = request.headers['x-touchspace-admin-name'];

    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
    const adminId = Array.isArray(adminIdHeader) ? adminIdHeader[0] : adminIdHeader;
    const adminName = Array.isArray(adminNameHeader)
      ? adminNameHeader[0]
      : adminNameHeader;

    if (!role || role.trim() !== 'admin') {
      throw new UnauthorizedException('Admin role is required');
    }

    if (!adminId?.trim()) {
      throw new ForbiddenException('Admin id header is required');
    }

    request.adminContext = {
      adminId: adminId.trim(),
      adminName: adminName?.trim() || undefined,
    };

    return true;
  }
}
