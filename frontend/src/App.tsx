import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import AdminUsers from './pages/AdminUsers';
import AdminSystem from './pages/AdminSystem';
import AdminLogs from './pages/AdminLogs';
import AdminAcl from './pages/AdminAcl';
import { RequirePermission } from './lib/guard';

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center">
        <Icon name="helpCircle" size={48} className="text-zinc-500 mb-4" strokeWidth={1.5} />
        <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
        <p className="text-zinc-400 mt-2">{t('notFound.desc')}</p>
        <button onClick={() => navigate('/')} className="btn btn-primary mt-6 text-sm">{t('notFound.cta')}</button>
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
