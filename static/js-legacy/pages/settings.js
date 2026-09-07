import { h } from '../lib/dom.js';
import { user as userStore } from '../lib/store.js';
import { Shell, TopBar } from '../components/layout.js';
import { toast } from '../lib/ui.js';

export const Settings = () => {
  const u = userStore.get();
  const local = { ...u };
  let tab = 'profile';

  const tabs = [
    { id: 'profile',  label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'billing',  label: 'Billing' },
    { id: 'team',     label: 'Team' },
    { id: 'api',      label: 'API keys' },
  ];

  const tabNav = h('div', { class: 'border-b border-zinc-800 mb-4 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-thin' });
  const tabNavInner = h('nav', { class: 'flex gap-4 sm:gap-6 text-sm whitespace-nowrap' });
  tabNav.appendChild(tabNavInner);

  const body = h('div', {});

  const refresh = () => {
    tabNavInner.innerHTML = '';
    tabs.forEach(t => {
      const active = tab === t.id;
      tabNavInner.appendChild(h('a', {
        class: `py-3 border-b-2 -mb-px cursor-pointer ${active ? 'border-brand-500 text-brand-300 font-medium' : 'border-transparent text-zinc-400 hover:text-white'}`,
        onClick: () => { tab = t.id; refresh(); }
      }, t.label));
    });

    body.innerHTML = '';

    if (tab === 'profile') {
      body.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
        h('div', { class: 'flex flex-col sm:flex-row sm:items-center gap-4 mb-6 pb-6 border-b border-zinc-800' }, [
          h('div', { class: `w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br ${local.avatar} flex items-center justify-center text-xl sm:text-2xl font-bold text-white flex-shrink-0` }, local.name.charAt(0)),
          h('div', { class: 'flex-1 min-w-0' }, [
            h('p', { class: 'text-base sm:text-lg font-semibold truncate' }, local.name),
            h('p', { class: 'text-xs sm:text-sm text-zinc-400 truncate' }, local.email)
          ]),
          h('button', { class: 'btn btn-secondary text-xs sm:text-sm', onClick: () => toast('Avatar upload (demo)', 'info') }, 'Change')
        ]),
        field('Display name', 'name', local.name, (v) => { local.name = v; }),
        field('Email', 'email', local.email, (v) => { local.email = v; }),
        h('div', { class: 'flex justify-end mt-6' }, [
          h('button', {
            class: 'btn btn-primary text-xs sm:text-sm w-full sm:w-auto',
            onClick: () => { userStore.set(local); toast('Profile saved', 'success'); }
          }, 'Save changes')
        ])
      ]));
    } else if (tab === 'security') {
      body.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
        h('h3', { class: 'font-semibold text-sm sm:text-base mb-4' }, 'Password'),
        field('Current password', 'cur', '', () => {}, 'password'),
        field('New password', 'new', '', () => {}, 'password'),
        field('Confirm new password', 'conf', '', () => {}, 'password'),
        h('div', { class: 'flex justify-end mt-6' }, [
          h('button', { class: 'btn btn-primary text-xs sm:text-sm w-full sm:w-auto', onClick: () => toast('Password updated (demo)', 'success') }, 'Update password')
        ]),
        h('hr', { class: 'border-zinc-800 my-6' }),
        h('h3', { class: 'font-semibold text-sm sm:text-base mb-2' }, 'Two-factor authentication'),
        h('p', { class: 'text-xs sm:text-sm text-zinc-400 mb-3' }, 'Add an extra layer of security to your account.'),
        h('button', { class: 'btn btn-secondary text-xs sm:text-sm', onClick: () => toast('2FA setup (demo)', 'info') }, 'Enable 2FA')
      ]));
    } else if (tab === 'billing') {
      body.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
        h('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4' }, [
          h('div', {}, [
            h('h3', { class: 'font-semibold text-sm sm:text-base' }, 'Current plan'),
            h('p', { class: 'text-xs sm:text-sm text-zinc-400 mt-1' }, 'Free plan · ' + local.usage + ' of ' + local.limit + ' campaigns used this month.')
          ]),
          h('a', { href: '#/pricing', class: 'btn btn-primary text-xs sm:text-sm' }, 'Upgrade')
        ]),
        h('div', { class: 'h-2 bg-zinc-800 rounded-full overflow-hidden mb-4 sm:mb-6' }, [
          h('div', { class: 'h-full gradient-bg', style: { width: ((local.usage/local.limit)*100) + '%' } })
        ]),
        h('h3', { class: 'font-semibold text-sm sm:text-base mb-3' }, 'Payment method'),
        h('div', { class: 'bg-zinc-950 border border-zinc-800 rounded-lg p-3 sm:p-4 flex items-center gap-3' }, [
          h('div', { class: 'w-10 h-7 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded flex-shrink-0' }),
          h('div', { class: 'flex-1' }, [h('p', { class: 'text-xs sm:text-sm' }, 'No card on file')]),
          h('button', { class: 'btn btn-secondary text-xs sm:text-sm', onClick: () => toast('Add card flow (demo)', 'info') }, 'Add card')
        ])
      ]));
    } else if (tab === 'team') {
      body.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
        h('h3', { class: 'font-semibold text-sm sm:text-base mb-1' }, 'Team members'),
        h('p', { class: 'text-xs sm:text-sm text-zinc-400 mb-4' }, 'Upgrade to invite collaborators.'),
        h('button', { class: 'btn btn-primary text-xs sm:text-sm', onClick: () => toast('Invite flow (demo)', 'info') }, 'Invite teammate')
      ]));
    } else if (tab === 'api') {
      const keys = [
        { id: 'k1', name: 'local-dev',  prefix: 'mf_live_••••', created: Date.now() - 30*86400e3 },
        { id: 'k2', name: 'ci-pipeline', prefix: 'mf_live_••••', created: Date.now() - 5*86400e3 },
      ];
      body.appendChild(h('div', { class: 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 sm:p-6' }, [
        h('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4' }, [
          h('h3', { class: 'font-semibold text-sm sm:text-base' }, 'API keys'),
          h('button', { class: 'btn btn-primary text-xs sm:text-sm', onClick: () => toast('New key created (demo)', 'success') }, 'Generate key')
        ]),
        h('div', { class: 'space-y-2' }, keys.map(k =>
          h('div', { class: 'bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3' }, [
            h('div', { class: 'flex-1 min-w-0' }, [
              h('p', { class: 'text-sm font-medium truncate' }, k.name),
              h('p', { class: 'text-[10px] sm:text-xs text-zinc-500 font-mono truncate' }, k.prefix + 'a3f9')
            ]),
            h('div', { class: 'flex gap-2 flex-shrink-0' }, [
              h('button', { class: 'btn btn-ghost text-xs px-2.5 py-1.5', onClick: () => toast('Copied to clipboard', 'success') }, 'Copy'),
              h('button', { class: 'btn btn-danger text-xs px-2.5 py-1.5', onClick: () => toast('Revoked (demo)', 'info') }, 'Revoke')
            ])
          ])
        ))
      ]));
    }
  };

  const field = (label, key, value, onInput, type = 'text') => h('div', { class: 'mb-4' }, [
    h('label', { class: 'label' }, label),
    h('input', {
      class: 'input', type, value: value || '', onInput: (e) => onInput(e.target.value)
    })
  ]);

  refresh();

  const page = h('div', {}, [
    TopBar({ title: 'Settings', breadcrumb: null, actions: [] }),
    h('p', { class: 'text-xs sm:text-sm text-zinc-400 -mt-4 sm:-mt-6 mb-4 sm:mb-6' }, 'Manage your profile, security, billing, and API.'),
    tabNav,
    body
  ]);

  return Shell({ user: userStore.get(), page, currentPath: '/settings' });
};
