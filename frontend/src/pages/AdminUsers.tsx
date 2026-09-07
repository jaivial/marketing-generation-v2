// Admin / Users — full user management page (root only).
//
// Features:
//   * Stats: total users, by-role counts, recent sign-ups.
//   * Filter by role / email / name.
//   * Create / edit / delete users with multi-role bitmask editing.
//   * Safe-delete (cannot delete the built-in root user).

import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/store';
import { ALL_ROLES, ROLE_INFO, type RoleName } from '../lib/acl';
import { adminListUsers, adminCreateUser, adminUpdateUser, adminDeleteUser, type AdminUser } from '../lib/api';
import { Icon } from '../components/ui';
import { cn } from '../lib/utils';

const ROLE_BITS: Record<RoleName, number> = {
  guest: 1, user: 2, viewer: 4, billing: 8, admin: 16, root: 32,
};

const ROLE_BADGE: Record<RoleName, string> = {
  root:    'bg-rose-500/20 text-rose-300',
  admin:   'bg-amber-500/20 text-amber-300',
  billing: 'bg-cyan-500/20 text-cyan-300',
  viewer:  'bg-zinc-700 text-zinc-300',
  user:    'bg-brand-500/20 text-brand-300',
  guest:   'bg-zinc-800 text-zinc-400',
};

const AdminUsers: React.FC = () => {
  const { can, logout } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<RoleName | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ name: '', email: '', roles: 2 as number });

  const loadUsers = async () => {
    try {
      setError(null);
      const data = await adminListUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load users');
    }
  };

  useEffect(() => { if (can('admin:users')) loadUsers(); }, [can]);

  if (!can('admin:users')) {
    return <DeniedScreen onLogin={logout} />;
  }

  function startCreate(role: RoleName) {
    setEditing(null);
    setShowForm(role);
    setForm({
      name: '',
      email: `user${Math.floor(Math.random() * 1000)}@example.com`,
      roles: ROLE_BITS[role],
    });
  }

  function startEdit(u: AdminUser) {
    setShowForm(null);
    setEditing(u);
    setForm({ name: u.name, email: u.email, roles: u.roles });
  }

  async function saveForm() {
    try {
      if (editing) {
        await adminUpdateUser(editing.id, { name: form.name, email: form.email, roles: form.roles });
      } else if (showForm) {
        await adminCreateUser({ name: form.name, email: form.email, roles: form.roles });
      }
      setShowForm(null); setEditing(null);
      await loadUsers();
    } catch (e: any) { setError(e.message || 'Save failed'); }
  }

  async function removeUser(u: AdminUser) {
    if (u.id === 'r-001') { setError('cannot delete the built-in root user'); return; }
    if (!confirm(`Delete ${u.email}?`)) return;
    try {
      await adminDeleteUser(u.id);
      await loadUsers();
    } catch (e: any) { setError(e.message || 'Delete failed'); }
  }

  // Stats
  const stats = (users || []).reduce<Record<string, number>>((acc, u) => {
    for (const rn of u.roles_names) acc[rn] = (acc[rn] || 0) + 1;
    return acc;
  }, {});

  const filtered = (users || []).filter(u => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      u.name.toLowerCase().includes(f) ||
      u.email.toLowerCase().includes(f) ||
      u.roles_names.some(r => r.includes(f))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Icon name="users" size={24} className="text-brand-400" />
            User Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            All users in the system. Only root can access this page.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadUsers} className="btn btn-secondary text-sm">
            <Icon name="settings" size={14} /> Refresh
          </button>
          <button onClick={logout} className="btn btn-secondary text-xs">
            <Icon name="logOut" size={12} /> Logout
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Total</p>
          <p className="text-xl font-bold">{(users || []).length}</p>
        </div>
        {(['user', 'admin', 'billing', 'root'] as RoleName[]).map(r => (
          <div key={r} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{ROLE_INFO[r].label}</p>
            <p className="text-xl font-bold">{stats[r] || 0}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-300 flex items-center gap-2">
          <Icon name="alertCircle" size={14} /> {error}
        </div>
      )}

      {/* Create buttons */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Add user as:</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.filter(r => r !== 'guest').map(r => (
            <button key={r} onClick={() => startCreate(r)} className="btn btn-secondary text-xs">
              <Icon name="plus" size={12} /> {ROLE_INFO[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex items-center gap-2">
        <Icon name="search" size={14} className="text-zinc-500" />
        <input
          className="bg-transparent outline-none text-sm flex-1"
          placeholder="Filter by name, email, or role…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="text-xs text-zinc-500">{filtered.length} / {(users || []).length}</span>
      </div>

      {/* Edit / create form */}
      {(showForm || editing) && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300">
            {editing ? 'Edit user' : `Create new ${ROLE_INFO[showForm!].label.toLowerCase()}`}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Name</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Roles</label>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => {
                const has = (form.roles & ROLE_BITS[r]) !== 0;
                return (
                  <button key={r} type="button" onClick={() => {
                    const next = has ? form.roles & ~ROLE_BITS[r] : form.roles | ROLE_BITS[r];
                    setForm({ ...form, roles: next });
                  }} className={cn(
                    'px-2.5 py-1 rounded text-xs border',
                    has
                      ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  )}>
                    {ROLE_INFO[r].label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5">Current bitmask: {form.roles}</p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowForm(null); setEditing(null); }} className="btn btn-secondary text-sm">Cancel</button>
            <button onClick={saveForm} className="btn btn-primary text-sm">
              <Icon name="check" size={12} /> {editing ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      {users === null ? (
        <div className="text-center text-zinc-500 py-12">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">No users match "{filter}".</div>
      ) : (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase tracking-wider bg-zinc-950/50">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Roles</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Tenant</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Created</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-zinc-900/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 sm:hidden">{u.tenant_id} · {new Date(u.created_at * 1000).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles_names.map(r => (
                        <span key={r} className={cn(
                          'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                          ROLE_BADGE[r as RoleName] || 'bg-zinc-800 text-zinc-400'
                        )}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 hidden sm:table-cell">{u.tenant_id}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 hidden md:table-cell">
                    {new Date(u.created_at * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => startEdit(u)} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">
                        Edit
                      </button>
                      {u.id !== 'r-001' && (
                        <button onClick={() => removeUser(u)} className="px-2 py-1 rounded text-xs text-rose-400 hover:bg-rose-500/10">
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const DeniedScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => (
  <div className="text-center py-16">
    <Icon name="lock" size={48} className="mx-auto text-zinc-600 mb-4" />
    <h2 className="text-xl font-semibold mb-2">Root access required</h2>
    <p className="text-sm text-zinc-500 mb-6">
      The User Management page is restricted to the global root administrator.
    </p>
    <a href="#/login" onClick={onLogin} className="btn btn-primary">Sign in as root</a>
  </div>
);

export default AdminUsers;
