// Login page - real email + password sign-in.
//
// POST /api/auth/login
//   200 -> JWT stored, on to /dashboard
//   401 -> bad credentials
//   403 -> the address exists but was never confirmed: offer to resend the code
// observation point: `ui.auth.login` (page) / `ui.auth.otp.resend` (resend).
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { Logo, Icon, toast } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login: React.FC = () => {
  const { login, resendOtp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);

    if (!EMAIL_RE.test(email)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }

    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.status === 401) {
        setError('Invalid email or password.');
      } else if (err?.status === 403) {
        setUnconfirmed(true);
        setError('That email is not confirmed yet. Check your inbox for the 6-digit code.');
      } else {
        setError(err?.message || 'Sign in failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await resendOtp(email.trim());
      toast('Confirmation code sent - check your inbox.', 'success');
      navigate(`/confirm?email=${encodeURIComponent(email.trim())}`);
    } catch (err: any) {
      toast(err?.message || 'Could not send a new code.', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 bg-grid">
      <header className="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <Logo />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold font-display">Sign in to MarketingForge</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Welcome back. Enter the email and password you registered with.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="label">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                data-testid="login-email-input"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="label">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                data-testid="login-password-input"
                className="input"
              />
            </div>

            {error && (
              <p role="alert" data-testid="login-error" className="text-sm text-rose-400">{error}</p>
            )}

            {unconfirmed && (
              <button
                type="button"
                onClick={resend}
                data-testid="login-resend-confirmation"
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                Resend confirmation code
              </button>
            )}

            <button type="submit" disabled={busy} data-testid="login-submit-button" className="btn btn-primary w-full">
              {busy ? 'Signing in\u2026' : <>Sign in <Icon name="arrowRight" size={14} /></>}
            </button>
          </form>

          <p className="text-sm text-zinc-400 mt-6 text-center">
            New here?{' '}
            <Link to="/register" data-testid="login-create-account-link" className="text-brand-400 hover:text-brand-300">
              Create account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
