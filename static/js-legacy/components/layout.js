// App shell — sidebar + topbar + main slot. Mobile-responsive down to 230px.
import { h, cn } from '../lib/dom.js';
import { router } from '../lib/router.js';

const NAV = [
  { path: '/',              label: 'Dashboard',     icon: 'M3 12l2-2 4 4 8-8 4 4-12 12z' },
  { path: '/campaigns',     label: 'Campaigns',     icon: 'M15 10l4-4-4-4M19 6H5a2 2 0 00-2 2v8a2 2 0 002 2h14' },
  { path: '/new',           label: 'New campaign',  icon: 'M12 4v16m8-8H4' },
  { path: '/library',       label: 'Library',       icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V7a2 2 0 00-2-2H7a2 2 0 00-2 2v4' },
  { path: '/integrations',  label: 'Integrations',  icon: 'M13.828 10.172a4 4 0 015.656 5.656l-5.657-5.657M10.172 13.828a4 4 0 01-5.656-5.656l5.657 5.657' },
  { path: '/analytics',     label: 'Analytics',     icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { path: '/settings',      label: 'Settings',      icon: 'M10.325 4.317a2 2 0 013.35 0c.36.572.965.954 1.65 1.014a2 2 0 011.78 1.78c.06.685.442 1.29 1.014 1.65a2 2 0 010 3.35 2 2 0 00-1.014 1.65 2 2 0 01-1.78 1.78 2 2 0 00-1.65 1.014 2 2 0 01-3.35 0 2 2 0 00-1.65-1.014 2 2 0 01-1.78-1.78 2 2 0 00-1.014-1.65 2 2 0 010-3.35 2 2 0 001.014-1.65 2 2 0 011.78-1.78 2 2 0 001.65-1.014zM12 15a3 3 0 100-6 3 3 0 000 6z' },
];

const ICON = (path, size = 16) => h('svg', {
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  html: `<path d="${path}"/>`
});

export const Logo = (props = {}) => {
  const { compact = false } = props;
  return h('div', { class: 'flex items-center gap-2' }, [
    h('div', { class: 'w-7 h-7 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0' }, [
      h('svg', { width: 14, height: 14, viewBox: '0 0 20 20', fill: 'white', html: '<path d="M3 4h14v12H3z" opacity=".3"/><path d="M3 4l7 8 7-8v12H3z"/>' })
    ]),
    compact ? null : h('span', { class: 'font-semibold tracking-tight whitespace-nowrap' }, [
      'Marketing', h('span', { class: 'text-brand-400' }, 'Forge')
    ])
  ]);
};

// Drawer controller: open/close logic in a small object that controls DOM classes.
// We use a single shared controller per shell so menu toggles work consistently.
const Drawer = () => {
  const api = {
    open() {
      document.documentElement.classList.add('drawer-open');
    },
    close() {
      document.documentElement.classList.remove('drawer-open');
    },
    toggle() {
      document.documentElement.classList.toggle('drawer-open');
    }
  };
  return api;
};

// Sidebar — slides over content on mobile (<768px), inline on desktop.
export const Sidebar = ({ currentPath, usage, limit, plan, name, email, avatar }) => {
  const nav = h('nav', { class: 'flex-1 p-2 md:p-3 space-y-0.5 text-sm overflow-y-auto scrollbar-thin' });
  for (const item of NAV) {
    const active = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
    const a = h('a', {
      href: '#' + item.path,
      class: cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer',
        active
          ? 'bg-brand-500/10 text-brand-300 border border-brand-500/20'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
      )
    }, [
      ICON(item.icon, 18),
      h('span', { class: 'truncate nav-label' }, item.label),
      item.badge && h('span', { class: 'ml-auto text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded nav-badge' }, String(item.badge))
    ]);
    nav.appendChild(a);
  }

  const usagePct = Math.min(100, Math.round((usage / limit) * 100));
  // Compact footer: upgrade card hidden on very narrow screens to save space;
  // user row always visible (it's the most useful thing).
  const upgrade = h('div', { class: 'p-2 md:p-3 border-t border-zinc-800 space-y-2 md:space-y-3 flex-shrink-0' }, [
    h('div', { class: 'hidden sm:block upgrade-card bg-gradient-to-br from-brand-500/10 to-fuchsia-500/10 border border-brand-500/20 rounded-xl p-4' }, [
      h('div', { class: 'flex items-center justify-between mb-1' }, [
        h('p', { class: 'text-xs font-semibold text-brand-300 capitalize' }, plan + ' plan'),
        h('p', { class: 'text-xs text-zinc-400' }, `${usage} / ${limit}`)
      ]),
      h('div', { class: 'h-1 bg-zinc-800 rounded-full overflow-hidden mb-3' }, [
        h('div', { class: 'h-full gradient-bg', style: { width: usagePct + '%' } })
      ]),
      h('a', { href: '#/pricing', class: 'block text-center text-xs bg-zinc-100 text-zinc-900 font-medium py-1.5 rounded-lg hover:bg-white transition' }, 'Upgrade'),
    ]),
    h('a', { href: '#/settings', class: 'user-info flex items-center gap-2 px-1 cursor-pointer' }, [
      h('div', { class: cn('w-7 h-7 rounded-full bg-gradient-to-br flex-shrink-0', avatar) }),
      h('div', { class: 'flex-1 min-w-0' }, [
        h('p', { class: 'text-xs font-medium truncate' }, name),
        h('p', { class: 'text-[10px] text-zinc-500 truncate' }, email)
      ])
    ])
  ]);

  // Toggle sidebar collapsed state (desktop/tablet only). Mobile uses drawer.
  // Persists preference in localStorage.
  const SIDEBAR_KEY = 'mf-sidebar-collapsed';
  // Apply saved preference on load
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === '1') {
      document.documentElement.classList.add('sidebar-collapsed');
    }
  } catch {}
  const toggleSidebar = () => {
    const html = document.documentElement;
    html.classList.toggle('sidebar-collapsed');
    try { localStorage.setItem(SIDEBAR_KEY, html.classList.contains('sidebar-collapsed') ? '1' : '0'); } catch {}
  };

  // Outer uses Tailwind classes that depend on .drawer-open class on <html>.
  // Width: 80vw on mobile (auto-shrinks for narrow viewports); md+ it's 240px.
  // Users can also collapse on tablet+ via the sidebar-collapse button.
  const aside = h('aside', {
    id: 'mf-sidebar',
    class: cn(
      'mf-sidebar bg-zinc-950 h-screen flex-col flex-shrink-0 z-40',
      'fixed top-0 left-0 -translate-x-full transition-transform duration-200 ease-out',
      'w-[min(80vw,18rem)] sm:w-72',
      'md:sticky md:top-0 md:translate-x-0 md:flex md:w-60 md:border-r md:border-zinc-800'
    )
  }, [
    h('div', { class: 'h-14 px-5 flex items-center justify-between border-b border-zinc-800 flex-shrink-0' }, [
      Logo(),
      h('div', { class: 'flex items-center gap-1' }, [
        // Tablet/desktop collapse button — big, visible, always on md+
        h('button', {
          class: 'hidden md:flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-colors',
          'aria-label': 'Collapse sidebar',
          title: 'Collapse sidebar (more room for content)',
          onClick: toggleSidebar,
        }, [
          // Left-chevron double icon — visually clear "collapse left"
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>' })
        ]),
        // Mobile close button (visible when drawer is open on mobile)
        h('button', {
          class: 'md:hidden flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800',
          'aria-label': 'Close menu',
          onClick: () => Drawer().close()
        }, [
          h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M6 18L18 6M6 6l12 12"/>' })
        ])
      ])
    ]),
    nav,
    upgrade,
    // Persistent edge handle (visible on md+) — click to collapse
    h('div', {
      class: 'mf-sidebar-edge-handle',
      title: 'Click to collapse sidebar',
      onClick: toggleSidebar,
    })
  ]);
  return aside;
};

