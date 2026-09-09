// OTP building blocks shared by the register wizard and the /confirm page.
//
// Both flows ask the backend for the same thing — a 6-digit code that was
// mailed to the user — so the input and the "resend" control live here once.
// observation point: `ui.auth.otp` (the api layer tags each call with a
// more specific point, e.g. `ui.auth.otp.resend`).
import React, { useEffect, useRef, useState } from 'react';
import { resendOtp } from '../lib/api';
import { toast } from './ui';

export const OTP_LENGTH = 6;

/** Seconds the backend enforces between two "resend" mails. */
const RESEND_COOLDOWN_S = 60;

interface OtpInputProps {
  value: string;
  onChange: (otp: string) => void;
  /** Unique test id prefix, e.g. "register" -> "register-otp-input". */
  testId: string;
  autoFocus?: boolean;
  onComplete?: (otp: string) => void;
}

/** Single 6-digit code field: numeric keypad, digits only, auto-submitting. */
export const OtpInput: React.FC<OtpInputProps> = ({ value, onChange, testId, autoFocus, onComplete }) => {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      autoFocus={autoFocus}
      value={value}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={OTP_LENGTH}
      placeholder={"\u2022".repeat(OTP_LENGTH)}
      aria-label={`${OTP_LENGTH}-digit confirmation code`}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
        onChange(digits);
        if (digits.length === OTP_LENGTH) onComplete?.(digits);
      }}
      data-testid={`${testId}-otp-input`}
      className="input text-center text-xl tracking-[0.6em] font-mono"
    />
  );
};

interface ResendOtpProps {
  email: string;
  /** Called after the backend accepted the resend (202). */
  onSent?: () => void;
  testId: string;
}

/** "Resend code" link that stays disabled while the 60s cooldown runs. */
export const ResendOtpButton: React.FC<ResendOtpProps> = ({ email, onSent, testId }) => {
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function resend() {
    setBusy(true);
    try {
      await resendOtp(email);
      setLeft(RESEND_COOLDOWN_S);
      toast('New code sent \u2014 check your inbox.', 'success');
      onSent?.();
    } catch (e: any) {
      const status = e?.status;
      if (status === 429) {
        setLeft(RESEND_COOLDOWN_S);
        toast('Please wait a minute before asking for a new code.', 'info');
      } else {
        toast(e?.message || 'Could not send a new code.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!email) return null;

  return (
    <button
      type="button"
      onClick={resend}
      disabled={busy || left > 0}
      data-testid={`${testId}-otp-resend`}
      className="text-xs text-brand-400 hover:text-brand-300 disabled:text-zinc-600 disabled:cursor-not-allowed"
    >
      {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
    </button>
  );
};
