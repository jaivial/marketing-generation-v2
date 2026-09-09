// SignOut â drops the JWT on mount and hands the principal back to /login.
// Mounted by the /logout route so a sign-out is deep-linkable.
// observation point: `ui.auth.signout`.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth-provider';
import { Spinner } from './ui/spinner';
import { cn } from '../../lib/utils';

export const SignOut: React.FC<{ className?: string }> = ({ className }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  return (
    <div data-testid="auth-sign-out" className={cn('flex items-center justify-center py-10 gap-2 text-sm text-zinc-500', className)}>
      <Spinner className="h-4 w-4" />
      Signing you outâ¦
    </div>
  );
};