// Backdrop overlay (mobile only).
export const Backdrop = () => h('div', {
  id: 'mf-backdrop',
  class: 'mf-backdrop md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30',
  onClick: () => Drawer().close()
});


// Touch-swipe: close drawer (swipe left anywhere), open drawer (swipe right from left edge).
let __mfSwipeBound = false;
const bindSwipeToClose = () => {
  if (__mfSwipeBound) return;
  __mfSwipeBound = true;
  let startX = 0, startY = 0, startT = 0;
  const onStart = (e) => {
    const t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY; startT = Date.now();
  };
  const onMove = (e) => {
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // Only react to fast, horizontal, short swipes.
    if (Math.abs(dx) < 50 || Math.abs(dy) > 80) return;
    const isOpen = document.documentElement.classList.contains('drawer-open');
    if (isOpen && dx < 0) {
      Drawer().close();
      startX = -10000;
    } else if (!isOpen && dx > 0 && startX < 24 && window.innerWidth < 768) {
      Drawer().open();
      startX = -10000;
    }
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: true });
  // Mouse fallback for testing
  document.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
};
bindSwipeToClose();

export const MobileHeader = ({ title, breadcrumb }) => {
  return h('header', {
    class: 'md:hidden sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-2 h-11 flex items-center gap-2 flex-shrink-0'
  }, [
    h('button', {
      class: 'w-9 h-9 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900 flex-shrink-0',
      'aria-label': 'Open menu',
      onClick: () => Drawer().open()
    }, [
      h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M4 6h16M4 12h16M4 18h16"/>' })
    ]),
    h('div', { class: 'flex-1 min-w-0' }, [
      breadcrumb && h('div', { class: 'text-[10px] text-zinc-500 truncate leading-tight' }, breadcrumb.map((b, i) => h('span', {}, [
        i > 0 && h('span', { class: 'mx-0.5' }, '/'),
        h('a', { href: b.href || '#', class: 'hover:text-zinc-300' }, b.label)
      ]))),
      h('p', { class: 'text-sm font-semibold truncate leading-tight' }, title)
    ]),
    Logo({ compact: true })
  ]);
};

