// ForgotPasswordCard / ResetLinkSentCard â visual structure lifted from the
// better-auth-ui radix-nova `forgot-password` + `reset-link-sent` registry
// items, rebound to our JWT backend:
//
//   POST /api/auth/forgot-password  200 -> the "check your inbox" panel
//                                   429 -> retry hint toasted, form stays open
//
// The backend always answers 200 for a known or unknown address, so the panel
// below is the same in both cases and no account can be enumerated.
// observation point: `ui.auth.password.forgot.card` (pairs with `ui.auth.password.forgot`).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth-provider';
import {
  AuthFieldGroup, AuthFormField, AuthFormRoot, AuthSubmitButton,
  useAuthForm, validateEmail, validateRequired,
} from './auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { FieldDescription, FieldError } from './ui/field';
import { RESEND_COOLDOWN_S } from './confirm-otp';
import { toast } from '../ui';

export type ForgotPasswordCardProps = {
  /** Fires with the submitted address once the mail request went through. */
  onSent: (email: string) => void;
  className?: string;
};

/** Email domain -> webmail login page, used by the "open email app" anchor. */
const MAIL_PROVIDERS: Record<string, string> = {
  'gmail.com': 'https://mail.google.com',
  'googlemail.com': 'https://mail.google.com',
  'outlook.com': 'https://outlook.office.com/mail',
  'hotmail.com': 'https://outlook.live.com/mail',
  'live.com': 'https://outlook.live.com/mail',
  'yahoo.com': 'https://mail.yahoo.com',
  'icloud.com': 'https://www.icloud.com/mail',
  'proton.me': 'https://mail.proton.me',
  'protonmail.com': 'https://mail.proton.me',
};

/** Webmail URL for an address, falling back to the local mail client. */
export function mailAppUrl(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return MAIL_PROVIDERS[domain] ?? 'mailto:';
}

/** Step 1: ask for a reset mail. */
export const ForgotPasswordCard: React.FC<ForgotPasswordCardProps> = ({ onSent, className }) => {
  const { forgotPassword } = useAuth();

  const form = useAuthForm({ email: '' }, (v) => ({
    email: validateEmail(v.email) ?? validateRequired(v.email),
  }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void form.submit(async (values) => {
      try {
        await forgotPassword(values.email.trim());
        onSent(values.email.trim());
      } catch (error: any) {
        if (error?.status === 429) {
          // Cooldown: the backend puts the retry hint in `detail`.
          toast(error?.message || 'Please wait a minute before asking again.', 'info');
          return;
        }
        throw error;
      }
    });
  };

  return (
    <Card data-testid="auth-forgot-password-card" className={className}>
      <CardHeader>
        <CardTitle data-testid="auth-forgot-password-title">Forgot password</CardTitle>
        <CardDescription data-testid="auth-forgot-password-description">
          Enter your email and we will send you a link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthFormRoot onSubmit={submit} data-testid="auth-forgot-password-form">
          <AuthFieldGroup>
            <AuthFormField
              id="auth-forgot-password-email" name="email" type="email" label="Email"
              autoComplete="email" placeholder="you@company.com" required
              value={form.values.email} onChange={form.bind('email')}
              error={form.fieldErrors.email} testId="auth-forgot-password-email-input"
            />
            <FieldError role="alert" error={form.formError} data-testid="auth-forgot-password-form-error" />
            <AuthSubmitButton busy={form.busy} testId="auth-forgot-password-submit" className="w-full">
              Send reset link
            </AuthSubmitButton>
          </AuthFieldGroup>
        </AuthFormRoot>
        <FieldDescription className="mt-4 text-center" data-testid="auth-forgot-password-footer">
          Remembered it?{' '}
          <Link to="/login" data-testid="auth-forgot-password-to-sign-in-link" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </FieldDescription>
      </CardContent>
    </Card>
  );
};

export type ResetLinkSentCardProps = {
  /** Address the reset mail was sent to (blank -> generic copy). */
  email: string;
  /** Back to step 1 with a different address. */
  onUseDifferentEmail: () => void;
  className?: string;
};

/** Step 2: confirmation panel shown whatever the mailbox actually contains. */
export const ResetLinkSentCard: React.FC<ResetLinkSentCardProps> = ({
  email, onUseDifferentEmail, className,
}) => {
  const { forgotPassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    setBusy(true);
    try {
      await forgotPassword(email);
      setCooldown(RESEND_COOLDOWN_S);
      toast('Reset link sent - check your inbox.', 'success');
    } catch (error: any) {
      setCooldown(RESEND_COOLDOWN_S);
      toast(error?.status === 429
        ? error?.message || 'Please wait a minute before asking again.'
        : error?.message || 'Could not send a new link.', 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="auth-reset-link-sent-card" className={className}>
      <CardHeader>
        <CardTitle data-testid="auth-reset-link-sent-title">Check your inbox</CardTitle>
        <CardDescription data-testid="auth-reset-link-sent-description">
          {email
            ? <>We sent a reset link to <span className="text-zinc-200">{email}</span>.</>
            : 'We sent you a reset link if that address exists.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3" data-testid="auth-reset-link-sent-actions">
          <a href={mailAppUrl(email)} target="_blank" rel="noopener noreferrer"
            className="btn btn-secondary w-full" data-testid="auth-reset-link-sent-open-email">
            Open email app
          </a>
          <Button
            variant="ghost" className="w-full" disabled={cooldown > 0 || busy}
            aria-busy={busy || undefined} onClick={resend} data-testid="auth-reset-link-sent-resend"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
          </Button>
        </div>
        <FieldDescription className="mt-4 text-center" data-testid="auth-reset-link-sent-footer">
          <button
            type="button" onClick={onUseDifferentEmail} disabled={busy}
            data-testid="auth-reset-link-sent-different-email"
            className="underline underline-offset-4"
          >
            Use a different email
          </button>
        </FieldDescription>
      </CardContent>
    </Card>
  );
};
