// ResetPasswordCard â visual structure lifted from the better-auth-ui radix-nova
// `reset-password` registry item, rebound to our JWT backend:
//
//   POST /api/auth/reset-password  200 -> "Password updated", on to /login
//                                  400 -> the link is dead, ask for a new one
//
// The token arrives as `?token=<jwt>` on /reset-password; without it there is
// nothing to swap, so the card renders the "missing token" notice instead.
// observation point: `ui.auth.password.reset.card` (pairs with `ui.auth.password.reset`).
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-provider';
import {
  AuthFieldGroup, AuthFormField, AuthFormRoot, AuthPasswordInput,
  AuthSubmitButton, useAuthForm, validateMinLength, validateRequired,
} from './auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FieldDescription, FieldError, FieldGroup } from './ui/field';
import { toast } from '../ui';

/** Same floor the backend enforces on `new_password` and the token itself. */
export const MIN_PASSWORD_LENGTH = 8;

export type ResetPasswordCardProps = {
  /** Reset token from the `?token=` query param; null renders the notice. */
  token: string | null;
  className?: string;
};

export const ResetPasswordCard: React.FC<ResetPasswordCardProps> = ({ token, className }) => {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [deadLink, setDeadLink] = useState(false);

  const form = useAuthForm({ password: '', confirmPassword: '' }, (v) => ({
    password: validateMinLength(v.password, MIN_PASSWORD_LENGTH) ?? validateRequired(v.password),
    confirmPassword:
      validateMinLength(v.confirmPassword, MIN_PASSWORD_LENGTH) ?? validateRequired(v.confirmPassword)
      ?? (v.confirmPassword === v.password ? undefined : 'Passwords do not match.'),
  }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void form.submit(async (values) => {
      try {
        await resetPassword(token as string, values.password);
        toast('Password updated', 'success');
        navigate('/login');
      } catch (error: any) {
        if (error?.status === 400) {
          setDeadLink(true);
          return;
        }
        throw error;
      }
    });
  };

  if (!token) {
    return (
      <Card data-testid="auth-reset-password-missing-token-card" className={className}>
        <CardHeader>
          <CardTitle data-testid="auth-reset-password-missing-token-title">Missing reset token</CardTitle>
          <CardDescription data-testid="auth-reset-password-missing-token-description">
            This page needs the token from the email we sent you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup data-testid="auth-reset-password-missing-token-body">
            <FieldDescription data-testid="auth-reset-password-missing-token-hint">
              Open the reset link from your inbox, or request a fresh one.
            </FieldDescription>
            <Link to="/forgot-password" data-testid="auth-reset-password-missing-token-link"
              className="btn btn-primary w-full">
              Request a new link
            </Link>
          </FieldGroup>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="auth-reset-password-card" className={className}>
      <CardHeader>
        <CardTitle data-testid="auth-reset-password-title">Reset password</CardTitle>
        <CardDescription data-testid="auth-reset-password-description">
          Choose a new password for your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthFormRoot onSubmit={submit} data-testid="auth-reset-password-form">
          <AuthFieldGroup>
            <AuthFormField
              id="auth-reset-password-password" name="password" label="New password"
              autoComplete="new-password" placeholder="At least 8 characters" required
              value={form.values.password} onChange={form.bind('password')}
              error={form.fieldErrors.password} testId="auth-reset-password-new-input"
              control={
                <AuthPasswordInput
                  id="auth-reset-password-password" name="password" autoComplete="new-password"
                  placeholder="At least 8 characters" required minLength={MIN_PASSWORD_LENGTH}
                  aria-invalid={!!form.fieldErrors.password || undefined}
                  value={form.values.password} onChange={form.bind('password')}
                  testId="auth-reset-password-new-input"
                />
              }
            />
            <AuthFormField
              id="auth-reset-password-confirm" name="confirmPassword" label="Confirm password"
              autoComplete="new-password" placeholder="Repeat the new password" required
              value={form.values.confirmPassword} onChange={form.bind('confirmPassword')}
              error={form.fieldErrors.confirmPassword} testId="auth-reset-password-confirm-input"
              control={
                <AuthPasswordInput
                  id="auth-reset-password-confirm" name="confirmPassword" autoComplete="new-password"
                  placeholder="Repeat the new password" required minLength={MIN_PASSWORD_LENGTH}
                  aria-invalid={!!form.fieldErrors.confirmPassword || undefined}
                  value={form.values.confirmPassword} onChange={form.bind('confirmPassword')}
                  testId="auth-reset-password-confirm-input"
                />
              }
            />
            {deadLink && (
              <FieldDescription data-testid="auth-reset-password-dead-link" role="alert">
                This reset link is invalid or has expired.{' '}
                <Link to="/forgot-password" data-testid="auth-reset-password-dead-link-url"
                  className="text-brand-400 hover:text-brand-300 underline underline-offset-4">
                  Request a new one.
                </Link>
              </FieldDescription>
            )}
            <FieldError role="alert" error={form.formError} data-testid="auth-reset-password-form-error" />
            <AuthSubmitButton busy={form.busy} testId="auth-reset-password-submit" className="w-full">
              Reset password
            </AuthSubmitButton>
          </AuthFieldGroup>
        </AuthFormRoot>
        <FieldDescription className="mt-4 text-center" data-testid="auth-reset-password-footer">
          Remembered it?{' '}
          <Link to="/login" data-testid="auth-reset-password-to-sign-in-link" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </FieldDescription>
      </CardContent>
    </Card>
  );
};
