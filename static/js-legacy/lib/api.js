// API + SSE client. Returns an EventSource-like async iterator.
//
// Usage:
//   for await (const ev of streamCampaign({...})) {
//     if (ev.event === 'frame') ...
//   }

export async function* streamCampaign({ source_kind, target, duration_s, style }) {
  const url = (window.MF_API || '') + '/api/campaigns';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_kind, target, duration_s, style }),
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
      let data;
      try { data = JSON.parse(dt); } catch { data = dt; }
      yield { event: ev, data };
    }
  }
}

export async function getHistory() {
  // Falls back to local store; tries server first.
  try {
    const r = await fetch('/api/campaigns/history');
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.campaigns)) return j.campaigns;
    }
  } catch {}
  return null;
}

export async function getHealth() {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return { ok: false };
    return await r.json();
  } catch { return { ok: false }; }
}
