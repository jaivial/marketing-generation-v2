// InputOTP â 6-slot one-time-code field lifted from the shadcn input-otp
// registry item, re-implemented on a single numeric input (no radix).
// observation point: `ui.auth.otp.input`.
import { useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';

export const OTP_LENGTH = 6;

export type InputOTPProps = {
  value: string;
  onChange: (otp: string) => void;
  /** Fires once the last digit lands, so the card can auto-submit. */
  onComplete?: (otp: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  testId: string;
  className?: string;
};

export const InputOTP: React.FC<InputOTPProps> = ({
  value, onChange, onComplete, length = OTP_LENGTH, disabled, autoFocus, testId, className,
}) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  return (
    <div
      data-slot="auth-input-otp"
      data-testid={`${testId}-otp-field`}
      className={cn('relative flex items-center gap-2', className)}
      onClick={() => ref.current?.focus()}
    >
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={`${length}-digit confirmation code`}
        data-testid={`${testId}-otp-input`}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
      />
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          data-slot="auth-input-otp-slot"
          data-active={value.length === i ? 'true' : undefined}
          className={cn(
            'flex h-11 w-9 items-center justify-center rounded-lg border bg-zinc-950 text-lg font-mono text-zinc-100 transition-colors',
            value.length === i ? 'border-brand-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]' : 'border-zinc-800',
          )}
        >
          {value[i]}
        </span>
      ))}
    </div>
  );
};
