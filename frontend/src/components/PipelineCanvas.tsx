// PipelineCanvas — React Flow view of the 5-step campaign pipeline.
//
// observation point: `ui.pipeline.canvas`
// coordination id: the campaign id (already in the URL) identifies the run the
// canvas is drawing; every node carries `data-testid="pipeline-node-<step>"`.
//
// Dumb and pure on purpose: it takes the `{step: state}` map produced by
// `usePipelineEvents()` and renders it. All state logic lives in
// lib/pipelineStates.ts so the wizard and this canvas can never diverge.

import { useMemo, type FC } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MarkerType,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Icon, type IconName } from './ui';
import { cn } from '../lib/utils';
import {
  PIPELINE_STEPS,
  describePipelineStep,
  isPipelineRunning,
  type PipelineLatest,
  type PipelineNodeState,
  type PipelineStates,
  type PipelineStep,
} from '../lib/pipelineStates';

const STEP_LABEL: Record<PipelineStep, string> = {
  source: 'Source',
  plan: 'Plan',
  frames: 'Frames',
  script: 'Script',
  video: 'Video',
};

const STEP_ICON: Record<PipelineNodeState, IconName> = {
  pending: 'hourglass',
  generating: 'loader',
  completed: 'check',
  warning: 'alertTriangle',
  error: 'alertCircle',
};

/** Existing Tailwind tokens only — no new colours introduced here. */
const STATE_CLASS: Record<PipelineNodeState, string> = {
  pending: 'border-zinc-800 bg-zinc-950/60 text-zinc-500',
  generating: 'border-amber-500/60 bg-amber-500/10 text-amber-300 animate-pulse',
  completed: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300',
  warning: 'border-yellow-500/60 bg-yellow-500/10 text-yellow-300',
  error: 'border-red-500/60 bg-red-500/10 text-red-300',
};

const STATE_LABEL: Record<PipelineNodeState, string> = {
  pending: 'Pending',
  generating: 'Running',
  completed: 'Done',
  warning: 'Warning',
  error: 'Failed',
};

export interface PipelineNodeData extends Record<string, unknown> {
  step: PipelineStep;
  state: PipelineNodeState;
  subtitle: string;
}

type PipelineFlowNode = Node<PipelineNodeData, 'pipelineStep'>;

/** One pipeline step card: name on top, state badge right, subtitle below. */
function PipelineStepNode({ data }: NodeProps<PipelineFlowNode>) {
  const { step, state, subtitle } = data;
  return (
    <div
      data-testid={`pipeline-node-${step}`}
      data-pipeline-state={state}
      className={cn(
        'w-[200px] rounded-xl border px-3 py-2.5 shadow-lg transition-colors',
        STATE_CLASS[state],
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-700 !border-none" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-700 !border-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wider">{STEP_LABEL[step]}</span>
        <span
          data-testid={`pipeline-node-badge-${step}`}
          title={STATE_LABEL[state]}
          className="flex items-center gap-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-medium"
        >
          <Icon
            name={STEP_ICON[state]}
            size={11}
            strokeWidth={2.5}
            className={state === 'generating' ? 'animate-spin' : undefined}
          />
          {STATE_LABEL[state]}
        </span>
      </div>
      <p
        data-testid={`pipeline-node-subtitle-${step}`}
        className="mt-1 truncate text-[11px] text-zinc-400"
      >
        {subtitle}
      </p>
    </div>
  );
}

const NODE_TYPES = { pipelineStep: PipelineStepNode };

export interface PipelineCanvasProps {
  /** `{step: state}` — straight out of `usePipelineEvents()`. */
  states: PipelineStates;
  /** Latest payload per step, used for the node subtitles. */
  latest?: PipelineLatest;
  /** Expected frame count (duration / 2s) for the `n of m frames` subtitle. */
  totalFrames?: number;
  className?: string;
}

const PipelineCanvas: FC<PipelineCanvasProps> = ({ states, latest, totalFrames, className }) => {
  const nodes = useMemo<PipelineFlowNode[]>(
    () =>
      PIPELINE_STEPS.map((step, i) => ({
        id: step,
        type: 'pipelineStep' as const,
        position: { x: i * 240, y: 0 },
        data: {
          step,
          state: states[step],
          subtitle: describePipelineStep(step, latest, totalFrames),
        },
        draggable: false,
        selectable: false,
      })),
    [states, latest, totalFrames],
  );

  const edges = useMemo<Edge[]>(
    () =>
      PIPELINE_STEPS.slice(0, -1).map((step, i) => ({
        id: `${step}-${PIPELINE_STEPS[i + 1]}`,
        source: step,
        target: PIPELINE_STEPS[i + 1],
        animated: states[PIPELINE_STEPS[i + 1]] === 'generating',
        style: { stroke: '#3f3f46', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3f3f46' },
      })),
    [states],
  );

  return (
    <section
      data-testid="pipeline-canvas"
      data-observation-point="ui.pipeline.canvas"
      className={cn(
        'rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:p-4',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            data-testid="pipeline-canvas-live-dot"
            className={cn(
              'w-2 h-2 rounded-full',
              isPipelineRunning(states) ? 'bg-brand-400 animate-pulse' : 'bg-zinc-600',
            )}
          />
          Pipeline
        </h3>
        <span data-testid="pipeline-canvas-live-label" className="text-[10px] text-zinc-500">
          live
        </span>
      </div>
      <div className="h-[220px] sm:h-[240px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          minZoom={0.4}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#27272a" />
        </ReactFlow>
      </div>
    </section>
  );
};

export default PipelineCanvas;
