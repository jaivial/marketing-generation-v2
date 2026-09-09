// Reset password page - swap the emailed token for a new password.
//
// GET  /reset-password?token=<jwt>  no token -> "Missing reset token" notice
// POST /api/auth/reset-password     200 -> /login, 400 -> dead-link notice
// observation point: `ui.auth.reset-password.page`.
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/auth-ui/auth-shell';
import { AuthRedirect } from '../components/auth-ui/auth-redirect';
import { ResetPasswordCard } from '../components/auth-ui/ResetPasswordCard';

const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <AuthShell>
      <AuthRedirect redirectTo="/dashboard">
        <ResetPasswordCard token={token} />
      </AuthRedirect>
    </AuthShell>
  );
};

export default ResetPassword;
