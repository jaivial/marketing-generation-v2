import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import TopBar from '../components/TopBar';
import { Icon, type IconName, Pill } from '../components/ui';
import { cn, timeAgo, formatNumber } from '../lib/utils';
import type { Campaign } from '../lib/types';

const Dashboard: React.FC = () => {
  const { user, history } = useStore();
  const navigate = useNavigate();

  const items = [...history].sort((a, b) => b.created_at - a.created_at);
  const done = items.filter(i => i.status === 'done').length;
  const totalFrames = items.filter(i => i.status === 'done').reduce((acc, i) => acc + (i.duration_s >= 30 ? 15 : 8), 0);
  const totalDuration = items.filter(i => i.status === 'done').reduce((acc, i) => acc + i.duration_s, 0);
  const successRate = items.length ? Math.round((done / items.length) * 100) : 0;

  const stats = [
    { label: 'Total campaigns', value: items.length, delta: '+2 this week',  icon: 'barChart3' as IconName, color: 'from-brand-500 to-fuchsia-500' },
    { label: 'Frames generated', value: totalFrames, delta: '+47 today',  icon: 'image' as IconName, color: 'from-cyan-500 to-blue-500' },
    { label: 'Video duration',   value: `${totalDuration}s`, delta: '+30s today', icon: 'video' as IconName, color: 'from-emerald-500 to-teal-500' },
    { label: 'Success rate',     value: `${successRate}%`, delta: '+4% vs last month', icon: 'trendingUp' as IconName, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <>
      <TopBar
        title={<>Welcome back, {user.name} <Icon name={"hand" as IconName} size={20} className="inline -mt-1" /></>}
        actions={[
          <button key="new" onClick={() => navigate('/new')} className="btn btn-primary text-xs sm:text-sm px-3 sm:px-4 py-2">
            <Icon name="plus" size={14} strokeWidth={2.2} />
            <span className="hidden sm:inline">New campaign</span>
            <span className="sm:hidden">New</span>
          </button>,
        ]}
      />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-6 sm:mb-8">Here's what's happening with your campaigns today.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {stats.map(s => (
          <div key={s.label} className="glow-card rounded-xl p-4 sm:p-5">
            <div className={cn('w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br flex items-center justify-center mb-2 sm:mb-3', s.color)}>
              <Icon name={s.icon} size={16} strokeWidth={1.8} className="sm:w-[18px] sm:h-[18px]" />
            </div>
            <p className="text-xl sm:text-2xl font-semibold font-display">{s.value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
            <p className="text-[10px] sm:text-xs text-emerald-400 mt-1.5 sm:mt-2">{s.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Recent campaigns */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800">
            <h2 className="font-semibold text-sm sm:text-base">Recent campaigns</h2>
            <Link to="/campaigns" className="text-xs text-brand-400 hover:text-brand-300 whitespace-nowrap">View all →</Link>
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 uppercase tracking-wider">
                <tr className="border-b border-zinc-800/50">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium">Duration</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Created</th>
                  <th className="text-right px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {items.slice(0, 5).map(c => (
                  <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="border-b border-zinc-800/30 hover:bg-zinc-900/50 cursor-pointer">
                    <td className="px-5 py-3 flex items-center gap-2">
                      <div className={cn('w-7 h-7 rounded bg-gradient-to-br flex-shrink-0', c.color)} />
                      <span className="truncate">{c.name}</span>
                    </td>
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
            {items.slice(0, 5).map(c => (
              <li key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="p-4 hover:bg-zinc-900/40 cursor-pointer flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex-shrink-0', c.color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-500">{c.duration_s}s</span>
                    <span className="text-[10px] text-zinc-600">·</span>
                    <span className="text-[10px] text-zinc-500">{timeAgo(c.created_at)}</span>
                  </div>
                </div>
                <Pill status={c.status} />
              </li>
            ))}
          </ul>
        </div>

        {/* Activity */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl">
          <div className="p-4 sm:p-5 border-b border-zinc-800">
            <h2 className="font-semibold text-sm sm:text-base">Activity</h2>
          </div>
          <ul className="p-4 sm:p-5 space-y-4 text-sm">
            {items.filter(i => i.status === 'done').slice(0, 3).map(i => (
              <li key={i.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0"><Icon name="check" size={14} strokeWidth={3} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-200 truncate text-xs sm:text-sm">{i.name} — video ready</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">{timeAgo(i.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
