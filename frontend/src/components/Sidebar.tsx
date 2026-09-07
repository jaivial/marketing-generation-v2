// Sidebar — desktop/tablet sidebar with collapse support.
// On mobile (<md) this is hidden; a separate MobileDrawer uses the same nav.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, useStore } from '../lib/store';
import { Logo, Icon, type IconName } from './ui';
import { cn } from '../lib/utils';

interface NavItem {
  path: string;
  labelKey: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { path: '/',              labelKey: 'nav.dashboard',    icon: 'dashboard' },
  { path: '/campaigns',     labelKey: 'nav.campaigns',    icon: 'campaigns' },
  { path: '/new',           labelKey: 'nav.newCampaign',  icon: 'plus' },
  { path: '/library',       labelKey: 'nav.library',      icon: 'library' },
  { path: '/integrations',  labelKey: 'nav.integrations', icon: 'integrations' },
  { path: '/analytics',     labelKey: 'nav.analytics',    icon: 'analytics' },
  { path: '/settings',      labelKey: 'nav.settings',     icon: 'settings' },
];

const ADMIN_NAV: NavItem[] = [
  { path: '/admin/users',  labelKey: 'nav.users',     icon: 'users' },
  { path: '/admin/system', labelKey: 'nav.system',    icon: 'settings' },
  { path: '/admin/logs',   labelKey: 'nav.logs',      icon: 'activity' },
  { path: '/admin/acl',    labelKey: 'nav.aclMatrix', icon: 'shieldCheck' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const { isRoot } = useAuth();
  const { user, sidebarCollapsed, setSidebarCollapsed } = useStore();

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const usagePct = Math.min(100, Math.round((user.usage / user.limit) * 100));

  return (
    <>
      <aside
        className={cn(
          'hidden md:flex sticky top-0 h-[100dvh] bg-zinc-950 border-r border-zinc-800 flex-col z-30 transition-all duration-200 ease-out flex-shrink-0',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Header */}
        <div className="h-14 px-3 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
          {!sidebarCollapsed && <Logo />}
          {sidebarCollapsed && (
            <div className="w-7 h-7 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="white" aria-hidden="true">
                <path d="M3 4h14v12H3z" opacity=".3" />
                <path d="M3 4l7 8 7-8v12H3z" />
              </svg>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(b => !b)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors flex-shrink-0"
            aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            title={sidebarCollapsed ? t('nav.expandSidebarHint') : t('nav.collapseSidebarHint')}
          >
            <Icon name={sidebarCollapsed ? 'chevronDoubleRight' : 'chevronDoubleLeft'} size={16} strokeWidth={2.2} />
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
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  active
                    ? 'bg-brand-500/10 text-brand-300 border border-brand-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent',
                  sidebarCollapsed && 'justify-center px-0'
                )}
                title={sidebarCollapsed ? t(item.labelKey) : undefined}
              >
                <Icon name={item.icon} size={18} />
                {!sidebarCollapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-zinc-800 space-y-2 flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="bg-gradient-to-br from-brand-500/10 to-fuchsia-500/10 border border-brand-500/20 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-brand-300 capitalize flex items-center gap-1.5">
                  <Icon name="crown" size={12} />
                  {t('nav.planLabel', { plan: user.plan })}
                </p>
                <p className="text-xs text-zinc-400">{user.usage} / {user.limit}</p>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                <div className="h-full gradient-bg" style={{ width: `${usagePct}%` }} />
              </div>
              <Link to="/pricing" className="block text-center text-xs bg-zinc-100 text-zinc-900 font-medium py-1.5 rounded-lg hover:bg-white transition">
                {t('nav.upgrade')}
              </Link>
            </div>
          )}
          {isRoot && (
          <div className="pt-1 border-t border-zinc-800/60 space-y-0.5">
            {!sidebarCollapsed && (
              <p className="text-[10px] uppercase tracking-wider text-rose-400/80 px-2 py-1">{t('nav.admin')}</p>
            )}
            {ADMIN_NAV.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  location.pathname.startsWith(item.path)
                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent',
                  sidebarCollapsed && 'justify-center'
                )}
                title={sidebarCollapsed ? t(item.labelKey) : undefined}
              >
                <Icon name={item.icon} size={18} />
                {!sidebarCollapsed && <span>{t(item.labelKey)}</span>}
              </Link>
            ))}
          </div>
        )}
        <Link to="/settings" className={cn('flex items-center gap-2 px-1 cursor-pointer', sidebarCollapsed && 'justify-center')}>
            <div className={cn('w-7 h-7 rounded-full bg-gradient-to-br flex-shrink-0', user.avatar)} />
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user.name}</p>
                <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
              </div>
            )}
          </Link>
        </div>
      </aside>

      {/* Floating "expand sidebar" button when collapsed — visible on md+ */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="hidden md:flex fixed top-3 left-20 z-30 h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white hover:bg-zinc-800 hover:border-brand-500/50 items-center gap-2 shadow-lg font-medium text-sm animate-fade-in"
          aria-label={t('nav.expandSidebar')}
          title={t('nav.expandSidebar')}
        >
          <Icon name="menu" size={18} />
          <span>{t('nav.menu')}</span>
        </button>
      )}
    </>
  );
};
