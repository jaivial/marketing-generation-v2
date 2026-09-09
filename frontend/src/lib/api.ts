// API client: SSE streaming + REST helpers.

import type { SseEvent } from './types';

const apiBase = (typeof window !== 'undefined' && (window as any).MF_API) || '';

export interface StreamCampaignBody {
  source_kind: 'url' | 'files';
  target: string;
  duration_s: number;
  style: string;
  /** Optional HTTP basic auth credentials for sites that require login. */
  username?: string | null;
  password?: string | null;
}

/** One `event:`/`data:` pair, exactly as the backend serialises it. */
export interface SseBlock {
  event: string;
  data: any;
}

/**
 * Parse a single SSE block (already split on a blank line).
 * Shared by every SSE consumer so the wire format is decoded in one place.
 */
export function parseSseBlock(block: string): SseBlock {
  const ev = (block.match(/^event:\s*(.+)$/m) || [])[1] || 'message';
  const dt = (block.match(/^data:\s*(.+)$/m) || [])[1] || '';
  let data: any;
  try { data = JSON.parse(dt); } catch { data = dt; }
  return { event: ev, data };
}

/** Split a chunk of the SSE body into complete blocks, keeping the tail. */
export function sseBlocks(buf: string, chunk: string): { blocks: string[]; rest: string } {
  const parts = (buf + chunk).split('\n\n');
  return { blocks: parts.slice(0, -1), rest: parts[parts.length - 1] || '' };
}

