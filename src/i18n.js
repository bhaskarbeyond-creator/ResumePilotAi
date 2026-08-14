import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common_en from './locales/en/en.json' with { type: 'json' };

export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'hi', 'es', 'fr', 'ru', 'se', 'dk', 'pt', 'de', 'it', 'gk', 'is', 'no', 'pl', 'ro', 'nl']);
const localeLoaders = {
   hi: () => import('./locales/hi/hi.json', { with: { type: 'json' } }), es: () => import('./locales/es/es.json', { with: { type: 'json' } }),
   fr: () => import('./locales/fr/fr.json', { with: { type: 'json' } }), ru: () => import('./locales/ru/ru.json', { with: { type: 'json' } }),
   se: () => import('./locales/se/se.json', { with: { type: 'json' } }), dk: () => import('./locales/dk/dk.json', { with: { type: 'json' } }),
   pt: () => import('./locales/pt/pt.json', { with: { type: 'json' } }), de: () => import('./locales/de/de.json', { with: { type: 'json' } }),
   it: () => import('./locales/it/it.json', { with: { type: 'json' } }), gk: () => import('./locales/gk/gk.json', { with: { type: 'json' } }),
   is: () => import('./locales/is/is.json', { with: { type: 'json' } }), no: () => import('./locales/no/no.json', { with: { type: 'json' } }),
   pl: () => import('./locales/pl/pl.json', { with: { type: 'json' } }), ro: () => import('./locales/ro/ro.json', { with: { type: 'json' } }),
   nl: () => import('./locales/nl/nl.json', { with: { type: 'json' } }),
};

let savedLanguage = 'en';
try {
   const stored = globalThis.localStorage?.getItem('preferredLanguage');
   if (SUPPORTED_LANGUAGES.includes(stored)) savedLanguage = stored;
} catch { /* English remains the deterministic fallback when storage is blocked. */ }

const dynamicLocaleBackend = {
   type: 'backend',
   init() {},
   read(language, _namespace, callback) {
      if (language === 'en') { callback(null, common_en); return; }
      const loader = localeLoaders[language];
      if (!loader) { callback(new Error(`Unsupported language: ${language}`), false); return; }
      loader().then(module => callback(null, module.default || module)).catch(error => callback(error, false));
   },
};

i18n.use(dynamicLocaleBackend).use(initReactI18next).init({
   lng: savedLanguage,
   fallbackLng: 'en', supportedLngs: SUPPORTED_LANGUAGES, load: 'languageOnly', cleanCode: true,
   returnEmptyString: false, defaultNS: 'common', ns: ['common'], debug: false,
   partialBundledLanguages: true,
   resources: { en: { common: common_en } },
   interpolation: { escapeValue: false },
});

export default i18n;
