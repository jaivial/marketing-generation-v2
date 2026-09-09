// PasswordStrengthMeter â four-segment hint lifted from the registry source;
// the score is a hint only, the backend stays the authority on passwords.
// observation point: `ui.auth.password.strength`.
import { cn } from '../../lib/utils';

type Level = 'weak' | 'fair' | 'good' | 'strong';

const SEGMENTS = [1, 2, 3, 4] as const;

const SEGMENT_COLOR: Record<Level, string> = {
  weak: 'bg-red-500',
  fair: 'bg-amber-500',
  good: 'bg-brand-400',
  strong: 'bg-emerald-500',
};

const LABEL: Record<Level, string> = {
  weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong',
};

const MIN_PASSWORD_LENGTH = 8;

export function evaluatePasswordStrength(password: string): { level: Level; score: number } {
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const score = Math.min(4, Math.floor(password.length / MIN_PASSWORD_LENGTH) + kinds - 1);
  const level: Level = score <= 1 ? 'weak' : score === 2 ? 'fair' : score === 3 ? 'good' : 'strong';
  return { level, score };
}

export const PasswordStrengthMeter: React.FC<{ password: string; className?: string }> = ({
  password, className,
}) => {
  if (!password) return null;
  const { level, score } = evaluatePasswordStrength(password);

  return (
    <div data-slot="auth-password-strength" data-testid="auth-password-strength" className={cn('flex flex-col gap-1.5', className)}>
      <div aria-hidden="true" className="flex gap-1">
        {SEGMENTS.map((segment) => (
          <span key={segment}
            className={cn('h-1 flex-1 rounded-full', segment <= score ? SEGMENT_COLOR[level] : 'bg-zinc-800')} />
        ))}
      </div>
      <p aria-live="polite" className="text-xs text-zinc-500">
        Password strength: {LABEL[level]}
      </p>
    </div>
  );
};
