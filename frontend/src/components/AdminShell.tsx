// AdminShell — wrapper for the root-only /admin/* pages.
// Provides a sub-navigation, the user info, and a "danger zone" warning.

import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { Icon, type IconName } from './ui';
import AuthMenu from './AuthMenu';
import { cn } from '../lib/utils';

interface AdminNavItem { path: string; label: string; icon: IconName; perm: string; }

const NAV: AdminNavItem[] = [
  { path: '/admin/users',   label: 'Users',         icon: 'users',       perm: 'admin:users'  },
  { path: '/admin/system',  label: 'System',        icon: 'settings',    perm: 'admin:system' },
  { path: '/admin/logs',    label: 'Logs',          icon: 'activity',    perm: 'admin:logs'   },
  { path: '/admin/acl',     label: 'ACL Matrix',    icon: 'shieldCheck', perm: 'admin:system' },
];

const AdminShell: React.FC = () => {
  const { isRoot, email, can } = useAuth();
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
        <Icon name="alertTriangle" size={20} className="text-rose-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-rose-300">
            Restricted area — root operations
          </p>
          <p className="text-xs text-zinc-400 mt-0.5" data-testid="admin-shell-session-line">
            Signed in as {email || 'root'}.
            Actions here affect every user and system setting globally. Use with care.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <AuthMenu scope="admin-shell" />
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-zinc-800">
        {NAV.filter(item => can(item.perm as any)).map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              'px-3 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2',
              isActive
                ? 'bg-zinc-900 text-brand-300 border-t border-x border-zinc-800'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Icon name={item.icon} size={14} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
};

export default AdminShell;
