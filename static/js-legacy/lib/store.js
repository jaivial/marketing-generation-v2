// Reactive store with subscribe + persistence to localStorage.
export class Store {
  constructor(initial = {}, key = 'mf-store') {
    this.state = initial;
    this.key = key;
    this.listeners = new Set();
    this.load();
  }
  get() { return this.state; }
  set(patch) {
    this.state = { ...this.state, ...patch };
    this.save();
    this.emit();
  }
  replace(s) { this.state = s; this.save(); this.emit(); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.state); }
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); } catch {}
  }
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.state = { ...this.state, ...JSON.parse(raw) };
    } catch {}
  }
}

// Single-instance user + UI store.
export const user = new Store({
  name: 'Jaime',
  email: 'jaime@menustudioai.com',
  plan: 'free',
  usage: 2,
  limit: 5,
  avatar: 'from-amber-400 to-pink-500',
}, 'mf-user');

export const ui = new Store({
  sidebarOpen: true,
}, 'mf-ui');

export const history = new Store({
  items: [
    { id: 'c-001', name: 'Acme CMS launch', duration_s: 30, status: 'done',        created_at: Date.now() - 2*3600e3,  color: 'from-rose-500 to-amber-500',    source: 'https://acme-cms.io',     style: 'cinematic',  plan: { hook: 'Your data, your rules.', tagline: 'Build like a team of ten.', cta: 'Start free', audience: 'Indie devs', tone: 'Confident' } },
    { id: 'c-002', name: 'Q4 product teaser', duration_s: 15, status: 'generating', created_at: Date.now() - 12*60e3,    color: 'from-indigo-500 to-fuchsia-500', source: 'https://q4.app',           style: 'motion',     plan: null },
    { id: 'c-003', name: 'Black friday promo', duration_s: 45, status: 'draft',      created_at: Date.now() - 86400e3,    color: 'from-cyan-500 to-blue-500',     source: 'https://shop.example.com', style: 'punchy',     plan: null },
    { id: 'c-004', name: 'Holiday story',     duration_s: 30, status: 'failed',     created_at: Date.now() - 3*86400e3,  color: 'from-violet-500 to-pink-500',   source: 'https://holiday.example',  style: 'cinematic',  plan: null },
    { id: 'c-005', name: 'SaaS launch v2',    duration_s: 30, status: 'done',       created_at: Date.now() - 5*86400e3,  color: 'from-amber-500 to-orange-500',  source: 'https://saas.example.com', style: 'cinematic',  plan: { hook: 'Ship faster.', tagline: 'Less code, more product.', cta: 'Try it now', audience: 'CTOs', tone: 'Bold' } },
    { id: 'c-006', name: 'Etsy store promo',  duration_s: 15, status: 'done',       created_at: Date.now() - 7*86400e3,  color: 'from-emerald-500 to-lime-500',  source: 'https://etsy.example.com', style: 'playful',    plan: { hook: 'Handmade vibes.', tagline: 'Crafted with love.', cta: 'Shop now', audience: 'Gen Z', tone: 'Warm' } },
  ],
}, 'mf-history');
