import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon } from '../components/ui';
import TopBar from '../components/TopBar';
import { cn, timeAgo } from '../lib/utils';

const TABS = [
  { id: 'all',     label: 'All' },
  { id: 'video',   label: 'Videos' },
  { id: 'frames',  label: 'Frames' },
  { id: 'scripts', label: 'Scripts' },
] as const;

const Library: React.FC = () => {
  const { history } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<typeof TABS[number]['id']>('all');
  const [query, setQuery] = useState('');

  // Defensive: history should always be an array, but localStorage corruption
  // could turn it into a plain object (from a previous broken build). Guard
  // so the page always renders, even if state is malformed.
  const safeHistory = Array.isArray(history) ? history : [];
  const items = safeHistory.filter(i => i && i.status === 'done').sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const filtered = query ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase())) : items;

  return (
    <>
      <TopBar title="Library" />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6">All your generated assets in one place.</p>

      <div className="border-b border-zinc-800 mb-4 sm:mb-6 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin">
        <nav className="flex gap-4 sm:gap-6 text-sm whitespace-nowrap">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('py-3 border-b-2', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white')}>
                {t.label} <span className={cn('ml-1', active ? 'text-brand-400/70' : 'text-zinc-600')}>
                  {t.id === 'all' ? items.length : t.id === 'frames' ? items.reduce((acc, i) => acc + Math.max(2, Math.ceil(i.duration_s/2)), 0) : items.length}
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

      {filtered.length === 0 ? (
        <div className="col-span-full p-8 sm:p-12 text-center text-zinc-500">
          <Icon name="video" size={36} className="text-zinc-500 mb-3" strokeWidth={1.5} />
          <p className="text-sm">No assets yet — generate your first campaign.</p>
          <button onClick={() => navigate('/new')} className="btn btn-primary mt-4 text-sm">Generate</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map(c => (
            <div key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="frame-card group rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden cursor-pointer transition">
              <div className={cn('aspect-video bg-gradient-to-br relative', c.color)}>
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="text-[10px] bg-black/70 backdrop-blur px-1.5 py-0.5 rounded text-white">{c.duration_s}s</span>
                </div>
                <div className="frame-overlay absolute inset-0 flex items-center justify-center bg-black/40">
                  <button className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center hover:scale-110 transition">
                    <Icon name="play" size={18} strokeWidth={2} className="text-zinc-900 ml-0.5" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[10px] sm:text-xs text-zinc-500 mt-1">{timeAgo(c.created_at)} · {Math.max(2, Math.ceil(c.duration_s/2))} frames</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default Library;
