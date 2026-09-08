// MobileDrawer — slides in from the LEFT when the hamburger is tapped (<md only).
// Contains the same nav as the desktop sidebar, plus user info and a "New campaign" CTA.

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon, Logo, type IconName } from './ui';
import { cn } from '../lib/utils';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { path: '/',              label: 'Dashboard',     icon: 'dashboard' },
  { path: '/campaigns',     label: 'Campaigns',     icon: 'campaigns' },
  { path: '/new',           label: 'New campaign',  icon: 'plus' },
  { path: '/library',       label: 'Library',       icon: 'library' },
  { path: '/integrations',  label: 'Integrations',  icon: 'integrations' },
  { path: '/analytics',     label: 'Analytics',     icon: 'analytics' },
  { path: '/settings',      label: 'Settings',      icon: 'settings' },
  { path: '/pricing',       label: 'Pricing',       icon: 'creditCard' },
];

export const MobileDrawer: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, drawerOpen, setDrawerOpen } = useStore();

  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (drawerOpen) {
      document.documentElement.classList.add('drawer-open');
    } else {
      document.documentElement.classList.remove('drawer-open');
    }
    return () => { document.documentElement.classList.remove('drawer-open'); };
  }, [drawerOpen]);

  // Close on Escape.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  const close = () => setDrawerOpen(false);

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <>
      {/* Backdrop — click to close. Visible only when open. */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer — slides from left */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 z-50 h-screen w-72 max-w-[80vw] bg-zinc-950 border-r border-zinc-800 flex flex-col transition-transform duration-200 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="h-14 px-3 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
          <Logo />
          <button
            onClick={close}
            className="flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800"
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* "New campaign" CTA at the top */}
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={() => { navigate('/new'); close(); }}
            className="w-full btn btn-primary justify-center"
          >
            <Icon name="plus" size={16} />
            <span>New campaign</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 text-sm overflow-y-auto scrollbar-thin">
          {NAV.map(item => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={close}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  active
                    ? 'bg-brand-500/10 text-brand-300 border border-brand-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
                )}
              >
                <Icon name={item.icon} size={18} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer with user info */}
        <div className="p-2 border-t border-zinc-800 flex-shrink-0">
          <Link
            to="/settings"
            onClick={close}
            className="flex items-center gap-2 px-1 py-1 cursor-pointer rounded-lg hover:bg-zinc-900"
          >
            <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex-shrink-0', user.avatar)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
            </div>
            <Icon name="chevronRight" size={16} className="text-zinc-600 flex-shrink-0" />
          </Link>
        </div>
      </aside>
    </>
  );
};
