// ConfirmOtpCard â the code step, styled after the registry's field/input
// primitives. Shared by the /confirm page and the inline sign-up step, so the
// resend cooldown and the auto-submit live in exactly one place.
// observation point: `ui.auth.otp.card` (backend pairs it with `ui.auth.otp.confirm`).
import React, { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { AuthFieldGroup, AuthFormRoot, AuthSubmitButton } from './auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FieldDescription, FieldError } from './ui/field';
import { InputOTP, OTP_LENGTH } from './ui/input-otp';
import { toast } from '../ui';

/** Seconds the backend enforces between two mails (obs: `ui.auth.otp.cooldown`). */
export const RESEND_COOLDOWN_S = 60;

export type ConfirmOtpCardProps = {
  email: string;
  /** Fires once the code swapped for a confirmed-session JWT. */
  onConfirmed: () => void;
  /** Unique prefix so both mount points keep distinct data-testids. */
  scope: string;
  title?: string;
  className?: string;
};

export const ConfirmOtpCard: React.FC<ConfirmOtpCardProps> = ({
  email, onConfirmed, scope, title = 'Confirm your email', className,
}) => {
  const { confirmOtp, resendOtp } = useAuth();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async (code: string) => {
    setError(null);
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
      return;
    }
    setBusy(true);
    try {
      await confirmOtp(email, code);
      toast('Email confirmed - welcome aboard.', 'success');
      onConfirmed();
    } catch (err: any) {
      setError(
        err?.status === 400 ? 'Invalid or expired code. Request a new one.'
          : err?.status === 401 ? 'Invalid or expired code. Request a new one.'
          : err?.message || 'Confirmation failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await resendOtp(email);
      setCooldown(RESEND_COOLDOWN_S);
      toast('New code sent - check your inbox.', 'success');
    } catch (err: any) {
      if (err?.status === 429) {
        setCooldown(RESEND_COOLDOWN_S);
        toast('Please wait a minute before asking for a new code.', 'info');
      } else {
        toast(err?.message || 'Could not send a new code.', 'error');
      }
    }
  };

  return (
    <Card data-testid={`${scope}-card`} className={className}>
      <CardHeader>
        <CardTitle data-testid={`${scope}-title`}>{title}</CardTitle>
        <CardDescription data-testid={`${scope}-description`}>
          {email
            ? <>Enter the {OTP_LENGTH}-digit code we emailed to <span className="text-zinc-200">{email}</span>.</>
            : `Enter the ${OTP_LENGTH}-digit code we emailed you.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthFormRoot
          data-testid={`${scope}-form`}
          onSubmit={(e) => { e.preventDefault(); void verify(otp); }}
        >
          <AuthFieldGroup>
            <InputOTP
              value={otp}
              onChange={(code) => { setOtp(code); setError(null); }}
              onComplete={(code) => void verify(code)}
              disabled={busy}
              autoFocus
              testId={scope}
            />
            <FieldError role="alert" error={error} data-testid={`${scope}-error`} />
            <AuthSubmitButton busy={busy} testId={`${scope}-submit`} className="w-full">
              Verify
            </AuthSubmitButton>
            <FieldDescription className="flex items-center justify-between" data-testid={`${scope}-footer`}>
              <button
                type="button" onClick={resend} disabled={cooldown > 0 || busy || !email}
                data-testid={`${scope}-resend`}
                className="text-brand-400 hover:text-brand-300 disabled:text-zinc-600 disabled:no-underline"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </FieldDescription>
          </AuthFieldGroup>
        </AuthFormRoot>
      </CardContent>
    </Card>
  );
};
