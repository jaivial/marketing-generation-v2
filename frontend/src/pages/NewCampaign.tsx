import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useStore } from '../lib/store';
import { streamCampaign, fetchEstimate, fetchBalance, type CampaignEstimate } from '../lib/api';
import { Icon, toast, type IconName } from '../components/ui';
import { cn, autoName, nFrames } from '../lib/utils';
import { formatCredits, formatCreditsUsd } from '../lib/credits';
import { isPipelineRunning, usePipelineEvents, type PipelineNodeState } from '../lib/pipelineStates';
import type { SseEvent, Campaign, Frame } from '../lib/types';

const STEPS = [
  { n: 1, label: 'Source' },
  { n: 2, label: 'Brief' },
  { n: 3, label: 'Style & duration' },
  { n: 4, label: 'Generate' },
];

const STYLES = [
  { id: 'cinematic',  label: 'Cinematic',  desc: 'Dramatic, filmic motion.', color: 'from-rose-500 to-amber-500' },
  { id: 'motion',     label: 'Motion-graphic', desc: 'Bold shapes, kinetic type.', color: 'from-indigo-500 to-fuchsia-500' },
  { id: 'playful',    label: 'Playful',    desc: 'Friendly, illustrated.',  color: 'from-emerald-500 to-lime-500' },
  { id: 'punchy',     label: 'Punchy',     desc: 'Fast cuts, bold copy.',    color: 'from-cyan-500 to-blue-500' },
  { id: 'minimal',    label: 'Minimal',    desc: 'Quiet, premium, lots of whitespace.', color: 'from-zinc-400 to-zinc-600' },
  { id: 'documentary',label: 'Documentary', desc: 'Real-feel, journalistic.', color: 'from-amber-500 to-orange-500' },
];

