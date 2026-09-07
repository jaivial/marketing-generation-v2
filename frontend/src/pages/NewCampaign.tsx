import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TopBar from '../components/TopBar';
import { useStore } from '../lib/store';
import { streamCampaign } from '../lib/api';
import { Icon, toast, type IconName } from '../components/ui';
import { cn, autoName, nFrames } from '../lib/utils';
import type { SseEvent, Campaign, Frame } from '../lib/types';

const STEPS = [
  { n: 1, labelKey: 'wizard.steps.source' },
  { n: 2, labelKey: 'wizard.steps.brief' },
  { n: 3, labelKey: 'wizard.steps.style' },
  { n: 4, labelKey: 'wizard.steps.generate' },
];

const STYLES = [
  { id: 'cinematic',   labelKey: 'wizard.styles.cinematic.label',   descKey: 'wizard.styles.cinematic.desc',   color: 'from-rose-500 to-amber-500' },
  { id: 'motion',      labelKey: 'wizard.styles.motion.label',      descKey: 'wizard.styles.motion.desc',      color: 'from-indigo-500 to-fuchsia-500' },
  { id: 'playful',     labelKey: 'wizard.styles.playful.label',     descKey: 'wizard.styles.playful.desc',     color: 'from-emerald-500 to-lime-500' },
  { id: 'punchy',      labelKey: 'wizard.styles.punchy.label',      descKey: 'wizard.styles.punchy.desc',      color: 'from-cyan-500 to-blue-500' },
  { id: 'minimal',     labelKey: 'wizard.styles.minimal.label',     descKey: 'wizard.styles.minimal.desc',     color: 'from-zinc-400 to-zinc-600' },
  { id: 'documentary', labelKey: 'wizard.styles.documentary.label', descKey: 'wizard.styles.documentary.desc', color: 'from-amber-500 to-orange-500' },
];

