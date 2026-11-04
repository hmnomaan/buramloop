export const WAREHOUSE_ROLE_PERMISSIONS = [
  'stock:read',
  'stock:write',
  'warmroom:read',
  'warmroom:write',
  'attachments:read',
  'attachments:write',
  'exports:run',
] as const;

export function getEffectiveRolePermissions(
  roleName: string,
  permissions: readonly string[] = []
): string[] {
  const effectivePermissions = new Set(permissions);

  if (roleName.trim().toLowerCase() === 'warehouse') {
    WAREHOUSE_ROLE_PERMISSIONS.forEach((permission) => effectivePermissions.add(permission));
  }

  return [...effectivePermissions];
}
