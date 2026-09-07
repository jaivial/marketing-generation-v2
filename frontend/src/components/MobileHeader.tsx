// Mobile header — sticky top bar with hamburger that opens the MobileDrawer.

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo, Icon } from './ui';
import LanguageSwitcher from './LanguageSwitcher';
import { useStore } from '../lib/store';

export interface Crumb {
  /** i18n key for the crumb label. */
  labelKey: string;
  href?: string;
}

interface Props {
  title: string;
  breadcrumb?: Crumb[];
}

// Route → i18n key. The caller translates; keeping keys here means the map
// stays a pure, testable data structure.
const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.dashboard',
  '/dashboard': 'nav.dashboard',
  '/new': 'nav.newCampaign',
  '/campaigns': 'nav.campaigns',
  '/library': 'nav.library',
  '/integrations': 'nav.integrations',
  '/analytics': 'nav.analytics',
  '/settings': 'nav.settings',
  '/pricing': 'nav.pricing',
};

/** Return the i18n key for a route's page title. */
export function deriveTitleKey(path: string): string {
  if (path.startsWith('/campaigns/')) return 'nav.campaign';
  return PAGE_TITLE_KEYS[path] || 'common.appName';
}

/** Return the breadcrumb trail (as i18n keys) for a route. */
export function deriveBreadcrumbKeys(path: string): Crumb[] | null {
  if (['/', '/dashboard', '/campaigns'].includes(path)) return null;
  if (path === '/new') return [{ labelKey: 'nav.campaigns', href: '/campaigns' }, { labelKey: 'nav.new' }];
  if (path.startsWith('/campaigns/')) return [{ labelKey: 'nav.campaigns', href: '/campaigns' }, { labelKey: 'nav.detail' }];
  return null;
}

const MobileHeader: React.FC<Props> = ({ title, breadcrumb }) => {
  const { t } = useTranslation();
  const { setDrawerOpen } = useStore();

  return (
    <header className="md:hidden sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-2 h-11 flex items-center gap-2 flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(2.75rem + env(safe-area-inset-top))' }}>
      <button
        onClick={() => setDrawerOpen(true)}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900 flex-shrink-0"
        aria-label={t('nav.openMenu')}
      >
        <Icon name="menu" size={20} strokeWidth={2} />
      </button>
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <div className="text-[10px] text-zinc-500 truncate leading-tight">
            {breadcrumb.map((b, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-0.5">/</span>}
                {b.href
                  ? <Link to={b.href} className="hover:text-zinc-300">{t(b.labelKey)}</Link>
                  : t(b.labelKey)}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm font-semibold truncate leading-tight">{title}</p>
      </div>
      <LanguageSwitcher className="!px-1.5 !py-1 max-w-[5.5rem]" />
      <Logo compact />
    </header>
  );
};

export default MobileHeader;
