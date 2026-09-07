// App entry — wires router + render loop + registers pages.
import { router } from './lib/router.js';
import { mount } from './lib/dom.js';

// Pages are loaded lazily to avoid circular imports.
const registerPages = async () => {
  const [
    Landing, Dashboard, NewCampaign, Campaigns, Library, Detail,
    Integrations, Analytics, Settings, Pricing,
  ] = await Promise.all([
    import('./pages/landing.js'),
    import('./pages/dashboard.js'),
    import('./pages/new-campaign.js'),
    import('./pages/campaigns.js'),
    import('./pages/library.js'),
    import('./pages/detail.js'),
    import('./pages/integrations.js'),
    import('./pages/analytics.js'),
    import('./pages/settings.js'),
    import('./pages/pricing.js'),
  ]);
  router.register({
    '/':              Landing.Landing,
    '/dashboard':     Dashboard.Dashboard,
    '/new':           NewCampaign.NewCampaign,
    '/campaigns':     Campaigns.Campaigns,
    '/campaigns/:id': Detail.Detail,
    '/library':       Library.Library,
    '/integrations':  Integrations.Integrations,
    '/analytics':     Analytics.Analytics,
    '/settings':      Settings.Settings,
    '/pricing':       Pricing.Pricing,
  });
};

const render = ({ route, params }) => {
  // `route` is the matched handler (already resolved by Router.resolve)
  const handler = route;
  const node = handler ? handler(params) : null;
  mount(document.getElementById('app'), node);
  const main = document.querySelector('main');
  if (main) main.scrollTo?.(0, 0);
  window.scrollTo({ top: 0, behavior: 'instant' });
};

registerPages().then(() => {
  router.onChange(render);
  // Close mobile drawer on route change
  if (!window.__mfDrawerCloseBound) {
    window.__mfDrawerCloseBound = true;
    router.onChange(() => {
      document.documentElement.classList.remove('drawer-open');
      document.documentElement.classList.remove('landing-menu-open');
    });
  }
  router.start();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    const search = document.querySelector('input[placeholder*="Search"]');
    if (search) { search.focus(); search.select(); }
  }
  if (e.key === 'n' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && !e.metaKey && !e.ctrlKey) {
    router.navigate('/new');
  }
});

window.MF = { router };
