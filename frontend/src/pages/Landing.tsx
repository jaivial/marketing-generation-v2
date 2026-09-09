import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Logo, type IconName } from '../components/ui';

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'globe', title: 'Website scrape', desc: 'Paste a URL — agent-browser handles JS, llms.txt, and login-gated sites.' },
  { icon: 'sparkles', title: 'AI plan', desc: 'MiniMax-M3 plans hook, tagline, CTA, audience & tone.' },
  { icon: 'image', title: 'Frame generation', desc: 'Up to 23 HD frames via GPT-Image-2.0.' },
  { icon: 'video', title: 'Video assembly', desc: 'MiniMax-H3 stitches frames + master prompt.' },
];

const Landing: React.FC = () => {
  const navigate = useNavigate();
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
            <Link to="/dashboard" className="hover:text-white">Dashboard</Link>
            <Link to="/campaigns" className="hover:text-white">Campaigns</Link>
            <Link to="/library" className="hover:text-white">Library</Link>
            <Link to="/integrations" className="hover:text-white">Integrations</Link>
            <Link to="/pricing" className="hover:text-white">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" data-testid="landing-signin-link" className="hidden sm:inline text-sm text-zinc-400 hover:text-white">Sign in</Link>
            <button
              onClick={() => navigate('/new')}
              className="btn btn-primary text-xs sm:text-sm px-3 py-1.5"
            >
              Start free
            </button>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden w-9 h-9 -mr-1 rounded-lg flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900"
              aria-label="Menu"
            >
              <Icon name={menuOpen ? "close" : "menu"} size={20} strokeWidth={2} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden absolute inset-x-0 top-14 mx-3 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-40 p-2 animate-slide-up">
            {[
              { path: '/dashboard', label: 'Dashboard' },
              { path: '/campaigns', label: 'Campaigns' },
              { path: '/library', label: 'Library' },
              { path: '/integrations', label: 'Integrations' },
              { path: '/pricing', label: 'Pricing' },
            ].map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 animate-fade-in">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2.5 sm:px-3 py-1 rounded-full mb-4 sm:mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse flex-shrink-0" />
            <span>MiniMax-H3 + GPT-Image-2.0</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight font-display">
            Ship <span className="gradient-text">marketing videos</span>
            <br />
            in minutes, not weeks.
          </h1>
          <p className="text-zinc-400 mt-4 sm:mt-5 max-w-2xl mx-auto text-sm sm:text-lg px-2">
            Paste a URL or a project folder. We scrape, plan, render, and assemble a full campaign — script, frames, video — all in one orchestrated AI pipeline.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 sm:mt-10 px-4">
          <button
            onClick={() => navigate('/new')}
            className="btn btn-primary px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto"
          >
            Start generating
            <Icon name="arrowRight" size={14} strokeWidth={2} className="sm:w-4 sm:h-4" />
          </button>
          <Link to="/pricing" className="btn btn-ghost px-4 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto">
            See pricing
          </Link>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 max-w-4xl mx-auto mt-8 sm:mt-12">
          {FEATURES.map((f, i) => (
            <div key={i} className="glow-card rounded-xl p-3 sm:p-4 text-left">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center mb-2 sm:mb-3">
                <Icon name={f.icon} size={16} strokeWidth={1.8} className="sm:w-[18px] sm:h-[18px]" />
              </div>
              <p className="text-sm font-medium">{f.title}</p>
              <p className="text-[11px] sm:text-xs text-zinc-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-800/80 mt-12 sm:mt-16 py-6 sm:py-8 text-center text-[10px] sm:text-xs text-zinc-500">
        © 2025 MarketingForge · <Link to="/pricing" className="hover:text-zinc-300">Pricing</Link> · <Link to="/integrations" className="hover:text-zinc-300">Integrations</Link> · <a href="/api/health" target="_blank" className="hover:text-zinc-300">API health</a>
      </footer>
    </div>
  );
};

export default Landing;
