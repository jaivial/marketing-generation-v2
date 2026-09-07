// Login page — pick a demo role to "log in" as.
// In a real backend this would be a password / OAuth / SSO form; here
// we let the user pick any role for testing the ACL end-to-end.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { ALL_ROLES, ROLE_INFO, type RoleName, type Permission } from '../lib/acl';
import { Logo, Icon } from '../components/ui';

const Login: React.FC = () => {
  const { loginAs, isAuthenticated, rolesNames } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<RoleName>('user');
  const [email, setEmail] = useState<string>('alice@example.com');
  const [busy, setBusy] = useState(false);

  async function doLogin() {
    setBusy(true);
    try {
      await loginAs(selected, 'u-' + Math.random().toString(36).slice(2, 8), email);
      navigate(selected === 'root' ? '/admin/system' : '/dashboard');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 bg-grid">
      <header className="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Logo />
          {isAuthenticated && (
            <span className="text-xs text-zinc-400">
              Signed in as: {rolesNames.map((r: RoleName) => r.toUpperCase()).join(', ')}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold font-display">Sign in to MarketingForge</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Pick a demo role to log in as. Each role has different access levels
            in the system.
          </p>

          <div className="mt-6 space-y-2">
            {ALL_ROLES.map(r => {
              const selected_now = selected === r;
              return (
                <button
                  key={r}
                  onClick={() => setSelected(r)}
                  className={cn(
                    'w-full text-left rounded-xl border p-4 transition',
                    selected_now
                      ? 'bg-brand-500/10 border-brand-500 ring-1 ring-brand-500/30'
                      : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                      selected_now ? 'border-brand-500 bg-brand-500' : 'border-zinc-700'
                    )}>
                      {selected_now && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{ROLE_INFO[r].label}</p>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{r}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{ROLE_INFO[r].description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">Email (demo only)</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
            />
          </div>

          <button
            onClick={doLogin}
            disabled={busy}
            className="mt-6 btn btn-primary w-full"
          >
            {busy ? 'Signing in…' : <>Sign in as {ROLE_INFO[selected].label} <Icon name="arrowRight" size={14} /></>}
          </button>
        </div>

        <p className="text-xs text-zinc-500 mt-6 text-center">
          This is a demo login. No password required — the chosen role determines what
          you can do and see. Try <code className="text-zinc-300">root</code> for the
          full admin area at <code className="text-zinc-300">/admin/system</code>.
        </p>
      </main>
    </div>
  );
};

function cn(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ');
}

export default Login;
