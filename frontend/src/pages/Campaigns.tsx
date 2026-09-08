import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import TopBar from '../components/TopBar';
import { Icon, Pill } from '../components/ui';
import { cn, timeAgo } from '../lib/utils';

const TABS = [
  { id: 'all',        label: 'All' },
  { id: 'done',       label: 'Done' },
  { id: 'generating', label: 'Generating' },
  { id: 'draft',      label: 'Drafts' },
  { id: 'failed',     label: 'Failed' },
] as const;

const Campaigns: React.FC = () => {
  const { history } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<typeof TABS[number]['id']>('all');
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    let list = [...history].sort((a, b) => b.created_at - a.created_at);
    if (filter !== 'all') list = list.filter(i => i.status === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.source || '').toLowerCase().includes(q));
    }
    return list;
  }, [history, filter, query]);

  return (
    <>
      <TopBar
        title="Campaigns"
        actions={[
          <button key="new" onClick={() => navigate('/new')} className="btn btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2">
            <Icon name="plus" size={14} strokeWidth={2.2} />
            <span className="hidden sm:inline">New</span>
          </button>,
        ]}
      />

      <div className="border-b border-zinc-800 mb-4 sm:mb-6 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin">
        <nav className="flex gap-4 sm:gap-6 text-sm whitespace-nowrap">
          {TABS.map(t => {
            const active = filter === t.id;
            const count = t.id === 'all' ? history.length : history.filter(i => i.status === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={cn('py-3 border-b-2', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white')}
              >
                {t.label} <span className={cn('ml-1', active ? 'text-brand-400/70' : 'text-zinc-600')}>{count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="relative mb-4">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" strokeWidth={2} />
        <input
          className="input pl-9"
          placeholder="Search campaigns…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-zinc-500">
            <Icon name="search" size={36} className="text-zinc-500 mb-3" strokeWidth={1.5} />
            <p className="text-sm">No campaigns match your filters.</p>
            <button onClick={() => navigate('/new')} className="btn btn-secondary mt-4 text-sm">Create your first</button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500 uppercase tracking-wider">
                  <tr className="border-b border-zinc-800/50">
                    <th className="text-left px-5 py-3 font-medium">Name</th>
                    <th className="text-left px-5 py-3 font-medium">Source</th>
                    <th className="text-left px-5 py-3 font-medium">Duration</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-left px-5 py-3 font-medium">Created</th>
                    <th className="text-right px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {items.map(c => (
                    <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="border-b border-zinc-800/30 hover:bg-zinc-900/50 cursor-pointer">
                      <td className="px-5 py-3 flex items-center gap-2 min-w-0">
                        <div className={cn('w-7 h-7 rounded bg-gradient-to-br flex-shrink-0', c.color)} />
                        <span className="truncate">{c.name}</span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 truncate max-w-[14rem]">{c.source || '—'}</td>
                      <td className="px-5 py-3 whitespace-nowrap">{c.duration_s}s</td>
                      <td className="px-5 py-3"><Pill status={c.status} /></td>
                      <td className="px-5 py-3 text-zinc-500 whitespace-nowrap">{timeAgo(c.created_at)}</td>
                      <td className="px-5 py-3 text-right text-zinc-500">⋯</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="md:hidden divide-y divide-zinc-800/50">
              {items.map(c => (
                <li key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="p-3 sm:p-4 hover:bg-zinc-900/40 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex-shrink-0', c.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">{c.source || '—'}</p>
                    </div>
                    <Pill status={c.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
                    <span>{c.duration_s}s</span>
                    <span className="text-zinc-700">·</span>
                    <span>{timeAgo(c.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
};

export default Campaigns;