export async function* streamCampaign(body: StreamCampaignBody): AsyncGenerator<SseEvent> {
  // Strip empty strings from username/password so backend treats them as null.
  const payload: any = { ...body };
  if (!payload.username) delete payload.username;
  if (!payload.password) delete payload.password;

  const r = await fetch(`${apiBase}/api/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${txt || r.statusText}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const { blocks, rest } = sseBlocks(buf, dec.decode(value, { stream: true }));
    buf = rest;
    for (const block of blocks) {
      const { event, data } = parseSseBlock(block);
      yield { event: event as any, data };
    }
  }
}

// ─── Live pipeline events (SSE) ──────────────────────────────────────────
// observation point: `ui.pipeline.events` — the backend can match these
// requests to a run via the `X-Mf-Coordination-Id` header we send.

/** Backoff floor/ramp for reconnects: 500ms, 1s, 2s, 4s, then capped at 5s. */
const SSE_BACKOFF_BASE_MS = 500;
const SSE_BACKOFF_CAP_MS = 5000;

/**
 * Subscribe to `GET /api/campaigns/{id}/events`, replaying every persisted
 * event before following live ones. Reconnects with exponential backoff on
 * error/disconnect and stops for good on `done` / `error`.
 *
 * Returns an unsubscribe function (idempotent).
 */
export function subscribeCampaignEvents(
  id: string,
  onEvent: (e: SseBlock) => void,
): () => void {
  const coordinationId = `campaign-${id}-${Math.random().toString(36).slice(2, 8)}`;
  const ctrl = new AbortController();
  let closed = false;
  let attempt = 0;

  const connect = async (): Promise<void> => {
    while (!closed && !ctrl.signal.aborted) {
      try {
        // Native EventSource cannot send the Authorization header, so the
        // stream is read with the same fetch reader streamCampaign() uses.
        const r = await fetch(`${apiBase}/api/campaigns/${encodeURIComponent(id)}/events`, {
          headers: {
            'Accept': 'text/event-stream',
            ...authHeaders(),
            'X-Mf-Observation-Point': 'ui.pipeline.events',
            'X-Mf-Coordination-Id': coordinationId,
          },
          signal: ctrl.signal,
        });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        attempt = 0;
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const { blocks, rest } = sseBlocks(buf, dec.decode(value, { stream: true }));
          buf = rest;
          for (const evt of blocks.map(parseSseBlock)) {
            onEvent(evt);
            if (evt.event === 'done' || evt.event === 'error') { closed = true; return; }
          }
        }
      } catch { /* unreachable backend — back off and try again */ }
      if (closed || ctrl.signal.aborted) return;
      await new Promise(res => setTimeout(res, Math.min(SSE_BACKOFF_CAP_MS, SSE_BACKOFF_BASE_MS * 2 ** attempt++)));
    }
  };

  void connect();
  return () => { closed = true; ctrl.abort(); };
}

/**
 * Fetch the caller's campaign history.
 *
 * Returns `null` (rather than throwing or returning `[]`) when the request
 * fails or the caller isn't authorised, so pages can distinguish "backend
 * unavailable, keep showing what we have" from "you genuinely have zero
 * campaigns". `authHeaders()` is hoisted from below.
 */
export async function getHistory(): Promise<any[] | null> {
  try {
    const r = await fetch(`${apiBase}/api/campaigns/history`, {
      headers: authHeaders(),
    });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.campaigns)) return j.campaigns;
    }
  } catch {}
  return null;
}

export interface CampaignDetailPlan {
  plan: {
    hook?: string; tagline?: string; cta?: string;
    audience?: string; tone?: string;
  } | null;
  script: string;
  frames: string[];
  screenshots: string[];
  video_url: string | null;
  scenes: string[];
  multi_scene: boolean;
}

export interface CampaignAsset {
  id: number | null;
  kind: string;
  url: string;
  duration_s: number | null;
  metadata: Record<string, any>;
  created_at: number;
}

export interface CampaignDetail {
  campaign: any;
  plan: CampaignDetailPlan;
  assets: CampaignAsset[];
}

/** Thrown by every helper here so callers can branch on 401/403/404/409/429. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

/** GET /api/campaigns/{id} -> `{campaign, plan, assets}`. */
export async function getCampaign(id: string): Promise<CampaignDetail> {
  const r = await fetch(`${apiBase}/api/campaigns/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new ApiError(r.status, detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function getHealth(): Promise<{ ok: boolean }> {
  try {
    const r = await fetch(`${apiBase}/api/health`);
    if (!r.ok) return { ok: false };
    return await r.json();
  } catch {
    return { ok: false };
  }
}


// ─── Auth & ACL helpers ──────────────────────────────────────────────

import type { RoleName, Permission } from './acl';

export interface AuthMe {
  id: string;
  email: string;
  name: string;
  /** Optional: the real backend principal ships the role flags implicitly. */
  roles?: number;
  roles_names?: RoleName[];
  is_authenticated: boolean;
  is_admin: boolean;
  is_root?: boolean;
}

/** `UserOut` from `app/models/auth.py` — returned by every token endpoint. */
export interface AuthUserOut {
  id: string;
  email: string;
  name: string | null;
  email_confirmed: boolean;
  workspace_id: string | null;
}

/** `TokenOut`: the JWT plus the principal it was minted for. */
export interface TokenOut {
  access_token: string;
  token_type: string;
  user: AuthUserOut;
}

/** `OtpOut`: result of asking the backend to re-mail a confirmation code. */
export interface OtpOut {
  sent: boolean;
  expires_in: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: number;
  roles_names: RoleName[];
  tenant_id: string;
  created_at: number;
  last_seen: number | null;
}

export interface AdminLog {
  ts: number;
  level: string;
  name: string;
  message: string;
}

export interface AdminSystem {
  hostname: string;
  python: string;
  platform: string;
  uptime_s: number;
  cwd: string;
  env: Record<string, string>;
}

// ── Auth: JWT storage + email/password endpoints ───────────────────
// observation point: `ui.auth` — every call below carries an
// `X-Mf-Observation-Point` / `X-Mf-Coordination-Id` pair so the backend can
// trace a browser session end-to-end.

const TOKEN_KEY = 'auth_token';
/** Key the pre-JWT demo builds used; migrated once, then dropped. */
const LEGACY_TOKEN_KEY = 'mf-acl-token';

/** The old client minted its own `demo:<roles>:<id>` tokens — never replay those. */
const isDemoToken = (tok: string | null): boolean => !!tok && tok.includes('demo:');

/**
 * Move the legacy demo token key out of the way (obs: ui.auth.token.migrate).
 * A stale demo token would be rejected by the JWT-first middleware, so we
 * drop it instead of carrying it over under the new key.
 */
function migrateTokenKey(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy === null) return;
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    if (!isDemoToken(legacy) && !localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, legacy);
    }
  } catch { /* private mode / quota — behave as signed out */ }
}

