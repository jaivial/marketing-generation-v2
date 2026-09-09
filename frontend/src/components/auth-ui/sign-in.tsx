// SignInCard â visual structure lifted from the better-auth-ui radix-nova
// sign-in registry item, rebound to our JWT login. No social providers, no
// passkeys, no captcha: only what the backend implements.
// observation point: `ui.auth.signin.card` (backend pairs it with `ui.auth.login`).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-provider';
import {
  AuthFieldGroup, AuthFormField, AuthFormRoot, AuthPasswordInput,
  AuthSubmitButton, useAuthForm, validateEmail, validateRequired,
} from './auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FieldDescription, FieldError } from './ui/field';
import { toast } from '../ui';

export type SignInCardProps = { className?: string };

export const SignInCard: React.FC<SignInCardProps> = ({ className }) => {
  const { login, resendOtp } = useAuth();
  const navigate = useNavigate();
  const [unconfirmed, setUnconfirmed] = React.useState(false);

  const form = useAuthForm({ email: '', password: '' }, (v) => ({
    email: validateEmail(v.email) ?? validateRequired(v.email),
    password: validateRequired(v.password, 'Enter your password.'),
  }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void form.submit(async (values) => {
      try {
        await login(values.email.trim(), values.password);
        navigate('/dashboard');
      } catch (error: any) {
        if (error?.status === 401) {
          form.bind('password')('');
          error.message = 'Invalid email or password.';
        }
        if (error?.status === 403) setUnconfirmed(true);
        throw error;
      }
    });
  };

  const resend = async () => {
    try {
      await resendOtp(form.values.email.trim());
      toast('Confirmation code sent - check your inbox.', 'success');
      navigate(`/confirm?email=${encodeURIComponent(form.values.email.trim())}`);
    } catch (error: any) {
      toast(error?.message || 'Could not send a new code.', 'error');
    }
  };

  return (
    <Card data-testid="auth-sign-in-card" className={className}>
      <CardHeader>
        <CardTitle data-testid="auth-sign-in-title">Sign in</CardTitle>
        <CardDescription data-testid="auth-sign-in-description">
          Welcome back. Enter the email and password you registered with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthFormRoot onSubmit={submit} data-testid="auth-sign-in-form">
          <AuthFieldGroup>
            <AuthFormField
              id="auth-sign-in-email" name="email" type="email" label="Email"
              autoComplete="email" placeholder="you@company.com" required
              value={form.values.email} onChange={form.bind('email')}
              error={form.fieldErrors.email} testId="auth-sign-in-email-input"
            />
            <AuthFormField
              id="auth-sign-in-password" name="password" label="Password"
              value={form.values.password} onChange={form.bind('password')}
              error={form.fieldErrors.password} testId="auth-sign-in-password-input"
              control={
                <AuthPasswordInput
                  id="auth-sign-in-password" name="password" autoComplete="current-password"
                  placeholder="Your password" required aria-invalid={!!form.fieldErrors.password || undefined}
                  value={form.values.password} onChange={form.bind('password')}
                  testId="auth-sign-in-password-input"
                />
              }
            />
            <FieldDescription className="text-right" data-testid="auth-sign-in-forgot-password">
              <Link to="/forgot-password" data-testid="auth-sign-in-forgot-password-link"
                className="text-xs text-zinc-400 hover:text-zinc-200">
                Forgot password?
              </Link>
            </FieldDescription>
            <FieldError role="alert" error={form.formError} data-testid="auth-sign-in-form-error" />
            {unconfirmed && (
              <FieldDescription data-testid="auth-sign-in-unconfirmed">
                That email is not confirmed yet.{' '}
                <button type="button" onClick={resend} data-testid="auth-sign-in-resend-otp"
                  className="text-brand-400 hover:text-brand-300 underline underline-offset-4">
                  Resend the code
                </button>
              </FieldDescription>
            )}
            <AuthSubmitButton busy={form.busy} testId="auth-sign-in-submit" className="w-full">
              Sign in
            </AuthSubmitButton>
          </AuthFieldGroup>
        </AuthFormRoot>
        <FieldDescription className="mt-4 text-center" data-testid="auth-sign-in-footer">
          New here?{' '}
          <Link to="/register" data-testid="auth-sign-in-to-sign-up-link" className="underline underline-offset-4">
            Create an account
          </Link>
        </FieldDescription>
      </CardContent>
    </Card>
  );
};
