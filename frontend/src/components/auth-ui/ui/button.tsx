// Button â thin shadcn-shaped wrapper over the existing `.btn*` rules so the
// auth cards stay visually identical to the rest of the SPA.
import { cn } from '../../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', className, type, ...props }) => (
  <button
    {...props}
    type={type ?? 'button'}
    data-slot="auth-button"
    className={cn('btn', VARIANT[variant], className)}
  />
);
