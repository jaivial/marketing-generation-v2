// i18n bootstrap — react-i18next wired to the backend `/api/i18n` endpoints.
//
// Bundles live server-side (app/i18n/<lang>.json) and are fetched on demand,
// so shipping a new language never requires a frontend rebuild. The chosen
// language is persisted in localStorage under `i18nextLng` (the key
// i18next-browser-languagedetector uses by convention) and re-applied on
// every page load / navigation.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const STORAGE_KEY = 'i18nextLng';
export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'sv', 'pl', 'ja',
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number];

export interface LanguageInfo {
  code: string;
  name: string;
  rtl?: boolean;
}

/** Static fallback so the switcher renders even if /languages is unreachable. */
export const FALLBACK_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'sv', name: 'Svenska' },
  { code: 'pl', name: 'Polski' },
  { code: 'ja', name: '日本語' },
];

const apiBase = (typeof window !== 'undefined' && (window as any).MF_API) || '';

/** Read the persisted language, falling back to `en`. */
export function getStoredLanguage(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)
    ? saved
    : DEFAULT_LANGUAGE;
}

/** Fetch the flat key→string bundle for a language. */
export async function fetchBundle(lang: string): Promise<Record<string, string>> {
  const r = await fetch(`${apiBase}/api/i18n/strings?lang=${encodeURIComponent(lang)}`);
  if (!r.ok) throw new Error(`i18n: HTTP ${r.status} for ${lang}`);
  const data = await r.json();
  // `_meta` is bookkeeping, not a translatable string.
  const { _meta, ...strings } = data || {};
  return strings as Record<string, string>;
}

/** Fetch the list of languages the backend can serve. */
export async function fetchLanguages(): Promise<LanguageInfo[]> {
  try {
    const r = await fetch(`${apiBase}/api/i18n/languages`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data) && data.length ? data : FALLBACK_LANGUAGES;
  } catch {
    return FALLBACK_LANGUAGES;
  }
}

const loaded = new Set<string>();

/** Load a bundle into i18next (once per language) and activate it. */
export async function loadLanguage(lang: string): Promise<void> {
  if (!loaded.has(lang)) {
    try {
      const strings = await fetchBundle(lang);
      i18n.addResourceBundle(lang, 'translation', strings, true, true);
      loaded.add(lang);
    } catch (err) {
      // Network/404 → stay on whatever is already active rather than blanking
      // the UI. English is bundled as the in-memory fallback.
      console.warn('[i18n] failed to load', lang, err);
      return;
    }
  }
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

/** Persist + activate a language. Safe to call from event handlers. */
export async function setLanguage(lang: string): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  await loadLanguage(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

let initialised: Promise<void> | null = null;

/**
 * Initialise i18next. Idempotent — repeated calls return the same promise so
 * React StrictMode's double-invocation doesn't double-init.
 */
export function initI18n(): Promise<void> {
  if (initialised) return initialised;
  const lng = getStoredLanguage();

  initialised = i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: DEFAULT_LANGUAGE,
      // Keys are flat dotted strings ("nav.dashboard"), not nested objects.
      keySeparator: false,
      nsSeparator: false,
      resources: {},
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      // Render the key itself rather than an empty node if a string is missing.
      parseMissingKeyHandler: (key: string) => key,
    })
    .then(async () => {
      // Always have English available as the fallback bundle.
      await loadLanguage(DEFAULT_LANGUAGE);
      if (lng !== DEFAULT_LANGUAGE) await loadLanguage(lng);
      if (typeof document !== 'undefined') document.documentElement.lang = lng;
    });

  return initialised;
}

export default i18n;
