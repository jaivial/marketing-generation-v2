// Mobile header — sticky top bar with hamburger that opens the MobileDrawer.

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Logo, Icon } from './ui';
import { useStore } from '../lib/store';

interface Props {
  title: string;
  breadcrumb?: { label: string; href?: string }[];
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/new': 'New campaign',
  '/campaigns': 'Campaigns',
  '/library': 'Library',
  '/integrations': 'Integrations',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
  '/pricing': 'Pricing',
};

export function deriveTitle(path: string): string {
  if (path.startsWith('/campaigns/')) return 'Campaign';
  return PAGE_TITLES[path] || 'MarketingForge';
}

export function deriveBreadcrumb(path: string): { label: string; href?: string }[] | null {
  if (['/', '/dashboard', '/campaigns'].includes(path)) return null;
  if (path === '/new') return [{ label: 'Campaigns', href: '/campaigns' }, { label: 'New' }];
  if (path.startsWith('/campaigns/')) return [{ label: 'Campaigns', href: '/campaigns' }, { label: 'Detail' }];
  return null;
}

const MobileHeader: React.FC<Props> = ({ title, breadcrumb }) => {
  const { setDrawerOpen } = useStore();

  return (
    <header className="md:hidden sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-2 h-11 flex items-center gap-2 flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(2.75rem + env(safe-area-inset-top))' }}>
      <button
        onClick={() => setDrawerOpen(true)}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900 flex-shrink-0"
        aria-label="Open navigation menu"
      >
        <Icon name="menu" size={20} strokeWidth={2} />
      </button>
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <div className="text-[10px] text-zinc-500 truncate leading-tight">
            {breadcrumb.map((b, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-0.5">/</span>}
                {b.href ? <Link to={b.href} className="hover:text-zinc-300">{b.label}</Link> : b.label}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm font-semibold truncate leading-tight">{title}</p>
      </div>
      <Logo compact />
    </header>
  );
};

export default MobileHeader;
