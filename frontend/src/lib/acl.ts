// ACL types and helpers shared across the frontend.
//
// We mirror the backend Role / Permission system but keep the names
// lowercase (frontend convention) and provide ergonomic helpers
// for hiding nav items / disabling buttons.

export type RoleName =
  | 'guest'
  | 'user'
  | 'viewer'
  | 'billing'
  | 'admin'
  | 'root';

export type Permission =
  // Pages
  | 'page:landing'
  | 'page:pricing'
  | 'page:dashboard'
  | 'page:campaigns.own'
  | 'page:campaigns.all'
  | 'page:library'
  | 'page:integrations'
  | 'page:analytics.own'
  | 'page:analytics.all'
  | 'page:billing'
  | 'page:settings.own'
  // System admin
  | 'admin:users'
  | 'admin:system'
  | 'admin:logs'
  | 'admin:campaigns.all'
  // Campaign mutations
  | 'campaign:create'
  | 'campaign:delete.own'
  | 'campaign:delete.any'
  // Data-plane
  | 'data:logs'
  | 'data:users'
  | 'data:billing';

export const ALL_ROLES: RoleName[] = [
  'guest', 'user', 'viewer', 'billing', 'admin', 'root',
];

export const ROLE_INFO: Record<RoleName, { label: string; description: string; bit: number }> = {
  guest:   { label: 'Guest',   description: 'Unauthenticated visitor. Can view landing and pricing.',         bit: 1 },
  user:    { label: 'User',    description: 'Standard authenticated user. Create and manage own campaigns.',   bit: 2 },
  viewer:  { label: 'Viewer',  description: 'Read-only access. Useful for sharing dashboards.',            bit: 4 },
  billing: { label: 'Billing', description: 'Can manage billing and integrations.',                         bit: 8 },
  admin:   { label: 'Admin',   description: 'Tenant administrator. Manage users and all tenant data.',      bit: 16 },
  root:    { label: 'Root',    description: 'Global super-administrator. Full system access.',             bit: 32 },
};

// The backend ships the same data via /api/auth/roles and /api/auth/permissions.
// We duplicate the structure here so the UI can render role pickers and
// permission tables without a round-trip. These are kept in sync with
// app/core/acl.py.

export const ROLE_PERMISSIONS_FRONTEND: Record<RoleName, Set<Permission>> = {
  guest: new Set<Permission>([
    'page:landing', 'page:pricing',
  ]),
  user: new Set<Permission>([
    'page:landing', 'page:pricing', 'page:dashboard',
    'page:campaigns.own', 'page:library', 'page:integrations',
    'page:analytics.own', 'page:settings.own',
    'campaign:create', 'campaign:delete.own',
  ]),
  viewer: new Set<Permission>([
    'page:landing', 'page:pricing', 'page:dashboard',
    'page:campaigns.own', 'page:library', 'page:integrations',
    'page:analytics.own', 'page:settings.own',
  ]),
  billing: new Set<Permission>([
    'page:landing', 'page:pricing', 'page:dashboard',
    'page:billing', 'page:integrations', 'data:billing',
  ]),
  admin: new Set<Permission>([
    'page:landing', 'page:pricing', 'page:dashboard',
    'page:campaigns.own', 'page:campaigns.all',
    'page:library', 'page:integrations',
    'page:analytics.own', 'page:analytics.all',
    'page:billing', 'page:settings.own',
    'campaign:create', 'campaign:delete.own', 'campaign:delete.any',
    'admin:users', 'admin:campaigns.all',
    'data:users', 'data:billing',
  ]),
  // root has *every* permission, which is checked via the role check.
  root: new Set<Permission>([]),
};

export function hasRole(rolesFlags: number, role: RoleName): boolean {
  return (rolesFlags & ROLE_INFO[role].bit) !== 0;
}

export function hasAnyRole(rolesFlags: number, roles: RoleName[]): boolean {
  return roles.some(r => hasRole(rolesFlags, r));
}

export function hasAllRoles(rolesFlags: number, roles: RoleName[]): boolean {
  return roles.every(r => hasRole(rolesFlags, r));
}

export function isRoot(rolesFlags: number): boolean {
  return hasRole(rolesFlags, 'root');
}

export function isAdmin(rolesFlags: number): boolean {
  return hasRole(rolesFlags, 'admin') || hasRole(rolesFlags, 'root');
}

export function isAuthenticated(rolesFlags: number): boolean {
  return rolesFlags !== 0 && rolesFlags !== ROLE_INFO.guest.bit;
}

export function canDo(rolesFlags: number, perm: Permission): boolean {
  if (isRoot(rolesFlags)) return true;
  for (const r of ALL_ROLES) {
    if (r === 'root') continue;
    if (!hasRole(rolesFlags, r)) continue;
    if (ROLE_PERMISSIONS_FRONTEND[r]?.has(perm)) return true;
  }
  return false;
}

export function rolesList(rolesFlags: number): RoleName[] {
  return ALL_ROLES.filter(r => hasRole(rolesFlags, r));
}
