// Onboarding wizard — captures the project context that feeds the
// workspace RAG index.
//
// Each text area maps 1:1 onto an `onboarding_notes` row; the section
// name is stored in the FTS5 `title` column, so the names here
// ("brand", "audience", "tone", ...) must match what the backend and
// the orchestrator's prompt builder expect.
//
// On submit we POST the whole batch to
// `/api/onboarding/{workspace_id}/sections` and, on success, drop the
// user on the dashboard.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, toast } from '../components/ui';
import { authHeaders } from '../lib/api';
import { cn } from '../lib/utils';

/** The wizard's fields. `key` is sent verbatim as the section name. */
const SECTIONS = [
  {
    key: 'brand',
    label: 'Your product or service',
    hint: 'What do you sell? Include the name, the category and what makes it worth buying.',
    placeholder: 'We run a beachfront paella restaurant in Valencia serving traditional Valencian rice dishes…',
    required: true,
  },
  {
    key: 'audience',
    label: 'Who is it for?',
    hint: 'Describe the people you want to reach — demographics, habits, what they care about.',
    placeholder: 'Tourists aged 25-50 visiting Valencia, plus locals looking for a special-occasion dinner…',
    required: true,
  },
  {
    key: 'tone',
    label: 'Voice and feel',
    hint: 'How should the ads sound and look? Adjectives are fine.',
    placeholder: 'Warm, sun-drenched, traditional yet refined. No corporate jargon, no hard sell…',
    required: true,
  },
  {
    key: 'products',
    label: 'Key products or offers',
    hint: 'Optional. The specific dishes, plans or SKUs you want to feature.',
    placeholder: 'Paella Valenciana for two, seafood fideuà, the €35 tasting menu…',
    required: false,
  },
  {
    key: 'usps',
    label: 'What makes you different?',
    hint: 'Optional. Your unique selling points — the reason to choose you.',
    placeholder: 'The only restaurant on the beach with a wood-fired paella terrace…',
    required: false,
  },
  {
    key: 'competitors',
    label: 'Competitors',
    hint: 'Optional. Who else is competing for the same customer?',
    placeholder: 'La Pepica, Casa Carmela, other Malvarrosa seafront restaurants…',
    required: false,
  },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

/**
 * Resolve the current workspace id.
 *
 * The auth flow persists `workspace_id` directly (it comes back on the
 * register/login `TokenOut.user` payload). We fall back to digging it
 * out of the cached user blob so a session stored by an older build
 * still works, and return null if neither is present — the form then
 * tells the user to sign in again rather than POSTing to
 * `/api/onboarding/null/sections`.
 */
export function resolveWorkspaceId(): string | null {
  try {
    const direct = localStorage.getItem('workspace_id');
    if (direct) return direct;
    const raw = localStorage.getItem('mf-user');
    if (raw) {
      const ws = JSON.parse(raw)?.workspace_id;
      if (typeof ws === 'string' && ws) return ws;
    }
  } catch {
    // Private-mode / quota errors: treat as "no workspace".
  }
  return null;
}

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const workspaceId = resolveWorkspaceId();

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: SectionKey, v: string) =>
    setValues(prev => ({ ...prev, [key]: v }));

  const missing = SECTIONS.filter(s => s.required && !(values[s.key] || '').trim());
  const canSubmit = !busy && !!workspaceId && missing.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!workspaceId) {
      setError('No workspace found — please sign in again.');
      return;
    }
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map(m => m.label).join(', ')}`);
      return;
    }

    // Only send sections the user actually filled in; the backend
    // rejects empty content.
    const payload = SECTIONS
      .map(s => ({ section: s.key, content: (values[s.key] || '').trim() }))
      .filter(s => s.content.length > 0);

    setBusy(true);
    try {
      const r = await fetch(
        `/api/onboarding/${encodeURIComponent(workspaceId)}/sections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(payload),
        },
      );
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      toast('Onboarding saved — your context is now searchable.', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong saving your answers.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold font-display">
            Tell us about your business
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            We use these answers as context for every campaign we generate, so the
            more specific you are, the better the ads. You can edit them later in
            Settings.
          </p>
        </div>

        {!workspaceId && (
          <div className="mb-6 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
            We couldn't find your workspace. Please{' '}
            <button className="underline" onClick={() => navigate('/login')}>
              sign in again
            </button>.
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          {SECTIONS.map(s => (
            <div
              key={s.key}
              className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5"
            >
              <label htmlFor={`onboarding-${s.key}`} className="block">
                <span className="text-sm font-semibold text-zinc-100">
                  {s.label}
                  {s.required && <span className="text-rose-400 ml-1">*</span>}
                </span>
                <span className="block text-xs text-zinc-500 mt-1">{s.hint}</span>
              </label>
              <textarea
                id={`onboarding-${s.key}`}
                name={s.key}
                rows={4}
                value={values[s.key] || ''}
                onChange={e => set(s.key, e.target.value)}
                placeholder={s.placeholder}
                className={cn(
                  'mt-3 w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3',
                  'text-sm text-zinc-100 placeholder:text-zinc-600',
                  'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30',
                )}
              />
            </div>
          ))}

          {error && (
            <p role="alert" className="text-sm text-rose-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-sm text-zinc-400 hover:text-zinc-100"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving…' : <>Finish setup <Icon name="arrowRight" size={14} /></>}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default Onboarding;
