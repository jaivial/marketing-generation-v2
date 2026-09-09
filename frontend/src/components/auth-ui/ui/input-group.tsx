// Input group â input with trailing addons (password reveal, resend link).
import { cn } from '../../../lib/utils';

export const InputGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-input-group" className={cn('relative flex w-full items-center', className)} />
);

export const InputGroupInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
  <input {...props} data-slot="auth-input-group-input" className={cn('input pr-10', className)} />
);

export const InputGroupAddon: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-input-group-addon" className={cn('absolute right-1.5 flex items-center', className)} />
);

export const InputGroupButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...props }) => (
  <button {...props} type={props.type ?? 'button'} data-slot="auth-input-group-button"
    className={cn('flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200', className)} />
);
