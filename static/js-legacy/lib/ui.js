// Toast + modal utilities.

export const toast = (msg, kind = 'info', timeout = 3500) => {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  const icon = kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i';
  el.innerHTML = `
    <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
      ${kind === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
        kind === 'error'   ? 'bg-rose-500/20 text-rose-400' :
                              'bg-indigo-500/20 text-indigo-400'}">${icon}</span>
    <span>${escapeHtml(msg)}</span>
  `;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 250);
  }, timeout);
};

export const modal = (content) => {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4';
  overlay.style.animation = 'fadeIn .2s ease-out';

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  if (content instanceof Node) overlay.appendChild(content);
  else overlay.innerHTML = content;

  root.appendChild(overlay);
  return { close, overlay };
};

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

export const timeAgo = (ts) => {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return new Date(ts).toLocaleDateString();
};

export const formatNumber = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
  return String(n);
};
