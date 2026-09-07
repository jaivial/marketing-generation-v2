// Landing/onboarding (root path) — features the wizard step into the new-campaign flow.
import { h, cn } from '../lib/dom.js';
import { router } from '../lib/router.js';

export const Landing = () => {
  const features = [
    { icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3 12h18', title: 'Website scrape', desc: 'Paste a URL — we read it with Lightpanda.' },
    { icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', title: 'AI plan', desc: 'MiniMax-M3 plans hook, tagline, CTA, audience & tone.' },
    { icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', title: 'Frame generation', desc: 'Up to 23 HD frames via GPT-Image-2.0.' },
    { icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', title: 'Video assembly', desc: 'MiniMax-H3 stitches frames + master prompt.' },
  ];

  const headline = h('div', { class: 'text-center mb-8 sm:mb-12' }, [
    h('div', { class: 'inline-flex items-center gap-2 text-[10px] sm:text-xs text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2.5 sm:px-3 py-1 rounded-full mb-4 sm:mb-5' }, [
      h('span', { class: 'w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse flex-shrink-0' }),
      h('span', {}, 'MiniMax-H3 + GPT-Image-2.0')
    ]),
    h('h1', { class: 'text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight font-display' }, [
      'Ship ', h('span', { class: 'gradient-text' }, 'marketing videos'), h('br'),
      'in minutes, not weeks.'
    ]),
    h('p', { class: 'text-zinc-400 mt-4 sm:mt-5 max-w-2xl mx-auto text-sm sm:text-lg px-2' },
      'Paste a URL or a project folder. We scrape, plan, render, and assemble a full campaign — script, frames, video — all in one orchestrated AI pipeline.')
  ]);

  const featureGrid = h('div', { class: 'grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 max-w-4xl mx-auto mt-8 sm:mt-12' });
  features.forEach((f, i) => {
    featureGrid.appendChild(
      h('div', { class: 'glow-card rounded-xl p-3 sm:p-4 text-left' }, [
        h('div', { class: 'w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center mb-2 sm:mb-3' }, [
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'sm:w-[18px] sm:h-[18px]', html: `<path d="${f.icon}"/>` })
        ]),
        h('p', { class: 'text-sm font-medium' }, f.title),
        h('p', { class: 'text-[11px] sm:text-xs text-zinc-500 mt-1' }, f.desc)
      ])
    );
  });

  const cta = h('div', { class: 'flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 sm:mt-10 px-4' }, [
    h('button', {
      class: 'btn btn-primary px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto',
      onClick: () => router.navigate('/new')
    }, [
      'Start generating',
      h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', class: 'sm:w-4 sm:h-4', html: '<path d="M5 12h14M13 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>' })
    ]),
    h('a', { href: '#/pricing', class: 'btn btn-ghost px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto' }, 'See pricing')
  ]);

  // Top nav for landing — full mobile menu (no sidebar)
  const mobileMenuBtn = h('button', {
    class: 'md:hidden w-9 h-9 -mr-1 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white',
    'aria-label': 'Menu',
    onClick: () => document.documentElement.classList.toggle('landing-menu-open')
  }, [
    h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M4 6h16M4 12h16M4 18h16"/>' })
  ]);

  const mobileMenu = h('div', { class: 'md:hidden fixed inset-x-0 top-14 mx-3 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-40 p-2' }, [
    h('a', { href: '#/dashboard', class: 'block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white' }, 'Dashboard'),
    h('a', { href: '#/campaigns', class: 'block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white' }, 'Campaigns'),
    h('a', { href: '#/library',   class: 'block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white' }, 'Library'),
    h('a', { href: '#/integrations', class: 'block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white' }, 'Integrations'),
    h('a', { href: '#/pricing',   class: 'block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white' }, 'Pricing'),
  ]);

  const root = h('div', { class: 'min-h-screen bg-zinc-950 text-zinc-100 bg-grid' }, [
    // Top bar
    h('header', { class: 'border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50' }, [
      h('div', { class: 'max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2' }, [
        h('div', { class: 'flex items-center gap-2 min-w-0' }, [
          h('div', { class: 'w-7 h-7 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0' }, [
            h('svg', { width: 14, height: 14, viewBox: '0 0 20 20', fill: 'white', html: '<path d="M3 4h14v12H3z" opacity=".3"/><path d="M3 4l7 8 7-8v12H3z"/>' })
          ]),
          h('span', { class: 'font-semibold text-sm sm:text-base whitespace-nowrap' }, ['Marketing', h('span', { class: 'text-brand-400' }, 'Forge')])
        ]),
        h('nav', { class: 'hidden md:flex gap-6 text-sm text-zinc-400' }, [
          h('a', { href: '#/dashboard', class: 'hover:text-white' }, 'Dashboard'),
          h('a', { href: '#/campaigns', class: 'hover:text-white' }, 'Campaigns'),
          h('a', { href: '#/library',   class: 'hover:text-white' }, 'Library'),
          h('a', { href: '#/integrations', class: 'hover:text-white' }, 'Integrations'),
          h('a', { href: '#/pricing',   class: 'hover:text-white' }, 'Pricing')
        ]),
        h('div', { class: 'flex items-center gap-2 sm:gap-3' }, [
          h('a', { href: '#/dashboard', class: 'hidden sm:inline text-sm text-zinc-400 hover:text-white' }, 'Sign in'),
          h('button', { class: 'btn btn-primary text-xs sm:text-sm px-3 py-1.5', onClick: () => router.navigate('/new') }, 'Start free'),
          mobileMenuBtn
        ])
      ]),
      mobileMenu
    ]),
    h('main', { class: 'max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 page-enter' }, [
      headline,
      cta,
      featureGrid
    ]),
    h('footer', { class: 'border-t border-zinc-800/80 mt-12 sm:mt-16 py-6 sm:py-8 text-center text-[10px] sm:text-xs text-zinc-500' }, [
      '© 2025 MarketingForge · ',
      h('a', { href: '#/pricing', class: 'hover:text-zinc-300' }, 'Pricing'),
      ' · ',
      h('a', { href: '#/integrations', class: 'hover:text-zinc-300' }, 'Integrations'),
      ' · ',
      h('a', { href: '/api/health', target: '_blank', class: 'hover:text-zinc-300' }, 'API health'),
    ])
  ]);

  return root;
};
