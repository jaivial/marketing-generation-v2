import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Icon } from './components/ui';
import { StoreProvider } from './lib/store';
import Shell from './components/Shell';
import AdminShell from './components/AdminShell';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import NewCampaign from './pages/NewCampaign';
import Campaigns from './pages/Campaigns';
import Detail from './pages/Detail';
import Library from './pages/Library';
import Integrations from './pages/Integrations';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import Register from './pages/Register';
import Confirm from './pages/Confirm';
import Onboarding from './pages/Onboarding';
import AdminUsers from './pages/AdminUsers';
import AdminSystem from './pages/AdminSystem';
import AdminLogs from './pages/AdminLogs';
import AdminAcl from './pages/AdminAcl';
import { RequirePermission } from './lib/guard';
import { AuthRedirect } from './components/auth-ui/auth-redirect';
import { SignOut } from './components/auth-ui/sign-out';

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center">
        <Icon name="helpCircle" size={48} className="text-zinc-500 mb-4" strokeWidth={1.5} />
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-zinc-400 mt-2">The page you're looking for doesn't exist.</p>
        <button onClick={() => navigate('/')} className="btn btn-primary mt-6 text-sm">Back to home</button>
      </div>
    </div>
  );
};

/**
 * The single place where every React route declares its required permission.
 * The guard component reads this and either renders the page, redirects to
 * /login (anonymous), or renders the access-denied screen (auth'd but
 * unauthorised).
 *
 * This is the frontend mirror of `app.main.ACLMiddleware` and means a user
 * can never even render a forbidden page — the API will also 403, but
 * failing fast on the client is nicer UX.
 */
const App: React.FC = () => {
  return (
    <StoreProvider>
      <Routes>
        {/* Public / unauthenticated */}
        <Route path="/" element={<RequirePermission permission="page:landing"><Landing /></RequirePermission>} />
        <Route path="/pricing" element={<RequirePermission permission="page:pricing"><Pricing /></RequirePermission>} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/confirm" element={<Confirm />} />
        {/* AuthRedirect bounces signed-in visitors of the auth views above to /dashboard. */}
        <Route path="/logout" element={<SignOut />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Authenticated user */}
        <Route element={<Shell />}>
          <Route path="/dashboard" element={<RequirePermission permission="page:dashboard"><Dashboard /></RequirePermission>} />
          <Route path="/new" element={<RequirePermission permission="campaign:create"><NewCampaign /></RequirePermission>} />
          <Route path="/campaigns" element={<RequirePermission permission="page:campaigns.own"><Campaigns /></RequirePermission>} />
          <Route path="/campaigns/:id" element={<RequirePermission permission="page:campaigns.own"><Detail /></RequirePermission>} />
          <Route path="/library" element={<RequirePermission permission="page:library"><Library /></RequirePermission>} />
          <Route path="/integrations" element={<RequirePermission permission="page:integrations"><Integrations /></RequirePermission>} />
          <Route path="/analytics" element={<RequirePermission permission="page:analytics.own"><Analytics /></RequirePermission>} />
          <Route path="/settings" element={<RequirePermission permission="page:settings.own"><Settings /></RequirePermission>} />
        </Route>

        {/* Root-only admin pages — share the Shell + AdminShell layout. */}
        <Route element={<RequirePermission permission="admin:users"><Shell><AdminShell /></Shell></RequirePermission>}>
          <Route path="/admin/users" element={<AdminUsers />} />
        </Route>
        <Route element={<RequirePermission permission="admin:system"><Shell><AdminShell /></Shell></RequirePermission>}>
          <Route path="/admin/system" element={<AdminSystem />} />
          <Route path="/admin/acl" element={<AdminAcl />} />
        </Route>
        <Route element={<RequirePermission permission="admin:logs"><Shell><AdminShell /></Shell></RequirePermission>}>
          <Route path="/admin/logs" element={<AdminLogs />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </StoreProvider>
  );
};

export default App;
