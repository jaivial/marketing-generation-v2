import { h, cn } from '../lib/dom.js';
import { user as userStore } from '../lib/store.js';
import { history as histStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';
import { timeAgo } from '../lib/ui.js';
import { router } from '../lib/router.js';

export const Library = () => {
  const items = histStore.get().items.filter(i => i.status === 'done').sort((a,b) => b.created_at - a.created_at);
  let tab = 'all';
  let query = '';

  const tabs = h('div', { class: 'border-b border-zinc-800 mb-4 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin' });
  const tabsNav = h('nav', { class: 'flex gap-4 sm:gap-6 text-sm whitespace-nowrap' });
  const tabsRefresh = () => {
    tabsNav.innerHTML = '';
    [
      { id: 'all',     label: 'All',      n: items.length },
      { id: 'video',   label: 'Videos',   n: items.length },
      { id: 'frames',  label: 'Frames',   n: items.reduce((acc, i) => acc + Math.max(2, Math.ceil(i.duration_s/2)), 0) },
      { id: 'scripts', label: 'Scripts',  n: items.length },
    ].forEach(f => {
      const active = tab === f.id;
      tabsNav.appendChild(h('a', {
        class: cn('py-3 border-b-2 cursor-pointer', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white'),
        onClick: () => { tab = f.id; tabsRefresh(); }
      }, [f.label, h('span', { class: cn('ml-1', active ? 'text-brand-400/70' : 'text-zinc-600') }, String(f.n))]));
    });
  };
  tabs.appendChild(tabsNav);

  const filterRow = h('div', { class: 'flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6' }, [
    h('div', { class: 'relative flex-1 sm:max-w-md' }, [
      h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', class: 'absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500', html: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" stroke-linecap="round" stroke-linejoin="round"/>' }),
      h('input', {
        class: 'input pl-9', placeholder: 'Search assets…',
        onInput: (e) => { query = e.target.value.toLowerCase(); renderGrid(); }
      })
    ]),
    h('div', { class: 'flex gap-2' }, [
      h('button', { class: 'btn btn-secondary text-xs sm:text-sm hidden sm:inline-flex' }, [
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', html: '<path d="M3 4h18M6 12h12m-9 8h6" stroke-linecap="round" stroke-linejoin="round"/>' }),
        'Filters'
      ]),
      h('button', { class: 'btn btn-primary text-xs sm:text-sm', onClick: () => router.navigate('/new') }, [
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', html: '<path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>' }),
        h('span', { class: 'hidden sm:inline' }, 'Generate')
      ])
    ])
  ]);

  const grid = h('div', { class: 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4' });
  const renderGrid = () => {
    grid.innerHTML = '';
    let filtered = items;
    if (query) filtered = filtered.filter(i => i.name.toLowerCase().includes(query));
    if (filtered.length === 0) {
      grid.appendChild(h('div', { class: 'col-span-full p-8 sm:p-12 text-center text-zinc-500' }, [
        h('p', { class: 'text-3xl sm:text-4xl mb-3' }, '🎬'),
        h('p', { class: 'text-sm' }, 'No assets yet — generate your first campaign.'),
        h('button', { class: 'btn btn-primary mt-4 text-sm', onClick: () => router.navigate('/new') }, 'Generate')
      ]));
      return;
    }
    filtered.forEach(c => {
      const card = h('div', {
        class: 'frame-card group rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden cursor-pointer transition',
        onClick: () => router.navigate('/campaigns/' + c.id)
      }, [
        h('div', { class: cn('aspect-video bg-gradient-to-br relative', c.color) }, [
          h('div', { class: 'absolute top-2 right-2 flex gap-1' }, [
            h('span', { class: 'text-[10px] bg-black/70 backdrop-blur px-1.5 py-0.5 rounded text-white' }, c.duration_s + 's')
          ]),
          h('div', { class: 'frame-overlay absolute inset-0 flex items-center justify-center bg-black/40' }, [
            h('button', { class: 'w-12 h-12 rounded-full bg-white/90 flex items-center justify-center hover:scale-110 transition' }, [
              h('svg', { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'currentColor', class: 'text-zinc-900 ml-0.5', html: '<path d="M4 4l12 6-12 6V4z"/>' })
            ])
          ])
        ]),
        h('div', { class: 'p-3' }, [
          h('p', { class: 'text-sm font-medium truncate' }, c.name),
          h('p', { class: 'text-[10px] sm:text-xs text-zinc-500 mt-1' }, `${timeAgo(c.created_at)} · ${Math.max(2, Math.ceil(c.duration_s/2))} frames`)
        ])
      ]);
      grid.appendChild(card);
    });
  };
  renderGrid();
  tabsRefresh();

  const page = h('div', {}, [
    TopBar({
      title: 'Library',
      breadcrumb: null,
      actions: []
    }),
    h('p', { class: 'text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6' }, 'All your generated assets in one place.'),
    tabs,
    filterRow,
    grid
  ]);

  return Shell({ user: userStore.get(), page, currentPath: '/library' });
};
