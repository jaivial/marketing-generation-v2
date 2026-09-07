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
    buf += dec.decode(value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop() || '';
    for (const block of blocks) {
      const ev = (block.match(/^event:\s*(.+)$/m) || [])[1] || 'message';
      const dt = (block.match(/^data:\s*(.+)$/m) || [])[1] || '';
      let data: any;
      try { data = JSON.parse(dt); } catch { data = dt; }
      yield { event: ev as any, data };
    }
  }
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

/** Thrown by `getCampaign` so callers can branch on 403 vs 404. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
  roles: number;
  roles_names: RoleName[];
  is_authenticated: boolean;
  is_admin: boolean;
  is_root: boolean;
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

const TOKEN_KEY = 'mf-acl-token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(tok: string | null) {
  try {
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function authHeaders(): Record<string, string> {
  const tok = getStoredToken();
  if (!tok) return {};
  // Demo token format: "Bearer demo:<role-int>:<id>[:<email>]"
  if (!tok.startsWith('Bearer ')) return { Authorization: `Bearer ${tok}` };
  return { Authorization: tok };
}

export async function fetchWhoami(): Promise<AuthMe> {
  const r = await fetch(`${apiBase}/api/auth/whoami`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`whoami failed: ${r.status}`);
  return r.json();
}

export async function loginDemo(roles: number, userId: string, email?: string): Promise<string> {
  // Server expects "Bearer demo:<int>:<id>[:<email>]"
  return `Bearer demo:${roles}:${userId}${email ? ':' + email : ''}`;
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
