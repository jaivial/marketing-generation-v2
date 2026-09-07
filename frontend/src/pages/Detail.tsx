import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import TopBar from '../components/TopBar';
import { cn, timeAgo } from '../lib/utils';
import { Icon, toast, openModal } from '../components/ui';

const TABS = [
  { id: 'frames',   labelKey: 'detail.tabs.frames' },
  { id: 'script',   labelKey: 'detail.tabs.script' },
  { id: 'source',   labelKey: 'detail.tabs.source' },
  { id: 'activity', labelKey: 'detail.tabs.activity' },
] as const;

const Detail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { history, setHistory } = useStore();
  const { t } = useTranslation();
  const c = history.find(i => i.id === id);
  const [tab, setTab] = useState<typeof TABS[number]['id']>('frames');

  if (!c) {
    return (
      <div className="p-8 sm:p-12 text-center">
        <Icon name="helpCircle" size={48} className="text-zinc-500 mb-4" strokeWidth={1.5} />
        <h2 className="text-lg sm:text-xl font-semibold">{t('detail.notFound.title')}</h2>
        <p className="text-sm text-zinc-400 mt-2">{t('detail.notFound.desc')}</p>
        <button onClick={() => navigate('/campaigns')} className="btn btn-primary mt-6 text-sm">{t('detail.notFound.cta')}</button>
      </div>
    );
  }

  const nFrames = Math.max(2, Math.ceil(c.duration_s / 2));
  const frames = c.frames && c.frames.length
    ? c.frames
    : Array.from({ length: nFrames }, (_, i) => ({ i, t: i * 2, url: null }));

  return (
    <>
      <TopBar
        title={c.name}
        breadcrumb={[{ label: t('wizard.breadcrumb.campaigns'), href: '/campaigns' }, { label: c.name }]}
        actions={[
          <button key="back" onClick={() => navigate('/campaigns')} className="btn btn-secondary text-xs sm:text-sm">{t('detail.back')}</button>,
        ]}
      />

      {/* Hero */}
      <div className={cn('rounded-xl sm:rounded-2xl aspect-video relative overflow-hidden mb-4 sm:mb-6 bg-gradient-to-br', c.color)}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => {
              if (c.videoUrl) {
                const v: any = document.createElement('video');
                v.src = c.videoUrl;
                v.controls = true;
                v.autoplay = true;
                v.className = 'w-full rounded-lg';
                const m = openModal(v);
                const wrap = document.createElement('div');
                wrap.className = 'w-full max-w-3xl';
                wrap.appendChild(v);
                m.overlay.innerHTML = '';
                m.overlay.appendChild(wrap);
              } else {
                toast(t('detail.toast.videoNotReady'), 'info');
              }
            }}
            className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition shadow-2xl"
          >
            <Icon name="play" size={22} strokeWidth={2} className="text-zinc-900 ml-0.5 sm:w-7 sm:h-7" />
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <h1 className="text-base sm:text-3xl font-bold text-white font-display truncate">{c.name}</h1>
              <p className="text-zinc-200 text-[10px] sm:text-sm mt-0.5 sm:mt-1 truncate">
                {c.duration_s}s · {c.style || 'cinematic'}
                {c.plan?.tagline ? ` · "${c.plan.tagline}"` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(c.videoUrl || ''); toast(t('detail.toast.videoUrlCopied'), 'success'); }} className="btn bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/10 text-xs px-2.5 py-1.5">{t('detail.share')}</button>
              <button onClick={() => toast(t('detail.toast.exportStarted'), 'success')} className="btn bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/10 text-xs px-2.5 py-1.5">{t('detail.export')}</button>
              <button
                onClick={() => {
                  if (confirm(t('detail.confirmDelete'))) {
                    setHistory(curr => curr.filter(i => i.id !== c.id));
                    toast(t('detail.toast.campaignDeleted'), 'success');
                    navigate('/campaigns');
                  }
                }}
                className="btn btn-danger text-xs px-2.5 py-1.5"
              >{t('detail.delete')}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <nav className="flex gap-4 sm:gap-6 text-sm border-b border-zinc-800 overflow-x-auto scrollbar-thin whitespace-nowrap">
            {TABS.map(item => {
              const active = tab === item.id;
              return (
                <button key={item.id} onClick={() => setTab(item.id)} className={cn('py-3 border-b-2 -mb-px', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white')}>
                  {t(item.labelKey)}
                </button>
              );
            })}
          </nav>
          <div className="mt-4 sm:mt-6">
            {tab === 'frames' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                  <h3 className="text-xs sm:text-sm font-semibold">{t('detail.timeline', { count: nFrames })}</h3>
                  <div className="text-[10px] sm:text-xs text-zinc-500">0:00 → 0:{String(c.duration_s).padStart(2,'0')}</div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                  {frames.map((f, i) => (
                    <div key={i} className="frame-card aspect-video rounded-lg overflow-hidden border border-zinc-800 relative cursor-pointer hover:border-brand-500/50">
                      {f.url
                        ? <img src={f.url} className="w-full h-full object-cover" alt={t('detail.frameAlt', { index: i })} loading="lazy" />
                        : <div className={cn('w-full h-full bg-gradient-to-br', c.color, 'opacity-80')} />
                      }
                      <span className="absolute bottom-1 left-1 text-[9px] sm:text-[10px] bg-black/70 px-1.5 py-0.5 rounded">
                        {typeof f.t === 'number' ? `${Math.floor(f.t/60)}:${String(f.t%60).padStart(2,'0')}` : `#${i+1}`}
                      </span>
                      <div className="frame-overlay absolute inset-0 flex items-center justify-center bg-black/40">
                        <Icon name="play" size={18} strokeWidth={2} className="text-white sm:w-5 sm:h-5" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === 'script' && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
                <h3 className="font-semibold text-sm sm:text-base mb-3">{t('detail.script.title')}</h3>
                <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  {c.script || (c.plan ? `${c.plan.hook}\n\n${c.plan.tagline}\n\n${t('detail.script.callToAction')} ${c.plan.cta}` : t('detail.script.empty'))}
                </pre>
              </div>
            )}
            {tab === 'source' && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60">
                {[
                  [t('detail.source.type'),    c.source_kind || 'url'],
                  [t('detail.source.target'),  c.source || '—'],
                  [t('detail.source.style'),   c.style || 'cinematic'],
                  [t('detail.source.created'), timeAgo(c.created_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between p-3 sm:p-4 text-xs sm:text-sm gap-3">
                    <span className="text-zinc-500 flex-shrink-0">{k}</span>
                    <span className="text-zinc-200 truncate text-right min-w-0">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === 'activity' && (
              <ul className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                <li className="flex gap-3 p-3 bg-zinc-900/40 rounded-lg border border-zinc-800">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0"><Icon name="check" size={14} strokeWidth={3} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 truncate">{t('detail.activity.pipelineComplete')}</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">{timeAgo(c.created_at)}</p>
                  </div>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          {c.plan && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
              <h3 className="font-semibold text-sm sm:text-base mb-3 sm:mb-4">{t('detail.plan.title')}</h3>
              <div className="space-y-3 text-xs sm:text-sm">
                {planRow(t('detail.plan.hook'), c.plan.hook)}
                {planRow(t('detail.plan.tagline'), c.plan.tagline)}
                {planRow(t('detail.plan.cta'), c.plan.cta)}
                {planRow(t('detail.plan.audience'), c.plan.audience)}
                {planRow(t('detail.plan.tone'), c.plan.tone)}
              </div>
            </div>
          )}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
            <h3 className="font-semibold text-sm sm:text-base mb-3 sm:mb-4">{t('detail.metadata.title')}</h3>
            <div className="space-y-2 text-xs sm:text-sm">
              {metaRow(t('detail.metadata.id'), c.id)}
              {metaRow(t('detail.metadata.duration'), c.duration_s + 's')}
              {metaRow(t('detail.metadata.status'), c.status)}
              {metaRow(t('detail.metadata.created'), timeAgo(c.created_at))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const planRow = (k: string, v: string) => (
  <div>
    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{k}</p>
    <p className="text-xs sm:text-sm text-zinc-100 mt-0.5 break-words">{v || '—'}</p>
  </div>
);

const metaRow = (k: string, v: string) => (
  <div className="flex justify-between gap-2">
    <span className="text-zinc-500">{k}</span>
    <span className="text-zinc-300 capitalize truncate text-right min-w-0">{String(v)}</span>
  </div>
);

export default Detail;
