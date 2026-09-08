import React, { useMemo } from 'react';
import { useStore } from '../lib/store';
import TopBar from '../components/TopBar';

const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const Analytics: React.FC = () => {
  const { history } = useStore();
  const items = history;
  const done = items.filter(i => i.status === 'done');
  const totalFrames = done.reduce((acc, i) => acc + Math.max(2, Math.ceil(i.duration_s/2)), 0);
  const totalDuration = done.reduce((acc, i) => acc + i.duration_s, 0);
  const successRate = items.length ? Math.round((done.length / items.length) * 100) : 0;

  // Deterministic bars (seeded by index) so they don't dance on re-render.
  const bars = useMemo(() => Array.from({length: 12}, (_, i) => ({ h: 20 + ((i * 37) % 70), label: MONTHS[i] })), []);

  const stylesCount: Record<string, number> = {};
  done.forEach(i => { const k = i.style || 'cinematic'; stylesCount[k] = (stylesCount[k] || 0) + 1; });
  const topStyles = Object.entries(stylesCount).sort((a, b) => b[1] - a[1]);

  const kpis = [
    { label: 'Campaigns completed', value: done.length, delta: '+12%' },
    { label: 'Frames generated',     value: totalFrames,  delta: '+24%' },
    { label: 'Total video (s)',      value: totalDuration, delta: '+8%' },
    { label: 'Success rate',         value: successRate + '%', delta: '+3%' },
  ];

  return (
    <>
      <TopBar title="Analytics" />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6">Performance and usage at a glance.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {kpis.map(k => (
          <div key={k.label} className="glow-card rounded-xl p-4 sm:p-5">
            <p className="text-xl sm:text-2xl font-semibold font-display">{k.value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{k.label}</p>
            <p className="text-[10px] sm:text-xs text-emerald-400 mt-1.5 sm:mt-2">{k.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h3 className="font-semibold text-sm sm:text-base">Frames generated (last 12 months)</h3>
            <div className="flex gap-2 text-xs">
              <button className="btn btn-secondary text-xs py-1">Monthly</button>
              <button className="btn btn-ghost text-xs py-1">Weekly</button>
            </div>
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2 h-32 sm:h-40">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 min-w-0">
                <div className="w-full rounded-t gradient-bg transition-all hover:opacity-80 min-h-[4px]" style={{ height: `${b.h}%` }} />
                <span className="text-[9px] sm:text-[10px] text-zinc-500">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-sm sm:text-base mb-3 sm:mb-4">Top styles</h3>
          {topStyles.length === 0 ? (
            <p className="text-sm text-zinc-500">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {topStyles.map(([style, count]) => {
                const max = topStyles[0][1];
                const pct = Math.round((count/max) * 100);
                return (
                  <div key={style}>
                    <div className="flex justify-between text-xs sm:text-sm mb-1">
                      <span className="capitalize text-zinc-300 truncate">{style}</span>
                      <span className="text-zinc-500 flex-shrink-0 ml-2">{count} campaigns</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full gradient-bg" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Analytics;
