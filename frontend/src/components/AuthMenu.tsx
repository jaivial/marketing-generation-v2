// AuthMenu - the account control shown in the top bar.
//
// Signed in  -> the principal's email + "Sign out".
// Signed out -> "Sign in" / "Create account".
//
// observation point: `ui.auth.menu` - the sign-out click is the single place
// where a browser session is dropped (token + principal).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { Icon } from './ui';

/** `scope` keeps every data-testid unique even when the menu is mounted twice. */
const AuthMenu: React.FC<{ scope?: string }> = ({ scope = 'topbar' }) => {
  const { isAuthenticated, email, logout, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <span data-testid={`${scope}-auth-menu-loading`} className="text-xs text-zinc-600" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link to="/login" data-testid={`${scope}-auth-menu-signin-link`}
          className="text-sm text-zinc-400 hover:text-white whitespace-nowrap">
          Sign in
        </Link>
        <Link to="/register" data-testid={`${scope}-auth-menu-register-link`}
          className="btn btn-primary text-xs px-3 py-1.5 whitespace-nowrap">
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
      <span data-testid={`${scope}-auth-menu-email`} className="text-xs text-zinc-500 truncate hidden sm:inline">
        {email}
      </span>
      <button
        type="button"
        onClick={() => { logout(); navigate('/login'); }}
        data-testid={`${scope}-auth-menu-signout-button`}
        className="btn btn-secondary text-xs px-2.5 py-1.5"
      >
        <Icon name="logOut" size={14} />
        Sign out
      </button>
    </div>
  );
};

export default AuthMenu;
