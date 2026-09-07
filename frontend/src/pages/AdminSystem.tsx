// Admin / System — full system management (root only).
//
// Sections:
//   1. System info — hostname, python, platform, uptime, cwd, env.
//   2. Health summary — backend reachable, ACL enforced, etc.
//   3. Role registry — every role flag with bit and description.
//   4. Permission registry — every permission grouped by category.
//   5. Quick links to the other admin pages (Users, Logs, ACL matrix).

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { adminGetSystem, adminListRoles, adminListPermissions, type AdminSystem } from '../lib/api';
import { ALL_ROLES, ROLE_INFO, type RoleName, type Permission } from '../lib/acl';
import { Icon } from '../components/ui';
import { cn } from '../lib/utils';

const AdminSystem: React.FC = () => {
  const { can, logout, rolesNames, isRoot } = useAuth();
  const [info, setInfo] = useState<AdminSystem | null>(null);
  const [roles, setRoles] = useState<{ name: RoleName; flag: number; label: string; description: string }[]>([]);
  const [permissions, setPermissions] = useState<{ name: Permission; category: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  useEffect(() => {
    if (!can('admin:system')) return;
    (async () => {
      try {
        const [i, r, p] = await Promise.all([adminGetSystem(), adminListRoles(), adminListPermissions()]);
        setInfo(i); setRoles(r); setPermissions(p);
      } catch (e: any) { setError(e.message || 'load failed'); }
    })();
  }, [can]);

  async function ping() {
    setPinging(true);
    try {
      const t0 = performance.now();
      const r = await fetch('/api/health');
      const dt = (performance.now() - t0).toFixed(1);
      setPingResult(r.ok ? `OK (${dt} ms)` : `FAIL: ${r.status}`);
    } catch (e: any) {
      setPingResult(`FAIL: ${e.message}`);
    } finally {
      setPinging(false);
    }
  }

  if (!can('admin:system')) {
    return (
      <div className="text-center py-16">
        <Icon name="lock" size={48} className="mx-auto text-zinc-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Root access required</h2>
        <p className="text-sm text-zinc-500">This page requires root role.</p>
      </div>
    );
  }

  const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Icon name="settings" size={24} className="text-brand-400" />
            System Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Full system administration. Signed in as
            <span className="text-zinc-200 mx-1">{rolesNames.map(r => r.toUpperCase()).join(', ')}</span>
            ({isRoot ? 'root' : 'not root'}).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={ping} disabled={pinging} className="btn btn-secondary text-xs">
            <Icon name={pinging ? 'loader' : 'zap'} size={12} className={cn(pinging && 'animate-spin')} />
            {pinging ? 'Pinging…' : 'Ping /api/health'}
          </button>
          {pingResult && (
            <span className={cn(
              'text-xs px-2 py-1 rounded',
              pingResult.startsWith('OK') ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            )}>{pingResult}</span>
          )}
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

      {/* Quick links */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link to="/admin/users" className="bg-zinc-900/60 border border-zinc-800 hover:border-brand-500/50 rounded-xl p-4 group transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center">
              <Icon name="users" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold group-hover:text-white">User Management</p>
              <p className="text-xs text-zinc-500">Create, edit, delete any user.</p>
            </div>
          </div>
        </Link>
        <Link to="/admin/logs" className="bg-zinc-900/60 border border-zinc-800 hover:border-brand-500/50 rounded-xl p-4 group transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center">
              <Icon name="activity" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold group-hover:text-white">System Logs</p>
              <p className="text-xs text-zinc-500">Live log stream, filters, severities.</p>
            </div>
          </div>
        </Link>
        <Link to="/admin/acl" className="bg-zinc-900/60 border border-zinc-800 hover:border-brand-500/50 rounded-xl p-4 group transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 text-brand-300 flex items-center justify-center">
              <Icon name="shieldCheck" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold group-hover:text-white">ACL Matrix</p>
              <p className="text-xs text-zinc-500">Roles × permissions × routes.</p>
            </div>
          </div>
        </Link>
      </section>

      {info && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Icon name="server" size={14} /> System Information
            </h2>
            <dl className="text-xs space-y-1.5">
              {[
                ['Hostname', info.hostname],
                ['Python', info.python],
                ['Platform', info.platform],
                ['Uptime (s)', String(info.uptime_s)],
                ['Working dir', info.cwd],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-zinc-800/50 pb-1">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="text-zinc-200 font-mono text-[11px] truncate ml-3 max-w-[60%]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <Icon name="box" size={14} /> Environment Variables
            </h2>
            <div className="text-xs max-h-48 overflow-y-auto space-y-0.5">
              {Object.entries(info.env).length === 0 ? (
                <p className="text-zinc-500">No non-secret env vars exposed.</p>
              ) : Object.entries(info.env).map(([k, v]) => (
                <div key={k} className="font-mono text-[10px]">
                  <span className="text-zinc-500">{k}</span>
                  <span className="text-zinc-600"> = </span>
                  <span className="text-zinc-300">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Role registry */}
      <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Icon name="crown" size={14} /> User Role Flags
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-zinc-500 uppercase tracking-wider">
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 pr-3">Name</th>
                <th className="text-left py-2 pr-3">Label</th>
                <th className="text-left py-2 pr-3">Bit</th>
                <th className="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {ALL_ROLES.map(r => ROLE_INFO[r] && (
                <tr key={r} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-3 font-mono uppercase">{r}</td>
                  <td className="py-2 pr-3">{ROLE_INFO[r].label}</td>
                  <td className="py-2 pr-3 font-mono">{ROLE_INFO[r].bit}</td>
                  <td className="py-2 text-zinc-400">{ROLE_INFO[r].description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Permission registry */}
      <section className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Icon name="key" size={14} /> Permission Registry
        </h2>
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, perms]) => (
            <div key={cat}>
              <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1.5">{cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {perms.map(p => (
                  <code key={p.name} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                    {p.name}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminSystem;
