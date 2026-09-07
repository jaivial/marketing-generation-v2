import { h, cn } from '../lib/dom.js';
import { user, history as histStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';
import { timeAgo } from '../lib/ui.js';
import { router } from '../lib/router.js';

const STATUS_PILL = {
  done:        { cls: 'pill-success', label: 'Done' },
  generating:  { cls: 'pill-warn',    label: 'Generating', dot: true },
  draft:       { cls: 'pill-neutral', label: 'Draft' },
  failed:      { cls: 'pill-error',   label: 'Failed' },
};

export const Dashboard = () => {
  const items = histStore.get().items.slice().sort((a, b) => b.created_at - a.created_at);
  const done = items.filter(i => i.status === 'done').length;
  const generating = items.filter(i => i.status === 'generating').length;
  const totalFrames = items.filter(i => i.status === 'done').reduce((acc, i) => acc + (i.duration_s >= 30 ? 15 : 8), 0);
  const totalDuration = items.filter(i => i.status === 'done').reduce((acc, i) => acc + i.duration_s, 0);

  const stats = [
    { label: 'Total campaigns', value: items.length, delta: '+2 this week',  icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', color: 'from-brand-500 to-fuchsia-500' },
    { label: 'Frames generated', value: totalFrames, delta: '+47 today',   icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'from-cyan-500 to-blue-500' },
    { label: 'Video duration',   value: totalDuration + 's', delta: '+30s today', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', color: 'from-emerald-500 to-teal-500' },
    { label: 'Success rate',     value: Math.round((done / Math.max(items.length, 1)) * 100) + '%', delta: '+4% vs last month', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'from-amber-500 to-orange-500' },
  ];

  const statsGrid = h('div', { class: 'grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8' });
  stats.forEach(s => {
    statsGrid.appendChild(
      h('div', { class: 'glow-card rounded-xl p-4 sm:p-5' }, [
        h('div', { class: cn('w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br flex items-center justify-center mb-2 sm:mb-3', s.color) }, [
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'white', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: `<path d="${s.icon}"/>` })
        ]),
        h('p', { class: 'text-xl sm:text-2xl font-semibold font-display' }, String(s.value)),
        h('p', { class: 'text-xs text-zinc-500 mt-0.5' }, s.label),
        h('p', { class: 'text-[10px] sm:text-xs text-emerald-400 mt-1.5 sm:mt-2' }, s.delta)
      ])
    );
  });

  // Recent campaigns — full table on desktop, card-list on mobile
  const recentItems = items.slice(0, 5);

  const recent = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden' }, [
    h('div', { class: 'flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800' }, [
      h('h2', { class: 'font-semibold text-sm sm:text-base' }, 'Recent campaigns'),
      h('a', { href: '#/campaigns', class: 'text-xs text-brand-400 hover:text-brand-300 whitespace-nowrap' }, 'View all →')
    ]),
    // Desktop table (hidden on mobile)
    h('div', { class: 'hidden md:block overflow-x-auto' }, [
      h('table', { class: 'w-full text-sm' }, [
        h('thead', { class: 'text-xs text-zinc-500 uppercase tracking-wider' }, [
          h('tr', { class: 'border-b border-zinc-800/50' }, [
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Name'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Duration'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Status'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Created'),
            h('th', { class: 'text-right px-5 py-3 font-medium' }, '')
          ])
        ]),
        h('tbody', { class: 'text-zinc-300' }, recentItems.map(c => {
          const pill = STATUS_PILL[c.status] || STATUS_PILL.draft;
          return h('tr', { class: 'border-b border-zinc-800/30 hover:bg-zinc-900/50 cursor-pointer', onClick: () => router.navigate('/campaigns/' + c.id) }, [
            h('td', { class: 'px-5 py-3 flex items-center gap-2' }, [
              h('div', { class: cn('w-7 h-7 rounded bg-gradient-to-br flex-shrink-0', c.color) }),
              h('span', { class: 'truncate' }, c.name)
            ]),
            h('td', { class: 'px-5 py-3 whitespace-nowrap' }, c.duration_s + 's'),
            h('td', { class: 'px-5 py-3' }, [
              h('span', { class: cn('pill', pill.cls) }, [
                pill.dot && h('span', { class: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse' }),
                pill.label
              ])
            ]),
            h('td', { class: 'px-5 py-3 text-zinc-500 whitespace-nowrap' }, timeAgo(c.created_at)),
            h('td', { class: 'px-5 py-3 text-right text-zinc-500' }, '⋯')
          ]);
        }))
      ])
    ]),
    // Mobile list (shown only on mobile)
    h('ul', { class: 'md:hidden divide-y divide-zinc-800/50' }, recentItems.map(c => {
      const pill = STATUS_PILL[c.status] || STATUS_PILL.draft;
      return h('li', { class: 'p-4 hover:bg-zinc-900/40 cursor-pointer flex items-center gap-3', onClick: () => router.navigate('/campaigns/' + c.id) }, [
        h('div', { class: cn('w-10 h-10 rounded-lg bg-gradient-to-br flex-shrink-0', c.color) }),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('p', { class: 'text-sm font-medium truncate' }, c.name),
          h('div', { class: 'flex items-center gap-2 mt-0.5' }, [
            h('span', { class: 'text-[10px] text-zinc-500' }, c.duration_s + 's'),
            h('span', { class: 'text-[10px] text-zinc-600' }, '·'),
            h('span', { class: 'text-[10px] text-zinc-500' }, timeAgo(c.created_at)),
          ])
        ]),
        h('span', { class: cn('pill text-[10px]', pill.cls) }, [
          pill.dot && h('span', { class: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse' }),
          pill.label
        ])
      ]);
    }))
  ]);

  // Activity feed
  const activity = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl' }, [
    h('div', { class: 'p-4 sm:p-5 border-b border-zinc-800' }, [h('h2', { class: 'font-semibold text-sm sm:text-base' }, 'Activity')]),
    h('ul', { class: 'p-4 sm:p-5 space-y-4 text-sm' }, [
      ...items.filter(i => i.status === 'done').slice(0, 3).map(i =>
        h('li', { class: 'flex gap-3' }, [
          h('div', { class: 'w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0' }, '✓'),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('p', { class: 'text-zinc-200 truncate text-xs sm:text-sm' }, `${i.name} — video ready`),
            h('p', { class: 'text-[10px] sm:text-xs text-zinc-500 mt-0.5' }, timeAgo(i.created_at))
          ])
        ])
      ),
      generating > 0 && h('li', { class: 'flex gap-3' }, [
        h('div', { class: 'w-7 h-7 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0' }, '↻'),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('p', { class: 'text-zinc-200 truncate text-xs sm:text-sm' }, 'Pipeline running'),
          h('p', { class: 'text-[10px] sm:text-xs text-zinc-500 mt-0.5' }, 'Frames rendering')
        ])
      ])
    ].filter(Boolean))
  ]);

  const page = h('div', {}, [
    TopBar({
      title: `Welcome back, ${user.get().name} 👋`,
      breadcrumb: null,
      actions: [
        h('button', { class: 'btn btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2', onClick: () => router.navigate('/new') }, [
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', html: '<path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>' }),
          h('span', { class: 'hidden sm:inline' }, 'New campaign'),
          h('span', { class: 'sm:hidden' }, 'New')
        ])
      ]
    }),
    h('p', { class: 'text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8' }, "Here's what's happening with your campaigns today."),
    statsGrid,
    h('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6' }, [
      h('div', { class: 'lg:col-span-2' }, [recent]),
      activity
    ])
  ]);

  return Shell({ user: user.get(), page, currentPath: '/' });
};
