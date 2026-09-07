// Admin / Logs — full system log viewer (root only).
//
// Features:
//   * Live polling (every 3 s) with a manual refresh button.
//   * Free-text filter (matches message or logger name).
//   * Level filter (DEBUG / INFO / WARNING / ERROR).
//   * "Emit test log" button so you can verify the capture pipeline.
//   * Color-coded by severity, monospace layout, sticky timestamps.

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/store';
import { adminListLogs, adminEmitTestLog, type AdminLog } from '../lib/api';
import { Icon } from '../components/ui';
import { cn } from '../lib/utils';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG:    'text-zinc-500',
  INFO:     'text-zinc-300',
  WARNING:  'text-amber-300',
  WARN:     'text-amber-300',
  ERROR:    'text-rose-300',
  CRITICAL: 'text-rose-400',
};

const LEVEL_BADGE: Record<string, string> = {
  DEBUG:    'bg-zinc-700/40 text-zinc-400',
  INFO:     'bg-sky-500/20 text-sky-300',
  WARNING:  'bg-amber-500/20 text-amber-300',
  WARN:     'bg-amber-500/20 text-amber-300',
  ERROR:    'bg-rose-500/20 text-rose-300',
  CRITICAL: 'bg-rose-500/40 text-rose-200',
};

const AdminLogs: React.FC = () => {
  const { can, logout } = useAuth();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await adminListLogs({ q: filter || undefined, level: level || undefined, limit });
      setLogs(data);
    } catch (e: any) { setError(e.message || 'load failed'); }
  }, [filter, level, limit]);

  useEffect(() => {
    if (!can('data:logs')) return;
    load();
    if (!autoRefresh) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [can, load, autoRefresh]);

  if (!can('data:logs')) {
    return (
      <div className="text-center py-16">
        <Icon name="lock" size={48} className="mx-auto text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Root access required</h2>
        <p className="text-sm text-zinc-500">The system log stream is restricted to root.</p>
      </div>
    );
  }

  const stats = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.level] = (acc[l.level] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Icon name="activity" size={24} className="text-brand-400" />
            System Logs
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Live log stream. The most recent <span className="text-zinc-200">{logs.length}</span> log records are shown below.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-zinc-400 flex items-center gap-1">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            auto-refresh
          </label>
          <button
            onClick={async () => { try { await adminEmitTestLog(); await load(); } catch (e: any) { setError(e.message); } }}
            className="btn btn-secondary text-xs"
            title="Emit a sample log line to verify the capture pipeline"
          >
            <Icon name="zap" size={12} /> Emit test
          </button>
          <button onClick={load} className="btn btn-secondary text-sm">
            <Icon name="settings" size={12} /> Refresh
          </button>
          <button onClick={logout} className="btn btn-secondary text-xs">
            <Icon name="logOut" size={12} /> Logout
          </button>
        </div>
      </div>

      {/* Severity stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {['INFO', 'WARNING', 'ERROR', 'DEBUG'].map(lvl => (
          <div key={lvl} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className={cn('text-[10px] uppercase tracking-wider font-bold', LEVEL_COLORS[lvl])}>{lvl}</span>
              <span className="text-sm font-semibold">{stats[lvl] || 0}</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-300 flex items-center gap-2">
          <Icon name="alertCircle" size={14} /> {error}
        </div>
      )}

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Icon name="search" size={14} className="text-zinc-500" />
          <input
            className="bg-transparent outline-none text-sm flex-1"
            placeholder="Filter by message or logger name…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <select className="bg-zinc-950 border border-zinc-800 rounded text-xs px-2 py-1" value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">All levels</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
        <select className="bg-zinc-950 border border-zinc-800 rounded text-xs px-2 py-1" value={String(limit)} onChange={e => setLimit(Number(e.target.value))}>
          {[100, 200, 500, 1000].map(n => <option key={n} value={n}>{n} records</option>)}
        </select>
        <span className="text-xs text-zinc-500 self-center">{logs.length} shown</span>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto font-mono text-[11px] divide-y divide-zinc-900">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-zinc-500">No log records.</p>
          ) : logs.map((l, i) => (
            <div key={i} className="px-4 py-2 hover:bg-zinc-900/40 flex gap-3">
              <span className="text-zinc-500 flex-shrink-0 w-20">
                {new Date(l.ts * 1000).toLocaleTimeString()}
              </span>
              <span className={cn(
                'flex-shrink-0 w-16 text-center rounded text-[10px] font-bold px-1.5 py-0.5',
                LEVEL_BADGE[l.level] || 'bg-zinc-700 text-zinc-300'
              )}>
                {l.level}
              </span>
              <span className="text-zinc-500 flex-shrink-0">[{l.name}]</span>
              <span className="text-zinc-200 break-all">{l.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminLogs;
