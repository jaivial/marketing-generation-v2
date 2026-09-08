// LanguageSwitcher — small dropdown that swaps the active UI language.
// Rendered at the top of Shell.tsx (and on the standalone marketing pages).

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchLanguages,
  setLanguage,
  getStoredLanguage,
  FALLBACK_LANGUAGES,
  type LanguageInfo,
} from '../lib/i18n';

interface Props {
  className?: string;
}

export const LanguageSwitcher: React.FC<Props> = ({ className = '' }) => {
  const { t, i18n } = useTranslation();
  const [languages, setLanguages] = React.useState<LanguageInfo[]>(FALLBACK_LANGUAGES);
  const [current, setCurrent] = React.useState<string>(() => i18n.language || getStoredLanguage());

  React.useEffect(() => {
    let alive = true;
    fetchLanguages().then(list => { if (alive) setLanguages(list); });
    return () => { alive = false; };
  }, []);

  // Keep the <select> in sync when the language changes elsewhere.
  React.useEffect(() => {
    const onChanged = (lng: string) => setCurrent(lng);
    i18n.on('languageChanged', onChanged);
    return () => { i18n.off('languageChanged', onChanged); };
  }, [i18n]);

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setCurrent(next);
    await setLanguage(next);
  };

  return (
    <select
      value={current}
      onChange={onChange}
      aria-label={t('common.language')}
      title={t('common.language')}
      className={
        'bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg ' +
        'px-2 py-1.5 hover:border-zinc-700 hover:text-white focus:outline-none ' +
        'focus:border-brand-500 cursor-pointer transition-colors ' + className
      }
    >
      {languages.map(l => (
        <option key={l.code} value={l.code}>{l.name}</option>
      ))}
    </select>
  );
};

export default LanguageSwitcher;
