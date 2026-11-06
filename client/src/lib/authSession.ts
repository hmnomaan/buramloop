import { UserSession, UserRole } from '../types/erp';

interface ApiAuthUser {
  id?: string;
  _id?: string;
  userId?: string;
  email: string;
  fullName?: string;
  role?: string;
  roleName?: string;
  permissions?: string[];
  avatarAttachmentId?: string | null;
  mustChangePassword?: boolean;
}

const ROLE_CODES: Record<string, UserRole> = {
  ADMIN: 'ADMIN',
  MANAGEMENT: 'MANAGEMENT',
  QA: 'QA_LEAD',
  QA_LEAD: 'QA_LEAD',
  PRODUCTION: 'PLANT_OPERATOR',
  PLANT_OPERATOR: 'PLANT_OPERATOR',
  WAREHOUSE: 'WAREHOUSE',
  INSPECTOR: 'INSPECTOR',
};

export function toUserSession(user: ApiAuthUser): UserSession {
  const roleName = user.role ?? user.roleName;
  const role = roleName
    ? (ROLE_CODES[roleName.toUpperCase()] || (roleName as UserRole))
    : undefined;
  const id = user.id ?? user._id ?? user.userId;

  if (!id || !user.email || !role || !Array.isArray(user.permissions)) {
    throw new Error('The server returned an incomplete or unsupported user session.');
  }

  return {
    id,
    name: user.fullName || user.email,
    email: user.email,
    role,
    permissions: user.permissions,
    stationId: 'DE-BB-HND-01',
    avatarAttachmentId: user.avatarAttachmentId ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
  };
}
