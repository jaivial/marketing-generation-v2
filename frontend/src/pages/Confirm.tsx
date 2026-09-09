// Confirm page - swap the emailed OTP for a confirmed-session JWT.
//
// POST /api/auth/confirm-otp  -> TokenOut (JWT stored by the store)
// POST /api/auth/resend-otp   -> 202, 60s cooldown enforced backend-side
// observation point: `ui.auth.confirm.page`.
import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/auth-ui/auth-shell';
import { AuthRedirect } from '../components/auth-ui/auth-redirect';
import { ConfirmOtpCard } from '../components/auth-ui/confirm-otp';

const Confirm: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get('email') ?? '';

  return (
    <AuthShell>
      <AuthRedirect redirectTo="/dashboard">
        <ConfirmOtpCard
          email={email} scope="auth-confirm-otp"
          onConfirmed={() => navigate('/dashboard')}
        />
        <p className="mt-4 text-center">
          <Link to="/register" data-testid="auth-confirm-to-register-link"
            className="text-xs text-zinc-500 hover:text-zinc-300">
            Use a different email
          </Link>
        </p>
      </AuthRedirect>
    </AuthShell>
  );
};

export default Confirm;
