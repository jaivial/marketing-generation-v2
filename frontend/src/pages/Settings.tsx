import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useStore } from '../lib/store';
import { toast } from '../components/ui';
import { cn } from '../lib/utils';

const TABS = [
  { id: 'profile',  label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'billing',  label: 'Billing' },
  { id: 'team',     label: 'Team' },
  { id: 'api',      label: 'API keys' },
] as const;

const Settings: React.FC = () => {
  const { user, setUser } = useStore();
  const local = { ...user };
  const [tab, setTab] = useState<typeof TABS[number]['id']>('profile');

  const field = (label: string, value: string, onChange: (v: string) => void, type = 'text') => (
    <div className="mb-4">
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );

  return (
    <>
      <TopBar title="Settings" />
      <p className="text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6">Manage your profile, security, billing, and API.</p>

      <div className="border-b border-zinc-800 mb-4 sm:mb-6 -mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin">
        <nav className="flex gap-4 sm:gap-6 text-sm whitespace-nowrap">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('py-3 border-b-2 -mb-px', active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white')}>
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === 'profile' && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 pb-6 border-b border-zinc-800">
            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br ${local.avatar} flex items-center justify-center text-xl sm:text-2xl font-bold text-white flex-shrink-0`}>{local.name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-lg font-semibold truncate">{local.name}</p>
              <p className="text-xs sm:text-sm text-zinc-400 truncate">{local.email}</p>
            </div>
            <button onClick={() => toast('Avatar upload (demo)', 'info')} className="btn btn-secondary text-xs sm:text-sm">Change</button>
          </div>
          {field('Display name', local.name, v => { local.name = v; })}
          {field('Email', local.email, v => { local.email = v; })}
          <div className="flex justify-end mt-6">
            <button onClick={() => { setUser(local); toast('Profile saved', 'success'); }} className="btn btn-primary text-xs sm:text-sm w-full sm:w-auto">Save changes</button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-sm sm:text-base mb-4">Password</h3>
          {field('Current password', '', () => {}, 'password')}
          {field('New password', '', () => {}, 'password')}
          {field('Confirm new password', '', () => {}, 'password')}
          <div className="flex justify-end mt-6">
            <button onClick={() => toast('Password updated (demo)', 'success')} className="btn btn-primary text-xs sm:text-sm w-full sm:w-auto">Update password</button>
          </div>
          <hr className="border-zinc-800 my-6" />
          <h3 className="font-semibold text-sm sm:text-base mb-2">Two-factor authentication</h3>
          <p className="text-xs sm:text-sm text-zinc-400 mb-3">Add an extra layer of security to your account.</p>
          <button onClick={() => toast('2FA setup (demo)', 'info')} className="btn btn-secondary text-xs sm:text-sm">Enable 2FA</button>
        </div>
      )}

      {tab === 'billing' && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-sm sm:text-base">Current plan</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">Free plan · {local.usage} of {local.limit} campaigns used this month.</p>
            </div>
            <Link to="/pricing" className="btn btn-primary text-xs sm:text-sm">Upgrade</Link>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-4 sm:mb-6">
            <div className="h-full gradient-bg" style={{ width: `${(local.usage/local.limit)*100}%` }} />
          </div>
          <h3 className="font-semibold text-sm sm:text-base mb-3">Payment method</h3>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 sm:p-4 flex items-center gap-3">
            <div className="w-10 h-7 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded flex-shrink-0" />
            <div className="flex-1"><p className="text-xs sm:text-sm">No card on file</p></div>
            <button onClick={() => toast('Add card flow (demo)', 'info')} className="btn btn-secondary text-xs sm:text-sm">Add card</button>
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h3 className="font-semibold text-sm sm:text-base mb-1">Team members</h3>
          <p className="text-xs sm:text-sm text-zinc-400 mb-4">Upgrade to invite collaborators.</p>
          <button onClick={() => toast('Invite flow (demo)', 'info')} className="btn btn-primary text-xs sm:text-sm">Invite teammate</button>
        </div>
      )}

      {tab === 'api' && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h3 className="font-semibold text-sm sm:text-base">API keys</h3>
            <button onClick={() => toast('New key created (demo)', 'success')} className="btn btn-primary text-xs sm:text-sm">Generate key</button>
          </div>
          <div className="space-y-2">
            {[
              { name: 'local-dev', prefix: 'mf_live_••••', created: Date.now() - 30*86400e3 },
              { name: 'ci-pipeline', prefix: 'mf_live_••••', created: Date.now() - 5*86400e3 },
            ].map(k => (
              <div key={k.name} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{k.name}</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500 font-mono truncate">{k.prefix}a3f9</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => toast('Copied to clipboard', 'success')} className="btn btn-ghost text-xs px-2.5 py-1.5">Copy</button>
                  <button onClick={() => toast('Revoked (demo)', 'info')} className="btn btn-danger text-xs px-2.5 py-1.5">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default Settings;
