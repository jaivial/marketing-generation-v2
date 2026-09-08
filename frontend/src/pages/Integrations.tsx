import React from 'react';
import TopBar from '../components/TopBar';
import { Icon, toast } from '../components/ui';
import { getHealth } from '../lib/api';
import { cn } from '../lib/utils';

const PROVIDERS = [
  { id: 'minimax',  name: 'MiniMax',  desc: 'Models: MiniMax-M3 · MiniMax-H3 (video)', connected: true,  spend: '$18.42', cap: '$50', color: 'from-amber-500 to-orange-500', letter: 'M' },
  { id: 'gptimage', name: 'GPT-Image-2.0', desc: 'Used via wavespeed CLI for frames', connected: true,  spend: '$7.12',  cap: '$30', color: 'from-emerald-500 to-teal-500', letter: 'G' },
  { id: 'wavespeed',name: 'Wavespeed', desc: 'Video + image rendering infra', connected: true, spend: '$22.10', cap: '$100', color: 'from-indigo-500 to-violet-500', letter: 'W' },
  { id: 'agentbrowser', name: 'agent-browser', desc: 'CLI browser for scraping login-gated sites (supports HTTP basic auth)', connected: true, spend: '$0.00', cap: '$20', color: 'from-rose-500 to-pink-500', letter: 'a' },
  { id: 'r2',      name: 'Cloudflare R2',  desc: 'Asset storage for generated frames & videos', connected: false, spend: '$0.00', cap: '—', color: 'from-orange-400 to-yellow-500', letter: 'R' },
  { id: 's3',      name: 'AWS S3',   desc: 'Alternative asset storage', connected: false, spend: '$0.00', cap: '—', color: 'from-amber-400 to-orange-600', letter: 'S' },
  { id: 'meta',    name: 'Meta Ads', desc: 'Push finished videos to Meta Ads Manager', connected: false, spend: '—', cap: '—', color: 'from-blue-500 to-blue-700', letter: 'f' },
  { id: 'tiktok',  name: 'TikTok',   desc: 'Auto-publish to TikTok Creative Exchange', connected: false, spend: '—', cap: '—', color: 'from-zinc-700 to-zinc-900', letter: 'T' },
];

const Integrations: React.FC = () => {
  const refreshHealth = async () => {
    const el = document.getElementById('health-status');
    if (!el) return;
    el.textContent = 'Checking…';
    const r = await getHealth();
    el.textContent = r?.ok ? 'All systems normal' : 'Degraded';
  };

  return (
    <>
      <TopBar title="Integrations" />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8">Connect your AI providers, storage, and publishing tools.</p>

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0"><Icon name="check" size={16} strokeWidth={3} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-emerald-300">Core services connected</p>
          <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5" id="health-status">Last health check: just now · all systems normal</p>
        </div>
        <button onClick={refreshHealth} className="text-[10px] sm:text-xs text-emerald-300 hover:text-emerald-200 flex-shrink-0 px-2 py-1">Re-check</button>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map(p => (
          <div key={p.id} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <div className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0', p.color)}>{p.letter}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm sm:text-base truncate">{p.name}</h3>
                  {p.connected
                    ? <span className="pill pill-success text-[10px]">Connected</span>
                    : <span className="pill pill-neutral text-[10px]">Not connected</span>
                  }
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">{p.desc}</p>
              </div>
              {p.connected
                ? <button onClick={() => toast(`Opening ${p.name} settings…`, 'info')} className="btn btn-secondary text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">Configure</button>
                : <button onClick={() => toast(`${p.name} setup flow (demo)`, 'info')} className="btn btn-primary text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">Connect</button>
              }
            </div>
            {p.spend !== '—' && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60 text-[11px] sm:text-xs">
                <span className="text-zinc-500">Spend this month</span>
                <span className="text-zinc-300 font-medium">{p.spend} / {p.cap}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export default Integrations;
