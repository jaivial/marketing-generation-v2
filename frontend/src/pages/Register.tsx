// Register page - create the account, then confirm it with the mailed OTP.
//
// POST /api/auth/register      201 -> "check your email" + the code input
//                              409 -> address already taken
// POST /api/auth/confirm-otp   -> swaps the code for a confirmed-session JWT
// observation point: `ui.auth.register.page`.
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/auth-ui/auth-shell';
import { AuthRedirect } from '../components/auth-ui/auth-redirect';
import { SignUpCard } from '../components/auth-ui/sign-up';
import { ConfirmOtpCard } from '../components/auth-ui/confirm-otp';

const Register: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // A code may still be in flight from a previous attempt: ?email= restores it.
  useEffect(() => {
    const emailed = params.get('email');
    if (emailed) setPendingEmail(emailed);
  }, [params]);

  return (
    <AuthShell>
      <AuthRedirect redirectTo="/dashboard">
        {pendingEmail ? (
          <>
            <p data-testid="auth-register-check-email"
              className="mb-3 text-center text-sm text-emerald-400">
              Check your email - we sent a 6-digit code.
            </p>
            <ConfirmOtpCard
              email={pendingEmail} scope="auth-register-otp"
              onConfirmed={() => navigate('/dashboard')}
            />
          </>
        ) : (
          <SignUpCard onOtpRequired={setPendingEmail} />
        )}
      </AuthRedirect>
    </AuthShell>
  );
};

export default Register;