const NewCampaign: React.FC = () => {
  const navigate = useNavigate();
  const { history, setHistory } = useStore();

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
  // Same state machine the detail-page canvas draws — one source of truth.
  // observation point: `ui.wizard.pipeline-events`.
  const pipeline = usePipelineEvents();
  const pipelineStates = pipeline.states;

  // ─── Cost preview ─────────────────────────────────────────────────────────
  // The wizard asks the backend what a campaign of this length costs and
  // whether the workspace can afford it. Both are advisory: the server
  // re-checks on generate, so a stale/failed fetch never blocks the user.
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setEstimating(true);
    fetchEstimate(duration_s)
      .then(e => { if (alive) setEstimate(e); })
      .catch(() => { if (alive) setEstimate(null); })
      .finally(() => { if (alive) setEstimating(false); });
    return () => { alive = false; };
  }, [duration_s]);

  // Balance only needs fetching once (and after a run, which spends credits).
  useEffect(() => {
    let alive = true;
    fetchBalance()
      .then(b => { if (alive) setBalance(b.balance_credits); })
      .catch(() => { if (alive) setBalance(null); });
    return () => { alive = false; };
  }, [done]);

  // Only block the button when we know both numbers *and* they're short.
  const insufficient =
    estimate !== null && balance !== null && balance < estimate.credits;

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
    pipeline.reset();

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
      const msg = String(err?.message || err || 'Unknown error');
      setError(msg);
      toast(msg, 'error', 6000);
      pipeline.fail();
      setHistory(curr => curr.map(i => i.id === id ? { ...i, status: 'failed' } : i));
      setRunning(false);
    }
  };

  const handleEvent = (ev: SseEvent) => {
    if (ev.event === 'plan') {
      setPlan(ev.data);
      pipeline.apply('plan', ev.data);
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, plan: ev.data } : i));
    } else if (ev.event === 'frame') {
      setFrames(f => [...f, ev.data]);
      pipeline.apply('frame', ev.data);
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, frames: [...(i.frames || []), ev.data] } : i));
    } else if (ev.event === 'script') {
      setScript(ev.data?.script || '');
      pipeline.apply('script', ev.data);
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, script: ev.data?.script } : i));
    } else if (ev.event === 'video') {
      setVideoUrl(ev.data?.url || null);
      pipeline.apply('video', ev.data);
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, videoUrl: ev.data?.url } : i));
    } else if (ev.event === 'done') {
      setDone(true);
      pipeline.apply('done', ev.data);
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, status: 'done' } : i));
      toast('Campaign generated successfully', 'success');
    } else if (ev.event === 'error') {
      setError(ev.data?.message || 'Unknown error');
      toast(ev.data?.message || 'Error', 'error', 6000);
      pipeline.fail();
      setHistory(curr => curr.map(i => i.id === campaignId ? { ...i, status: 'failed' } : i));
    }
  };

  return (
    <>
      <TopBar
        title="New campaign"
        breadcrumb={[{ label: 'Campaigns', href: '/campaigns' }, { label: 'New' }]}
      />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8">Generate a marketing video in 4 steps.</p>

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
                <span className={cn('sm:ml-0 truncate text-center sm:text-left', (passed || current) ? 'text-white' : 'text-zinc-500')}>{s.label}</span>
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
                <h2 className="text-lg sm:text-xl font-semibold">Where should we look?</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">Drop a public URL or a path to your codebase. We'll use it as creative fuel.</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">Step 1 of 4</span>
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
                      <span className="font-medium text-sm">{kind === 'url' ? 'Website URL' : 'Local project'}</span>
                    </div>
                    <p className="text-xs text-zinc-500">{kind === 'url' ? 'Scrape with agent-browser (handles JS, llms.txt, auth)' : 'Read source code & docs from path'}</p>
                  </button>
                );
              })}
            </div>

            <input
              className="input"
              placeholder={source_kind === 'url' ? 'https://example.com' : '/abs/path/to/project'}
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
                  <span>{showAuth ? 'Hide login credentials' : 'Site requires login?'}</span>
                  <Icon name={showAuth ? 'chevronUp' : 'chevronDown'} size={12} />
                </button>
                {showAuth && (
                  <div className="mt-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                    <div className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <Icon name="info" size={12} className="mt-0.5 flex-shrink-0" />
                      <span>Optional. The scraper will sign in before extracting page text. Credentials are sent once per request and never stored.</span>
                    </div>
                    <div>
                      <label className="label flex items-center gap-1.5">
                        <Icon name="user" size={12} />
                        <span>Username</span>
                      </label>
                      <input
                        className="input"
                        type="text"
                        autoComplete="username"
                        placeholder="alice@example.com"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label flex items-center gap-1.5">
                        <Icon name="key" size={12} />
                        <span>Password</span>
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
              <label className="label">Campaign name (optional)</label>
              <input
                className="input"
                placeholder="e.g. Q4 product teaser"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => navigate('/')} className="btn btn-ghost">Cancel</button>
              <button
                onClick={() => setStep(2)}
                disabled={!canAdvance()}
                className="btn btn-primary px-5"
              >Continue →</button>
            </div>
          </>
        )}

        {/* Step 2: Brief */}
        {step === 2 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">What's the brief?</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">We'll infer the rest. Optional but improves results.</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">Step 2 of 4</span>
            </div>

            <div className="mb-5">
              <label className="label">Brief / hook idea</label>
              <textarea
                className="textarea scrollbar-thin"
                rows={4}
                placeholder='e.g. "Show how our CMS lets indie devs launch a blog in 60 seconds."'
                value={brief}
                onChange={e => setBrief(e.target.value)}
              />
            </div>

            <label className="label">Quick templates</label>
            <div className="flex flex-wrap gap-2">
              {['Launch teaser for a SaaS product', 'E-commerce holiday promo', 'Brand story for an indie dev tool', 'Tutorial / how-to explainer'].map(t => (
                <button key={t} onClick={() => setBrief(t)} className="text-xs text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-md transition">
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-6 p-3 sm:p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs sm:text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-zinc-500">Source</span><span className="text-zinc-300 truncate ml-3 max-w-[60%] text-right flex items-center justify-end gap-1.5">
                          <Icon name={(source_kind === 'url' ? 'globe' : 'folder') as IconName} size={14} className="text-zinc-400 flex-shrink-0" />
                          {source_kind === 'url' ? 'URL' : 'Local'}
                        </span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Target</span><span className="text-zinc-300 truncate ml-3 max-w-[60%] text-right">{target || '—'}</span></div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => setStep(1)} className="btn btn-ghost">← Back</button>
              <button onClick={() => setStep(3)} className="btn btn-primary px-5">Continue →</button>
            </div>
          </>
        )}

        {/* Step 3: Style & duration */}
        {step === 3 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Style & duration</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">Pick a vibe and how long the video should run.</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">Step 3 of 4</span>
            </div>

            <div className="mb-6">
              <label className="label flex items-center justify-between">
                <span>Duration</span>
                <span className="text-brand-300 font-semibold">{duration_s}s</span>
              </label>
              <div className="flex items-center gap-3">
                {[15, 30, 45].map(d => (
                  <button key={d} onClick={() => setDuration(d)} className={cn('btn flex-1', duration_s === d ? 'btn-primary' : 'btn-secondary')}>
                    {d}s
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">{nFrames(duration_s)} frames · 1 per 2s</p>
            </div>

            <div>
              <label className="label">Style</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={cn('p-3 sm:p-4 rounded-xl text-left transition-all border-2', style === s.id ? 'bg-brand-500/10 border-brand-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700')}
                  >
                    <div className={cn('w-full h-10 sm:h-12 rounded-lg mb-2 bg-gradient-to-br', s.color)} />
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 p-3 sm:p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2">
              <span className="text-zinc-400">Estimated cost</span>
              {estimating && !estimate ? (
                <span className="text-zinc-500">calculating…</span>
              ) : estimate ? (
                <span className="text-right">
                  <span className="text-emerald-400 font-semibold">~{formatCredits(estimate.credits)} credits</span>
                  <span className="text-zinc-500 ml-1.5">({formatCreditsUsd(estimate.credits)})</span>
                </span>
              ) : (
                <span className="text-zinc-500">unavailable</span>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => setStep(2)} className="btn btn-ghost">← Back</button>
              <button onClick={() => setStep(4)} className="btn btn-primary px-5">Continue →</button>
            </div>
          </>
        )}

        {/* Step 4: Generate */}
        {step === 4 && (
          <>
            <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Ready to generate</h2>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">Review your choices and start the pipeline.</p>
              </div>
              <span className="text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0">Step 4 of 4</span>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60">
              {[
                { k: 'Campaign', v: name || autoName(target) },
                {
                  k: 'Source',
                  v: (
                    <span className="flex items-center gap-1.5 justify-end">
                      <Icon name={(source_kind === 'url' ? 'globe' : 'folder') as IconName} size={14} className="text-zinc-400 flex-shrink-0" />
                      <span className="truncate">{target}</span>
                    </span>
                  ),
                },
                { k: 'Duration', v: duration_s + 's' },
                { k: 'Style',    v: STYLES.find(s => s.id === style)?.label || style },
                { k: 'Brief',    v: brief || '— auto-inferred from source —' },
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
                    isPipelineRunning(pipelineStates) ? 'bg-brand-400 animate-pulse' : 'bg-zinc-600')} />
                  Pipeline
                </h3>
                <span className="text-[10px] sm:text-xs text-zinc-500 whitespace-nowrap" id="live-status">
                  {running ? 'Running…' : 'Idle'}
                </span>
              </div>
              <div className="space-y-3 text-xs sm:text-sm">
                {pipelineRow('plan', 'Plan · hook, tagline, CTA, audience, tone', 'MiniMax-M3 plan generation', pipelineStates.plan)}
                {pipelineRow('frames', 'Frames · 1 per 2s', 'Image generation via wavespeed', pipelineStates.frames)}
                {pipelineRow('script', 'Script · VO + shot list', 'MiniMax-M3 script', pipelineStates.script)}
                {pipelineRow('video', 'Video · MiniMax-H3 assembly', 'Stitch frames + master prompt', pipelineStates.video)}
              </div>
              <div ref={artifactsRef} className="mt-5 pt-5 border-t border-zinc-800">
                {plan && (
                  <div className="space-y-2 mb-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Generated plan</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                      {pillKV('Hook', plan.hook)}
                      {pillKV('Tagline', plan.tagline)}
                      {pillKV('CTA', plan.cta)}
                      {pillKV('Audience', plan.audience)}
                      {pillKV('Tone', plan.tone)}
                    </div>
                  </div>
                )}
                {frames.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Frames · {frames.length}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {frames.map(f => (
                        <div key={f.i} className="aspect-video rounded-lg border border-zinc-800 overflow-hidden relative bg-zinc-900">
                          <img src={f.url ?? undefined} className="w-full h-full object-cover" alt={`Frame ${f.i}`} loading="lazy" />
                          <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 px-1.5 py-0.5 rounded">#{f.i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {script && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Script</h4>
                    <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono scrollbar-thin max-h-48 overflow-auto">{script}</pre>
                  </div>
                )}
                {videoUrl && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">Final video</h4>
                    <video src={videoUrl} controls className="w-full rounded-lg border border-zinc-800 bg-black" />
                  </div>
                )}
                {(done || videoUrl) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => campaignId && navigate(`/campaigns/${campaignId}`)} className="btn btn-primary text-xs sm:text-sm">
                      View campaign
                    </button>
                    <button onClick={() => { setStep(1); setPlan(null); setFrames([]); setScript(''); setVideoUrl(null); setDone(false); }} className="btn btn-secondary text-xs sm:text-sm">Start another</button>
                    <button onClick={() => { navigator.clipboard?.writeText(videoUrl || ''); toast('Video URL copied', 'success'); }} className="btn btn-ghost text-xs sm:text-sm">Copy URL</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8">
              <button onClick={() => setStep(3)} disabled={running} className="btn btn-ghost">← Back</button>

              <div className="flex items-center justify-end gap-3">
                {/* Cost preview sits right next to the Generate button. */}
                <div className="text-right leading-tight">
                  {estimating && !estimate ? (
                    <span className="text-xs text-zinc-500">calculating…</span>
                  ) : estimate ? (
                    <>
                      <div className={cn('text-xs sm:text-sm font-semibold',
                        insufficient ? 'text-rose-400' : 'text-emerald-400')}>
                        ~{formatCredits(estimate.credits)} credits
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {balance !== null
                          ? `balance ${formatCredits(balance)}`
                          : formatCreditsUsd(estimate.credits)}
                      </div>
                    </>
                  ) : null}
                </div>

                <button
                  onClick={startGeneration}
                  disabled={running || insufficient}
                  title={insufficient ? 'Not enough credits — top up or upgrade your plan' : undefined}
                  className="btn btn-primary px-6"
                >
                  {running ? (
                    <>
                      <Icon name="loader" size={14} className="animate-spin" strokeWidth={2} />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Icon name="play" size={14} strokeWidth={2} />
                      Generate video
                    </>
                  )}
                </button>
              </div>
            </div>

            {insufficient && (
              <p className="mt-3 text-xs text-rose-400 text-right">
                Not enough credits for a {duration_s}s video.{' '}
                <button onClick={() => navigate('/pricing')} className="underline hover:text-rose-300">
                  Upgrade your plan
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
};

const pipelineRow = (key: string, label: string, sub: string, state: PipelineNodeState) => {
  const isActive = state === 'generating';
  const isDone = state === 'completed';
  const isWarning = state === 'warning';
  const isError = state === 'error';
  let iconCls = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ';
  let icon: React.ReactNode = '·';
  if (isDone) {
    iconCls += 'bg-emerald-500/20 text-emerald-400';
    icon = <Icon name="check" size={12} strokeWidth={3} />;
  } else if (isActive) {
    iconCls += 'bg-brand-500/20 text-brand-300 border-2 border-brand-500';
    icon = <Icon name="loader" size={12} className="animate-spin" strokeWidth={2} />;
  } else if (isWarning) {
    iconCls += 'bg-yellow-500/20 text-yellow-400';
    icon = <Icon name="alertTriangle" size={12} strokeWidth={2.5} />;
  } else if (isError) {
    iconCls += 'bg-rose-500/20 text-rose-400';
    icon = <Icon name="alertCircle" size={12} strokeWidth={2.5} />;
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
