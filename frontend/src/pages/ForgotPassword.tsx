// Forgot password page - ask for a reset mail, then show the inbox panel.
//
// POST /api/auth/forgot-password  200 -> "Check your inbox" (unknown emails
//                                        get the very same panel: no enumeration)
//                                 429 -> retry hint toasted, form stays open
// observation point: `ui.auth.forgot-password.page`.
import React, { useState } from 'react';
import { AuthShell } from '../components/auth-ui/auth-shell';
import { AuthRedirect } from '../components/auth-ui/auth-redirect';
import { ForgotPasswordCard, ResetLinkSentCard } from '../components/auth-ui/ForgotPasswordCard';

const ForgotPassword: React.FC = () => {
  // null -> request step; a string -> the mail went out for that address.
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  return (
    <AuthShell>
      <AuthRedirect redirectTo="/dashboard">
        {sentEmail === null ? (
          <ForgotPasswordCard onSent={setSentEmail} />
        ) : (
          <ResetLinkSentCard
            email={sentEmail} onUseDifferentEmail={() => setSentEmail(null)}
          />
        )}
      </AuthRedirect>
    </AuthShell>
  );
};

export default ForgotPassword;
