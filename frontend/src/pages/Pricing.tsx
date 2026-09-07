import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, Logo } from '../components/ui';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { toast } from '../components/ui';
import { cn } from '../lib/utils';

const PLANS = [
  { id: 'free', nameKey: 'pricing.plans.free.name', descKey: 'pricing.plans.free.desc', price: '$0', subKey: 'pricing.plans.free.sub',
    featureKeys: ['pricing.plans.free.features.campaigns', 'pricing.plans.free.features.duration', 'pricing.plans.free.features.models', 'pricing.plans.free.features.support', 'pricing.plans.free.features.watermark'],
    ctaKey: 'pricing.plans.free.cta', primary: false, current: true },
  { id: 'pro', nameKey: 'pricing.plans.pro.name', descKey: 'pricing.plans.pro.desc', price: '$49', subKey: 'pricing.plans.pro.sub',
    featureKeys: ['pricing.plans.pro.features.campaigns', 'pricing.plans.pro.features.duration', 'pricing.plans.pro.features.models', 'pricing.plans.pro.features.queue', 'pricing.plans.pro.features.watermark', 'pricing.plans.pro.features.brandkit'],
    ctaKey: 'pricing.plans.pro.cta', primary: true },
  { id: 'team', nameKey: 'pricing.plans.team.name', descKey: 'pricing.plans.team.desc', price: '$199', subKey: 'pricing.plans.team.sub',
    featureKeys: ['pricing.plans.team.features.campaigns', 'pricing.plans.team.features.duration', 'pricing.plans.team.features.seats', 'pricing.plans.team.features.library', 'pricing.plans.team.features.sso', 'pricing.plans.team.features.csm'],
    ctaKey: 'pricing.plans.team.cta', primary: false },
];

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 bg-grid">
      <header className="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 cursor-pointer min-w-0">
            <Logo />
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-zinc-400">
            <Link to="/dashboard" className="hover:text-white">{t('pricing.nav.dashboard')}</Link>
            <Link to="/campaigns" className="hover:text-white">{t('pricing.nav.campaigns')}</Link>
            <Link to="/library" className="hover:text-white">{t('pricing.nav.library')}</Link>
            <Link to="/pricing" className="text-white">{t('pricing.nav.pricing')}</Link>
          </nav>
          <LanguageSwitcher />
          <button onClick={() => navigate('/new')} className="btn btn-primary text-xs sm:text-sm px-3 py-1.5">{t('pricing.nav.startFree')}</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 animate-fade-in">
        <div className="text-center">
          <h1 className="text-2xl sm:text-4xl font-bold font-display">{t('pricing.title')}</h1>
          <p className="text-zinc-400 mt-2 sm:mt-3 text-sm sm:text-base">{t('pricing.subtitle')}</p>
          <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 mt-4 sm:mt-6 text-xs sm:text-sm">
            <button onClick={() => setYearly(false)} className={cn('px-3 py-1.5 rounded transition', !yearly ? 'bg-brand-500 text-white' : 'text-zinc-400')}>{t('pricing.monthly')}</button>
            <button onClick={() => setYearly(true)} className={cn('px-3 py-1.5 rounded transition', yearly ? 'bg-brand-500 text-white' : 'text-zinc-400')}>{t('pricing.yearly')}</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12">
          {PLANS.map(p => {
            const isCurrent = p.current;
            const isPrimary = p.primary;
            const price = yearly && p.price !== '$0' ? '$' + Math.round(parseInt(p.price.slice(1)) * 0.8) : p.price;
            return (
              <div key={p.id} className={cn('rounded-xl sm:rounded-2xl p-5 sm:p-6 relative', isPrimary ? 'gradient-border bg-gradient-to-br from-brand-500/10 to-fuchsia-500/10 shadow-2xl shadow-brand-950/30 sm:scale-[1.02]' : 'bg-zinc-900/60 border border-zinc-800')}>
                {isPrimary && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold gradient-bg text-white px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">{t('pricing.mostPopular')}</span>}
                <h3 className="font-semibold text-base sm:text-lg">{t(p.nameKey)}</h3>
                <p className="text-[11px] sm:text-xs text-zinc-500 mt-1">{t(p.descKey)}</p>
                <div className="mt-4 sm:mt-5 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-bold font-display">{price}</span>
                  <span className="text-zinc-500 text-xs sm:text-sm">{t(p.subKey)}</span>
                </div>
                <button
                  disabled={isCurrent}
                  onClick={() => {
                    if (p.id === 'team') { toast(t('pricing.toast.contactSales'), 'info'); return; }
                    toast(t('pricing.toast.upgraded', { plan: t(p.nameKey) }), 'success');
                  }}
                  className={cn('w-full mt-4 sm:mt-5 btn text-xs sm:text-sm', isCurrent ? 'btn-secondary' : isPrimary ? 'btn-primary' : 'btn-secondary')}
                >{t(p.ctaKey)}</button>
                <ul className="mt-5 sm:mt-6 space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-zinc-300">
                  {p.featureKeys.map(fk => (
                    <li key={fk} className="flex gap-2">
                      <Icon name="check" size={16} className="text-emerald-400 flex-shrink-0" strokeWidth={3} />
                      <span>{t(fk)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-12 sm:mt-16 bg-zinc-900/60 border border-zinc-800 rounded-xl sm:rounded-2xl p-5 sm:p-8">
          <h2 className="text-lg sm:text-xl font-semibold text-center">{t('pricing.faq.title')}</h2>
          <div className="mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-5 sm:gap-y-6">
            {[1, 2, 3, 4].map(n => (
              <div key={n}>
                <p className="font-medium text-sm sm:text-base">{t(`pricing.faq.q${n}`)}</p>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">{t(`pricing.faq.a${n}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Pricing;
