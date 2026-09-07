import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, Logo, type IconName } from '../components/ui';
import LanguageSwitcher from '../components/LanguageSwitcher';

const FEATURES: { icon: IconName; titleKey: string; descKey: string }[] = [
  { icon: 'globe',    titleKey: 'landing.features.scrape.title', descKey: 'landing.features.scrape.desc' },
  { icon: 'sparkles', titleKey: 'landing.features.plan.title',   descKey: 'landing.features.plan.desc' },
  { icon: 'image',    titleKey: 'landing.features.frames.title', descKey: 'landing.features.frames.desc' },
  { icon: 'video',    titleKey: 'landing.features.video.title',  descKey: 'landing.features.video.desc' },
];

const NAV_LINKS: { path: string; key: string }[] = [
  { path: '/dashboard',    key: 'landing.nav.dashboard' },
  { path: '/campaigns',    key: 'landing.nav.campaigns' },
  { path: '/library',      key: 'landing.nav.library' },
  { path: '/integrations', key: 'landing.nav.integrations' },
  { path: '/pricing',      key: 'landing.nav.pricing' },
];

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 bg-grid">
      {/* Top bar */}
      <header className="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <Logo />
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-zinc-400">
            {NAV_LINKS.map(l => (
              <Link key={l.path} to={l.path} className="hover:text-white">{t(l.key)}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link to="/dashboard" className="hidden sm:inline text-sm text-zinc-400 hover:text-white">{t('landing.nav.signIn')}</Link>
            <button
              onClick={() => navigate('/new')}
              className="btn btn-primary text-xs sm:text-sm px-3 py-1.5"
            >
              {t('landing.nav.startFree')}
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden w-9 h-9 -mr-1 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900"
              aria-label={t('landing.nav.menu')}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={20} strokeWidth={2} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden absolute inset-x-0 top-14 mx-3 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-40 p-2 animate-slide-up">
            {NAV_LINKS.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                {t(item.key)}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 animate-fade-in">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2.5 sm:px-3 py-1 rounded-full mb-4 sm:mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse flex-shrink-0" />
            <span>{t('landing.badge')}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight font-display">
            {t('landing.hero.titleLead')} <span className="gradient-text">{t('landing.hero.titleHighlight')}</span>
            <br />
            {t('landing.hero.titleTail')}
          </h1>
          <p className="text-zinc-400 mt-4 sm:mt-5 max-w-2xl mx-auto text-sm sm:text-lg px-2">
            {t('landing.hero.subtitle')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 sm:mt-10 px-4">
          <button
            onClick={() => navigate('/new')}
            className="btn btn-primary px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto"
          >
            {t('landing.cta.start')}
            <Icon name="arrowRight" size={14} strokeWidth={2} className="sm:w-4 sm:h-4" />
          </button>
          <Link to="/pricing" className="btn btn-ghost px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto">
            {t('landing.cta.pricing')}
          </Link>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 max-w-4xl mx-auto mt-8 sm:mt-12">
          {FEATURES.map((f, i) => (
            <div key={i} className="glow-card rounded-xl p-3 sm:p-4 text-left">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center mb-2 sm:mb-3">
                <Icon name={f.icon} size={16} strokeWidth={1.8} className="sm:w-[18px] sm:h-[18px]" />
              </div>
              <p className="text-sm font-medium">{t(f.titleKey)}</p>
              <p className="text-[11px] sm:text-xs text-zinc-500 mt-1">{t(f.descKey)}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-800/80 mt-12 sm:mt-16 py-6 sm:py-8 text-center text-[10px] sm:text-xs text-zinc-500">
        {t('landing.footer.copyright')} · <Link to="/pricing" className="hover:text-zinc-300">{t('landing.footer.pricing')}</Link> · <Link to="/integrations" className="hover:text-zinc-300">{t('landing.footer.integrations')}</Link> · <a href="/api/health" target="_blank" className="hover:text-zinc-300">{t('landing.footer.apiHealth')}</a>
      </footer>
    </div>
  );
};

export default Landing;
