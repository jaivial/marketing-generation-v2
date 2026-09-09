// Spinner â the single loading glyph the auth cards use.
// observation point: `ui.auth.spinner`.
import { Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <Loader2 size={16} strokeWidth={2} aria-hidden="true"
    data-testid="auth-ui-spinner" className={cn('animate-spin text-zinc-400', className)} />
);
