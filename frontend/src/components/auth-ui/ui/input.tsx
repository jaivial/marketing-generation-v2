// Input â styled with the existing `.input` rules so both worlds match.
import { cn } from '../../../lib/utils';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input {...props} data-slot="auth-input" className={cn('input', className)} />
);
