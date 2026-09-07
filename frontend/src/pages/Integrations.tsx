import React from 'react';
import { useTranslation } from 'react-i18next';
import TopBar from '../components/TopBar';
import { Icon, toast } from '../components/ui';
import { getHealth } from '../lib/api';
import { cn } from '../lib/utils';

const PROVIDERS = [
  { id: 'minimax',  name: 'MiniMax',  descKey: 'integrations.providers.minimax.desc', connected: true,  spend: '$18.42', cap: '$50', color: 'from-amber-500 to-orange-500', letter: 'M' },
  { id: 'gptimage', name: 'GPT-Image-2.0', descKey: 'integrations.providers.gptimage.desc', connected: true,  spend: '$7.12',  cap: '$30', color: 'from-emerald-500 to-teal-500', letter: 'G' },
  { id: 'wavespeed',name: 'Wavespeed', descKey: 'integrations.providers.wavespeed.desc', connected: true, spend: '$22.10', cap: '$100', color: 'from-indigo-500 to-violet-500', letter: 'W' },
  { id: 'agentbrowser', name: 'agent-browser', descKey: 'integrations.providers.agentbrowser.desc', connected: true, spend: '$0.00', cap: '$20', color: 'from-rose-500 to-pink-500', letter: 'a' },
  { id: 'r2',      name: 'Cloudflare R2',  descKey: 'integrations.providers.r2.desc', connected: false, spend: '$0.00', cap: '—', color: 'from-orange-400 to-yellow-500', letter: 'R' },
  { id: 's3',      name: 'AWS S3',   descKey: 'integrations.providers.s3.desc', connected: false, spend: '$0.00', cap: '—', color: 'from-amber-400 to-orange-600', letter: 'S' },
  { id: 'meta',    name: 'Meta Ads', descKey: 'integrations.providers.meta.desc', connected: false, spend: '—', cap: '—', color: 'from-blue-500 to-blue-700', letter: 'f' },
  { id: 'tiktok',  name: 'TikTok',   descKey: 'integrations.providers.tiktok.desc', connected: false, spend: '—', cap: '—', color: 'from-zinc-700 to-zinc-900', letter: 'T' },
];

const Integrations: React.FC = () => {
  const { t } = useTranslation();

  const refreshHealth = async () => {
    const el = document.getElementById('health-status');
    if (!el) return;
    el.textContent = t('integrations.health.checking');
    const r = await getHealth();
    el.textContent = r?.ok ? t('integrations.health.normal') : t('integrations.health.degraded');
  };

  return (
    <>
      <TopBar title={t('integrations.title')} />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8">{t('integrations.subtitle')}</p>

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0"><Icon name="check" size={16} strokeWidth={3} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-emerald-300">{t('integrations.health.title')}</p>
          <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5" id="health-status">{t('integrations.health.desc')}</p>
        </div>
        <button onClick={refreshHealth} className="text-[10px] sm:text-xs text-emerald-300 hover:text-emerald-200 flex-shrink-0 px-2 py-1">{t('integrations.health.recheck')}</button>
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
                    ? <span className="pill pill-success text-[10px]">{t('integrations.connected')}</span>
                    : <span className="pill pill-neutral text-[10px]">{t('integrations.notConnected')}</span>
                  }
                </div>
                <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">{t(p.descKey)}</p>
              </div>
              {p.connected
                ? <button onClick={() => toast(t('integrations.toast.openSettings', { name: p.name }), 'info')} className="btn btn-secondary text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">{t('integrations.configure')}</button>
                : <button onClick={() => toast(t('integrations.toast.setupFlow', { name: p.name }), 'info')} className="btn btn-primary text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">{t('integrations.connect')}</button>
              }
            </div>
            {p.spend !== '—' && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800/60 text-[11px] sm:text-xs">
                <span className="text-zinc-500">{t('integrations.spendThisMonth')}</span>
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