const NewCampaign: React.FC = () => {
  const navigate = useNavigate();
  const { history, setHistory } = useStore();
  const { t } = useTranslation();

  const [step, setStep] = useState(1);
  const [source_kind, setSourceKind] = useState<'url' | 'files'>('url');
  const [target, setTarget] = useState('');
  // Optional HTTP basic auth for sites that require login.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [brief, setBrief] = useState('');
  const [duration_s, setDuration] = useState(30);
  const [style, setStyle] = useState('cinematic');
  const [name, setName] = useState('');
  const [running, setRunning] = useState(false);

  const [plan, setPlan] = useState<any>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [script, setScript] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [pipelineStates, setPipelineStates] = useState<Record<string, 'active' | 'done' | 'error' | 'idle'>>({
    plan: 'idle', frame: 'idle', script: 'idle', video: 'idle',
  });

  const stepperRef = useRef<HTMLOListElement>(null);
  const artifactsRef = useRef<HTMLDivElement>(null);

  // Re-render the current step (for input changes that affect disabled state etc.)
  // Since React handles re-renders, no manual re-render needed.

  const canAdvance = () => {
    if (step === 1) return target.trim().length > 0;
    return true;
  };

  const startGeneration = async () => {
    setRunning(true);
    setPlan(null);
    setFrames([]);
    setScript('');
    setVideoUrl(null);
    setError(null);
    setDone(false);

    const id = 'c-' + Math.random().toString(36).slice(2, 8);
    setCampaignId(id);

    const draft: Campaign = {
      id,
      name: name || autoName(target),
      duration_s,
      status: 'generating',
      created_at: Date.now(),
      color: 'from-brand-500 to-fuchsia-500',
      source: target,
      source_kind,
      style,
      plan: null,
      frames: [],
    };
    setHistory(curr => [draft, ...curr.filter(i => i.id !== draft.id)]);

    const setPipe = (k: string, s: 'active' | 'done' | 'error') => {
      setPipelineStates(prev => ({ ...prev, [k]: s }));
    };

    try {
      const stream = streamCampaign({
        source_kind,
        target,
        duration_s,
        style,
        username: username || null,
        password: password || null,
      });
      for await (const ev of stream) {
        handleEvent(ev);
      }
    } catch (err: any) {
      const msg = String(err?.message || err || t('wizard.toast.unknownError'));
      setError(msg);
      toast(msg, 'error', 6000);
      Object.keys(pipelineStates).forEach(k => setPipe(k, 'error'));
      setHistory(curr => curr.map(i => i.id === id ? { ...i, status: 'failed' } : i));
      setRunning(false);
    }
  };

  const handleEvent = (ev: SseEvent) => {
    if (ev.event === 'plan') {
      setPlan(ev.data);
      setPipelineStates(p => ({ ...p, plan: 'done', frame: 'active' }));
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, plan: ev.data } : i));
    } else if (ev.event === 'frame') {
      setFrames(f => [...f, ev.data]);
      setPipelineStates(p => ({ ...p, frame: 'active' }));
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, frames: [...(i.frames || []), ev.data] } : i));
    } else if (ev.event === 'script') {
      setScript(ev.data?.script || '');
      setPipelineStates(p => ({ ...p, frame: 'done', script: 'done', video: 'active' }));
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, script: ev.data?.script } : i));
    } else if (ev.event === 'video') {
      setVideoUrl(ev.data?.url || null);
      setPipelineStates(p => ({ ...p, video: 'done' }));
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, videoUrl: ev.data?.url } : i));
    } else if (ev.event === 'done') {
      setDone(true);
      setPipelineStates(p => ({ ...p, video: 'done' }));
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, status: 'done' } : i));
      toast(t('wizard.toast.success'), 'success');
    } else if (ev.event === 'error') {
      setError(ev.data?.message || t('wizard.toast.unknownError'));
      toast(ev.data?.message || t('wizard.toast.error'), 'error', 6000);
      Object.keys(pipelineStates).forEach(k => setPipelineStates(p => ({ ...p, [k]: 'error' })));
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, status: 'failed' } : i));
    }
  };

  return (
    <>
      <TopBar
        title={t('wizard.title')}
        breadcrumb={[{ label: t('wizard.breadcrumb.campaigns'), href: '/campaigns' }, { label: t('wizard.breadcrumb.new') }]}
      />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8">{t('wizard.subtitle')}</p>

      {/* Stepper */}
      <ol ref={stepperRef} className="flex items-start w-full mb-6 sm:mb-8 text-xs sm:text-sm font-medium gap-1 sm:gap-0">
        {STEPS.map((s, i) => {
          const passed = step > s.n;
          const current = step === s.n;
          return (
            <li key={s.n} className={cn('flex items-center min-w-0', i < STEPS.length - 1 && 'flex-1')}>
              <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 min-w-0">
                <span className={cn(
                  'flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 text-xs sm:text-sm font-medium transition-colors flex-shrink-0',
                  passed ? 'bg-brand-500 border-brand-500 text-white'
                    : current ? 'bg-brand-500/10 border-brand-500 text-brand-300'
                    : 'border-zinc-700 text-zinc-500 bg-zinc-900/40'
                )}>
                  {passed ? (
                    <Icon name="check" size={12} strokeWidth={3} className="sm:w-3.5 sm:h-3.5" />
                  ) : s.n}
                </span>
                <span className={cn('sm:ml-0 truncate text-center sm:text-left', (passed || current) ? 'text-white' : 'text-zinc-500')}>{t(s.labelKey)}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('hidden sm:block flex-1 h-px mx-4 transition-colors', passed ? 'bg-brand-500' : 'bg-zinc-800')} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step content card */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl sm:rounded-2xl p-3 sm:p-8 min-h-[420px] page-enter">

        {/* Step 1: Source */}
        {step === 1 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">{t('wizard.step1.heading')}</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">{t('wizard.step1.desc')}</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">{t('wizard.stepOf', { current: 1, total: 4 })}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              {['url', 'files'].map(kind => {
                const active = source_kind === kind;
                return (
                  <button
                    key={kind}
                    onClick={() => setSourceKind(kind as any)}
                    className={cn(
                      'p-4 rounded-xl text-left transition-all border-2',
                      active ? 'bg-brand-500/10 border-brand-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg"><Icon name={(kind === 'url' ? 'globe' : 'folder') as IconName} size={20} strokeWidth={1.8} className="text-zinc-400" /></span>
                      <span className="font-medium text-sm">{kind === 'url' ? t('wizard.step1.url.label') : t('wizard.step1.files.label')}</span>
                    </div>
                    <p className="text-xs text-zinc-500">{kind === 'url' ? t('wizard.step1.url.desc') : t('wizard.step1.files.desc')}</p>
                  </button>
                );
              })}
            </div>

            <input
              className="input"
              placeholder={source_kind === 'url' ? t('wizard.step1.url.placeholder') : t('wizard.step1.files.placeholder')}
              value={target}
              onChange={e => setTarget(e.target.value)}
            />

            {/* Optional login credentials for sites behind auth (URL only) */}
            {source_kind === 'url' && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowAuth(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  <Icon name="lock" size={12} />
                  <span>{showAuth ? t('wizard.step1.auth.hide') : t('wizard.step1.auth.show')}</span>
                  <Icon name={showAuth ? 'chevronUp' : 'chevronDown'} size={12} />
                </button>
                {showAuth && (
                  <div className="mt-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                    <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <Icon name="info" size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{t('wizard.step1.auth.info')}</span>
                    </div>
                    <div>
                      <label className="label flex items-center gap-1.5">
                        <Icon name="user" size={12} />
                        <span>{t('wizard.step1.auth.username')}</span>
                      </label>
                      <input
                        className="input"
                        type="text"
                        autoComplete="username"
                        placeholder={t('wizard.step1.auth.usernamePlaceholder')}
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label flex items-center gap-1.5">
                        <Icon name="key" size={12} />
                        <span>{t('wizard.step1.auth.password')}</span>
                      </label>
                      <input
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {['https://acme-cms.io', 'https://menustudioai.com', 'https://stripe.com'].map(ex => (
                <button key={ex} onClick={() => { setTarget(ex); setSourceKind('url'); }} className="text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-md transition">
                  {ex}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <label className="label">{t('wizard.step1.name.label')}</label>
              <input
                className="input"
                placeholder={t('wizard.step1.name.placeholder')}
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => navigate('/')} className="btn btn-ghost">{t('common.cancel')}</button>
              <button
                onClick={() => setStep(2)}
                disabled={!canAdvance()}
                className="btn btn-primary px-5"
              >{t('common.continue')}</button>
            </div>
          </>
        )}

        {/* Step 2: Brief */}
        {step === 2 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">{t('wizard.step2.heading')}</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">{t('wizard.step2.desc')}</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">{t('wizard.stepOf', { current: 2, total: 4 })}</span>
            </div>

            <div className="mb-5">
              <label className="label">{t('wizard.step2.brief.label')}</label>
              <textarea
                className="textarea scrollbar-thin"
                rows={4}
                placeholder={t('wizard.step2.brief.placeholder')}
                value={brief}
                onChange={e => setBrief(e.target.value)}
              />
            </div>

            <label className="label">{t('wizard.step2.templates.label')}</label>
            <div className="flex flex-wrap gap-2">
              {['wizard.step2.templates.saas', 'wizard.step2.templates.ecommerce', 'wizard.step2.templates.brand', 'wizard.step2.templates.tutorial'].map(key => (
                <button key={key} onClick={() => setBrief(t(key))} className="text-xs text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-md transition">
                  {t(key)}
                </button>
              ))}
            </div>

            <div className="mt-6 p-3 sm:p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs sm:text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-zinc-500">{t('wizard.step2.summary.source')}</span><span className="text-zinc-300 truncate ml-3 max-w-[60%] text-right flex items-center justify-end gap-1.5">
                          <Icon name={(source_kind === 'url' ? 'globe' : 'folder') as IconName} size={14} className="text-zinc-400 flex-shrink-0" />
                          {source_kind === 'url' ? t('wizard.step2.summary.url') : t('wizard.step2.summary.local')}
                        </span></div>
              <div className="flex justify-between"><span className="text-zinc-500">{t('wizard.step2.summary.target')}</span><span className="text-zinc-300 truncate ml-3 max-w-[60%] text-right">{target || '—'}</span></div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => setStep(1)} className="btn btn-ghost">{t('common.backArrow')}</button>
              <button onClick={() => setStep(3)} className="btn btn-primary px-5">{t('common.continue')}</button>
            </div>
          </>
        )}

        {/* Step 3: Style & duration */}
        {step === 3 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">{t('wizard.step3.heading')}</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">{t('wizard.step3.desc')}</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">{t('wizard.stepOf', { current: 3, total: 4 })}</span>
            </div>

            <div className="mb-6">
              <label className="label flex items-center justify-between">
                <span>{t('wizard.step3.duration.label')}</span>
                <span className="text-brand-300 font-semibold">{duration_s}s</span>
              </label>
              <div className="flex items-center gap-3">
                {[15, 30, 45].map(d => (
                  <button key={d} onClick={() => setDuration(d)} className={cn('btn flex-1', duration_s === d ? 'btn-primary' : 'btn-secondary')}>
                    {d}s
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">{t('wizard.step3.frames.hint', { count: nFrames(duration_s) })}</p>
            </div>

            <div>
              <label className="label">{t('wizard.step3.style.label')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={cn('p-3 sm:p-4 rounded-xl text-left transition-all border-2', style === s.id ? 'bg-brand-500/10 border-brand-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700')}
                  >
                    <div className={cn('w-full h-10 sm:h-12 rounded-lg mb-2 bg-gradient-to-br', s.color)} />
                    <div className="font-medium text-sm">{t(s.labelKey)}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{t(s.descKey)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 p-3 sm:p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs sm:text-sm flex items-center justify-between">
              <span className="text-zinc-400">{t('wizard.step3.estimatedCost')}</span>
              <span className="text-emerald-400 font-semibold">~$0.42</span>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => setStep(2)} className="btn btn-ghost">{t('common.backArrow')}</button>
              <button onClick={() => setStep(4)} className="btn btn-primary px-5">{t('common.continue')}</button>
            </div>
          </>
        )}

        {/* Step 4: Generate */}
        {step === 4 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">{t('wizard.step4.heading')}</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">{t('wizard.step4.desc')}</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">{t('wizard.stepOf', { current: 4, total: 4 })}</span>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60">
              {[
                { k: t('wizard.step4.summary.campaign'), v: name || autoName(target) },
                {
                  k: t('wizard.step4.summary.source'),
                  v: (
                    <span className="flex items-center gap-1.5 justify-end">
                      <Icon name={(source_kind === 'url' ? 'globe' : 'folder') as IconName} size={14} className="text-zinc-400 flex-shrink-0" />
                      <span className="truncate">{target}</span>
                    </span>
                  ),
                },
                { k: t('wizard.step4.summary.duration'), v: duration_s + 's' },
                { k: t('wizard.step4.summary.style'), v: (() => { const f = STYLES.find(s => s.id === style); return f ? t(f.labelKey) : style; })() },
                { k: t('wizard.step4.summary.brief'), v: brief || t('wizard.step4.summary.briefAuto') },
              ].map(({ k, v }) => (
                <div key={k} className="flex items-center justify-between p-3 sm:p-4 text-xs sm:text-sm">
                  <span className="text-zinc-500">{k}</span>
                  <span className="text-zinc-200 truncate ml-3 max-w-[60%] text-right">{v}</span>
                </div>
              ))}
            </div>

            {/* Pipeline */}
            <div className="mt-6 bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <span className={cn('w-2 h-2 rounded-full',
                    pipelineStates.plan === 'active' || pipelineStates.frame === 'active' || pipelineStates.script === 'active' || pipelineStates.video === 'active'
                      ? 'bg-brand-400 animate-pulse' : 'bg-zinc-600')} />
                  {t('wizard.pipeline.title')}
                </h3>
                <span className="text-[10px] sm:text-xs text-zinc-500 whitespace-nowrap" id="live-status">
                  {running ? t('wizard.pipeline.running') : t('wizard.pipeline.idle')}
                </span>
              </div>
              <div className="space-y-3 text-xs sm:text-sm">
                {pipelineRow('plan', t('wizard.pipeline.plan.label'), t('wizard.pipeline.plan.sub'), pipelineStates.plan)}
                {pipelineRow('frame', t('wizard.pipeline.frame.label'), t('wizard.pipeline.frame.sub'), pipelineStates.frame)}
                {pipelineRow('script', t('wizard.pipeline.script.label'), t('wizard.pipeline.script.sub'), pipelineStates.script)}
                {pipelineRow('video', t('wizard.pipeline.video.label'), t('wizard.pipeline.video.sub'), pipelineStates.video)}
              </div>
              <div ref={artifactsRef} className="mt-5 pt-5 border-t border-zinc-800">
                {plan && (
                  <div className="space-y-2 mb-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">{t('wizard.artifacts.generatedPlan')}</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                      {pillKV(t('wizard.plan.hook'), plan.hook)}
                      {pillKV(t('wizard.plan.tagline'), plan.tagline)}
                      {pillKV(t('wizard.plan.cta'), plan.cta)}
                      {pillKV(t('wizard.plan.audience'), plan.audience)}
                      {pillKV(t('wizard.plan.tone'), plan.tone)}
                    </div>
                  </div>
                )}
                {frames.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">{t('wizard.artifacts.frames', { count: frames.length })}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {frames.map(f => (
                        <div key={f.i} className="aspect-video rounded-lg border border-zinc-800 overflow-hidden relative bg-zinc-900">
                          <img src={f.url ?? undefined} className="w-full h-full object-cover" alt={t('detail.frameAlt', { index: f.i })} loading="lazy" />
                          <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 px-1.5 py-0.5 rounded">#{f.i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {script && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">{t('wizard.artifacts.script')}</h4>
                    <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono scrollbar-thin max-h-48 overflow-auto">{script}</pre>
                  </div>
                )}
                {videoUrl && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">{t('wizard.artifacts.finalVideo')}</h4>
                    <video src={videoUrl} controls className="w-full rounded-lg border border-zinc-800 bg-black" />
                  </div>
                )}
                {(done || videoUrl) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => campaignId && navigate(`/campaigns/${campaignId}`)} className="btn btn-primary text-xs sm:text-sm">
                      {t('wizard.actions.viewCampaign')}
                    </button>
                    <button onClick={() => { setStep(1); setPlan(null); setFrames([]); setScript(''); setVideoUrl(null); setDone(false); }} className="btn btn-secondary text-xs sm:text-sm">{t('wizard.actions.startAnother')}</button>
                    <button onClick={() => { navigator.clipboard?.writeText(videoUrl || ''); toast(t('wizard.toast.videoUrlCopied'), 'success'); }} className="btn btn-ghost text-xs sm:text-sm">{t('wizard.actions.copyUrl')}</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => setStep(3)} disabled={running} className="btn btn-ghost">{t('common.backArrow')}</button>
              <button onClick={startGeneration} disabled={running} className="btn btn-primary px-6">
                {running ? (
                  <>
                    <Icon name="loader" size={14} className="animate-spin" strokeWidth={2} />
                    {t('wizard.actions.generating')}
                  </>
                ) : (
                  <>
                    <Icon name="play" size={14} strokeWidth={2} />
                    {t('wizard.actions.generateVideo')}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

const pipelineRow = (key: string, label: string, sub: string, state: string) => {
  const isActive = state === 'active';
  const isDone = state === 'done';
  const isError = state === 'error';
  let iconCls = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ';
  let icon: React.ReactNode = '·';
  if (isDone) {
    iconCls += 'bg-emerald-500/20 text-emerald-400';
    icon = <Icon name="check" size={12} strokeWidth={3} />;
  } else if (isActive) {
    iconCls += 'bg-brand-500/20 text-brand-300 border-2 border-brand-500';
    icon = <Icon name="loader" size={12} className="animate-spin" strokeWidth={2} />;
  } else if (isError) {
    iconCls += 'bg-rose-500/20 text-rose-400';
    icon = '!';
  } else {
    iconCls += 'bg-zinc-800 text-zinc-500';
  }
  return (
    <div className="flex items-center gap-3">
      <div className={iconCls}>{typeof icon === 'string' ? icon : icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs sm:text-sm text-zinc-300">{label}</div>
        <div className={cn('text-[10px] sm:text-xs', isActive ? 'text-brand-300' : isError ? 'text-rose-400' : 'text-zinc-500')}>{sub}</div>
      </div>
    </div>
  );
};

const pillKV = (k: string, v: string) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5">
    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{k}</p>
    <p className="text-xs sm:text-sm font-medium text-zinc-200 mt-0.5">{v || '—'}</p>
  </div>
);

export default NewCampaign;
