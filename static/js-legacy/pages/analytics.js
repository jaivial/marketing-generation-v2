import { h, cn } from '../lib/dom.js';
import { user as userStore } from '../lib/store.js';
import { history as histStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';

export const Analytics = () => {
  const items = histStore.get().items;
  const done = items.filter(i => i.status === 'done');
  const totalFrames = done.reduce((acc, i) => acc + Math.max(2, Math.ceil(i.duration_s/2)), 0);
  const totalDuration = done.reduce((acc, i) => acc + i.duration_s, 0);
  const successRate = Math.round((done.length / Math.max(items.length, 1)) * 100);

  const bars = Array.from({length: 12}, (_, i) => {
    const base = Math.round(20 + Math.random() * 70);
    return { h: base, label: ['J','F','M','A','M','J','J','A','S','O','N','D'][i] };
  });

  const chart = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
    h('div', { class: 'flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4' }, [
      h('h3', { class: 'font-semibold text-sm sm:text-base' }, 'Frames generated (last 12 months)'),
      h('div', { class: 'flex gap-2 text-xs' }, [
        h('button', { class: 'btn btn-secondary text-xs py-1' }, 'Monthly'),
        h('button', { class: 'btn btn-ghost text-xs py-1' }, 'Weekly'),
      ])
    ]),
    h('div', { class: 'flex items-end gap-1.5 sm:gap-2 h-32 sm:h-40' },
      bars.map(b =>
        h('div', { class: 'flex-1 flex flex-col items-center justify-end gap-2 min-w-0' }, [
          h('div', { class: 'w-full rounded-t gradient-bg transition-all hover:opacity-80 min-h-[4px]', style: { height: b.h + '%' } }),
          h('span', { class: 'text-[9px] sm:text-[10px] text-zinc-500' }, b.label)
        ])
      )
    )
  ]);

  const kpis = [
    { label: 'Campaigns completed', value: done.length, delta: '+12%' },
    { label: 'Frames generated',     value: totalFrames,  delta: '+24%' },
    { label: 'Total video (s)',      value: totalDuration, delta: '+8%' },
    { label: 'Success rate',         value: successRate + '%', delta: '+3%' },
  ];

  const kpiGrid = h('div', { class: 'grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6' });
  kpis.forEach(k => kpiGrid.appendChild(h('div', { class: 'glow-card rounded-xl p-4 sm:p-5' }, [
    h('p', { class: 'text-xl sm:text-2xl font-semibold font-display' }, String(k.value)),
    h('p', { class: 'text-xs text-zinc-500 mt-0.5' }, k.label),
    h('p', { class: 'text-[10px] sm:text-xs text-emerald-400 mt-1.5 sm:mt-2' }, k.delta)
  ])));

  const stylesCount = {};
  done.forEach(i => { const k = i.style || 'cinematic'; stylesCount[k] = (stylesCount[k] || 0) + 1; });
  const topStyles = Object.entries(stylesCount).sort((a,b) => b[1]-a[1]);

  const topPanel = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
    h('h3', { class: 'font-semibold text-sm sm:text-base mb-3 sm:mb-4' }, 'Top styles'),
    topStyles.length === 0
      ? h('p', { class: 'text-sm text-zinc-500' }, 'No data yet.')
      : h('div', { class: 'space-y-3' }, topStyles.map(([style, count]) => {
          const max = topStyles[0][1];
          const pct = Math.round((count/max) * 100);
          return h('div', {}, [
            h('div', { class: 'flex justify-between text-xs sm:text-sm mb-1' }, [
              h('span', { class: 'capitalize text-zinc-300 truncate' }, style),
              h('span', { class: 'text-zinc-500 flex-shrink-0 ml-2' }, count + ' campaigns')
            ]),
            h('div', { class: 'h-1.5 bg-zinc-800 rounded-full overflow-hidden' }, [
              h('div', { class: 'h-full gradient-bg', style: { width: pct + '%' } })
            ])
          ]);
        }))
  ]);

  const page = h('div', {}, [
    TopBar({ title: 'Analytics', breadcrumb: null, actions: [
      h('button', { class: 'btn btn-secondary text-xs sm:text-sm hidden sm:inline-flex' }, 'Export CSV')
    ]}),
    h('p', { class: 'text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6' }, 'Performance and usage at a glance.'),
    kpiGrid,
    h('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6' }, [
      h('div', { class: 'lg:col-span-2' }, [chart]),
      topPanel
    ])
  ]);

  return Shell({ user: userStore.get(), page, currentPath: '/analytics' });
};
