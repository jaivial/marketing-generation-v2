// Register page - create an account, then confirm it with the mailed OTP.
//
// POST /api/auth/register   201 -> "check your email" + 6-digit code input
//                           409 -> the address is already taken
// POST /api/auth/confirm-otp    -> swaps the code for a confirmed-session JWT
// POST /api/auth/resend-otp     -> re-mails a code (60s cooldown, see Otp.tsx)
// observation point: `ui.auth.register` / `ui.auth.otp.confirm`.
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { Logo, Icon, toast } from '../components/ui';
import { OtpInput, ResendOtpButton } from '../components/Otp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const Register: React.FC = () => {
  const { register, confirmOtp } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Tell us your name.'); return; }
    if (!EMAIL_RE.test(email)) { setError('Enter a valid email address.'); return; }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      // 201: the code is in the user's inbox - do not open a session yet.
      setAwaitingOtp(true);
      toast('Check your email for the 6-digit code.', 'success');
    } catch (err: any) {
      if (err?.status === 409) {
        setError('That email is already registered - sign in instead.');
      } else {
        setError(err?.message || 'We could not create the account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string = otp) {
    setOtpError(null);
    if (code.length !== 6) { setOtpError('Enter the 6-digit code from the email.'); return; }
    setBusy(true);
    try {
      await confirmOtp(email.trim(), code);
      toast('Email confirmed - welcome aboard.', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      setOtpError(
        err?.status === 400 ? 'Invalid or expired code. Request a new one.'
          : err?.message || 'Confirmation failed. Please try again.',
      );
    } finally {
      setBusy(false);
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
          {!awaitingOtp ? (
            <>
              <h1 className="text-2xl font-bold font-display">Create your account</h1>
              <p className="text-sm text-zinc-400 mt-2">
                One account, one workspace. We email a code to confirm your address.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label htmlFor="register-name" className="label">Name</label>
                  <input
                    id="register-name"
                    value={name}
                    autoComplete="name"
                    onChange={e => setName(e.target.value)}
                    placeholder="Jaime Ferrer"
                    data-testid="register-name-input"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="register-email" className="label">Email</label>
                  <input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    data-testid="register-email-input"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="register-password" className="label">Password</label>
                  <input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={`At least ${MIN_PASSWORD} characters`}
                    data-testid="register-password-input"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="register-password-confirm" className="label">Confirm password</label>
                  <input
                    id="register-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    data-testid="register-password-confirm-input"
                    className="input"
                  />
                </div>

                {error && (
                  <p role="alert" data-testid="register-error" className="text-sm text-rose-400">
                    {error}
                    {error.includes('already registered') && (
                      <>{' '}
                        <Link to="/login" data-testid="register-signin-instead-link"
                          className="text-brand-400 hover:text-brand-300">
                          Sign in instead
                        </Link>
                      </>
                    )}
                  </p>
                )}

                <button type="submit" disabled={busy} data-testid="register-submit-button"
                  className="btn btn-primary w-full">
                  {busy ? 'Creating account\u2026' : <>Create account <Icon name="arrowRight" size={14} /></>}
                </button>
              </form>

              <p className="text-sm text-zinc-400 mt-6 text-center">
                Already have an account?{' '}
                <Link to="/login" data-testid="register-login-link"
                  className="text-brand-400 hover:text-brand-300">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold font-display">Check your email</h1>
              <p className="text-sm text-zinc-400 mt-2">
                We sent a 6-digit code to <span className="text-zinc-200">{email}</span>.
                Enter it below to confirm your address.
              </p>

              <form onSubmit={e => { e.preventDefault(); verify(); }} className="mt-6 space-y-4">
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onComplete={verify}
                  testId="register"
                  autoFocus
                />

                {otpError && (
                  <p role="alert" data-testid="register-otp-error" className="text-sm text-rose-400">{otpError}</p>
                )}

                <button type="submit" disabled={busy} data-testid="register-otp-verify-button"
                  className="btn btn-primary w-full">
                  {busy ? 'Confirming\u2026' : 'Confirm email'}
                </button>

                <div className="flex items-center justify-between">
                  <ResendOtpButton email={email.trim()} testId="register" />
                  <Link to="/login" data-testid="register-back-to-login"
                    className="text-xs text-zinc-500 hover:text-zinc-300">Use a different email</Link>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Register;
