// Field set â label/description/error grouping lifted from the shadcn field
// registry item, bound to our own error contract (a plain string).
import { cn } from '../../../lib/utils';

export const Field: React.FC<React.HTMLAttributes<HTMLDivElement> & { invalid?: boolean }> = ({
  className, invalid, ...props
}) => (
  <div {...props} data-slot="auth-field" data-invalid={invalid ? 'true' : undefined}
    className={cn('flex flex-col gap-2', className)} />
);

export const FieldGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-field-group" className={cn('flex flex-col gap-4', className)} />
);

export const FieldLabel: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label {...props} data-slot="auth-field-label" className={cn('text-[13px] font-medium text-zinc-300', className)} />
);

export const FieldDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, ...props }) => (
  <p {...props} data-slot="auth-field-description" className={cn('text-xs leading-relaxed text-zinc-500', className)} />
);

export const FieldError: React.FC<React.HTMLAttributes<HTMLElement> & { error?: string | null }> = ({
  className, error, children, ...props
}) => {
  const message = error ?? (typeof children === 'string' ? children : null);
  if (!message) return null;
  return (
    <p {...props} role="alert" data-slot="auth-field-error" className={cn('text-xs text-rose-400', className)}>
      {message}
    </p>
  );
};

export const FieldSeparator: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div {...props} data-slot="auth-field-separator" className={cn('flex items-center gap-3 text-xs text-zinc-500', className)}>
    <span className="h-px flex-1 bg-zinc-800" />
    {children}
    <span className="h-px flex-1 bg-zinc-800" />
  </div>
);
