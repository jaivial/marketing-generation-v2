import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './lib/store';
import { AuthProvider } from './lib/store';
import { initI18n } from './lib/i18n';
import './styles/index.css';

// Load the persisted language (or `en`) before the first paint so the UI never
// flashes untranslated keys. Rendering proceeds even if the fetch fails —
// i18next falls back to echoing the key.
initI18n().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <StoreProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </StoreProvider>
      </HashRouter>
    </React.StrictMode>
  );
});