export const TopBar = ({ title, breadcrumb, actions }) => {
  return h('div', { class: 'flex items-start sm:items-center justify-between gap-3 mb-6 sm:mb-8' }, [
    h('div', { class: 'min-w-0 flex-1' }, [
      breadcrumb && h('div', { class: 'hidden sm:flex items-center gap-2 text-xs text-zinc-500 mb-1' }, [
        ...breadcrumb.map((b, i) => h('span', {}, [
          i > 0 && h('span', { class: 'mx-1' }, '/'),
          h('a', { href: b.href || '#', class: 'hover:text-zinc-300' }, b.label)
        ]))
      ]),
      h('h1', { class: 'text-xl sm:text-2xl font-semibold font-display truncate' }, title),
    ]),
    actions && actions.length > 0 ? h('div', { class: 'flex items-center gap-2 flex-shrink-0 flex-wrap justify-end' }, actions) : null
  ]);
};

// App shell — wraps a page in sidebar+main, with mobile drawer.
export const Shell = ({ user, page, currentPath }) => {
  const main = h('main', { class: 'flex-1 px-3 py-4 sm:p-6 md:p-8 max-w-7xl w-full page-enter overflow-x-hidden' }, [page]);
  const sidebar = Sidebar({
    currentPath,
    usage: user.usage, limit: user.limit, plan: user.plan,
    name: user.name, email: user.email, avatar: user.avatar,
  });
  const backdrop = Backdrop();

  // Floating "open sidebar" button — visible on md+ when sidebar is collapsed.
  // More prominent: shows icon + "Menu" label so it's discoverable.
  const expandSidebar = () => {
    document.documentElement.classList.remove('sidebar-collapsed');
    try { localStorage.setItem('mf-sidebar-collapsed', '0'); } catch {}
  };
  const expandBtn = h('button', {
    id: 'mf-expand-sidebar',
    class: 'fixed top-3 left-3 z-30 h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white hover:bg-zinc-800 hover:border-brand-500/50 items-center gap-2 shadow-lg font-medium text-sm',
    style: { display: 'none' },
    'aria-label': 'Open sidebar',
    title: 'Open sidebar',
    onClick: expandSidebar,
  }, [
    h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M4 6h16M4 12h16M4 18h16"/>' }),
    h('span', {}, 'Menu')
  ]);
  const contentWrap = h('div', { class: 'flex-1 flex flex-col min-w-0' }, [
    MobileHeader({
      title: pageTitle(currentPath),
      breadcrumb: deriveBreadcrumb(currentPath),
    }),
    main
  ]);

  return h('div', { class: 'flex min-h-screen bg-zinc-950' }, [
    sidebar,
    backdrop,
    expandBtn,
    contentWrap
  ]);
};

const deriveBreadcrumb = (path) => {
  if (!path || path === '/' || path === '/dashboard') return null;
  if (path === '/new') return [{ label: 'Campaigns', href: '#/campaigns' }, { label: 'New' }];
  if (path === '/campaigns') return null;
  if (path.startsWith('/campaigns/')) return [{ label: 'Campaigns', href: '#/campaigns' }, { label: 'Detail' }];
  return null;
};

const pageTitle = (path) => {
  if (!path || path === '/') return 'Dashboard';
  if (path === '/dashboard') return 'Dashboard';
  if (path === '/new') return 'New campaign';
  if (path === '/campaigns') return 'Campaigns';
  if (path.startsWith('/campaigns/')) return 'Campaign';
  if (path === '/library') return 'Library';
  if (path === '/integrations') return 'Integrations';
  if (path === '/analytics') return 'Analytics';
  if (path === '/settings') return 'Settings';
  if (path === '/pricing') return 'Pricing';
  return 'MarketingForge';
};
