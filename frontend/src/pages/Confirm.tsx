// Confirm page - the landing spot for the "confirm your email" link.
//
// /confirm?email=<addr> -> 6-digit code -> POST /api/auth/confirm-otp
// observation point: `ui.auth.confirm.page`.
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { Logo, Icon, toast } from '../components/ui';
import { OtpInput, ResendOtpButton } from '../components/Otp';

const Confirm: React.FC = () => {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const { confirmOtp } = useAuth();
  const navigate = useNavigate();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(code: string = otp) {
    setError(null);
    if (!email) { setError('No email to confirm - sign in and request a new code.'); return; }
    if (code.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setBusy(true);
    try {
      await confirmOtp(email, code);
      toast('Email confirmed - you are signed in.', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      setError(
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
          <h1 className="text-2xl font-bold font-display">Confirm your email</h1>
          <p className="text-sm text-zinc-400 mt-2">
            {email
              ? <>Enter the 6-digit code we emailed to <span className="text-zinc-200">{email}</span>.</>
              : 'Enter the 6-digit code we emailed you.'}
          </p>

          <form onSubmit={e => { e.preventDefault(); verify(); }} className="mt-6 space-y-4">
            <OtpInput value={otp} onChange={setOtp} onComplete={verify} testId="confirm" autoFocus />

            {error && (
              <p role="alert" data-testid="confirm-error" className="text-sm text-rose-400">{error}</p>
            )}

            <button type="submit" disabled={busy} data-testid="confirm-verify-button"
              className="btn btn-primary w-full">
              {busy ? 'Verifying\u2026' : <>Verify <Icon name="check" size={14} /></>}
            </button>

            <div className="flex items-center justify-between">
              <ResendOtpButton email={email} testId="confirm" />
              <Link to="/login" data-testid="confirm-different-email-link"
                className="text-xs text-zinc-500 hover:text-zinc-300">Use a different email</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Confirm;
