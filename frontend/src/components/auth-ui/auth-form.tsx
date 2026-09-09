// Auth form plumbing: plain React state standing in for the react-form hook
// the registry source used. One hook + four presentational pieces, reused by
// the sign-in, sign-up and confirm cards.
// observation point: `ui.auth.form`.
import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { InputGroupAddon, InputGroupButton, InputGroupInput } from './ui/input-group';
import { Spinner } from './ui/spinner';

export type AuthFormValues = Record<string, string>;
export type AuthFieldErrors = Record<string, string | undefined>;

/** Our equivalent of the core `normalizeAuthFormServerError` helper. */
export function authFormServerError(error: unknown, fallback: string): string {
  const message = (error as any)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

export function useAuthForm<T extends AuthFormValues>(
  initial: T,
  validate?: (values: T) => AuthFieldErrors,
) {
  const [values, setValues] = useState<T>(initial);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Change handler factory: clears that field's error as the user types. */
  const bind = (name: keyof T & string) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setFormError(null);
  };

  async function submit(action: (values: T) => Promise<void>): Promise<boolean> {
    const found = validate?.(values) ?? {};
    if (Object.values(found).some(Boolean)) { setFieldErrors(found); return false; }
    setFormError(null);
    setBusy(true);
    try {
      await action(values);
      return true;
    } catch (error) {
      setFormError(authFormServerError(error, 'Unable to submit this form. Try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { values, bind, fieldErrors, formError, setFormError, busy, submit };
}

export type AuthFormFieldProps = {
  /** Render your own control (input-group, otp, ...) instead of a plain input. */
  control?: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  label: React.ReactNode;
  testId: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  onChange?: (value: string) => void;
  value?: string;
};

export const AuthFormField: React.FC<AuthFormFieldProps> = ({
  control, description, error, label, testId, className, ...input
}) => (
  <Field invalid={!!error} className={className}>
    <FieldLabel htmlFor={input.id}>{label}</FieldLabel>
    {control ?? <Input {...input} onChange={(e) => input.onChange?.(e.target.value)} aria-invalid={!!error || undefined} data-testid={testId} />}
    {description ? <FieldDescription>{description}</FieldDescription> : null}
    <FieldError error={error} data-testid={`${testId}-error`} />
  </Field>
);

/** Password input with the registry's reveal toggle. */
export const AuthPasswordInput: React.FC<{
  value: string; onChange: (value: string) => void; testId: string; disabled?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>> = ({
  value, onChange, testId, disabled, ...props
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative flex items-center" data-slot="auth-password-input">
      <InputGroupInput
        {...props}
        type={visible ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={props['aria-invalid']}
        data-testid={testId}
        className="pr-10"
      />
      <InputGroupAddon>
        <InputGroupButton
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          data-testid={`${testId}-toggle`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {visible
              ? <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></>
              : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}
          </svg>
        </InputGroupButton>
      </InputGroupAddon>
    </div>
  );
};

export const AuthFormRoot: React.FC<React.FormHTMLAttributes<HTMLFormElement>> = ({ className, ...props }) => (
  <form {...props} noValidate data-slot="auth-form" className={cn('flex flex-col gap-6', className)} />
);

export const AuthFieldGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <FieldGroup {...props} data-slot="auth-field-group" className={className} />
);

export const AuthSubmitButton: React.FC<{
  busy?: boolean; children: React.ReactNode; testId: string; className?: string;
}> = ({ busy, children, testId, className }) => (
  <Button type="submit" disabled={busy} aria-busy={busy || undefined} data-testid={testId} className={className}>
    {busy ? <Spinner /> : null}
    {children}
  </Button>
);

// Field validators (the registry used core helpers for these).
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string, message = 'Enter a valid email address.'): string | undefined {
  return EMAIL_PATTERN.test(email.trim()) ? undefined : message;
}

export function validateRequired(value: string, message = 'This field is required.'): string | undefined {
  return value.trim() ? undefined : message;
}

export function validateMinLength(value: string, min: number, message?: string): string | undefined {
  return value.length >= min ? undefined : message || `Use at least ${min} characters.`;
}
