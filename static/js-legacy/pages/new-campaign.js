// New Campaign wizard + live SSE stream view.
import { h, cn } from '../lib/dom.js';
import { Shell, TopBar } from '../components/layout.js';
import { streamCampaign } from '../lib/api.js';
import { history as histStore } from '../lib/store.js';
import { toast, escapeHtml, timeAgo } from '../lib/ui.js';
import { router } from '../lib/router.js';

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

export const NewCampaign = () => {
  const state = {
    step: 1,
    source_kind: 'url',
    target: '',
    brief: '',
    duration_s: 30,
    style: 'cinematic',
    name: '',
    running: false,
    events: [],          // all events as they come
    plan: null,
    frames: [],          // [{i, t, url}]
    script: '',
    videoUrl: null,
    error: null,
    done: false,
    stepDurations: {},   // step label -> ms
    campaignId: null,
  };


  const reRenderCurrentStep = () => {
    // Preserve focus + caret position across re-render
    const ae = document.activeElement;
    const tag = ae?.tagName;
    const isField = tag === 'INPUT' || tag === 'TEXTAREA';
    const id = isField ? ae.placeholder || ae.name : null;
    const start = isField && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
    const end   = isField && typeof ae.selectionEnd   === 'number' ? ae.selectionEnd   : null;
    if (state.step === 1) renderStep1();
    else if (state.step === 2) renderStep2();
    else if (state.step === 3) renderStep3();
    else if (state.step === 4) renderStep4();
    if (id) {
      // Find the matching input again
      const all = card.querySelectorAll('input, textarea');
      for (const el of all) {
        if ((el.placeholder || el.name) === id) {
          el.focus();
          if (start != null && end != null && typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(start, end); } catch {}
          }
          break;
        }
      }
    }
  };

  // Stepper — compact on mobile (number+label-per-step stacked), horizontal on sm+
  const stepper = h('ol', { class: 'flex items-start w-full mb-6 sm:mb-8 text-xs sm:text-sm font-medium gap-1 sm:gap-0' });
  const stepperRefresh = () => {
    stepper.innerHTML = '';
    STEPS.forEach((s, i) => {
      const passed = state.step > s.n;
      const current = state.step === s.n;
      const li = h('li', { class: cn('flex items-center min-w-0', i < STEPS.length - 1 && 'flex-1') }, [
        h('div', { class: 'flex flex-col sm:flex-row items-center gap-1 sm:gap-2 min-w-0' }, [
          h('span', { class: cn(
            'flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 text-xs sm:text-sm font-medium transition-colors flex-shrink-0',
            passed ? 'bg-brand-500 border-brand-500 text-white' :
            current ? 'bg-brand-500/10 border-brand-500 text-brand-300' :
                      'border-zinc-700 text-zinc-500 bg-zinc-900/40'
          ) }, [
            passed
              ? h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'sm:w-3.5 sm:h-3.5', html: '<path d="M5 13l4 4L19 7"/>' })
              : String(s.n)
          ]),
          h('span', { class: cn('sm:ml-0 truncate text-center sm:text-left', (passed || current) ? 'text-white' : 'text-zinc-500') }, s.label)
        ]),
        i < STEPS.length - 1 && h('div', { class: cn('hidden sm:block flex-1 h-px mx-4 transition-colors', passed ? 'bg-brand-500' : 'bg-zinc-800') })
      ]);
      stepper.appendChild(li);
    });
  };

  const card = h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl sm:rounded-2xl p-3 sm:p-8 min-h-[420px] page-enter' });

  // ---- STEP 1: Source -----------------------------------------------------
  const renderStep1 = () => {
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'flex items-start justify-between gap-2 mb-4 sm:mb-6' }, [
      h('div', {}, [
        h('h2', { class: 'text-lg sm:text-xl font-semibold' }, 'Where should we look?'),
        h('p', { class: 'text-zinc-400 text-xs sm:text-sm mt-1' }, "Drop a public URL or a path to your codebase. We'll use it as creative fuel.")
      ]),
      h('span', { class: 'text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0' }, 'Step 1 of 4')
    ]));

    const sourceToggle = h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5' });
    ['url', 'files'].forEach(kind => {
      const active = state.source_kind === kind;
      const btn = h('button', { class: cn(
        'p-4 rounded-xl text-left transition-all border-2',
        active ? 'bg-brand-500/10 border-brand-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      ), onClick: () => { state.source_kind = kind; renderStep1(); } }, [
        h('div', { class: 'flex items-center gap-2 mb-1' }, [
          h('span', { class: 'text-lg' }, kind === 'url' ? '🌐' : '📁'),
          h('span', { class: 'font-medium text-sm' }, kind === 'url' ? 'Website URL' : 'Local project')
        ]),
        h('p', { class: 'text-xs text-zinc-500' }, kind === 'url' ? 'Scrape with Lightpanda (fast headless)' : 'Read source code & docs from path')
      ]);
      sourceToggle.appendChild(btn);
    });
    card.appendChild(sourceToggle);

    const input = h('input', {
      class: 'input',
      placeholder: state.source_kind === 'url' ? 'https://example.com' : '/abs/path/to/project',
      value: state.target,
      onInput: (e) => { state.target = e.target.value; reRenderCurrentStep(); }
    });
    card.appendChild(input);

    // Examples chips
    const examples = h('div', { class: 'mt-3 flex flex-wrap gap-2' });
    ['https://acme-cms.io', 'https://menustudioai.com', 'https://stripe.com'].forEach(ex => {
      examples.appendChild(h('button', {
        class: 'text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-md transition',
        onClick: () => { state.target = ex; state.source_kind = 'url'; renderStep1(); }
      }, ex));
    });
    card.appendChild(examples);

    // Campaign name (optional)
    card.appendChild(h('div', { class: 'mt-6' }, [
      h('label', { class: 'label' }, 'Campaign name (optional)'),
      h('input', {
        class: 'input',
        placeholder: 'e.g. Q4 product teaser',
        value: state.name,
        onInput: (e) => { state.name = e.target.value; reRenderCurrentStep(); }
      })
    ]));

    card.appendChild(h('div', { class: 'flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8' }, [
      h('button', { class: 'btn btn-ghost', onClick: () => router.navigate('/') }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary px-5',
        disabled: !state.target.trim(),
        onClick: () => { state.step = 2; stepperRefresh(); renderStep2(); }
      }, ['Continue →'])
    ]));
  };

  // ---- STEP 2: Brief ------------------------------------------------------
  const renderStep2 = () => {
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'flex items-start justify-between gap-2 mb-4 sm:mb-6' }, [
      h('div', {}, [
        h('h2', { class: 'text-lg sm:text-xl font-semibold' }, "What's the brief?"),
        h('p', { class: 'text-zinc-400 text-xs sm:text-sm mt-1' }, "We'll infer the rest. Optional but improves results.")
      ]),
      h('span', { class: 'text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0' }, 'Step 2 of 4')
    ]));

    card.appendChild(h('div', { class: 'mb-5' }, [
      h('label', { class: 'label' }, 'Brief / hook idea'),
      h('textarea', {
        class: 'textarea scrollbar-thin',
        rows: 4,
        placeholder: 'e.g. "Show how our CMS lets indie devs launch a blog in 60 seconds."',
        value: state.brief,
        onInput: (e) => { state.brief = e.target.value; reRenderCurrentStep(); }
      })
    ]));

    // Quick templates
    const tpls = [
      'Launch teaser for a SaaS product',
      'E-commerce holiday promo',
      'Brand story for an indie dev tool',
      'Tutorial / how-to explainer'
    ];
    const tplWrap = h('div', { class: 'flex flex-wrap gap-2' });
    tpls.forEach(t => tplWrap.appendChild(h('button', {
      class: 'text-xs text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-md transition',
      onClick: () => { state.brief = t; renderStep2(); }
    }, t)));
    card.appendChild(h('div', {}, [
      h('label', { class: 'label' }, 'Quick templates'),
      tplWrap
    ]));

    // Summary of choices
    const summary = h('div', { class: 'mt-6 p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs sm:text-sm space-y-1.5' }, [
      h('div', { class: 'flex justify-between' }, [h('span', { class: 'text-zinc-500' }, 'Source'), h('span', { class: 'text-zinc-300' }, state.source_kind === 'url' ? '🌐 URL' : '📁 Local')]),
      h('div', { class: 'flex justify-between' }, [h('span', { class: 'text-zinc-500' }, 'Target'), h('span', { class: 'text-zinc-300 truncate ml-3 max-w-[60%]' }, state.target || '—')]),
    ]);
    card.appendChild(summary);

    card.appendChild(h('div', { class: 'flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8' }, [
      h('button', { class: 'btn btn-ghost', onClick: () => { state.step = 1; stepperRefresh(); renderStep1(); } }, '← Back'),
      h('button', { class: 'btn btn-primary px-5', onClick: () => { state.step = 3; stepperRefresh(); renderStep3(); } }, 'Continue →')
    ]));
  };

  // ---- STEP 3: Style & duration ------------------------------------------
  const renderStep3 = () => {
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'flex items-start justify-between gap-2 mb-4 sm:mb-6' }, [
      h('div', {}, [
        h('h2', { class: 'text-lg sm:text-xl font-semibold' }, 'Style & duration'),
        h('p', { class: 'text-zinc-400 text-xs sm:text-sm mt-1' }, 'Pick a vibe and how long the video should run.')
      ]),
      h('span', { class: 'text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0' }, 'Step 3 of 4')
    ]));

    // Duration
    const durWrap = h('div', { class: 'mb-6' });
    durWrap.appendChild(h('label', { class: 'label flex items-center justify-between' }, [
      h('span', {}, 'Duration'),
      h('span', { class: 'text-brand-300 font-semibold' }, state.duration_s + 's')
    ]));
    const durRow = h('div', { class: 'flex items-center gap-3' });
    [15, 30, 45].forEach(d => {
      durRow.appendChild(h('button', {
        class: cn('btn flex-1', state.duration_s === d ? 'btn-primary' : 'btn-secondary'),
        onClick: () => { state.duration_s = d; renderStep3(); }
      }, d + 's'));
    });
    durWrap.appendChild(durRow);
    durWrap.appendChild(h('p', { class: 'text-xs text-zinc-500 mt-2' }, `${Math.max(2, Math.ceil(state.duration_s / 2))} frames · 1 per 2s`));
    card.appendChild(durWrap);

    // Style
    const styleWrap = h('div', {});
    styleWrap.appendChild(h('label', { class: 'label' }, 'Style'));
    const styleGrid = h('div', { class: 'grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3' });
    STYLES.forEach(s => {
      styleGrid.appendChild(h('button', {
        class: cn('p-4 rounded-xl text-left transition-all border-2',
          state.style === s.id ? 'bg-brand-500/10 border-brand-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
        ),
        onClick: () => { state.style = s.id; renderStep3(); }
      }, [
        h('div', { class: cn('w-full h-10 sm:h-12 rounded-lg mb-2 bg-gradient-to-br', s.color) }),
        h('div', { class: 'font-medium text-sm' }, s.label),
        h('div', { class: 'text-xs text-zinc-500 mt-0.5' }, s.desc)
      ]));
    });
    styleWrap.appendChild(styleGrid);
    card.appendChild(styleWrap);

    // Final summary
    card.appendChild(h('div', { class: 'mt-6 p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-sm flex items-center justify-between' }, [
      h('span', { class: 'text-zinc-400' }, 'Estimated cost'),
      h('span', { class: 'text-emerald-400 font-semibold' }, '~$0.42')
    ]));

    card.appendChild(h('div', { class: 'flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8' }, [
      h('button', { class: 'btn btn-ghost', onClick: () => { state.step = 2; stepperRefresh(); renderStep2(); } }, '← Back'),
      h('button', { class: 'btn btn-primary px-5', onClick: () => { state.step = 4; stepperRefresh(); renderStep4(); } }, 'Continue →')
    ]));
  };

  // ---- STEP 4: Generate ---------------------------------------------------
  let abort = null;
  const renderStep4 = () => {
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'flex items-start justify-between gap-2 mb-4 sm:mb-6' }, [
      h('div', {}, [
        h('h2', { class: 'text-lg sm:text-xl font-semibold' }, 'Ready to generate'),
        h('p', { class: 'text-zinc-400 text-xs sm:text-sm mt-1' }, 'Review your choices and start the pipeline.')
      ]),
      h('span', { class: 'text-[10px] sm:text-xs text-zinc-500 bg-zinc-800/60 px-2 py-1 rounded whitespace-nowrap flex-shrink-0' }, 'Step 4 of 4')
    ]));

    // Summary list
    const rows = [
      ['Campaign',  state.name || autoName(state.target)],
      ['Source',    state.source_kind === 'url' ? '🌐 ' + state.target : '📁 ' + state.target],
      ['Duration',  state.duration_s + 's'],
      ['Style',     STYLES.find(s => s.id === state.style)?.label || state.style],
      ['Brief',     state.brief || '— auto-inferred from source —']
    ];
    const list = h('div', { class: 'bg-zinc-950/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60' });
    rows.forEach(([k, v]) => list.appendChild(h('div', { class: 'flex items-center justify-between p-4 text-sm' }, [
      h('span', { class: 'text-zinc-500' }, k),
      h('span', { class: 'text-zinc-200 truncate ml-3 max-w-[60%] text-right text-right' }, v)
    ])));
    card.appendChild(list);

    // Live pipeline card
    const live = h('div', { class: 'mt-6 bg-zinc-950/60 border border-zinc-800 rounded-xl p-5' }, [
      h('div', { class: 'flex items-center justify-between mb-4' }, [
        h('h3', { class: 'font-semibold flex items-center gap-2' }, [
          h('span', { class: 'w-2 h-2 rounded-full bg-brand-400' }),
          'Pipeline'
        ]),
        h('span', { class: 'text-[10px] sm:text-xs text-zinc-500 whitespace-nowrap', id: 'live-status' }, 'Idle')
      ]),
      h('div', { class: 'space-y-3', id: 'pipeline-list' }, [
        pipelineRow('plan',   'Plan · hook, tagline, CTA, audience, tone', 'Plan from MiniMax-M3'),
        pipelineRow('frame',  'Frames · 1 per 2s',                        'Image generation via wavespeed'),
        pipelineRow('script', 'Script · VO + shot list',                  'MiniMax-M3'),
        pipelineRow('video',  'Video · MiniMax-H3 assembly',              'Stitch frames + master prompt'),
      ]),
      h('div', { class: 'mt-5 pt-5 border-t border-zinc-800', id: 'live-artifacts' })
    ]);
    card.appendChild(live);

    card.appendChild(h('div', { class: 'flex flex-col-reverse sm:flex-row justify-between gap-2 mt-6 sm:mt-8' }, [
      h('button', {
        class: 'btn btn-ghost',
        disabled: state.running,
        onClick: () => { state.step = 3; stepperRefresh(); renderStep3(); }
      }, '← Back'),
      h('button', {
        class: 'btn btn-primary px-6',
        disabled: state.running,
        onClick: start
      }, state.running ? [
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', class: 'animate-spin', html: '<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9" stroke-linecap="round" stroke-linejoin="round"/>' }),
        'Generating…'
      ] : [
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' }),
        'Generate video'
      ])
    ]));
  };

  const pipelineRow = (key, label, sub) => {
    const icon = h('div', { class: 'w-6 h-6 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-xs font-bold', id: `pip-${key}-icon` }, '·');
    const sub2 = h('div', { class: 'text-xs text-zinc-500', id: `pip-${key}-sub` }, sub);
    const bar  = h('div', { class: 'h-1 w-24 bg-zinc-800 rounded-full overflow-hidden hidden', id: `pip-${key}-bar` }, [
      h('div', { class: 'h-full bg-brand-500 transition-all', style: { width: '0%' } })
    ]);
    const time = h('span', { class: 'text-xs text-zinc-600', id: `pip-${key}-time` }, '—');
    const row = h('div', { class: 'flex items-center gap-3', id: `pip-${key}-row` }, [
      icon,
      h('div', { class: 'flex-1 min-w-0' }, [
        h('div', { class: 'text-sm text-zinc-300' }, label),
        sub2
      ]),
      bar,
      time
    ]);
    row.dataset.key = key;
    return row;
  };

  const setPipelineState = (key, status, label) => {
    const icon = document.getElementById(`pip-${key}-icon`);
    const sub  = document.getElementById(`pip-${key}-sub`);
    const bar  = document.getElementById(`pip-${key}-bar`);
    const time = document.getElementById(`pip-${key}-time`);
    if (!icon) return;
    icon.className = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold';
    if (status === 'active') {
      icon.classList.add('bg-brand-500/20', 'text-brand-300', 'border-2', 'border-brand-500');
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      sub.classList.add('text-brand-300');
      sub.textContent = label || 'Working…';
      bar.classList.remove('hidden');
    } else if (status === 'done') {
      icon.classList.add('bg-emerald-500/20', 'text-emerald-400');
      icon.textContent = '✓';
      sub.classList.remove('text-brand-300');
      sub.classList.add('text-zinc-500');
      sub.textContent = label || sub.textContent;
      bar.classList.add('hidden');
    } else if (status === 'error') {
      icon.classList.add('bg-rose-500/20', 'text-rose-400');
      icon.textContent = '!';
      sub.classList.add('text-rose-400');
      sub.textContent = label || 'Failed';
      bar.classList.add('hidden');
    } else {
      icon.classList.add('bg-zinc-800', 'text-zinc-500');
      icon.textContent = '·';
    }
  };

  const start = async () => {
    state.running = true;
    state.events = [];
    state.frames = [];
    state.plan = null;
    state.script = '';
    state.videoUrl = null;
    state.error = null;
    state.done = false;
    state.campaignId = 'c-' + Math.random().toString(36).slice(2, 8);
    renderStep4(); // re-render to show "Generating…" state

    // Create a draft history entry immediately (status: generating)
    const draft = {
      id: state.campaignId,
      name: state.name || autoName(state.target),
      duration_s: state.duration_s,
      status: 'generating',
      created_at: Date.now(),
      color: 'from-brand-500 to-fuchsia-500',
      source: state.target,
      style: state.style,
      plan: null,
    };
    histStore.set({ items: [draft, ...histStore.get().items.filter(i => i.id !== draft.id)] });

    const setStatus = (txt) => {
      const el = document.getElementById('live-status');
      if (el) el.textContent = txt;
    };

    try {
      let startedPlan = 0;
      const t0 = performance.now();

      const stream = streamCampaign({
        source_kind: state.source_kind,
        target: state.target,
        duration_s: state.duration_s,
        style: state.style,
      });

      for await (const ev of stream) {
        state.events.push(ev);
        if (ev.event === 'plan') {
          state.plan = ev.data;
          setPipelineState('plan', 'done', `Hook: "${ev.data.hook}"`);
          setPipelineState('frame', 'active', `Rendering frames…`);
          startedPlan = performance.now();
          setStatus('Plan ready · generating frames');
          renderArtifacts();
        } else if (ev.event === 'frame') {
          state.frames.push(ev.data);
          setPipelineState('frame', 'active', `Frame ${state.frames.length} / ${Math.max(2, Math.ceil(state.duration_s/2))}`);
          // Mark done if we've reached expected count or first frame arrives and plan is also showing
          renderArtifacts();
          setStatus(`Frame ${state.frames.length}/${Math.max(2, Math.ceil(state.duration_s/2))}`);
        } else if (ev.event === 'script') {
          state.script = ev.data.script || '';
          setPipelineState('frame', 'done');
          setPipelineState('script', 'done', 'Script ready');
          setPipelineState('video', 'active', 'Assembling video with MiniMax-H3');
          setStatus('Assembling video…');
          renderArtifacts();
        } else if (ev.event === 'video') {
          state.videoUrl = ev.data.url;
          setPipelineState('video', 'done');
          setStatus('Video ready!');
          renderArtifacts();
        } else if (ev.event === 'done') {
          state.done = true;
          setStatus('Done in ' + Math.round((performance.now()-t0)/1000) + 's');
          // Update history
          const items = histStore.get().items.map(i => i.id === state.campaignId ? {
            ...i, status: 'done', plan: state.plan, script: state.script, videoUrl: state.videoUrl, frames: state.frames
          } : i);
          histStore.set({ items });
          toast('Campaign generated successfully', 'success');
          renderArtifacts();
        } else if (ev.event === 'error') {
          state.error = ev.data?.message || 'Unknown error';
          setStatus('Failed');
          ['plan','frame','script','video'].forEach(k => setPipelineState(k, 'error', 'Failed'));
          const items = histStore.get().items.map(i => i.id === state.campaignId ? { ...i, status: 'failed' } : i);
          histStore.set({ items });
          toast(state.error, 'error', 6000);
          renderArtifacts();
        }
      }
    } catch (err) {
      state.error = String(err.message || err);
      setStatus('Error');
      ['plan','frame','script','video'].forEach(k => setPipelineState(k, 'error', 'Failed'));
      const items = histStore.get().items.map(i => i.id === state.campaignId ? { ...i, status: 'failed' } : i);
      histStore.set({ items });
      toast(state.error, 'error', 6000);
      renderArtifacts();
    } finally {
      state.running = false;
      renderStep4();
    }
  };

  const renderArtifacts = () => {
    const root = document.getElementById('live-artifacts');
    if (!root) return;
    root.innerHTML = '';

    // Plan card
    if (state.plan) {
      root.appendChild(h('div', { class: 'space-y-2' }, [
        h('h4', { class: 'text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2' }, 'Generated plan'),
        h('div', { class: 'grid grid-cols-2 gap-2 text-sm' }, [
          pillKV('Hook', state.plan.hook),
          pillKV('Tagline', state.plan.tagline),
          pillKV('CTA', state.plan.cta),
          pillKV('Audience', state.plan.audience),
          pillKV('Tone', state.plan.tone),
        ])
      ]));
    }

    // Frames grid
    if (state.frames.length) {
      root.appendChild(h('div', { class: 'mt-4' }, [
        h('h4', { class: 'text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2' }, `Frames · ${state.frames.length}`),
        h('div', { class: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2' },
          state.frames.map(f => h('div', { class: 'aspect-video rounded-lg border border-zinc-800 overflow-hidden relative group bg-zinc-900' }, [
            h('img', { src: f.url, alt: `Frame ${f.i}`, class: 'w-full h-full object-cover', loading: 'lazy' }),
            h('span', { class: 'absolute bottom-1 left-1 text-[10px] bg-black/70 px-1.5 py-0.5 rounded' }, formatT(f.t, f.i))
          ]))
        )
      ]));
    }

    // Script
    if (state.script) {
      root.appendChild(h('div', { class: 'mt-4' }, [
        h('h4', { class: 'text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2' }, 'Script'),
        h('pre', { class: 'bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono scrollbar-thin max-h-48 overflow-auto' }, state.script)
      ]));
    }

    // Video
    if (state.videoUrl) {
      root.appendChild(h('div', { class: 'mt-4' }, [
        h('h4', { class: 'text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2' }, 'Final video'),
        h('video', { src: state.videoUrl, controls: true, class: 'w-full rounded-lg border border-zinc-800 bg-black' })
      ]));
    }

    // Actions when done
    if (state.done || state.videoUrl) {
      root.appendChild(h('div', { class: 'mt-4 flex gap-2' }, [
        h('button', { class: 'btn btn-primary', onClick: () => router.navigate('/campaigns/' + state.campaignId) }, [
          h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M5 13l4 4L19 7"/>' }),
          'View campaign'
        ]),
        h('button', { class: 'btn btn-secondary', onClick: () => { state.step = 1; stepperRefresh(); renderStep1(); } }, 'Start another'),
        h('button', { class: 'btn btn-ghost', onClick: () => {
          navigator.clipboard?.writeText(state.videoUrl || '');
          toast('Video URL copied', 'success');
        } }, 'Copy URL')
      ]));
    }
  };

  const pillKV = (k, v) => h('div', { class: 'bg-zinc-900 border border-zinc-800 rounded-lg p-2.5' }, [
    h('p', { class: 'text-[10px] text-zinc-500 uppercase tracking-wider' }, k),
    h('p', { class: 'text-sm font-medium text-zinc-200 mt-0.5' }, v || '—')
  ]);

  const formatT = (t, i) => {
    if (typeof t === 'number') {
      const m = Math.floor(t/60), s = t % 60;
      return `${m}:${String(s).padStart(2,'0')}`;
    }
    return `#${i+1}`;
  };

  // Mount the active step
  stepperRefresh();
  const root = h('div', {}, [
    TopBar({
      title: 'New campaign',
      breadcrumb: [{ label: 'Campaigns', href: '#/campaigns' }, { label: 'New' }],
      actions: [
        h('button', { class: 'btn btn-secondary', onClick: () => router.navigate('/campaigns') }, 'View all'),
      ]
    }),
    h('p', { class: 'text-sm text-zinc-400 -mt-6 mb-8' }, 'Generate a marketing video in 4 steps.'),
    stepper,
    card
  ]);

  // Initial render
  renderStep1();

  return Shell({ user: { name: 'Jaime', email: 'jaime@menustudioai.com', avatar: 'from-amber-400 to-pink-500', plan: 'free', usage: 2, limit: 5 }, page: root, currentPath: '/new' });
};

const autoName = (target) => {
  try {
    if (!target) return 'Untitled campaign';
    if (target.startsWith('http')) {
      const u = new URL(target);
      return u.hostname.replace('www.','') + ' campaign';
    }
    return target.split('/').filter(Boolean).slice(-1)[0] || 'Untitled';
  } catch { return 'Untitled campaign'; }
};
