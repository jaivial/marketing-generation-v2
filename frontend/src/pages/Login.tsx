// Login page - the lifted SignInCard inside the auth shell.
//
// POST /api/auth/login  200 -> JWT stored, on to /dashboard
//                       401 -> bad credentials
//                       403 -> unconfirmed address: the card offers a resend
// observation point: `ui.auth.login.page`.
import React from 'react';
import { AuthShell } from '../components/auth-ui/auth-shell';
import { AuthRedirect } from '../components/auth-ui/auth-redirect';
import { SignInCard } from '../components/auth-ui/sign-in';

const Login: React.FC = () => (
  <AuthShell>
    <AuthRedirect redirectTo="/dashboard">
      <SignInCard />
    </AuthRedirect>
  </AuthShell>
);

export default Login;
