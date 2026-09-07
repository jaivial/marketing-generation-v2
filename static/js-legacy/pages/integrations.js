import { h, cn } from '../lib/dom.js';
import { user as userStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';
import { toast } from '../lib/ui.js';
import { getHealth } from '../lib/api.js';

const PROVIDERS = [
  { id: 'minimax',  name: 'MiniMax',  desc: 'Models: MiniMax-M3 · MiniMax-H3 (video)', connected: true,  spend: '$18.42', cap: '$50', color: 'from-amber-500 to-orange-500', letter: 'M' },
  { id: 'gptimage', name: 'GPT-Image-2.0', desc: 'Used via wavespeed CLI for frames', connected: true,  spend: '$7.12',  cap: '$30', color: 'from-emerald-500 to-teal-500', letter: 'G' },
  { id: 'wavespeed',name: 'Wavespeed', desc: 'Video + image rendering infra', connected: true, spend: '$22.10', cap: '$100', color: 'from-indigo-500 to-violet-500', letter: 'W' },
  { id: 'lightpanda',name: 'Lightpanda', desc: 'Fast headless browser for website scraping', connected: true, spend: '$0.00', cap: '$20', color: 'from-rose-500 to-pink-500', letter: 'L' },
  { id: 'r2',      name: 'Cloudflare R2',  desc: 'Asset storage for generated frames & videos', connected: false, spend: '$0.00', cap: '—', color: 'from-orange-400 to-yellow-500', letter: 'R' },
  { id: 's3',      name: 'AWS S3',   desc: 'Alternative asset storage', connected: false, spend: '$0.00', cap: '—', color: 'from-amber-400 to-orange-600', letter: 'S' },
  { id: 'meta',    name: 'Meta Ads', desc: 'Push finished videos to Meta Ads Manager', connected: false, spend: '—', cap: '—', color: 'from-blue-500 to-blue-700', letter: 'f' },
  { id: 'tiktok',  name: 'TikTok',   desc: 'Auto-publish to TikTok Creative Exchange', connected: false, spend: '—', cap: '—', color: 'from-zinc-700 to-zinc-900', letter: 'T' },
];

export const Integrations = () => {
  const list = h('div', { class: 'space-y-3' });

  const refreshHealth = async () => {
    const h_el = document.getElementById('health-status');
    if (!h_el) return;
    h_el.textContent = 'Checking…';
    const r = await getHealth();
    h_el.textContent = r?.ok ? 'All systems normal' : 'Degraded';
  };

  PROVIDERS.forEach(p => {
    const card = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5' }, [
      h('div', { class: 'flex items-start sm:items-center gap-3 sm:gap-4' }, [
        h('div', { class: cn('w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0', p.color) }, p.letter),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'flex items-center gap-2 flex-wrap' }, [
            h('h3', { class: 'font-semibold text-sm sm:text-base truncate' }, p.name),
            p.connected
              ? h('span', { class: 'pill pill-success text-[10px]' }, 'Connected')
              : h('span', { class: 'pill pill-neutral text-[10px]' }, 'Not connected')
          ]),
          h('p', { class: 'text-[11px] sm:text-xs text-zinc-400 mt-1 line-clamp-2' }, p.desc)
        ]),
        p.connected
          ? h('button', { class: 'btn btn-secondary text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0', onClick: () => toast(`Opening ${p.name} settings…`, 'info') }, 'Configure')
          : h('button', { class: 'btn btn-primary text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0', onClick: () => toast(`${p.name} setup flow (demo)`, 'info') }, 'Connect')
      ]),
      p.spend !== '—' ? h('div', { class: 'flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60 text-[11px] sm:text-xs' }, [
        h('span', { class: 'text-zinc-500' }, 'Spend this month'),
        h('span', { class: 'text-zinc-300 font-medium' }, `${p.spend} / ${p.cap}`)
      ]) : null
    ]);
    list.appendChild(card);
  });

  const page = h('div', {}, [
    TopBar({ title: 'Integrations', breadcrumb: null, actions: [] }),
    h('p', { class: 'text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8' }, 'Connect your AI providers, storage, and publishing tools.'),
    h('div', { class: 'bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-3' }, [
      h('div', { class: 'w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold text-sm' }, '✓'),
      h('div', { class: 'flex-1 min-w-0' }, [
        h('p', { class: 'text-xs sm:text-sm font-medium text-emerald-300' }, 'Core services connected'),
        h('p', { class: 'text-[10px] sm:text-xs text-zinc-400 mt-0.5', id: 'health-status' }, 'Last health check: just now · all systems normal')
      ]),
      h('button', { class: 'text-[10px] sm:text-xs text-emerald-300 hover:text-emerald-200 flex-shrink-0 px-2 py-1', onClick: refreshHealth }, 'Re-check')
    ]),
    list
  ]);

  return Shell({ user: userStore.get(), page, currentPath: '/integrations' });
};
