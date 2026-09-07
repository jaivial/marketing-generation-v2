import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Logo } from '../components/ui';
import { toast } from '../components/ui';
import { cn } from '../lib/utils';

const PLANS = [
  { id: 'free', name: 'Free', desc: 'For tinkering', price: '$0', sub: 'forever',
    features: ['5 campaigns / month', '15s max duration', 'Standard models', 'Community support', 'Watermarked exports'],
    cta: 'Current plan', primary: false, current: true },
  { id: 'pro', name: 'Pro', desc: 'For creators & marketers', price: '$49', sub: '/mo + usage',
    features: ['50 campaigns / month', '45s max duration', 'All models', 'Priority queue', 'No watermark', 'Brand kit + custom fonts'],
    cta: 'Upgrade to Pro', primary: true },
  { id: 'team', name: 'Team', desc: 'For agencies & teams', price: '$199', sub: '/mo + usage',
    features: ['Unlimited campaigns', 'Up to 60s duration', 'Up to 10 seats', 'Team library & roles', 'SSO + audit log', 'Dedicated CSM'],
    cta: 'Contact sales', primary: false },
];

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 bg-grid">
      <header className="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 cursor-pointer min-w-0">
            <Logo />
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-zinc-400">
            <Link to="/dashboard" className="hover:text-white">Dashboard</Link>
            <Link to="/campaigns" className="hover:text-white">Campaigns</Link>
            <Link to="/library" className="hover:text-white">Library</Link>
            <Link to="/pricing" className="text-white">Pricing</Link>
          </nav>
          <button onClick={() => navigate('/new')} className="btn btn-primary text-xs sm:text-sm px-3 py-1.5">Start free</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 animate-fade-in">
        <div className="text-center">
          <h1 className="text-2xl sm:text-4xl font-bold font-display">Simple, usage-based pricing</h1>
          <p className="text-zinc-400 mt-2 sm:mt-3 text-sm sm:text-base">Start free. Scale as you grow. No seat fees.</p>
          <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 mt-4 sm:mt-6 text-xs sm:text-sm">
            <button onClick={() => setYearly(false)} className={cn('px-3 py-1.5 rounded transition', !yearly ? 'bg-brand-500 text-white' : 'text-zinc-400')}>Monthly</button>
            <button onClick={() => setYearly(true)} className={cn('px-3 py-1.5 rounded transition', yearly ? 'bg-brand-500 text-white' : 'text-zinc-400')}>Yearly · save 20%</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12">
          {PLANS.map(p => {
            const isCurrent = p.current;
            const isPrimary = p.primary;
            const price = yearly && p.price !== '$0' ? '$' + Math.round(parseInt(p.price.slice(1)) * 0.8) : p.price;
            return (
              <div key={p.id} className={cn('rounded-xl sm:rounded-2xl p-5 sm:p-6 relative', isPrimary ? 'gradient-border bg-gradient-to-br from-brand-500/10 to-fuchsia-500/10 shadow-2xl shadow-brand-950/30 sm:scale-[1.02]' : 'bg-zinc-900/60 border border-zinc-800')}>
                {isPrimary && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold gradient-bg text-white px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">Most popular</span>}
                <h3 className="font-semibold text-base sm:text-lg">{p.name}</h3>
                <p className="text-[11px] sm:text-xs text-zinc-500 mt-1">{p.desc}</p>
                <div className="mt-4 sm:mt-5 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-bold font-display">{price}</span>
                  <span className="text-zinc-500 text-xs sm:text-sm">{p.sub}</span>
                </div>
                <button
                  disabled={isCurrent}
                  onClick={() => {
                    if (p.id === 'team') { toast('Sales will reach out shortly', 'info'); return; }
                    toast(`Upgraded to ${p.name} (demo)`, 'success');
                  }}
                  className={cn('w-full mt-4 sm:mt-5 btn text-xs sm:text-sm', isCurrent ? 'btn-secondary' : isPrimary ? 'btn-primary' : 'btn-secondary')}
                >{p.cta}</button>
                <ul className="mt-5 sm:mt-6 space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-zinc-300">
                  {p.features.map(f => (
                    <li key={f} className="flex gap-2">
                      <Icon name="check" size={16} className="text-emerald-400 flex-shrink-0" strokeWidth={3} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-12 sm:mt-16 bg-zinc-900/60 border border-zinc-800 rounded-xl sm:rounded-2xl p-5 sm:p-8">
          <h2 className="text-lg sm:text-xl font-semibold text-center">Frequently asked questions</h2>
          <div className="mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-5 sm:gap-y-6">
            {['How is "usage" billed?','Can I cancel anytime?','Do you offer custom durations?','Is my data used for training?'].map((q, i) => (
              <div key={q}>
                <p className="font-medium text-sm sm:text-base">{q}</p>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  {i === 0 ? 'Per-token for chat models, per-second for video. Itemized invoice every month.' :
                   i === 1 ? 'Yes — your subscription ends at the period, no questions asked.' :
                   i === 2 ? 'On the Team plan, durations up to 60s are supported. Contact us for longer.' :
                             'No. Your inputs and outputs are never used to train models.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Pricing;