export function getStoredToken(): string | null {
  try {
    migrateTokenKey();
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(tok: string | null) {
  try {
    if (tok) {
      localStorage.setItem(TOKEN_KEY, tok);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch { /* ignore */ }
}

export function authHeaders(): Record<string, string> {
  const tok = getStoredToken();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

/** Flatten a FastAPI error body (`detail` string or validation list) to text. */
async function errorDetail(r: Response): Promise<string> {
  const raw = await r.text().catch(() => '');
  try {
    const body = JSON.parse(raw);
    const d = body?.detail ?? body;
    if (Array.isArray(d)) return d.map((e: any) => e?.msg || JSON.stringify(e)).join(', ');
    if (typeof d === 'string') return d;
  } catch { /* plain-text body */ }
  return raw || `HTTP ${r.status}`;
}

/** POST a JSON auth payload, tagging it with the given observation point. */
async function postAuth<T>(path: string, body: unknown, observationPoint: string): Promise<T> {
  const coordinationId = `${observationPoint}-${Math.random().toString(36).slice(2, 8)}`;
  const r = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mf-Observation-Point': observationPoint,
      'X-Mf-Coordination-Id': coordinationId,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, await errorDetail(r));
  // Some auth endpoints (password reset) answer 200 with an empty body.
  const raw = await r.text();
  return (raw ? JSON.parse(raw) : null) as T;
}

/** Create an account; the backend mails a 6-digit code and returns an unconfirmed token. */
export const register = (name: string, email: string, password: string): Promise<TokenOut> =>
  postAuth('/api/auth/register', { name, email, password }, 'ui.auth.register');

/** Email + password sign-in; 403 when the address is not confirmed yet. */
export const login = (email: string, password: string): Promise<TokenOut> =>
  postAuth('/api/auth/login', { email, password }, 'ui.auth.login');

/** Swap a 6-digit code for a confirmed-session token. */
export const confirmOtp = (email: string, otp: string): Promise<TokenOut> =>
  postAuth('/api/auth/confirm-otp', { email, otp }, 'ui.auth.otp.confirm');

/** Re-mail a fresh code (429 while the 60s cooldown is running). */
export const resendOtp = (email: string): Promise<OtpOut> =>
  postAuth('/api/auth/resend-otp', { email }, 'ui.auth.otp.resend');

/** `{ ok: true }` - always 200, even for unknown addresses (no enumeration). */
export interface ForgotPasswordOut {
  ok: boolean;
}

/** Ask for a reset mail; 429 with a retry hint while the cooldown runs. */
export const forgotPassword = (email: string): Promise<ForgotPasswordOut> =>
  postAuth('/api/auth/forgot-password', { email }, 'ui.auth.password.forgot');

/** Swap the mailed token for a new password; 400 on an invalid/expired token. */
export const resetPassword = (token: string, newPassword: string): Promise<void> =>
  postAuth('/api/auth/reset-password', { token, new_password: newPassword }, 'ui.auth.password.reset')
    .then(() => undefined);

export async function fetchWhoami(): Promise<AuthMe> {
  const r = await fetch(`${apiBase}/api/auth/whoami`, {
    headers: { ...authHeaders(), 'X-Mf-Observation-Point': 'ui.auth.whoami' },
  });
  if (!r.ok) throw new ApiError(r.status, await errorDetail(r));
  return r.json();
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const r = await fetch(`${apiBase}/api/admin/users`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`list users failed: ${r.status}`);
  const j = await r.json();
  return j.users || j;
}

export async function adminCreateUser(payload: {
  email: string; name: string; roles: number; tenant_id?: string;
}): Promise<AdminUser> {
  const r = await fetch(`${apiBase}/api/admin/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`create user failed: ${r.status}`);
  return r.json();
}

export async function adminUpdateUser(userId: string, payload: {
  email: string; name: string; roles: number; tenant_id?: string;
}): Promise<AdminUser> {
  const r = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`update user failed: ${r.status}`);
  return r.json();
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const r = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!r.ok && r.status !== 204) throw new Error(`delete user failed: ${r.status}`);
}

export async function adminGetSystem(): Promise<AdminSystem> {
  const r = await fetch(`${apiBase}/api/admin/system`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`get system failed: ${r.status}`);
  return r.json();
}

export async function adminListLogs(opts: { level?: string; q?: string; limit?: number } = {}): Promise<AdminLog[]> {
  const params = new URLSearchParams();
  if (opts.level) params.set('level', opts.level);
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  const r = await fetch(`${apiBase}/api/admin/logs?${params}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`list logs failed: ${r.status}`);
  return r.json();
}

export async function adminEmitTestLog(): Promise<void> {
  const r = await fetch(`${apiBase}/api/admin/logs/test`, { method: 'POST', headers: authHeaders() });
  if (!r.ok) throw new Error(`emit test log failed: ${r.status}`);
}

export async function adminListRoles(): Promise<{ name: RoleName; flag: number; label: string; description: string }[]> {
  const r = await fetch(`${apiBase}/api/admin/roles`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`list roles failed: ${r.status}`);
  return r.json();
}

export async function adminListPermissions(): Promise<{ name: Permission; category: string }[]> {
  const r = await fetch(`${apiBase}/api/admin/permissions`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`list permissions failed: ${r.status}`);
  return r.json();
}


// ─── ACL matrix (root-only) ───────────────────────────────────────────────────
export interface AdminAclMatrix {
  roles: { name: string; flag: number; label: string; description: string }[];
  permissions: { name: string; category: string }[];
  routes: { method: string; path: string; perm: string | null; category: string; label: string }[];
}

export async function adminGetAclMatrix(): Promise<AdminAclMatrix> {
  const r = await fetch(`${apiBase}/api/admin/acl/matrix`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`get acl matrix failed: ${r.status}`);
  return r.json();
}

export async function adminListRoutes(): Promise<AdminAclMatrix['routes']> {
  const r = await fetch(`${apiBase}/api/admin/routes`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`list routes failed: ${r.status}`);
  return r.json();
}


// ─── Billing ────────────────────────────────────────────────────────────────
// All amounts are in credits. Use lib/credits.ts to render dollars.

export interface BillingPlan {
  name: string;
  tagline: string;
  monthly_credits: number;
  price_usd: number;
  /** Marginal credits per second of video — used for the max-duration hint. */
  cost_per_sec: number;
}

export interface BillingBalance {
  workspace_id: string;
  balance_credits: number;
}

export interface CampaignEstimate {
  duration_s: number;
  n_frames: number;
  credits: number;
  usd: number;
  credit_usd: number;
}

export interface CheckoutResult {
  ok: boolean;
  workspace_id: string;
  plan_name: string;
  monthly_credits: number;
  since: number;
}

export async function fetchPlans(): Promise<BillingPlan[]> {
  const r = await fetch(`${apiBase}/api/billing/plans`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetch plans failed: ${r.status}`);
  return r.json();
}

/** Omit `workspaceId` to get the caller's own workspace balance. */
export async function fetchBalance(workspaceId?: string): Promise<BillingBalance> {
  const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
  const r = await fetch(`${apiBase}/api/billing/balance${qs}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetch balance failed: ${r.status}`);
  return r.json();
}

export interface MyWorkspace {
  workspace_id: string;
  plan_name: string | null;
  balance_credits: number;
}

/** Bootstrap: which workspace am I, what plan am I on, what's my balance. */
export async function fetchMyWorkspace(): Promise<MyWorkspace> {
  const r = await fetch(`${apiBase}/api/billing/workspace`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetch workspace failed: ${r.status}`);
  return r.json();
}

export async function checkoutPlan(workspaceId: string, planName: string): Promise<CheckoutResult> {
  const r = await fetch(`${apiBase}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ workspace_id: workspaceId, plan_name: planName }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`checkout failed: ${r.status} ${txt}`);
  }
  return r.json();
}

export async function fetchEstimate(durationS: number): Promise<CampaignEstimate> {
  const r = await fetch(`${apiBase}/api/campaigns/estimate?duration_s=${durationS}`, {
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`fetch estimate failed: ${r.status}`);
  return r.json();
}
