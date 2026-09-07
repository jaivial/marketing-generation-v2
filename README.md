# Marketing Generation

Minimal Python service that orchestrates AI to generate marketing video campaigns.

## Pipeline
1. **Source** — local files OR website scraped via `lightpanda fetch`.
2. **Plan** — `MiniMax-M3` via MiniMax REST → JSON `{hook, tagline, cta, audience, tone}`.
3. **Frames** — `gpt-image-2.0image` via `wavespeed` CLI, **max 1 per 2s** (15s→8, 30s→15, 45s→23).
4. **Script** — high-quality VO script from `MiniMax-M3`.
5. **Video** — frames + master prompt + duration → `alibaba/wan-3.0/reference-to-video` via `wavespeed` (https://wavespeed.ai/models/alibaba/wan-3.0/reference-to-video). The orchestrator asks the LLM to decide between **single-scene** (one wavespeed call with every reference image) and **multi-scene** (up to 3 wavespeed calls, each one logical scene, stitched with ffmpeg). Screenshots of the source web app can be captured via `agent-browser` and embedded as references.

## Architecture (SOLID)
- **S** — each module has one job (`config`, `protocols`, `*_client`, `orchestrator`, `routes`).
- **O** — add a new model/source by adding a constant or new class, never editing call sites.
- **L** — every `ChatClient` / `MediaClient` / `SourceReader` is interchangeable via Protocols.
- **I** — Protocols are tiny (1-3 methods); no client carries unused surface.
- **D** — `Orchestrator` & routes depend on `Protocol`s; the container wires concretes.

## API
- `POST /api/campaigns` — **SSE stream** of events: `plan | frame | script | video | done | error`.
- `POST /api/campaigns/sync` — same, returned as JSON list.
- `GET  /api/health` — health probe.
- `GET /` — full SPA shell (dark-theme dashboard).

## Public URL
**https://marketing-generation.menustudioai.com** (proxied via Cloudflare)

## Deployment

### Run as systemd service (current production setup)
```bash
sudo systemctl enable --now marketing-generation  # runs uvicorn on 127.0.0.1:9105
sudo systemctl reload nginx                       # picks up the marketing-generation vhost
```
The systemd unit is the single source of truth for the app process. Don't launch
`uvicorn` by hand — that leaves duplicate instances on stray ports.

`marketing-generation.socket` was disabled on 2026-09-07: it listened on `:9000`,
which nothing uses (the service binds `:9105` itself).

### Nginx vhost
Served by the **system nginx** (`systemctl nginx`), exactly like every other site
on this box. Config lives in the standard location:
- `/etc/nginx/sites-available/marketing-generation.menustudioai.com`
- symlinked from `/etc/nginx/sites-enabled/`

Layout:
- `:80` — Cloudflare origin (serves the app) + ACME challenge (`/var/www/certbot`)
- `:443` — TLS (Let's Encrypt, auto-renew via certbot webroot)
- `:7100` — direct admin access, no TLS, bypasses Cloudflare
- `server_name marketing-generation.menustudioai.com`
- `proxy_pass http://127.0.0.1:9105`
- SSE-friendly: `proxy_buffering off`, `proxy_read_timeout 3600s`
- CF real-IP from Cloudflare IP ranges

> **Why `:80` does not redirect to HTTPS.** This hostname is Cloudflare-*proxied*
> with SSL mode **Flexible**, so Cloudflare fetches the origin over port 80. A
> `return 301 https://$host$request_uri` on `:80` gets handed straight back to the
> browser, which re-requests over HTTPS, hits Cloudflare again, and loops forever
> (`ERR_TOO_MANY_REDIRECTS`). Serving the app on `:80` is correct under both
> Flexible and Full. Users still always get HTTPS via Cloudflare + HSTS.
>
> Sibling hosts like `cortex-dev` *can* redirect on `:80` only because they are
> DNS-only (grey cloud) and terminate TLS at this nginx directly.

Apply changes with:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Do not** run `/home/jaime/nginx` as a second user-space nginx. That setup was
> retired on 2026-09-07: its config used `listen 80 default_server`, so starting it
> stole port 80 from the system nginx and took every site on the box offline.

### Cloudflare DNS
Record `A marketing-generation.menustudioai.com → 65.109.100.94 (proxied)`,
managed via API with the jaimebillanueba99@gmail.com account.

### Docker (alternative)
```bash
docker compose up --build
# open http://localhost:8000
```

## Environment
Copy `.env.example` to `.env` and fill in:
- `MINIMAX_API_KEY`
- `WAVESPEED_API_KEY`
- `LIGHTPANDA_BIN` (path to `lightpanda` binary)

## Frontend (SPA)

Built with **React 18 + TypeScript + Vite + Tailwind CSS**. Dark-theme SPA
with full responsive layout, down to 230px screens.

### Build
```bash
cd frontend
npm install
npm run build         # outputs to ../static/dist/
```

The production build is served by FastAPI as static assets — no separate
frontend server needed.

### Pages
- `/`              — Landing / onboarding hero with the 4-step wizard entry-point.
- `/dashboard`     — Welcome screen with KPI cards, recent campaigns table, activity feed.
- `/new`           — **4-step wizard** (Source → Brief → Style & duration → Generate) with live SSE pipeline UI (plan / frames / script / video rendered as events arrive).
- `/campaigns`     — Searchable, filterable table of every campaign.
- `/campaigns/:id` — Campaign detail view: hero video player, frame timeline, script, source, plan, activity log.
- `/library`       — Asset grid (videos / frames / scripts) with tabs and search.
- `/integrations`  — Connected providers (MiniMax, GPT-Image, Wavespeed, agent-browser) + storage/publishing tools.
- `/analytics`     — KPI grid + bar chart + top styles breakdown.
- `/settings`      — Profile, Security, Billing, Team, API keys (tabbed).
- `/pricing`       — Public pricing page (3 tiers + FAQ).

### Mobile UX (down to 230px)
- **Bottom navigation bar** — fixed at bottom on `<md` screens with Home, Campaigns, [+ FAB], Library, More
- **Bottom "More" drawer** — opens a 2-column grid with Integrations / Analytics / Settings / Pricing
- **Collapsible sidebar** on tablet/desktop — click the `«` button to shrink to icon-only (64px)
- **Sidebar "Menu" pill** — when collapsed, a "☰ Menu" button appears top-left to expand
- **Persistent state** — sidebar collapsed/expanded preference saves to localStorage
- **Mobile header** — sticky top bar with hamburger that opens a **left-side slide-out drawer** (the primary nav: Dashboard, Campaigns, New campaign CTA, Library, Integrations, Analytics, Settings, Pricing + user)
- **Tap-outside or Escape to close** the drawer; auto-closes on route change
- **Responsive padding** — `px-3 py-4` on mobile, `sm:p-6` on tablet, `md:p-8` on desktop
- **Card layouts** — collapsed card-list on mobile, full table on desktop
- **Frame grid** — 2 columns on mobile, 3 on tablet, 4 on desktop
- **Optional login credentials** — when scraping a URL, the wizard reveals a "Site requires login?" expander with username/password fields. These are sent to the backend, forwarded to **agent-browser** (`agent-browser set credentials`), and never persisted in campaign history.

All icons use the **Lucide React** icon set (no more inline SVGs, no more emojis).

### iOS Safari compatibility
The layout is hardened against the iOS Safari "shrinking bottom nav after scroll" bug:
- **CSS** uses `min-height: 100dvh` (dynamic viewport) with `100vh` and `-webkit-fill-available` fallbacks. `html, body` are pinned to 100% with `overscroll-behavior-y: contain` to prevent rubber-band scroll from displacing fixed elements.
- **Shell root** uses `min-h-[100dvh] min-h-screen` so the page height tracks the actual visible viewport.
- **BottomNav** uses `transform: translateZ(0)` / `WebkitTransform: translateZ(0)` to force a GPU compositing layer (this is the canonical iOS Safari fix for `position: fixed` elements that get displaced when the URL bar collapses). It also has `padding-bottom: max(env(safe-area-inset-bottom), 0px)` to clear the iPhone home indicator.
- **MobileHeader** has `padding-top: env(safe-area-inset-top)` so it clears the iPhone notch / Dynamic Island.
- **Sidebar** uses `h-[100dvh]` so the desktop sidebar doesn't shrink on mobile-safari-style viewport changes.
- **Main content** has `padding-bottom: calc(4rem + env(safe-area-inset-bottom) + 0.5rem)` so scrolling content never gets hidden behind the bottom nav + home indicator.

### Console-error-free state
The smoke test (`cdp-smoke3.py`) loads every route with pre-seeded localStorage data and captures all `console.error` / `console.warn` / unhandled-exception events. As of the latest build there are **0 errors and 0 warnings** across all 10 routes (landing, dashboard, new, campaigns, campaign detail, library, integrations, analytics, settings, pricing).

### Module layout
- `frontend/src/App.tsx` — Route table + Shell wrapper.
- `frontend/src/main.tsx` — Entry point: HashRouter + StoreProvider.
- `frontend/src/lib/` — `types.ts` (Campaign, Frame, User), `store.ts` (React Context + localStorage), `api.ts` (SSE streamCampaign + REST helpers), `utils.ts` (cn, timeAgo, formatNumber, ICONS).
- `frontend/src/components/` — `Shell.tsx`, `Sidebar.tsx`, `MobileHeader.tsx`, `BottomNav.tsx`, `TopBar.tsx`, `ui.tsx` (Logo, Icon, Pill, ToastContainer, openModal, toast).
- `frontend/src/pages/` — One file per route.
- `frontend/src/styles/index.css` — Tailwind directives + custom utilities.
- `frontend/tailwind.config.js` — Custom theme (brand colors, xs breakpoint at 380px).
- `frontend/vite.config.ts` — Vite config (proxies /api to FastAPI in dev).

### Streaming UX
The wizard's "Generate" button opens an SSE stream against `POST /api/campaigns`
and updates the pipeline UI in real time as `plan`, `frame`, `script`, `video`,
`done`, and `error` events arrive. Frames appear one-by-one in a grid, the
script is shown as soon as it's ready, and the final `<video>` element renders
when the URL is received.

### Keyboard shortcuts
- `/` — focus search
- `n` — new campaign
- `esc` — close modal

### Mobile UX
- **Fully responsive down to 230px** screens — every page tested and verified
- **Collapsible sidebar** on tablet/desktop:
  - Click the `«` button in the sidebar header to collapse to icon-only (64px)
  - Click the purple edge-handle on the right edge of the sidebar
  - Click the "☰ Menu" pill in the top-left corner to expand again
  - State persists in `localStorage`
- **Slide-over drawer** on mobile:
  - Tap the hamburger to open the drawer
  - Drawer width scales with viewport (80vw, capped at 288px) — never covers the whole screen
  - Swipe left to close, swipe right from the left edge to open
  - Tap the dark backdrop to close
  - Auto-closes when navigating between pages
- **Touch-friendly tap targets** throughout (≥36×36px)
