// Shell — wraps a page with Sidebar (md+), MobileHeader (<md), MobileDrawer (<md),
// BottomNav (<md). Provides responsive padding and accounts for the bottom-nav on mobile.

import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import MobileHeader, { deriveTitle, deriveBreadcrumb } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import BottomNav from './BottomNav';
import { ToastContainer } from './ui';
import { useStore } from '../lib/store';

const Shell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { drawerOpen } = useStore();

  // Close drawer on route change.
  const { setDrawerOpen } = useStore();
  React.useEffect(() => {
    setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Routes that don't need the shell wrapper (e.g. landing, pricing).
  const isStandalone = location.pathname === '/' || location.pathname === '/pricing';

  if (isStandalone) {
    return (
      <>
        <Outlet />
        <MobileDrawer />
        <ToastContainer />
      </>
    );
  }

  const title = deriveTitle(location.pathname);
  const breadcrumb = deriveBreadcrumb(location.pathname);

  return (
    <div className="flex bg-zinc-950 h-[100dvh] min-h-screen overflow-hidden">
      <Sidebar />
      <MobileDrawer />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overscroll-none">
        <MobileHeader title={title} breadcrumb={breadcrumb || undefined} />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 max-w-7xl w-full page-enter overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-8">
          <Outlet />
        </main>
        <BottomNav />
      </div>
      <ToastContainer />
    </div>
  );
};

export default Shell;
