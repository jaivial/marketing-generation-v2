// Pipeline state machine + the single React hook that both the wizard
// (NewCampaign) and the detail canvas (PipelineCanvas) consume, so the two
// UIs can never disagree about where a run is.
//
// Coordination contract with the backend (POST /api/campaigns/start and
// GET /api/campaigns/{id}/events):
//   observation point ...... `ui.pipeline.state-machine`
//   correlation id ......... `X-Mf-Coordination-Id`, minted by the subscriber
//   events ................. screenshot | plan | frame | script | video
//                            | warning | budget | done | error
//
// Everything above the "React binding" rule is pure: no React, no I/O, no
// side effects, no mutation — reusable from anywhere in the app.

/** Ordered pipeline steps, matching the backend's execution order. */
export const PIPELINE_STEPS = ['source', 'plan', 'frames', 'script', 'video'] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** States a single step can be in. */
export type PipelineNodeState = 'pending' | 'generating' | 'completed' | 'warning' | 'error';
export type PipelineStates = Record<PipelineStep, PipelineNodeState>;

/** Any event the SSE stream can emit. Unknown ones are inert. */
export type PipelineEventName = string;

/** Payload of an SSE event, as emitted by the pipeline. */
export interface PipelineEventData {
  step?: string;
  message?: string;
  total?: number;
  index?: number;
  count?: number;
  i?: number;
  url?: string;
  script?: string;
  hook?: string;
  tagline?: string;
  [key: string]: any;
}

/** Event name -> the step it belongs to. */
export const EVENT_STEP: Record<string, PipelineStep> = {
  screenshot: 'source',
  plan: 'plan',
  frame: 'frames',
  script: 'script',
  video: 'video',
};

/** Fresh pipeline: nothing has happened yet (`first` seeds the head step). */
export function initialPipelineStates(first: PipelineNodeState = 'pending'): PipelineStates {
  return PIPELINE_STEPS.reduce(
    (acc, step, i) => ({ ...acc, [step]: i === 0 ? first : 'pending' }),
    {} as PipelineStates,
  );
}

/** (currentState, eventName) -> nextState for a single node. */
export function nextPipelineState(current: PipelineNodeState, event: PipelineEventName): PipelineNodeState {
  if (event === 'error') return 'error';
  if (current === 'error') return 'error';
  if (event === 'warning') return current === 'completed' ? current : 'warning';
  if (event === 'done') return 'completed';
  return current === 'completed' ? 'completed' : 'generating';
}

/** True while any step is still being produced. */
export function isPipelineRunning(states: PipelineStates): boolean {
  return PIPELINE_STEPS.some(s => states[s] === 'generating');
}

/** Transport-level failure: nothing survived. */
export function failPipeline(states: PipelineStates): PipelineStates {
  return PIPELINE_STEPS.reduce((acc, s) => ({ ...acc, [s]: 'error' }), { ...states });
}

/** Steps upstream of `step` that never reported in are implicitly done. */
function withUpstreamDone(states: PipelineStates, step: PipelineStep): PipelineStates {
  const idx = PIPELINE_STEPS.indexOf(step);
  return PIPELINE_STEPS.reduce(
    (acc, s, i) => (i < idx && acc[s] !== 'completed' ? { ...acc, [s]: 'completed' } : acc),
    states,
  );
}

/** Last step whose state differs from `notState`, walking the pipeline back. */
function lastStepNotIn(states: PipelineStates, notState: PipelineNodeState): PipelineStep | undefined {
  return [...PIPELINE_STEPS].reverse().find(s => states[s] !== notState);
}

/** Which step an `error`/`warning` event is about. */
function stepForIssue(data: PipelineEventData | undefined, states: PipelineStates): PipelineStep {
  const named = data?.step && EVENT_STEP[data.step];
  if (named) return named;
  // The step being produced, else the last one that already moved.
  return lastStepNotIn(states, 'pending') ?? PIPELINE_STEPS[PIPELINE_STEPS.length - 1];
}

/** Pure reducer: fold one SSE event into the states. Never mutates `states`. */
export function applyPipelineEvent(
  states: PipelineStates,
  event: PipelineEventName,
  data?: PipelineEventData,
): PipelineStates {
  if (event === 'done') return withUpstreamDone({ ...states, video: 'completed' }, 'video');
  if (event === 'error') return { ...states, [stepForIssue(data, states)]: 'error' };
  if (event === 'warning') {
    const step = stepForIssue(data, states);
    return { ...states, [step]: nextPipelineState(states[step], event) };
  }
  const step = EVENT_STEP[event];
  if (!step) return states; // `budget` and friends don't move the pipeline
  const next = withUpstreamDone({ ...states, [step]: nextPipelineState(states[step], event) }, step);
  // A step's own payload means that step finished producing (frames stream).
  return event === 'frame' ? next : { ...next, [step]: 'completed' };
}

/** Latest payload seen per step — what the node subtitles are built from. */
export type PipelineLatest = Partial<Record<PipelineStep, PipelineEventData>>;

/** Human subtitle for a node, e.g. frames -> `3 of 9 frames`. */
export function describePipelineStep(
  step: PipelineStep,
  latest: PipelineLatest = {},
  totalFrames?: number,
): string {
  const d = latest[step] || {};
  switch (step) {
    case 'source':
      return d.url || d.count ? `${d.count ?? 1} source capture${(d.count ?? 1) > 1 ? 's' : ''}` : 'fetching source';
    case 'plan':
      return d.hook || d.tagline || 'planning hook & CTA';
    case 'frames': {
      const done = d.index != null ? d.index + 1 : (d.count ?? (d.i != null ? d.i + 1 : 0));
      const total = totalFrames ?? d.total;
      return total ? `${done} of ${total} frames` : `${done} frames`;
    }
    case 'script':
      return d.script ? `${String(d.script).trim().split(/\s+/).length} words` : 'writing voice-over';
    case 'video':
      return d.url ? 'render ready' : 'assembling frames';
  }
}

// ─── React binding ───────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';

export interface PipelineEventLog {
  /** Current {step: state} map — pass it straight to <PipelineCanvas />. */
  states: PipelineStates;
  /** Fold one SSE event in. Stable identity, safe in effect deps. */
  apply: (event: PipelineEventName, data?: PipelineEventData) => void;
  /** Back to the initial map, for a run that starts over. */
  reset: (initial?: PipelineStates) => void;
  /** Mark every step failed (the stream itself died). */
  fail: () => void;
  /** Latest payload per step, for the node subtitles. */
  latest: PipelineLatest;
}

export function usePipelineEvents(initial?: PipelineStates): PipelineEventLog {
  // observation point: `ui.pipeline.hook`
  const seed = useMemo(() => initial ?? initialPipelineStates(), [initial]);
  const [states, setStates] = useState<PipelineStates>(seed);
  const [latest, setLatest] = useState<PipelineLatest>({});

  const apply = useCallback((event: PipelineEventName, data?: PipelineEventData) => {
    setStates(prev => applyPipelineEvent(prev, event, data));
    const step = EVENT_STEP[event];
    if (step) setLatest(prev => ({ ...prev, [step]: data ?? {} }));
  }, []);

  const reset = useCallback((next?: PipelineStates) => {
    setStates(next ?? seed);
    setLatest({});
  }, [seed]);

  const fail = useCallback(() => setStates(failPipeline), []);

  return { states, apply, reset, fail, latest };
}
