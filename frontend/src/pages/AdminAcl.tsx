// Admin / ACL — full role × permission matrix viewer (root only).
//
// Renders three sections:
//   1. The role × permission matrix (which role has which permission)
//   2. The HTTP route → permission registry
//   3. The "live" principal the viewer is logged in as
//
// Everything comes from the backend via /api/admin/acl/matrix.

import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/store';
import { adminGetAclMatrix } from '../lib/api';
import { ALL_ROLES, ROLE_INFO, type RoleName, type Permission, canDo } from '../lib/acl';
import { Icon } from '../components/ui';
import { cn } from '../lib/utils';

interface RoleInfo { name: RoleName; flag: number; label: string; description: string; }
interface PermInfo { name: Permission; category: string; }
interface RouteInfo { method: string; path: string; perm: Permission | null; category: string; label: string; }
interface AclMatrix { roles: RoleInfo[]; permissions: PermInfo[]; routes: RouteInfo[]; }

const AdminAcl: React.FC = () => {
  const { can, logout, rolesNames } = useAuth();
  const [matrix, setMatrix] = useState<AclMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!can('admin:system')) return;
    (async () => {
      try {
        const m = await adminGetAclMatrix();
        setMatrix(m as AclMatrix);
      } catch (e: any) { setError(e.message || 'failed to load ACL matrix'); }
    })();
  }, [can]);

  if (!can('admin:system')) {
    return (
      <div className="text-center py-16">
        <Icon name="lock" size={48} className="mx-auto text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Root access required</h2>
        <p className="text-sm text-zinc-500">This page requires the root role.</p>
      </div>
    );
  }

  if (!matrix) {
    return <div className="text-center text-zinc-500 py-12">Loading…</div>;
  }

  // No runtime import of ROLE_PERMISSIONS_FRONTEND needed here; we
  // use the lower-level `canDo(rolesFlags, permission)` helper.

  // Group permissions by category
  const grouped: Record<string, PermInfo[]> = {};
  for (const p of matrix.permissions) {
    (grouped[p.category] = grouped[p.category] || []).push(p);
  }

  const f = filter.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Icon name="shieldCheck" size={24} className="text-brand-400" />
            ACL Matrix
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Roles, permissions, and route access for the entire system.
            You are signed in as: <span className="text-zinc-200">{rolesNames.map(r => r.toUpperCase()).join(', ')}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilter('')} className="btn btn-secondary text-xs">
            <Icon name="close" size={12} /> Clear
          </button>
          <button onClick={logout} className="btn btn-secondary text-xs">
            <Icon name="logOut" size={12} /> Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-300 flex items-center gap-2">
          <Icon name="alertCircle" size={14} /> {error}
        </div>
      )}

      {/* Filter */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Icon name="search" size={14} className="text-zinc-500" />
          <input
            className="bg-transparent flex-1 outline-none text-sm"
            placeholder="Filter by role label, permission name, or route path…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Roles */}
      <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Icon name="crown" size={14} /> User role flags
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {matrix.roles
            .filter(r => !f || r.name.toLowerCase().includes(f) || r.label.toLowerCase().includes(f) || r.description.toLowerCase().includes(f))
            .map(r => {
              return (
                <div key={r.name} className="bg-zinc-950/60 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{r.label}</span>
                    <code className="text-[10px] uppercase text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">{r.name}</code>
                    <code className="text-[10px] text-zinc-600 ml-auto">bit {r.flag}</code>
                  </div>
                  <p className="text-xs text-zinc-400">{r.description}</p>
                </div>
              );
            })}
        </div>
      </section>

      {/* Permission matrix */}
      <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Icon name="shieldCheck" size={14} /> Permission matrix
        </h2>
        <p className="text-xs text-zinc-500">
          Root (R) always has access; root is treated as the universal role in this view.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-800">
              <th className="text-left py-2 pr-3 font-medium">Permission</th>
              {ALL_ROLES.map(rn => (
                <th key={rn} className="text-center px-2 py-2 font-medium">{ROLE_INFO[rn].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([cat, perms]) => (
              <React.Fragment key={cat}>
                <tr className="bg-zinc-950/40">
                  <td colSpan={1 + ALL_ROLES.length} className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1.5">
                    {cat}
                  </td>
                </tr>
                {perms
                  .filter(p => !f || p.name.toLowerCase().includes(f))
                  .map(p => (
                    <tr key={p.name} className="border-b border-zinc-800/40 hover:bg-zinc-950/30">
                      <td className="py-1.5 pr-3 font-mono text-[11px] text-zinc-300">{p.name}</td>
                      {ALL_ROLES.map(rn => {
                        // ROOT has everything
                        if (rn === 'root') {
                          return <td key={rn} className="text-center text-emerald-400">✓</td>;
                        }
                        // GUEST/USER/etc. — check role perms
                        const bit = ROLE_INFO[rn].bit;
                        const role = ALL_ROLES.includes(rn) ? rn : null;
                        // Use canDo() with a synthetic roles-flag
                        const ok = canDo(bit, p.name);
                        return (
                          <td key={rn} className={cn('text-center text-sm', ok ? 'text-emerald-400' : 'text-zinc-700')}>
                            {ok ? '✓' : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </section>

      {/* Routes */}
      <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3 overflow-x-auto">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Icon name="server" size={14} /> Route → permission registry
        </h2>
        <p className="text-xs text-zinc-500">
          HTTP routes the backend enforces with the global ACL middleware. Public routes show no permission.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-800">
              <th className="text-left py-2 pr-3 font-medium">Method</th>
              <th className="text-left py-2 pr-3 font-medium">Path</th>
              <th className="text-left py-2 pr-3 font-medium">Permission</th>
              <th className="text-left py-2 pr-3 font-medium">Label</th>
            </tr>
          </thead>
          <tbody>
            {matrix.routes
              .filter(r => !f || r.path.toLowerCase().includes(f) || (r.perm || '').toLowerCase().includes(f))
              .map(r => (
                <tr key={`${r.method}-${r.path}`} className="border-b border-zinc-800/40 hover:bg-zinc-950/30">
                  <td className="py-1.5 pr-3">
                    <span className={cn(
                      'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono',
                      r.method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' :
                      r.method === 'POST' ? 'bg-sky-500/20 text-sky-300' :
                      r.method === 'PUT' ? 'bg-amber-500/20 text-amber-300' :
                      r.method === 'DELETE' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-zinc-700 text-zinc-300'
                    )}>{r.method}</span>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-zinc-200">{r.path}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px]">
                    {r.perm ? (
                      <span className="text-brand-300">{r.perm}</span>
                    ) : (
                      <span className="text-zinc-600">— public —</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-zinc-400">{r.label}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default AdminAcl;
