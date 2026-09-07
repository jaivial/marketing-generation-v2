// Utility helpers shared across components.

import type { Campaign } from './types';

export function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}

export function autoName(target: string): string {
  try {
    if (!target) return 'Untitled campaign';
    if (target.startsWith('http')) {
      const u = new URL(target);
      return u.hostname.replace('www.', '') + ' campaign';
    }
    return target.split('/').filter(Boolean).slice(-1)[0] || 'Untitled';
  } catch {
    return 'Untitled campaign';
  }
}

export function nFrames(duration_s: number): number {
  return Math.max(2, Math.ceil(duration_s / 2));
}

export const STATUS_PILL: Record<string, { cls: string; label: string; dot?: boolean }> = {
  done:        { cls: 'pill-success', label: 'Done' },
  generating:  { cls: 'pill-warn',    label: 'Generating', dot: true },
  draft:       { cls: 'pill-neutral', label: 'Draft' },
  failed:      { cls: 'pill-error',   label: 'Failed' },
};

// Icon SVG paths (24x24 viewBox) for nav and UI.
export const ICONS: Record<string, string> = {
  dashboard: 'M3 12l2-2 4 4 8-8 4 4-12 12z',
  campaigns: 'M15 10l4-4-4-4M19 6H5a2 2 0 00-2 2v8a2 2 0 002 2h14',
  plus: 'M12 4v16m8-8H4',
  library: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V7a2 2 0 00-2-2H7a2 2 0 00-2 2v4',
  integrations: 'M13.828 10.172a4 4 0 015.656 5.656l-5.657-5.657M10.172 13.828a4 4 0 01-5.656-5.656l5.657 5.657',
  analytics: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  settings: 'M10.325 4.317a2 2 0 013.35 0c.36.572.965.954 1.65 1.014a2 2 0 011.78 1.78c.06.685.442 1.29 1.014 1.65a2 2 0 010 3.35 2 2 0 00-1.014 1.65 2 2 0 01-1.78 1.78 2 2 0 00-1.65 1.014 2 2 0 01-3.35 0 2 2 0 00-1.65-1.014 2 2 0 01-1.78-1.78 2 2 0 00-1.014-1.65 2 2 0 010-3.35 2 2 0 001.014-1.65 2 2 0 011.78-1.78 2 2 0 001.65-1.014zM12 15a3 3 0 100-6 3 3 0 000 6z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
  chevronLeft: 'M15 19l-7-7 7-7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDoubleLeft: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  chevronDoubleRight: 'M13 5l-5 5 5 5M6 5l-5 5 5 5',
  play: 'M4 4l12 6-12 6V4z',
  sparkles: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
};

export function getIconPath(name: keyof typeof ICONS): string {
  return ICONS[name] || '';
}
