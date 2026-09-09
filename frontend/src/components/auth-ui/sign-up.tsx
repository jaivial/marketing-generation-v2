// SignUpCard â lifted from the radix-nova sign-up registry item (name, email,
// password + strength meter, confirm password) and rebound to our register
// call. The mailed 6-digit code is entered in the inline ConfirmOtpCard step.
// observation point: `ui.auth.signup.card` (backend pairs it with `ui.auth.register`).
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth-provider';
import {
  AuthFieldGroup, AuthFormField, AuthFormRoot, AuthPasswordInput,
  AuthSubmitButton, useAuthForm, validateEmail, validateMinLength, validateRequired,
} from './auth-form';
import { PasswordStrengthMeter } from './password-strength-meter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { FieldDescription, FieldError } from './ui/field';

export const MIN_PASSWORD_LENGTH = 8;

export type SignUpCardProps = {
  className?: string;
  /** Fired once the backend accepted the sign-up and mailed the code. */
  onOtpRequired: (email: string) => void;
};

export const SignUpCard: React.FC<SignUpCardProps> = ({ className, onOtpRequired }) => {
  const { register } = useAuth();

  const form = useAuthForm(
    { name: '', email: '', password: '', confirmPassword: '' },
    (v) => ({
      name: validateRequired(v.name, 'Tell us your name.'),
      email: validateEmail(v.email) ?? validateRequired(v.email),
      password: validateMinLength(v.password, MIN_PASSWORD_LENGTH),
      confirmPassword:
        v.password === v.confirmPassword ? undefined : 'Passwords do not match.',
    }),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void form.submit(async (values) => {
      try {
        await register(values.name.trim(), values.email.trim(), values.password);
        onOtpRequired(values.email.trim());
      } catch (error: any) {
        if (error?.status === 409) error.message = 'That email is already registered - sign in instead.';
        throw error;
      }
    });
  };

  return (
    <Card data-testid="auth-sign-up-card" className={className}>
      <CardHeader>
        <CardTitle data-testid="auth-sign-up-title">Create your account</CardTitle>
        <CardDescription data-testid="auth-sign-up-description">
          One account, one workspace. We email a code to confirm your address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthFormRoot onSubmit={submit} data-testid="auth-sign-up-form">
          <AuthFieldGroup>
            <AuthFormField
              id="auth-sign-up-name" name="name" label="Name" autoComplete="name"
              placeholder="Jaime Ferrer" required
              value={form.values.name} onChange={form.bind('name')}
              error={form.fieldErrors.name} testId="auth-sign-up-name-input"
            />
            <AuthFormField
              id="auth-sign-up-email" name="email" type="email" label="Email"
              autoComplete="email" placeholder="you@company.com" required
              value={form.values.email} onChange={form.bind('email')}
              error={form.fieldErrors.email} testId="auth-sign-up-email-input"
            />
            <AuthFormField
              id="auth-sign-up-password" name="password" label="Password"
              error={form.fieldErrors.password} testId="auth-sign-up-password-input"
              description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              control={
                <>
                  <AuthPasswordInput
                    id="auth-sign-up-password" name="password" autoComplete="new-password"
                    placeholder="Create a password" required maxLength={72}
                    aria-invalid={!!form.fieldErrors.password || undefined}
                    value={form.values.password} onChange={form.bind('password')}
                    testId="auth-sign-up-password-input"
                  />
                  <PasswordStrengthMeter password={form.values.password} />
                </>
              }
            />
            <AuthFormField
              id="auth-sign-up-confirm-password" name="confirmPassword" label="Confirm password"
              autoComplete="new-password" placeholder="Repeat the password" required
              value={form.values.confirmPassword} onChange={form.bind('confirmPassword')}
              error={form.fieldErrors.confirmPassword} testId="auth-sign-up-confirm-password-input"
            />
            <FieldError role="alert" error={form.formError} data-testid="auth-sign-up-form-error" />
            <AuthSubmitButton busy={form.busy} testId="auth-sign-up-submit" className="w-full">
              Create account
            </AuthSubmitButton>
          </AuthFieldGroup>
        </AuthFormRoot>
        <FieldDescription className="mt-4 text-center" data-testid="auth-sign-up-footer">
          Already have an account?{' '}
          <Link to="/login" data-testid="auth-sign-up-to-sign-in-link" className="underline underline-offset-4">
            Sign in
          </Link>
        </FieldDescription>
      </CardContent>
    </Card>
  );
};
