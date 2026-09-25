import type { Request, Response, NextFunction } from 'express';
import { can, isSme, type Permission, type AdminRole } from '@mgt/domain';
import { ApiError } from '../../middleware/error';
import type { AdminUserRepository } from '../../persistence/repositories';

export interface AdminRequest extends Request {
  adminId: string;
  adminRoles: AdminRole[];
  adminIsSme: boolean;
}

// Resolves the admin identity ONCE and attaches roles. Every admin route sits behind this,
// so a route can never accidentally run with an unresolved identity — a missing admin record
// is a 403, not an empty role list that silently passes a permissive check.
export function requireAdmin(users: AdminUserRepository, getUserId: (req: Request) => string | null) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!userId) return next(new ApiError(401, 'unauthenticated', 'Admin authentication required.'));
    const admin = await users.get(userId);
    if (!admin) return next(new ApiError(403, 'not_an_admin', 'This account has no admin access.'));
    const r = req as AdminRequest;
    r.adminId = admin.id;
    r.adminRoles = admin.roles;
    r.adminIsSme = isSme(admin.roles);
    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = (req as AdminRequest).adminRoles;
    if (!roles) return next(new ApiError(500, 'rbac_misconfigured', 'requirePermission used without requireAdmin.'));
    if (!can(roles, permission)) {
      return next(new ApiError(403, 'forbidden', `Missing permission: ${permission}`));
    }
    next();
  };
}
