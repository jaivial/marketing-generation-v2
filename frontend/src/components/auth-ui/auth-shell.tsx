// AuthShell â the full-page frame the auth cards sit in (grid backdrop, logo,
// centered column). One layout for sign-in, sign-up and confirm.
// observation point: `ui.auth.shell`.
import { Link } from 'react-router-dom';
import { Logo } from '../ui';
import { cn } from '../../lib/utils';

export const AuthShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div data-testid="auth-shell" className="min-h-screen bg-zinc-950 text-zinc-100 bg-grid">
    <header className="border-b border-zinc-800/80 backdrop-blur bg-zinc-950/70 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <Link to="/" data-testid="auth-shell-logo-link" aria-label="MarketingForge home">
          <Logo />
        </Link>
      </div>
    </header>
    <main className="flex flex-col items-center px-4 sm:px-6 py-10 sm:py-16">
      <div data-testid="auth-shell-card-slot" className={cn('w-full max-w-sm animate-fade-in', className)}>
        {children}
      </div>
    </main>
  </div>
);
