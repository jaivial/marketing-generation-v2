// Reactive store backed by React context + localStorage.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Campaign, User } from './types';

const LS_KEYS = {
  user: 'mf-user',
  history: 'mf-history',
  sidebarCollapsed: 'mf-sidebar-collapsed',
} as const;

// ─── Default seed data ──────────────────────────────────────────────────
const DEFAULT_USER: User = {
  name: 'Jaime',
  email: 'jaime@menustudioai.com',
  plan: 'free',
  usage: 2,
  limit: 5,
  avatar: 'from-amber-400 to-pink-500',
};

const DEFAULT_HISTORY: Campaign[] = [
  { id: 'c-001', name: 'Acme CMS launch', duration_s: 30, status: 'done',        created_at: Date.now() - 2 * 3600e3,  color: 'from-rose-500 to-amber-500',    source: 'https://acme-cms.io',     style: 'cinematic', plan: { hook: 'Your data, your rules.', tagline: 'Build like a team of ten.', cta: 'Start free', audience: 'Indie devs', tone: 'Confident' } },
  { id: 'c-002', name: 'Q4 product teaser', duration_s: 15, status: 'generating', created_at: Date.now() - 12 * 60e3,   color: 'from-indigo-500 to-fuchsia-500', source: 'https://q4.app',           style: 'motion' },
  { id: 'c-003', name: 'Black friday promo', duration_s: 45, status: 'draft',      created_at: Date.now() - 86400e3,   color: 'from-cyan-500 to-blue-500',     source: 'https://shop.example.com', style: 'punchy' },
  { id: 'c-004', name: 'Holiday story',     duration_s: 30, status: 'failed',     created_at: Date.now() - 3 * 86400e3, color: 'from-violet-500 to-pink-500',   source: 'https://holiday.example',  style: 'cinematic' },
  { id: 'c-005', name: 'SaaS launch v2',    duration_s: 30, status: 'done',       created_at: Date.now() - 5 * 86400e3, color: 'from-amber-500 to-orange-500',  source: 'https://saas.example.com', style: 'cinematic', plan: { hook: 'Ship faster.', tagline: 'Less code, more product.', cta: 'Try it now', audience: 'CTOs', tone: 'Bold' } },
  { id: 'c-006', name: 'Etsy store promo',  duration_s: 15, status: 'done',       created_at: Date.now() - 7 * 86400e3, color: 'from-emerald-500 to-lime-500',  source: 'https://etsy.example.com', style: 'playful', plan: { hook: 'Handmade vibes.', tagline: 'Crafted with love.', cta: 'Shop now', audience: 'Gen Z', tone: 'Warm' } },
];

// ─── Local-storage helpers ──────────────────────────────────────────────
function loadJson<T>(key: string, fallback: T): T {
  // Loads a value from localStorage.
  //
  // Critical: if the fallback is an array (e.g. history) we must NEVER spread
  // the parsed value into it, because that turns the array into a plain object
  // with numeric keys. The store of e.g. an empty object {"0": {...}} from a
  // previous (broken) build would silently corrupt the fallback and crash
  // downstream code that does .filter / .map on it.
  //
  // Rules:
  //  - missing / unparseable        → fallback
  //  - fallback is array:
  //      • parsed is array           → return parsed (use the stored value)
  //      • anything else             → fallback
  //  - fallback is object:
  //      • parsed is plain object    → { ...fallback, ...parsed }
  //      • anything else             → fallback
  //  - fallback is primitive       → parsed if same shape, else fallback
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed == null) return fallback;

    const fallbackIsArray = Array.isArray(fallback);
    const parsedIsArray  = Array.isArray(parsed);
    const parsedIsObject = parsed && typeof parsed === 'object' && !parsedIsArray;

    if (fallbackIsArray) {
      // Only accept arrays; anything else (objects, strings, numbers) is rejected.
      return parsedIsArray ? (parsed as T) : fallback;
    }
    if (Array.isArray(fallback) === false && typeof fallback === 'object' && fallback !== null) {
      // Object fallback: only accept plain objects, shallow-merge.
      if (parsedIsObject) return { ...fallback, ...parsed } as T;
      return fallback;
    }
    // Primitive fallback (string, number, boolean): accept the parsed value
    // only if the types match.
    if (typeof parsed === typeof fallback) return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}
