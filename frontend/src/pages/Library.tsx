import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon, Pill } from '../components/ui';
import TopBar from '../components/TopBar';
import { cn, timeAgo, nFrames } from '../lib/utils';
import { getHistory } from '../lib/api';
import type { Campaign } from '../lib/types';

const TABS = [
  { id: 'all',     label: 'All' },
  { id: 'video',   label: 'Videos' },
  { id: 'frames',  label: 'Frames' },
  { id: 'scripts', label: 'Scripts' },
] as const;

/**
 * Library — the real, server-backed asset list.
 *
 * Previously this page read only from the local `useStore()` history (which
 * is seeded with demo rows and persisted to localStorage). It now fetches
 * `/api/campaigns/history` with the caller's JWT on mount and renders that.
 *
 * The local store stays as the *initial* render source so the page paints
 * instantly on a warm reload; the server response replaces it as soon as it
 * lands (and is written back into the store so Campaigns.tsx and Detail.tsx
 * see the same data). If the request fails we keep whatever we had and show
 * a small inline notice rather than blanking the page.
 */
const Library: React.FC = () => {
  const { history, setHistory } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<typeof TABS[number]['id']>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getHistory();
      if (cancelled) return;
      if (rows) {
        // Merge: server rows win, but keep any locally-known extras (e.g.
        // frame URLs captured live by the wizard) for the same campaign id.
        setHistory(prev => {
          const local = new Map(
            (Array.isArray(prev) ? prev : []).map(c => [c.id, c] as const),
          );
          return rows.map((r: any) => ({ ...(local.get(r.id) || {}), ...r }));
        });
        setFailed(false);
      } else {
        setFailed(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [setHistory]);

  // Defensive: history should always be an array, but localStorage corruption
  // could turn it into a plain object (from a previous broken build). Guard
  // so the page always renders, even if state is malformed.
  const safeHistory: Campaign[] = Array.isArray(history) ? history : [];

  // Unlike the old version we no longer hide non-`done` rows: a campaign
  // that is still generating is exactly what the user wants to watch, and
  // the status badge tells them where it is.
  const items = useMemo(
    () => safeHistory
      .filter(Boolean)
      .slice()
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
    [safeHistory],
  );

  const tabbed = useMemo(() => {
    if (tab === 'video')   return items.filter(i => !!i.videoUrl || i.status === 'done');
    if (tab === 'frames')  return items.filter(i => (i.frames?.length ?? 0) > 0 || i.status === 'done');
    if (tab === 'scripts') return items.filter(i => !!i.script || !!i.plan);
    return items;
  }, [items, tab]);

  const filtered = query
    ? tabbed.filter(i => (i.name || '').toLowerCase().includes(query.toLowerCase()))
    : tabbed;

  const tabCount = (id: typeof TABS[number]['id']): number => {
    if (id === 'all') return items.length;
    if (id === 'frames') {
      return items.reduce((acc, i) => acc + (i.frames?.length || nFrames(i.duration_s || 0)), 0);
    }
    if (id === 'video') return items.filter(i => !!i.videoUrl || i.status === 'done').length;
    return items.filter(i => !!i.script || !!i.plan).length;
  };

  return (
    <>
      <TopBar title="Library" />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6">All your generated assets in one place.</p>

      {failed && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Icon name="alertTriangle" size={14} strokeWidth={2} />
          Couldn’t reach the server — showing the last known list.
        </div>
      )}

      <div className="border-b border-zinc-800 mb-4 sm:mb-6 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin">
        <nav className="flex gap-4 sm:gap-6 text-sm whitespace-nowrap">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('py-3 border-b-2', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white')}>
                {t.label} <span className={cn('ml-1', active ? 'text-brand-400/70' : 'text-zinc-600')}>
                  {tabCount(t.id)}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="relative flex-1 sm:max-w-md">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" strokeWidth={2} />
          <input className="input pl-9" placeholder="Search assets…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/new')} className="btn btn-primary text-xs sm:text-sm">
            <Icon name="plus" size={14} strokeWidth={2.2} />
            <span className="hidden sm:inline">Generate</span>
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden animate-pulse">
              <div className="aspect-video bg-zinc-800/60" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-3/4 rounded bg-zinc-800/80" />
                <div className="h-2 w-1/2 rounded bg-zinc-800/60" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="col-span-full p-8 sm:p-12 text-center text-zinc-500">
          <Icon name="video" size={36} className="text-zinc-500 mb-3" strokeWidth={1.5} />
          <p className="text-sm">No assets yet — generate your first campaign.</p>
          <button onClick={() => navigate('/new')} className="btn btn-primary mt-4 text-sm">Generate</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map(c => (
            <Link
              key={c.id}
              to={`/campaigns/${c.id}`}
              className="frame-card group rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden cursor-pointer transition block"
            >
              <div className={cn('aspect-video bg-gradient-to-br relative', c.color)}>
                {c.frames && c.frames[0] && c.frames[0].url && (
                  <img src={c.frames[0].url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <div className="absolute top-2 left-2">
                  <Pill status={c.status} />
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="text-[10px] bg-black/70 backdrop-blur px-1.5 py-0.5 rounded text-white">{c.duration_s}s</span>
                </div>
                <div className="frame-overlay absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition">
                    <Icon name="play" size={18} strokeWidth={2} className="text-zinc-900 ml-0.5" />
                  </span>
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[10px] sm:text-xs text-zinc-500 mt-1">
                  {timeAgo(c.created_at)} · {c.frames?.length || nFrames(c.duration_s || 0)} frames
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
};

export default Library;
