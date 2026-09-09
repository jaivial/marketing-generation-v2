// TopBar — page title + optional breadcrumb + actions.

import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './ui';
import AuthMenu from './AuthMenu';
import { cn } from '../lib/utils';

interface Props {
  title: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[] | null;
  actions?: React.ReactNode | React.ReactNode[];
}

const TopBar: React.FC<Props> = ({ title, breadcrumb, actions }) => {
  const hasActions = Array.isArray(actions) ? actions.length > 0 : !!actions;
  return (
    <div className="flex items-start sm:items-center justify-between gap-3 mb-6 sm:mb-8">
      <div className="min-w-0 flex-1">
        {breadcrumb && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500 mb-1">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <Icon name="chevronRight" size={12} className="text-zinc-700" />}
                {b.href ? <Link to={b.href} className="hover:text-zinc-300">{b.label}</Link> : b.label}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold font-display truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        {hasActions && (
          <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>
        )}
        {/* Account area: email + Sign out, or Sign in / Create account. */}
        <AuthMenu />
      </div>
    </div>
  );
};

export default TopBar;
