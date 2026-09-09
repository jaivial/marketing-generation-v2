// Global ACL guard for the React Router.
//
// Wraps each route element with `RequirePermission` so the SPA enforces the
// same permissions as the backend (ROUTE_PERMISSIONS). When the principal
// doesn't have the route's required permission we either:
//
//   * redirect to /login (if not authenticated)
//   * redirect to /dashboard (if authenticated but unauthorised)
//
// This is the frontend mirror of `app.main.ACLMiddleware` and exists so a
// user can't even render a page they shouldn't see, let alone hit the API.

import React from 'react';
import { useAuth } from './store';
import { matchRoute, routeAllowedFor } from './routes';
import type { Permission } from './acl';
import { Icon } from '../components/ui';
import { Link, useLocation, Navigate } from 'react-router-dom';

interface GuardProps {
  /** Override the required permission (otherwise read from the route registry). */
  permission?: Permission | null;
  /** Optional children to render when access is granted. */
  children: React.ReactNode;
}

/** Standalone "access denied" panel used when the user is auth'd but lacks permission. */
const Denied: React.FC<{ permission?: Permission | null; pathname: string }> = ({ permission, pathname }) => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
    <div className="max-w-md text-center">
      <Icon name="shieldAlert" size={48} className="text-rose-400 mx-auto mb-4" />
      <h1 className="text-2xl font-semibold mb-2">Access denied</h1>
      <p className="text-sm text-zinc-400">
        Your current role does not grant access to
        <code className="text-zinc-200 mx-1">{pathname}</code>
        {permission ? (
          <>
            (requires <code className="text-zinc-200">{permission}</code>).
          </>
        ) : (
          <>.</>
        )}
      </p>
      <p className="text-xs text-zinc-500 mt-3">
        Sign in with an account that has the right access.
      </p>
      <Link to="/login" className="btn btn-primary mt-6 text-sm inline-flex items-center gap-2"
        data-testid="guard-access-denied-signin-link">
        <Icon name="key" size={14} /> Sign in
      </Link>
    </div>
  </div>
);

/** Standalone "loading" panel used while the auth state is being resolved. */
const Loading: React.FC = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm gap-2">
    <Icon name="loader" size={16} className="animate-spin" />
    <span>Checking permissions…</span>
  </div>
);

/** Wraps a route and blocks access unless the principal has the right permission. */
export const RequirePermission: React.FC<GuardProps> = ({ permission, children }) => {
  const { isAuthenticated, roles, loading } = useAuth();
  const location = useLocation();
  // Decide the permission: explicit override wins, otherwise look up by path
  const route = matchRoute(location.pathname);
  const requiredPerm = permission !== undefined ? permission : (route?.permission ?? null);

  if (requiredPerm === null) return <>{children}</>;
  if (loading) return <Loading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!routeAllowedFor(roles, { permission: requiredPerm } as any)) {
    return <Denied permission={requiredPerm ?? undefined} pathname={location.pathname} />;
  }
  return <>{children}</>;
};

/** Shorthand: gate a route on a specific permission. */
export const requirePerm = (perm: Permission) => (children: React.ReactNode) =>
  <RequirePermission permission={perm}>{children}</RequirePermission>;
