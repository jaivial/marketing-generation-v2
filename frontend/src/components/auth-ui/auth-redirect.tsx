// AuthRedirect â the registry's session-aware redirect, bound to our store.
// Signed-in visitors of /login, /register and /confirm are bounced to
// /dashboard; the protected-route half of the contract lives in lib/guard.tsx.
// observation point: `ui.auth.redirect`.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth-provider';
import { Spinner } from './ui/spinner';
import { cn } from '../../lib/utils';

export type AuthRedirectProps = {
  /** Where an already-authenticated principal is sent. */
  redirectTo?: string;
  /** Rendered for guests (the actual auth card). */
  children: React.ReactNode;
  className?: string;
};

export const AuthRedirect: React.FC<AuthRedirectProps> = ({
  children, redirectTo = '/dashboard', className,
}) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // `from` keeps the post-login bounce intact for guard.tsx redirected hits.
  const from = (location.state as { from?: string } | null)?.from;

  if (loading) {
    return (
      <div data-testid="auth-redirect-loading" className={cn('flex items-center justify-center py-10', className)}>
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to={from && from !== location.pathname ? from : redirectTo} replace data-testid="auth-redirect-bounce" />;
  }
  return <>{children}</>;
};
