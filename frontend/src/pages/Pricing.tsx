import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Logo, toast } from '../components/ui';
import { cn } from '../lib/utils';
import { fetchPlans, checkoutPlan, fetchMyWorkspace, type BillingPlan } from '../lib/api';
import { CREDIT_USD, formatCredits, maxDurationFor } from '../lib/credits';

// Static copy that isn't part of the price table. The backend owns the
// numbers (name / allowance / price); this only decorates them.
const PLAN_CHROME: Record<string, { color: string; features: string[]; popular?: boolean }> = {
  Starter: {
    color: 'from-cyan-500 to-blue-500',
    features: ['Standard models', 'Community support', 'Watermark-free exports'],
  },
  Pro: {
    color: 'from-brand-500 to-fuchsia-500',
    popular: true,
    features: ['All models', 'Priority queue', 'Brand kit + custom fonts', 'Email support'],
  },
  Studio: {
    color: 'from-amber-500 to-orange-500',
    features: ['All models', 'Highest priority queue', 'Team library & roles', 'SSO + audit log', 'Dedicated CSM'],
  },
};

/** "1m 20s" / "45s" — rough per-campaign duration a plan's allowance buys. */
function humanDuration(totalSec: number): string {
  if (totalSec <= 0) return '—';
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

const Pricing: React.FC = () => {
  const navigate = useNavigate();

  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Load the real price table from the API.
  useEffect(() => {
    let alive = true;
    fetchPlans()
      .then(p => { if (alive) setPlans(p); })
      .catch(e => { if (alive) setError(String(e?.message || e)); });
    // Signed-in visitors also see which plan they're already on. Guests
    // simply get a 403/404 here, which is not an error worth surfacing.
    fetchMyWorkspace()
      .then(w => { if (alive) setCurrentPlan(w.plan_name); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const choose = async (plan: BillingPlan) => {
    setBusy(plan.name);
    try {
      const w = await fetchMyWorkspace();
      const res = await checkoutPlan(w.workspace_id, plan.name);
      setCurrentPlan(res.plan_name);
      toast(
        `You're on ${res.plan_name} — ${formatCredits(res.monthly_credits)} credits / month`,
        'success',
      );
    } catch (e: any) {
      const msg = String(e?.message || e);
      // The most common failure is "not signed in / no workspace yet".
      if (msg.includes('403') || msg.includes('404')) {
        toast('Sign in to choose a plan', 'info');
        navigate('/login');
      } else {
        toast(`Checkout failed: ${msg}`, 'error', 6000);
      }
    } finally {
      setBusy(null);
    }
  };

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
          <h1 className="text-2xl sm:text-4xl font-bold font-display">Simple, credit-based pricing</h1>
          <p className="text-zinc-400 mt-2 sm:mt-3 text-sm sm:text-base">
            Every plan comes with a monthly credit allowance. Spend it on whatever mix
            of length and volume you need — 1 credit = ${CREDIT_USD.toFixed(2)}.
          </p>
        </div>

        {/* Loading / error states */}
        {error && (
          <div className="mt-8 mx-auto max-w-md bg-rose-500/10 border border-rose-500/40 text-rose-200 rounded-xl p-4 text-sm text-center">
            <Icon name="alertCircle" size={16} className="inline mr-1.5 -mt-0.5" />
            Couldn't load pricing: {error}
          </div>
        )}

        {!plans && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl sm:rounded-2xl p-5 sm:p-6 bg-zinc-900/60 border border-zinc-800 animate-pulse">
                <div className="h-4 w-24 bg-zinc-800 rounded" />
                <div className="h-3 w-36 bg-zinc-800/70 rounded mt-3" />
                <div className="h-9 w-28 bg-zinc-800 rounded mt-6" />
                <div className="h-9 w-full bg-zinc-800/70 rounded mt-5" />
              </div>
            ))}
          </div>
        )}

        {plans && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12">
            {plans.map(p => {
              const chrome = PLAN_CHROME[p.name] || { color: 'from-zinc-500 to-zinc-700', features: [] };
              const isPrimary = !!chrome.popular;
              const isCurrent = currentPlan === p.name;
              const maxSec = maxDurationFor(p.monthly_credits, p.cost_per_sec);
              return (
                <div
                  key={p.name}
                  className={cn(
                    'rounded-xl sm:rounded-2xl p-5 sm:p-6 relative flex flex-col',
                    isPrimary
                      ? 'gradient-border bg-gradient-to-br from-brand-500/10 to-fuchsia-500/10 shadow-2xl shadow-brand-950/30 sm:scale-[1.02]'
                      : 'bg-zinc-900/60 border border-zinc-800',
                  )}
                >
                  {isPrimary && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold gradient-bg text-white px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                      Most popular
                    </span>
                  )}

                  <div className={cn('w-full h-1.5 rounded-full bg-gradient-to-r mb-4', chrome.color)} />

                  <h3 className="font-semibold text-base sm:text-lg">{p.name}</h3>
                  <p className="text-[11px] sm:text-xs text-zinc-500 mt-1">{p.tagline}</p>

                  <div className="mt-4 sm:mt-5 flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-bold font-display">
                      ${p.price_usd.toFixed(0)}
                    </span>
                    <span className="text-zinc-500 text-xs sm:text-sm">/mo</span>
                  </div>

                  {/* The two numbers that actually matter */}
                  <dl className="mt-4 space-y-2 text-xs sm:text-sm">
                    <div className="flex items-center justify-between gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
                      <dt className="text-zinc-400">Monthly credits</dt>
                      <dd className="font-semibold text-brand-300">{formatCredits(p.monthly_credits)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
                      <dt className="text-zinc-400">Est. max video / mo</dt>
                      <dd className="font-semibold text-emerald-400">~{humanDuration(maxSec)}</dd>
                    </div>
                  </dl>
                  <p className="text-[10px] text-zinc-600 mt-1.5">
                    ~{p.cost_per_sec.toFixed(1)} credits per second of video
                  </p>

                  <button
                    disabled={isCurrent || busy !== null}
                    onClick={() => choose(p)}
                    className={cn(
                      'w-full mt-4 sm:mt-5 btn text-xs sm:text-sm',
                      isCurrent ? 'btn-secondary' : isPrimary ? 'btn-primary' : 'btn-secondary',
                    )}
                  >
                    {busy === p.name ? (
                      <>
                        <Icon name="loader" size={14} className="animate-spin" strokeWidth={2} />
                        Choosing…
                      </>
                    ) : isCurrent ? 'Current plan' : 'Choose plan'}
                  </button>

                  {chrome.features.length > 0 && (
                    <ul className="mt-5 sm:mt-6 space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-zinc-300">
                      {chrome.features.map(f => (
                        <li key={f} className="flex gap-2">
                          <Icon name="check" size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={3} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 sm:mt-16 bg-zinc-900/60 border border-zinc-800 rounded-xl sm:rounded-2xl p-5 sm:p-8">
          <h2 className="text-lg sm:text-xl font-semibold text-center">Frequently asked questions</h2>
          <div className="mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-5 sm:gap-y-6">
            {['What is a credit?', 'Can I cancel anytime?', 'What happens if I run out?', 'Is my data used for training?'].map((q, i) => (
              <div key={q}>
                <p className="font-medium text-sm sm:text-base">{q}</p>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  {i === 0 ? `One credit is $${CREDIT_USD.toFixed(2)}. Video generation is billed per second, keyframes per image — the wizard shows the exact cost before you generate.` :
                   i === 1 ? 'Yes — your subscription ends at the period, no questions asked.' :
                   i === 2 ? 'Generation is blocked until your allowance resets or you top up. You are never charged overage automatically.' :
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
