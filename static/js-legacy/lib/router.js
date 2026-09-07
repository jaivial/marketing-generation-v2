// Hash-based router. Pages receive { navigate } in props.

const routes = {};

export class Router {
  constructor() {
    this.routes = routes;
    this.defaultRoute = '/';
    this.current = null;
    this.params = {};
    this.listeners = [];
    window.addEventListener('hashchange', () => this.resolve());
  }

  register(map) {
    Object.assign(this.routes, map);
  }

  start() {
    if (!window.location.hash) window.location.hash = this.defaultRoute;
    this.resolve();
  }

  navigate(path) {
    if (window.location.hash === '#' + path) {
      this.resolve();
    } else {
      window.location.hash = path;
    }
  }

  onChange(fn) { this.listeners.push(fn); }

  resolve() {
    const raw = window.location.hash.slice(1) || this.defaultRoute;
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const match = matchRoute(path, this.routes);
    this.current = match.route;
    this.params = match.params;
    this.query = query;
    for (const fn of this.listeners) fn({ path, query, params: match.params, route: match.route });
  }
}

const matchRoute = (path, routes) => {
  if (routes[path]) return { route: routes[path], params: {} };
  for (const [pattern, route] of Object.entries(routes)) {
    if (!pattern.includes(':')) continue;
    const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
    const m = path.match(re);
    if (m) {
      const keys = (pattern.match(/:[^/]+/g) || []).map(k => k.slice(1));
      const params = {};
      keys.forEach((k, i) => params[k] = m[i + 1]);
      return { route, params };
    }
  }
  return { route: routes['/'] || notFound, params: {} };
};

const notFound = () => {
  const div = document.createElement('div');
  div.className = 'p-12 text-center';
  div.innerHTML = `<h1 class="text-2xl font-semibold">404</h1><p class="text-zinc-400 mt-2">Page not found.</p>`;
  return div;
};

export const router = new Router();
export { routes };
