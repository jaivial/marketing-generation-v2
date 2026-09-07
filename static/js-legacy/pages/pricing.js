import { h, cn } from '../lib/dom.js';
import { toast } from '../lib/ui.js';
import { router } from '../lib/router.js';

const PLANS = [
  {
    id: 'free', name: 'Free', desc: 'For tinkering', price: '$0', sub: 'forever',
    features: ['5 campaigns / month', '15s max duration', 'Standard models', 'Community support', 'Watermarked exports'],
    cta: 'Current plan', primary: false, current: true
  },
  {
    id: 'pro', name: 'Pro', desc: 'For creators & marketers', price: '$49', sub: '/mo + usage',
    features: ['50 campaigns / month', '45s max duration', 'All models', 'Priority queue', 'No watermark', 'Brand kit + custom fonts'],
    cta: 'Upgrade to Pro', primary: true
  },
  {
    id: 'team', name: 'Team', desc: 'For agencies & teams', price: '$199', sub: '/mo + usage',
    features: ['Unlimited campaigns', 'Up to 60s duration', 'Up to 10 seats', 'Team library & roles', 'SSO + audit log', 'Dedicated CSM'],
    cta: 'Contact sales', primary: false
  },
];

export const Pricing = () => {
  let yearly = false;

  const toggle = h('div', { class: 'inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 mt-4 sm:mt-6 text-xs sm:text-sm' }, [
    h('button', {
      class: cn('px-3 py-1.5 rounded transition', !yearly ? 'bg-brand-500 text-white' : 'text-zinc-400'),
      onClick: () => { yearly = false; refresh(); }
    }, 'Monthly'),
    h('button', {
      class: cn('px-3 py-1.5 rounded transition', yearly ? 'bg-brand-500 text-white' : 'text-zinc-400'),
      onClick: () => { yearly = true; refresh(); }
    }, 'Yearly · save 20%'),
  ]);

  const grid = h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12' });

  const refresh = () => {
    grid.innerHTML = '';
    PLANS.forEach(p => {
      const isCurrent = p.current;
      const isPrimary = p.primary;
      const price = yearly && p.price !== '$0' ? Math.round(parseInt(p.price.slice(1)) * 0.8) : p.price;
      const card = h('div', {
        class: cn(
          'rounded-xl sm:rounded-2xl p-5 sm:p-6 relative',
          isPrimary
            ? 'gradient-border bg-gradient-to-br from-brand-500/10 to-fuchsia-500/10 shadow-2xl shadow-brand-950/30 sm:scale-[1.02]'
            : 'bg-zinc-900/60 border border-zinc-800'
        )
      }, [
        isPrimary && h('span', { class: 'absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold gradient-bg text-white px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap' }, 'Most popular'),
        h('h3', { class: 'font-semibold text-base sm:text-lg' }, p.name),
        h('p', { class: 'text-[11px] sm:text-xs text-zinc-500 mt-1' }, p.desc),
        h('div', { class: 'mt-4 sm:mt-5 flex items-baseline gap-1' }, [
          h('span', { class: 'text-3xl sm:text-4xl font-bold font-display' }, price),
          h('span', { class: 'text-zinc-500 text-xs sm:text-sm' }, p.sub)
        ]),
        h('button', {
          class: cn('w-full mt-4 sm:mt-5 btn text-xs sm:text-sm', isCurrent ? 'btn-secondary' : isPrimary ? 'btn-primary' : 'btn-secondary'),
          disabled: isCurrent,
          onClick: () => {
            if (p.id === 'team') { toast('Sales will reach out shortly', 'info'); return; }
            toast(`Upgraded to ${p.name} (demo)`, 'success');
          }
        }, p.cta),
        h('ul', { class: 'mt-5 sm:mt-6 space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-zinc-300' }, p.features.map(f =>
          h('li', { class: 'flex gap-2' }, [
            h('span', { class: 'text-emerald-400 flex-shrink-0' }, '✓'),
            h('span', {}, f)
          ])
        ))
      ]);
      grid.appendChild(card);
    });
  };
  refresh();

  const root = h('div', { class: 'min-h-screen bg-zinc-950 text-zinc-100 bg-grid' }, [
    h('header', { class: 'border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50' }, [
      h('div', { class: 'max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2' }, [
        h('a', { href: '#/', class: 'flex items-center gap-2 cursor-pointer min-w-0' }, [
          h('div', { class: 'w-7 h-7 rounded-lg gradient-bg flex items-center justify-center flex-shrink-0' }, [
            h('svg', { width: 14, height: 14, viewBox: '0 0 20 20', fill: 'white', html: '<path d="M3 4h14v12H3z" opacity=".3"/><path d="M3 4l7 8 7-8v12H3z"/>' })
          ]),
          h('span', { class: 'font-semibold text-sm sm:text-base whitespace-nowrap' }, ['Marketing', h('span', { class: 'text-brand-400' }, 'Forge')])
        ]),
        h('nav', { class: 'hidden md:flex gap-6 text-sm text-zinc-400' }, [
          h('a', { href: '#/dashboard', class: 'hover:text-white' }, 'Dashboard'),
          h('a', { href: '#/campaigns', class: 'hover:text-white' }, 'Campaigns'),
          h('a', { href: '#/library',   class: 'hover:text-white' }, 'Library'),
          h('a', { href: '#/pricing',   class: 'text-white' }, 'Pricing'),
        ]),
        h('button', { class: 'btn btn-primary text-xs sm:text-sm px-3 py-1.5', onClick: () => router.navigate('/new') }, 'Start free')
      ])
    ]),
    h('main', { class: 'max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 page-enter' }, [
      h('div', { class: 'text-center' }, [
        h('h1', { class: 'text-2xl sm:text-4xl font-bold font-display' }, 'Simple, usage-based pricing'),
        h('p', { class: 'text-zinc-400 mt-2 sm:mt-3 text-sm sm:text-base' }, 'Start free. Scale as you grow. No seat fees.'),
        toggle
      ]),
      grid,
      h('div', { class: 'mt-12 sm:mt-16 bg-zinc-900/60 border border-zinc-800 rounded-xl sm:rounded-2xl p-5 sm:p-8' }, [
        h('h2', { class: 'text-lg sm:text-xl font-semibold text-center' }, 'Frequently asked questions'),
        h('div', { class: 'mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-5 sm:gap-y-6' }, [
          ...['How is "usage" billed?','Can I cancel anytime?','Do you offer custom durations?','Is my data used for training?'].map((q, i) =>
            h('div', {}, [
              h('p', { class: 'font-medium text-sm sm:text-base' }, q),
              h('p', { class: 'text-xs sm:text-sm text-zinc-400 mt-1' }, [
                i === 0 ? 'Per-token for chat models, per-second for video. Itemized invoice every month.' :
                i === 1 ? 'Yes — your subscription ends at the period, no questions asked.' :
                i === 2 ? 'On the Team plan, durations up to 60s are supported. Contact us for longer.' :
                          'No. Your inputs and outputs are never used to train models.'
              ])
            ])
          )
        ])
      ])
    ])
  ]);
  return root;
};
