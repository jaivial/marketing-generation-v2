import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import TopBar from '../components/TopBar';
import { cn, timeAgo } from '../lib/utils';
import { Icon, toast, openModal } from '../components/ui';
import { ApiError, getCampaign } from '../lib/api';
import type { CampaignDetail } from '../lib/api';
import type { Campaign, Frame } from '../lib/types';

const TABS = [
  { id: 'frames',   label: 'Frames' },
  { id: 'script',   label: 'Script' },
  { id: 'source',   label: 'Source' },
  { id: 'activity', label: 'Activity' },
] as const;

/**
 * Campaign detail — reads the campaign by id from `GET /api/campaigns/{id}`
 * and renders the plan, the frame grid, the script, and the final video URL.
 *
 * The locally-cached store row (if any) is used for the first paint so
 * navigating from the Library feels instant; the server payload then fills
 * in everything the list endpoint doesn't carry (script, every frame URL,
 * screenshots, per-asset rows). 403/404 from the API map onto distinct
 * messages so a shared link to somebody else's campaign says so plainly.
 */
const Detail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { history, setHistory } = useStore();
  const cached = (Array.isArray(history) ? history : []).find(i => i.id === id);
  const [tab, setTab] = useState<typeof TABS[number]['id']>('frames');
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const d = await getCampaign(id);
        if (cancelled) return;
        setDetail(d);
        // Keep the shared store in sync so the list pages show the same
        // status/plan without a second round-trip.
        setHistory(prev => {
          const rows = Array.isArray(prev) ? prev : [];
          const merged: Campaign = {
            ...(rows.find(r => r.id === id) as Campaign | undefined),
            ...d.campaign,
            script: d.plan.script,
            videoUrl: d.plan.video_url,
            plan: d.plan.plan as any,
            frames: d.plan.frames.map((url, i) => ({ i, t: i * 2, url })),
          };
          return rows.some(r => r.id === id)
            ? rows.map(r => (r.id === id ? merged : r))
            : [merged, ...rows];
        });
      } catch (e) {
        if (!cancelled) {
          setError({ status: e instanceof ApiError ? e.status : 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, setHistory]);

  // Prefer the server payload; fall back to the cached list row.
  const c: Campaign | undefined = detail
    ? ({ ...(cached || {}), ...detail.campaign } as Campaign)
    : cached;

  if (loading && !c) {
    return (
      <div className="p-8 sm:p-12 text-center text-zinc-500">
        <Icon name="loader" size={32} className="animate-spin mb-3" strokeWidth={2} />
        <p className="text-sm">Loading campaign…</p>
      </div>
    );
  }

  if (!c || (error && !detail)) {
    const forbidden = error?.status === 403;
    return (
      <div className="p-8 sm:p-12 text-center">
        <Icon name={forbidden ? 'lock' : 'helpCircle'} size={48} className="text-zinc-500 mb-4" strokeWidth={1.5} />
        <h2 className="text-lg sm:text-xl font-semibold">
          {forbidden ? 'No access to this campaign' : 'Campaign not found'}
        </h2>
        <p className="text-sm text-zinc-400 mt-2">
          {forbidden
            ? 'This campaign belongs to another workspace.'
            : 'The campaign may have been deleted.'}
        </p>
        <button onClick={() => navigate('/campaigns')} className="btn btn-primary mt-6 text-sm">Back to campaigns</button>
      </div>
    );
  }

  const plan = detail?.plan.plan ?? c.plan ?? null;
  const script = detail?.plan.script || c.script || '';
  const videoUrl = detail?.plan.video_url || c.videoUrl || null;
  const screenshots = detail?.plan.screenshots ?? [];
  const serverFrames: Frame[] = (detail?.plan.frames ?? []).map((url, i) => ({ i, t: i * 2, url }));

  const nFrames = Math.max(2, Math.ceil(c.duration_s / 2));
  const frames: Frame[] = serverFrames.length
    ? serverFrames
    : (c.frames && c.frames.length
      ? c.frames
      : Array.from({ length: nFrames }, (_, i) => ({ i, t: i * 2, url: null })));

  return (
    <>
      <TopBar
        title={c.name}
        breadcrumb={[{ label: 'Campaigns', href: '/campaigns' }, { label: c.name }]}
        actions={[
          <button key="back" onClick={() => navigate('/campaigns')} className="btn btn-secondary text-xs sm:text-sm">← Back</button>,
        ]}
      />

      {/* Hero */}
      <div className={cn('rounded-xl sm:rounded-2xl aspect-video relative overflow-hidden mb-4 sm:mb-6 bg-gradient-to-br', c.color)}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => {
              if (videoUrl) {
                const v: any = document.createElement('video');
                v.src = videoUrl;
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
                toast('Video not ready yet', 'info');
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
                {plan?.tagline ? ` · "${plan.tagline}"` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(videoUrl || ''); toast('Video URL copied', 'success'); }} className="btn bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/10 text-xs px-2.5 py-1.5">Share</button>
              <button onClick={() => toast('Export started', 'success')} className="btn bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/10 text-xs px-2.5 py-1.5">Export</button>
              <button
                onClick={() => {
                  if (confirm('Delete this campaign?')) {
                    setHistory(curr => curr.filter(i => i.id !== c.id));
                    toast('Campaign deleted', 'success');
                    navigate('/campaigns');
                  }
                }}
                className="btn btn-danger text-xs px-2.5 py-1.5"
              >Delete</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 min-w-0">
          <nav className="flex gap-4 sm:gap-6 text-sm border-b border-zinc-800 overflow-x-auto scrollbar-thin whitespace-nowrap">
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className={cn('py-3 border-b-2 -mb-px', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white')}>
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-4 sm:mt-6">
            {tab === 'frames' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                  <h3 className="text-xs sm:text-sm font-semibold">Timeline · {nFrames} frames</h3>
                  <div className="text-[10px] sm:text-xs text-zinc-500">0:00 → 0:{String(c.duration_s).padStart(2,'0')}</div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                  {frames.map((f, i) => (
                    <div key={i} className="frame-card aspect-video rounded-lg overflow-hidden border border-zinc-800 relative cursor-pointer hover:border-brand-500/50">
                      {f.url
                        ? <img src={f.url} className="w-full h-full object-cover" alt={`Frame ${i}`} loading="lazy" />
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
                <h3 className="font-semibold text-sm sm:text-base mb-3">Voice-over script</h3>
                <pre className="whitespace-pre-wrap font-mono text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  {script || (plan ? `${plan.hook}\n\n${plan.tagline}\n\nCall to action: ${plan.cta}` : 'No script generated yet.')}
                </pre>
              </div>
            )}
            {tab === 'source' && (
              <div className="space-y-4">
              {/* The final render is the single most useful thing on this
                  page, so we show the URL verbatim (copyable) instead of
                  hiding it behind the hero play button only. */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
                <h3 className="font-semibold text-sm sm:text-base mb-3">Final video</h3>
                {videoUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate text-xs bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1.5 text-brand-300">{videoUrl}</code>
                    <a href={videoUrl} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs px-2.5 py-1.5">
                      <Icon name="externalLink" size={13} strokeWidth={2} />
                    </a>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(videoUrl); toast('Video URL copied', 'success'); }}
                      className="btn btn-secondary text-xs px-2.5 py-1.5"
                    >
                      <Icon name="copy" size={13} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Not rendered yet.</p>
                )}
                {screenshots.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Screenshots ({screenshots.length})</p>
                    <div className="grid grid-cols-3 gap-2">
                      {screenshots.map((u, i) => (
                        <img key={i} src={u} alt={`Screenshot ${i + 1}`} loading="lazy" className="aspect-video w-full object-cover rounded border border-zinc-800" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60">
                {[
                  ['Type',     c.source_kind || 'url'],
                  ['Target',   c.source || '—'],
                  ['Style',    c.style || 'cinematic'],
                  ['Created',  timeAgo(c.created_at)],
                  ['Assets',   String(detail?.assets.length ?? 0)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between p-3 sm:p-4 text-xs sm:text-sm gap-3">
                    <span className="text-zinc-500 flex-shrink-0">{k}</span>
                    <span className="text-zinc-200 truncate text-right min-w-0">{v}</span>
                  </div>
                ))}
              </div>
              </div>
            )}
            {tab === 'activity' && (
              <ul className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                <li className="flex gap-3 p-3 bg-zinc-900/40 rounded-lg border border-zinc-800">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0"><Icon name="check" size={14} strokeWidth={3} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 truncate">Pipeline complete</p>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">{timeAgo(c.created_at)}</p>
                  </div>
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          {plan && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
              <h3 className="font-semibold text-sm sm:text-base mb-3 sm:mb-4">Campaign plan</h3>
              <div className="space-y-3 text-xs sm:text-sm">
                {planRow('Hook', plan.hook || '')}
                {planRow('Tagline', plan.tagline || '')}
                {planRow('CTA', plan.cta || '')}
                {planRow('Audience', plan.audience || '')}
                {planRow('Tone', plan.tone || '')}
              </div>
            </div>
          )}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5">
            <h3 className="font-semibold text-sm sm:text-base mb-3 sm:mb-4">Metadata</h3>
            <div className="space-y-2 text-xs sm:text-sm">
              {metaRow('ID', c.id)}
              {metaRow('Duration', c.duration_s + 's')}
              {metaRow('Status', c.status)}
              {metaRow('Created', timeAgo(c.created_at))}
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