function saveJson<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ─── Context shape ──────────────────────────────────────────────────────
export interface StoreContextValue {
  user: User;
  setUser: (u: User | ((prev: User) => User)) => void;
  history: Campaign[];
  setHistory: (h: Campaign[] | ((prev: Campaign[]) => Campaign[])) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (b: boolean | ((prev: boolean) => boolean)) => void;
  drawerOpen: boolean;
  setDrawerOpen: (b: boolean | ((prev: boolean) => boolean)) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null!);

// ─── Provider ───────────────────────────────────────────────────────────
export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User>(() => loadJson(LS_KEYS.user, DEFAULT_USER));
  const [history, setHistoryState] = useState<Campaign[]>(() => loadJson(LS_KEYS.history, DEFAULT_HISTORY));
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => localStorage.getItem(LS_KEYS.sidebarCollapsed) === '1');
  const [drawerOpen, setDrawerOpenState] = useState<boolean>(false);

  useEffect(() => { saveJson(LS_KEYS.user, user); }, [user]);
  useEffect(() => { saveJson(LS_KEYS.history, history); }, [history]);
  useEffect(() => { try { localStorage.setItem(LS_KEYS.sidebarCollapsed, sidebarCollapsed ? '1' : '0'); } catch {} }, [sidebarCollapsed]);

  const setUser = useCallback((u: User | ((prev: User) => User)) => {
    setUserState(prev => typeof u === 'function' ? (u as any)(prev) : u);
  }, []);
  const setHistory = useCallback((h: Campaign[] | ((prev: Campaign[]) => Campaign[])) => {
    setHistoryState(prev => typeof h === 'function' ? (h as any)(prev) : h);
  }, []);
  const setSidebarCollapsed = useCallback((b: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedState(prev => typeof b === 'function' ? (b as any)(prev) : b);
  }, []);
  const setDrawerOpen = useCallback((b: boolean | ((prev: boolean) => boolean)) => {
    setDrawerOpenState(prev => typeof b === 'function' ? (b as any)(prev) : b);
  }, []);

  const ctxValue: StoreContextValue = { user, setUser, history, setHistory, sidebarCollapsed, setSidebarCollapsed, drawerOpen, setDrawerOpen };
  return React.createElement(
    StoreContext.Provider,
    { value: ctxValue },
    children
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}


// ─── Auth & ACL state ────────────────────────────────────────────────
import type { RoleName, Permission } from './acl';
import {
  hasAnyRole, hasRole, isRoot as isRootFn, isAdmin as isAdminFn,
  isAuthenticated, canDo, rolesList,
} from './acl';
import { fetchWhoami, getStoredToken, loginDemo, setStoredToken } from './api';

export interface AuthState {
  id: string;
  email: string;
  name: string;
  roles: number;          // bitmask
  rolesNames: RoleName[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  isRoot: boolean;
}

const DEFAULT_AUTH: AuthState = {
  id: 'guest', email: '', name: 'Guest',
  roles: 1,  // GUEST
  rolesNames: ['guest'],
  isAuthenticated: false, isAdmin: false, isRoot: false,
};

interface AuthActions {
  refresh: () => Promise<void>;
  loginAs: (role: RoleName, userId: string, email?: string) => Promise<void>;
  logout: () => void;
  hasRole: (r: RoleName) => boolean;
  hasAnyRole: (r: RoleName[]) => boolean;
  can: (p: Permission) => boolean;
}

type AuthCtx = AuthState & AuthActions;
const AuthContext = createContext<AuthCtx | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchWhoami();
      setAuth({
        id: me.id, email: me.email, name: me.name,
        roles: me.roles, rolesNames: me.roles_names,
        isAuthenticated: me.is_authenticated, isAdmin: me.is_admin, isRoot: me.is_root,
      });
    } catch (e) {
      setAuth(DEFAULT_AUTH);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loginAs = useCallback(async (role: RoleName, userId: string, email?: string) => {
    const roleBit = { guest: 1, user: 2, viewer: 4, billing: 8, admin: 16, root: 32, USER: 2, ADMIN: 16, ROOT: 32 }[role] ?? 2;
    const tok = await loginDemo(roleBit, userId, email);
    setStoredToken(tok);
    await refresh();
  }, [refresh]);

  const logout = useCallback(() => { setStoredToken(null); setAuth(DEFAULT_AUTH); }, []);

  const value: AuthCtx = {
    ...auth,
    refresh, loginAs, logout,
    hasRole: (r) => hasRole(auth.roles, r),
    hasAnyRole: (rs) => hasAnyRole(auth.roles, rs),
    can: (p) => canDo(auth.roles, p),
  };
  return React.createElement(
    AuthContext.Provider,
    { value },
    children
  );
};

export function useAuth(): AuthCtx {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
