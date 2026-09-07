import { h, cn } from '../lib/dom.js';
import { user as userStore } from '../lib/store.js';
import { history as histStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';
import { timeAgo } from '../lib/ui.js';
import { router } from '../lib/router.js';

const STATUS = {
  done:        { cls: 'pill-success', label: 'Done' },
  generating:  { cls: 'pill-warn',    label: 'Generating', dot: true },
  draft:       { cls: 'pill-neutral', label: 'Draft' },
  failed:      { cls: 'pill-error',   label: 'Failed' },
};

export const Campaigns = () => {
  const items = histStore.get().items.slice().sort((a,b) => b.created_at - a.created_at);
  let filter = 'all';
  let query = '';

  const headerActions = [
    h('button', { class: 'btn btn-secondary text-xs sm:text-sm hidden sm:inline-flex', onClick: () => router.navigate('/library') }, 'Library'),
    h('button', { class: 'btn btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2', onClick: () => router.navigate('/new') }, [
      h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', html: '<path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>' }),
      h('span', { class: 'hidden sm:inline' }, 'New')
    ])
  ];

  // Tabs — horizontally scrollable on mobile
  const tabs = h('div', { class: 'border-b border-zinc-800 mb-4 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin' });
  const tabsNav = h('nav', { class: 'flex gap-4 sm:gap-6 text-sm whitespace-nowrap' });
  const tabsRefresh = () => {
    tabsNav.innerHTML = '';
    const filters = [
      { id: 'all',        label: 'All',          n: items.length },
      { id: 'done',       label: 'Done',         n: items.filter(i => i.status === 'done').length },
      { id: 'generating', label: 'Generating',   n: items.filter(i => i.status === 'generating').length },
      { id: 'draft',      label: 'Drafts',       n: items.filter(i => i.status === 'draft').length },
      { id: 'failed',     label: 'Failed',       n: items.filter(i => i.status === 'failed').length },
    ];
    filters.forEach(f => {
      const active = filter === f.id;
      tabsNav.appendChild(h('a', {
        class: cn('py-3 border-b-2 cursor-pointer', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white'),
        onClick: () => { filter = f.id; tabsRefresh(); listRefresh(); }
      }, [
        f.label, h('span', { class: cn('ml-1', active ? 'text-brand-400/70' : 'text-zinc-600') }, String(f.n))
      ]));
    });
  };
  tabs.appendChild(tabsNav);

  const search = h('div', { class: 'relative mb-4' }, [
    h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', class: 'absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500', html: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" stroke-linecap="round" stroke-linejoin="round"/>' }),
    h('input', {
      class: 'input pl-9', placeholder: 'Search campaigns…',
      onInput: (e) => { query = e.target.value.toLowerCase(); listRefresh(); }
    })
  ]);

  const list = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden' });
  const listRefresh = () => {
    list.innerHTML = '';
    let filtered = items;
    if (filter !== 'all') filtered = filtered.filter(i => i.status === filter);
    if (query) filtered = filtered.filter(i =>
      i.name.toLowerCase().includes(query) ||
      (i.source || '').toLowerCase().includes(query)
    );
    if (filtered.length === 0) {
      list.appendChild(h('div', { class: 'p-8 sm:p-12 text-center text-zinc-500' }, [
        h('p', { class: 'text-3xl sm:text-4xl mb-3' }, '🔍'),
        h('p', { class: 'text-sm' }, 'No campaigns match your filters.'),
        h('button', { class: 'btn btn-secondary mt-4 text-sm', onClick: () => router.navigate('/new') }, 'Create your first')
      ]));
      return;
    }

    // Desktop table view
    const table = h('div', { class: 'hidden md:block overflow-x-auto' }, [
      h('table', { class: 'w-full text-sm' }, [
        h('thead', { class: 'text-xs text-zinc-500 uppercase tracking-wider' }, [
          h('tr', { class: 'border-b border-zinc-800/50' }, [
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Name'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Source'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Duration'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Status'),
            h('th', { class: 'text-left px-5 py-3 font-medium' }, 'Created'),
            h('th', { class: 'text-right px-5 py-3 font-medium' }, '')
          ])
        ]),
        h('tbody', { class: 'text-zinc-300' }, filtered.map(c => {
          const pill = STATUS[c.status] || STATUS.draft;
          return h('tr', {
            class: 'border-b border-zinc-800/30 hover:bg-zinc-900/50 cursor-pointer',
            onClick: () => router.navigate('/campaigns/' + c.id)
          }, [
            h('td', { class: 'px-5 py-3 flex items-center gap-2 min-w-0' }, [
              h('div', { class: cn('w-7 h-7 rounded bg-gradient-to-br flex-shrink-0', c.color) }),
              h('span', { class: 'truncate' }, c.name)
            ]),
            h('td', { class: 'px-5 py-3 text-zinc-400 truncate max-w-[14rem]' }, c.source || '—'),
            h('td', { class: 'px-5 py-3 whitespace-nowrap' }, c.duration_s + 's'),
            h('td', { class: 'px-5 py-3' }, [
              h('span', { class: cn('pill', pill.cls) }, [
                pill.dot && h('span', { class: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse' }),
                pill.label
              ])
            ]),
            h('td', { class: 'px-5 py-3 text-zinc-500 whitespace-nowrap' }, timeAgo(c.created_at)),
            h('td', { class: 'px-5 py-3 text-right' }, [
              h('span', { class: 'text-zinc-500 hover:text-white cursor-pointer' }, '⋯')
            ])
          ]);
        }))
      ])
    ]);
    list.appendChild(table);

    // Mobile card-list view
    const cardList = h('ul', { class: 'md:hidden divide-y divide-zinc-800/50' }, filtered.map(c => {
      const pill = STATUS[c.status] || STATUS.draft;
      return h('li', { class: 'p-3 sm:p-4 hover:bg-zinc-900/40 cursor-pointer', onClick: () => router.navigate('/campaigns/' + c.id) }, [
        h('div', { class: 'flex items-center gap-3' }, [
          h('div', { class: cn('w-10 h-10 rounded-lg bg-gradient-to-br flex-shrink-0', c.color) }),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('p', { class: 'text-sm font-medium truncate' }, c.name),
            h('p', { class: 'text-[10px] text-zinc-500 truncate mt-0.5' }, c.source || '—')
          ]),
          h('span', { class: cn('pill text-[10px]', pill.cls) }, [
            pill.dot && h('span', { class: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse' }),
            pill.label
          ])
        ]),
        h('div', { class: 'flex items-center gap-3 mt-2 text-[10px] text-zinc-500' }, [
          h('span', {}, c.duration_s + 's'),
          h('span', { class: 'text-zinc-700' }, '·'),
          h('span', {}, timeAgo(c.created_at))
        ])
      ]);
    }));
    list.appendChild(cardList);
  };
  listRefresh();
  tabsRefresh();

  const page = h('div', {}, [
    TopBar({
      title: 'Campaigns',
      breadcrumb: null,
      actions: headerActions
    }),
    tabs,
    search,
    list
  ]);

  return Shell({ user: userStore.get(), page, currentPath: '/campaigns' });
};
