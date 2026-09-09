// Route → permission metadata for the *frontend* router.
//
// The backend exposes the same data via GET /api/admin/routes (root only).
// We mirror the structure here so the SPA can render a single source of
// truth for navigation, route guards, and the admin "permission viewer"
// page — without having to ask the server on every navigation.
//
// Each entry describes one React route. `match` is a regex tested against
// `location.pathname`; the first matching entry wins.

import type { Permission, RoleName } from './acl';
import { isRoot, canDo } from './acl';

export type RouteCategory = 'public' | 'user' | 'admin' | 'system';

export interface RouteSpec {
  /** React Router path pattern, e.g. '/admin/users/:id'. */
  path: string;
  /** Regex tested against `location.pathname`. */
  match: RegExp;
  /** Minimum permission required to view the route, or null for public. */
  permission: Permission | null;
  /** Coarse classification used by the nav UI. */
  category: RouteCategory;
  /** Roles that can see this route in nav / links. */
  roles: RoleName[];
  /** Human-readable label shown in nav and breadcrumbs. */
  label: string;
  /** Lucide icon name. */
  icon?: string;
}

// Order matters: more-specific routes come first so they match before the
// catch-all admin route.
export const ROUTES: RouteSpec[] = [
  // ─── Public ───────────────────────────────────────────────────────────────
  { path: '/',         match: /^\/$/,                        permission: 'page:landing', category: 'public', roles: ['guest','user','viewer','billing','admin','root'], label: 'Home',     icon: 'home' },
  { path: '/pricing',  match: /^\/pricing$/,                  permission: 'page:pricing', category: 'public', roles: ['guest','user','viewer','billing','admin','root'], label: 'Pricing', icon: 'creditCard' },
  { path: '/login',    match: /^\/login$/,                    permission: null,           category: 'public', roles: ['guest','user','viewer','billing','admin','root'], label: 'Sign in', icon: 'key' },
  { path: '/register', match: /^\/register$/,                  permission: null,           category: 'public', roles: ['guest','user','viewer','billing','admin','root'], label: 'Create account', icon: 'user' },
  { path: '/confirm',  match: /^\/confirm$/,                   permission: null,           category: 'public', roles: ['guest','user','viewer','billing','admin','root'], label: 'Confirm email', icon: 'mail' },

  // ─── User (authenticated) ─────────────────────────────────────────────────
  { path: '/dashboard',         match: /^\/dashboard$/,          permission: 'page:dashboard',     category: 'user', roles: ['user','admin','root'], label: 'Dashboard',     icon: 'dashboard' },
  { path: '/campaigns',         match: /^\/campaigns$/,          permission: 'page:campaigns.own',  category: 'user', roles: ['user','viewer','admin','root'], label: 'Campaigns', icon: 'campaigns' },
  { path: '/campaigns/:id',     match: /^\/campaigns\/[^/]+$/,    permission: 'page:campaigns.own',  category: 'user', roles: ['user','viewer','admin','root'], label: 'Campaign detail', icon: 'campaigns' },
  { path: '/new',               match: /^\/new$/,                permission: 'campaign:create',     category: 'user', roles: ['user','admin','root'], label: 'New campaign', icon: 'plus' },
  { path: '/library',           match: /^\/library$/,            permission: 'page:library',        category: 'user', roles: ['user','viewer','admin','root'], label: 'Library',     icon: 'library' },
  { path: '/integrations',      match: /^\/integrations$/,       permission: 'page:integrations',   category: 'user', roles: ['user','viewer','billing','admin','root'], label: 'Integrations', icon: 'integrations' },
  { path: '/analytics',         match: /^\/analytics$/,          permission: 'page:analytics.own',  category: 'user', roles: ['user','viewer','admin','root'], label: 'Analytics', icon: 'analytics' },
  { path: '/settings',          match: /^\/settings$/,           permission: 'page:settings.own',   category: 'user', roles: ['user','viewer','billing','admin','root'], label: 'Settings', icon: 'settings' },

  // ─── Admin (root only) ────────────────────────────────────────────────────
  { path: '/admin/users',       match: /^\/admin\/users$/,       permission: 'admin:users', category: 'admin',  roles: ['root'], label: 'User management',  icon: 'users' },
  { path: '/admin/system',      match: /^\/admin\/system$/,      permission: 'admin:system', category: 'system', roles: ['root'], label: 'System management', icon: 'settings' },
  { path: '/admin/logs',        match: /^\/admin\/logs$/,        permission: 'admin:logs', category: 'system', roles: ['root'], label: 'System logs', icon: 'activity' },
  { path: '/admin/acl',         match: /^\/admin\/acl$/,         permission: 'admin:system', category: 'system', roles: ['root'], label: 'ACL matrix', icon: 'shieldCheck' },
];


/** Return the RouteSpec that matches the given pathname, or undefined. */
export function matchRoute(pathname: string): RouteSpec | undefined {
  return ROUTES.find(r => r.match.test(pathname));
}


/** True if the given role set has access to the route. */
export function routeAllowedFor(rolesFlags: number, r: RouteSpec): boolean {
  if (r.permission === null) return true;
  // ROOT shortcut
  if (isRoot(rolesFlags)) return true;
  if (r.permission === undefined) return false;
  return canDo(rolesFlags, r.permission as Permission);
}
