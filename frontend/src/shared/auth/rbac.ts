export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  INTERNAL_ADMIN: 'INTERNAL_ADMIN',
  INTERNAL_STAFF: 'INTERNAL_STAFF',
  TENANT_ADMIN: 'TENANT_ADMIN',
  FACULTY: 'FACULTY',
  STUDENT: 'STUDENT',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const GLOBAL_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.INTERNAL_ADMIN,
  ROLES.INTERNAL_STAFF,
];

export const hasRole = (role: Role | undefined, expected: Role[]) => {
  if (!role) return false;
  return expected.includes(role);
};

export const hasPermission = (permissions: string[] | undefined, permission: string) => {
  if (!permissions || permissions.length === 0) return false;
  return permissions.includes('*') || permissions.includes(permission);
};
