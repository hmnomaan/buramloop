import { UserRole, UserSession } from '../types/erp';

export type ModuleKey =
  | 'DASHBOARD'
  | 'MASTER_DATA'
  | 'SOURCING'
  | 'INCOMING_QA'
  | 'WAREHOUSE_STOCK'
  | 'WARM_CABINETS'
  | 'BATCH_PLANNING'
  | 'PROCESSING'
  | 'SHIPMENTS'
  | 'ADMIN_COSTS'
  | 'TRACEABILITY'
  | 'AUDIT_DOCS'
  | 'USER_PROFILE';

interface ModuleAccessRule {
  allowedRoles: readonly UserRole[];
  anyPermissions?: readonly string[];
}

const ALL_ROLES: readonly UserRole[] = [
  'ADMIN',
  'MANAGEMENT',
  'QA_LEAD',
  'PLANT_OPERATOR',
  'WAREHOUSE',
  'INSPECTOR',
];

const MODULE_ACCESS: Record<ModuleKey, ModuleAccessRule> = {
  DASHBOARD: { allowedRoles: ALL_ROLES },
  MASTER_DATA: { allowedRoles: ['ADMIN'] },
  SOURCING: {
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD'],
    anyPermissions: ['sourcing:read', 'sourcing:write', 'management:approve', 'qa:approve'],
  },
  INCOMING_QA: {
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'WAREHOUSE'],
    anyPermissions: ['stock:read'],
  },
  WAREHOUSE_STOCK: {
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'WAREHOUSE', 'INSPECTOR'],
    anyPermissions: ['stock:read'],
  },
  WARM_CABINETS: {
    allowedRoles: ['ADMIN', 'WAREHOUSE', 'PLANT_OPERATOR'],
    anyPermissions: ['warmroom:read', 'warmroom:write'],
  },
  BATCH_PLANNING: {
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'PLANT_OPERATOR'],
    anyPermissions: ['batches:read', 'batches:write', 'batches:approve'],
  },
  PROCESSING: {
    allowedRoles: ['ADMIN', 'PLANT_OPERATOR'],
    anyPermissions: ['processing:read', 'processing:write'],
  },
  SHIPMENTS: {
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD'],
    anyPermissions: ['shipments:read', 'shipments:write', 'qa:approve'],
  },
  ADMIN_COSTS: {
    allowedRoles: ['ADMIN', 'MANAGEMENT'],
    anyPermissions: ['reports:read', 'costs:read'],
  },
  TRACEABILITY: {
    allowedRoles: ['ADMIN', 'MANAGEMENT', 'QA_LEAD', 'INSPECTOR'],
    anyPermissions: ['trace:read'],
  },
  AUDIT_DOCS: {
    allowedRoles: ['ADMIN', 'MANAGEMENT'],
    anyPermissions: ['audit:read', 'exports:run', 'attachments:read', 'admin:compliance'],
  },
  USER_PROFILE: { allowedRoles: ALL_ROLES },
};

export function hasPermission(permissions: readonly string[], required: string): boolean {
  if (permissions.includes('*:*') || permissions.includes(required)) return true;
  const [module] = required.split(':');
  return Boolean(module && permissions.includes(`${module}:*`));
}

export function canAccessModule(user: UserSession, module: ModuleKey): boolean {
  if (user.mustChangePassword) return module === 'USER_PROFILE';
  if (user.role === 'ADMIN' || user.permissions?.includes('*:*')) return true;

  const rule = MODULE_ACCESS[module];
  if (!rule) return false;

  // Role matches default allowed list
  if (rule.allowedRoles.includes(user.role)) {
    if (!rule.anyPermissions?.length) return true;
    return rule.anyPermissions.some((permission) =>
      hasPermission(user.permissions, permission)
    );
  }

  // Admin delegation: User role is not in default list, but user has been explicitly granted module permission
  if (rule.anyPermissions?.length) {
    return rule.anyPermissions.some((permission) =>
      hasPermission(user.permissions, permission)
    );
  }

  return false;
}

export function canReceiveIncomingLots(user: UserSession): boolean {
  return (
    (user.role === 'WAREHOUSE' || user.role === 'ADMIN') &&
    canAccessModule(user, 'INCOMING_QA') &&
    hasPermission(user.permissions, 'stock:write')
  );
}

export function canApproveIncomingLots(user: UserSession): boolean {
  return (
    canAccessModule(user, 'INCOMING_QA') &&
    hasPermission(user.permissions, 'qa:approve')
  );
}
