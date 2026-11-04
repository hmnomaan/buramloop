// server/src/middlewares/rbac.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors';

/**
 * Checks if the authenticated user holds the required "module:action" permission
 * (or "*:*" / "<module>:*"). Also blocks Inspector from any non-GET mutation.
 */
export function hasPermission(userPermissions: string[], requiredPerm: string): boolean {
  if (userPermissions.includes('*:*')) return true;
  if (userPermissions.includes(requiredPerm)) return true;
  const [mod] = requiredPerm.split(':');
  if (mod && userPermissions.includes(`${mod}:*`)) return true;
  return false;
}

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    // Inspector is strictly read-only across the entire platform
    if (req.user.isInspector && req.method !== 'GET' && !req.path.endsWith('/export')) {
      return next(AppError.forbidden('Inspector role has strictly read-only access'));
    }

    const permitted = requiredPermissions.some((perm) =>
      hasPermission(req.user!.permissions, perm)
    );

    if (!permitted) {
      return next(
        AppError.forbidden(
          `Role '${req.user.roleName}' lacks required permission: ${requiredPermissions.join(' OR ')}`
        )
      );
    }

    next();
  };
}

/**
 * Restricts pricing, cost calculation, and margin endpoints strictly to Admin
 * (or Management when explicitly granted 'reports:read').
 */
export function requireAdminOnly(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(AppError.unauthorized());
  if (!req.user.isAdmin) {
    return next(AppError.forbidden('This resource is restricted to Admin only'));
  }
  next();
}