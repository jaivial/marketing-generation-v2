import { h, cn } from '../lib/dom.js';
import { history as histStore, user as userStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';
import { timeAgo, toast, modal } from '../lib/ui.js';
import { router } from '../lib/router.js';

export const Detail = (params) => {
  const id = params.id;
  const items = histStore.get().items;
  const c = items.find(i => i.id === id);

  if (!c) {
    return Shell({ user: userStore.get(), page: h('div', { class: 'p-8 sm:p-12 text-center' }, [
      h('p', { class: 'text-4xl sm:text-5xl mb-4' }, '🤷'),
      h('h2', { class: 'text-lg sm:text-xl font-semibold' }, 'Campaign not found'),
      h('p', { class: 'text-sm text-zinc-400 mt-2' }, 'The campaign may have been deleted.'),
      h('button', { class: 'btn btn-primary mt-6 text-sm', onClick: () => router.navigate('/campaigns') }, 'Back to campaigns')
    ]), currentPath: '/campaigns' });
  }

  let tab = 'frames';

  // Hero actions — wrap on mobile
  const heroActions = h('div', { class: 'flex flex-wrap items-center gap-2' }, [
    h('button', {
      class: 'btn bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/10 text-xs px-2.5 py-1.5',
      onClick: () => { navigator.clipboard?.writeText(c.videoUrl || ''); toast('Video URL copied', 'success'); }
    }, [
      h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', html: '<path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" stroke-linecap="round" stroke-linejoin="round"/>' }),
      'Share'
    ]),
    h('button', {
      class: 'btn bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/10 text-xs px-2.5 py-1.5',
      onClick: () => toast('Export started', 'success')
    }, [
      h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', html: '<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" stroke-linecap="round" stroke-linejoin="round"/>' }),
      'Export'
    ]),
    h('button', {
      class: 'btn btn-danger text-xs px-2.5 py-1.5',
      onClick: () => {
        if (confirm('Delete this campaign?')) {
          histStore.set({ items: histStore.get().items.filter(i => i.id !== c.id) });
          toast('Campaign deleted', 'success');
          router.navigate('/campaigns');
        }
      }
    }, 'Delete')
  ]);

  const hero = h('div', { class: cn('rounded-xl sm:rounded-2xl aspect-video relative overflow-hidden mb-4 sm:mb-6 bg-gradient-to-br', c.color) }, [
    h('div', { class: 'absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent' }),
    h('div', { class: 'absolute inset-0 flex items-center justify-center' }, [
      h('button', {
        class: 'w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition shadow-2xl',
        onClick: () => {
          if (c.videoUrl) {
            const v = h('video', { src: c.videoUrl, controls: true, autoplay: true, class: 'w-full rounded-lg' });
            const m = modal(v);
            const wrap = h('div', { class: 'w-full max-w-3xl' });
            wrap.appendChild(v);
            m.overlay.innerHTML = '';
            m.overlay.appendChild(wrap);
          } else {
            toast('Video not ready yet', 'info');
          }
        }
      }, [
        h('svg', { width: 22, height: 22, viewBox: '0 0 20 20', fill: 'currentColor', class: 'text-zinc-900 ml-0.5 sm:w-7 sm:h-7', html: '<path d="M4 4l12 6-12 6V4z"/>' })
      ])
    ]),
    h('div', { class: 'absolute bottom-0 left-0 right-0 p-3 sm:p-6' }, [
      h('div', { class: 'flex flex-col gap-3' }, [
        h('div', { class: 'min-w-0' }, [
          h('h1', { class: 'text-base sm:text-3xl font-bold text-white font-display truncate' }, c.name),
          h('p', { class: 'text-zinc-200 text-[10px] sm:text-sm mt-0.5 sm:mt-1 truncate' }, [
            `${c.duration_s}s · `,
            (c.style || 'cinematic'),
            c.plan?.tagline ? ` · "${c.plan.tagline}"` : ''
          ])
        ]),
        heroActions
      ])
    ])
  ]);

  const tabNav = h('nav', { class: 'flex gap-4 sm:gap-6 text-sm border-b border-zinc-800 overflow-x-auto scrollbar-thin whitespace-nowrap' });
  const tabContent = h('div', { class: 'mt-4 sm:mt-6' });

  const refreshTab = () => {
    tabNav.innerHTML = '';
    [['frames','Frames'], ['script','Script'], ['source','Source'], ['activity','Activity']].forEach(([id, lbl]) => {
      const active = tab === id;
      tabNav.appendChild(h('a', {
        class: cn('py-3 border-b-2 -mb-px cursor-pointer', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white'),
        onClick: () => { tab = id; refreshTab(); }
      }, lbl));
    });

    tabContent.innerHTML = '';
    if (tab === 'frames') {
      const wrap = h('div', {}, [
        h('div', { class: 'flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3' }, [
          h('h3', { class: 'text-xs sm:text-sm font-semibold' }, `Timeline · ${Math.max(2, Math.ceil(c.duration_s/2))} frames`),
          h('div', { class: 'text-[10px] sm:text-xs text-zinc-500' }, `0:00 → 0:${String(c.duration_s).padStart(2,'0')}`)
        ]),
        h('div', { class: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3' },
          (c.frames && c.frames.length ? c.frames : Array.from({length: Math.max(2, Math.ceil(c.duration_s/2))}, (_, i) => ({ i, t: i*2, url: null }))).map((f, i) =>
            h('div', { class: 'frame-card aspect-video rounded-lg overflow-hidden border border-zinc-800 relative cursor-pointer hover:border-brand-500/50' }, [
              f.url
                ? h('img', { src: f.url, class: 'w-full h-full object-cover', alt: `Frame ${i}`, loading: 'lazy' })
                : h('div', { class: cn('w-full h-full bg-gradient-to-br', c.color, 'opacity-80') }),
              h('span', { class: 'absolute bottom-1 left-1 text-[9px] sm:text-[10px] bg-black/70 px-1.5 py-0.5 rounded' }, typeof f.t === 'number' ? `${Math.floor(f.t/60)}:${String(f.t%60).padStart(2,'0')}` : `#${i+1}`),
              h('div', { class: 'frame-overlay absolute inset-0 flex items-center justify-center bg-black/40' }, [
                h('svg', { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'white', class: 'sm:w-5 sm:h-5', html: '<path d="M10 4a6 6 0 100 12 6 6 0 000-12zM8 14V6l6 4-6 4z"/>' })
              ])
            ])
          )
        )
      ]);
      tabContent.appendChild(wrap);
    } else if (tab === 'script') {
      const scriptText = c.script || (c.plan ? `${c.plan.hook}\n\n${c.plan.tagline}\n\nCall to action: ${c.plan.cta}` : 'No script generated yet.');
      tabContent.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
        h('h3', { class: 'font-semibold text-sm sm:text-base mb-3' }, 'Voice-over script'),
        h('pre', { class: 'whitespace-pre-wrap font-mono text-xs sm:text-sm text-zinc-300 leading-relaxed' }, scriptText),
      ]));
    } else if (tab === 'source') {
      const rows = [
        ['Type',     c.source_kind || 'url'],
        ['Target',   c.source || '—'],
        ['Style',    c.style || 'cinematic'],
        ['Created',  timeAgo(c.created_at)],
      ];
      tabContent.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60' },
        rows.map(([k, v]) => h('div', { class: 'flex items-center justify-between p-3 sm:p-4 text-xs sm:text-sm gap-3' }, [
          h('span', { class: 'text-zinc-500 flex-shrink-0' }, k),
          h('span', { class: 'text-zinc-200 truncate text-right min-w-0' }, v)
        ]))
      ));
    } else if (tab === 'activity') {
      tabContent.appendChild(h('ul', { class: 'space-y-2 sm:space-y-3 text-xs sm:text-sm' }, [
        h('li', { class: 'flex gap-3 p-3 bg-zinc-900/40 rounded-lg border border-zinc-800' }, [
          h('div', { class: 'w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0' }, '✓'),
          h('div', { class: 'flex-1 min-w-0' }, [h('p', { class: 'text-zinc-200 truncate' }, 'Pipeline complete'), h('p', { class: 'text-[10px] sm:text-xs text-zinc-500 mt-0.5' }, timeAgo(c.created_at))])
        ])
      ]));
    }
  };
  refreshTab();

  const sidebar = h('div', { class: 'space-y-4 sm:space-y-6' }, [
    c.plan && h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5' }, [
      h('h3', { class: 'font-semibold text-sm sm:text-base mb-3 sm:mb-4' }, 'Campaign plan'),
      h('div', { class: 'space-y-3 text-xs sm:text-sm' }, [
        planRow('Hook',     c.plan.hook),
        planRow('Tagline',  c.plan.tagline),
        planRow('CTA',      c.plan.cta),
        planRow('Audience', c.plan.audience),
        planRow('Tone',     c.plan.tone),
      ])
    ]),
    h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5' }, [
      h('h3', { class: 'font-semibold text-sm sm:text-base mb-3 sm:mb-4' }, 'Metadata'),
      h('div', { class: 'space-y-2 text-xs sm:text-sm' }, [
        metaRow('ID',       c.id),
        metaRow('Duration', c.duration_s + 's'),
        metaRow('Status',   c.status),
        metaRow('Created',  timeAgo(c.created_at)),
      ])
    ])
  ]);

  const page = h('div', {}, [
    TopBar({
      title: c.name,
      breadcrumb: [{ label: 'Campaigns', href: '#/campaigns' }, { label: c.name }],
      actions: [
        h('button', { class: 'btn btn-secondary text-xs sm:text-sm', onClick: () => router.navigate('/campaigns') }, '← Back'),
      ]
    }),
    hero,
    h('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6' }, [
      h('div', { class: 'lg:col-span-2 min-w-0' }, [tabNav, tabContent]),
      h('div', { class: 'lg:col-span-1' }, [sidebar])
    ])
  ]);

  return Shell({ user: userStore.get(), page, currentPath: '/campaigns' });
};

const planRow = (k, v) => h('div', {}, [
  h('p', { class: 'text-[10px] text-zinc-500 uppercase tracking-wider' }, k),
  h('p', { class: 'text-xs sm:text-sm text-zinc-100 mt-0.5 break-words' }, v || '—')
]);

const metaRow = (k, v) => h('div', { class: 'flex justify-between gap-2' }, [
  h('span', { class: 'text-zinc-500' }, k),
  h('span', { class: 'text-zinc-300 capitalize truncate text-right min-w-0' }, String(v))
]);
