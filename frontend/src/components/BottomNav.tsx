// Bottom navigation bar — visible on mobile (<md).
// Shows primary navigation items + a FAB-style "New" button.
//
// iOS Safari fix: on iOS the URL bar collapses on scroll, which can shift
// fixed-position elements. We:
//  1. Use position: sticky with bottom:0 inside a 100dvh flex column
//     (works reliably on all mobile browsers including iOS Safari).
//  2. Set the nav height to include env(safe-area-inset-bottom) so the home
//     indicator never overlaps the buttons.
//  3. Use translate3d / translateZ to force a GPU layer (helps iOS keep the
//     element stable during scroll).

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './ui';
import { cn } from '../lib/utils';

const NAV: { path: string; label: string; icon: IconName; }[] = [
  { path: '/',              label: 'Home',      icon: 'home' },
  { path: '/campaigns',     label: 'Campaigns', icon: 'campaigns' },
  { path: '/new',           label: 'New',       icon: 'plus' },  // Special: FAB style
  { path: '/library',       label: 'Library',   icon: 'library' },
  { path: '/dashboard',     label: 'More',      icon: 'menu' },
];

const MoreDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const navigate = useNavigate();
  if (!open) return null;

  const items: { path: string; label: string; desc: string; icon: IconName }[] = [
    { path: '/integrations', label: 'Integrations', desc: 'Connect AI providers', icon: 'integrations' },
    { path: '/analytics',    label: 'Analytics',     desc: 'Performance & usage',  icon: 'analytics' },
    { path: '/settings',     label: 'Settings',      desc: 'Profile & API keys',   icon: 'settings' },
    { path: '/pricing',      label: 'Pricing',       desc: 'Plans & upgrade',     icon: 'creditCard' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full bg-zinc-900 border-t border-zinc-800 rounded-t-2xl shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 pb-6">
          {/* Handle */}
          <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-4" />
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 px-2">More</h3>
          <div className="grid grid-cols-2 gap-2">
            {items.map(item => (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); onClose(); }}
                className="text-left p-3 rounded-lg hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-800 transition-colors flex items-start gap-3"
              >
                <span className="w-9 h-9 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center flex-shrink-0">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  // iOS Safari fix: when the URL bar collapses, the *visual* viewport
  // shrinks but window.innerHeight doesn't. This hook keeps the bottom nav
  // anchored to the *visual* bottom (i.e. above the URL bar) by adjusting
  // a CSS variable that we use in the inline style. This is the
  // canonical fix used by Bootstrap, MUI, etc.
  const navRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const nav = navRef.current;
    if (!vv || !nav) return;

    const update = () => {
      // offsetTop is the distance from the layout viewport's top to the
      // visual viewport's top. When the URL bar shows, this equals 0; when
      // it hides (visualViewport grows), offsetTop becomes positive.
      // The visible area ends at offsetTop + visualViewport.height.
      // We set --vvh (visible visual height) for any descendants that need it.
      const visible = vv.height;
      document.documentElement.style.setProperty('--vvh', `${visible}px`);
      // Also push the nav up by the delta between the layout viewport bottom
      // and the visual viewport bottom. This is the iOS-specific delta that
      // a plain `position: fixed; bottom: 0` doesn't handle.
      const layoutH = window.innerHeight;
      const delta = Math.max(0, layoutH - visible);
      nav.style.transform = `translate3d(0, 0, 0) translateY(0px)`;
      if (delta > 0) {
        // When the URL bar is visible, visual viewport is shorter; we need
        // to translate the nav up by the URL bar height.
        nav.style.transform = `translate3d(0, 0, 0) translateY(-${delta}px)`;
      }
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <>
      <nav
        ref={navRef}
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 h-16 flex items-stretch flex-shrink-0"
        style={{
          // Total height accounts for the iPhone home indicator. Using
          // env(safe-area-inset-bottom) inside calc keeps the nav buttons
          // above the indicator even when the URL bar collapses.
          height: 'calc(4rem + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          // Force a GPU layer — this is the canonical iOS Safari fix for
          // `position: fixed` elements that get displaced when the URL bar
          // collapses/expands. Combined with will-change: transform it keeps
          // the nav rock-solid during scroll on iOS.
          transform: 'translate3d(0,0,0)',
          WebkitTransform: 'translate3d(0,0,0)',
          willChange: 'transform',
          // Prevent the URL bar collapse from re-flowing the page underneath.
          // This stops the "shrink" effect.
          contain: 'layout style',
          paddingTop: '4px',
        } as React.CSSProperties}
        aria-label="Primary"
      >
        {NAV.map(item => {
          const active = isActive(item.path);
          const isNew = item.icon === 'plus';

          if (isNew) {
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); }}
                className="flex-1 flex flex-col items-center justify-center -mt-5 group"
                aria-label="New campaign"
              >
                <span className="w-11 h-11 rounded-full gradient-bg flex items-center justify-center shadow-lg shadow-brand-950/50 group-active:scale-95 transition-transform">
                  <Icon name="plus" size={22} strokeWidth={2.5} className="text-white" />
                </span>
                <span className="text-[10px] text-zinc-400 mt-0.5">New</span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => {
                if (item.icon === 'menu') {
                  setMoreOpen(true);
                } else {
                  navigate(item.path);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? 'text-brand-300' : 'text-zinc-500'}`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={22} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
};

export default BottomNav;
