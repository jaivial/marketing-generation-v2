// Card â shadcn card surface, tuned to the zinc-900/brand palette.
import { cn } from '../../../lib/utils';

const surface = 'rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-2xl';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-card" className={cn(surface, 'text-zinc-100', className)} />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-card-header" className={cn('flex flex-col gap-1.5 p-6 pb-0', className)} />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h1 {...props} data-slot="auth-card-title" className={cn('text-xl font-semibold font-display tracking-tight', className)} />
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className, ...props }) => (
  <p {...props} data-slot="auth-card-description" className={cn('text-sm text-zinc-400', className)} />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-card-content" className={cn('p-6', className)} />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div {...props} data-slot="auth-card-footer" className={cn('flex items-center p-6 pt-0', className)} />
);
