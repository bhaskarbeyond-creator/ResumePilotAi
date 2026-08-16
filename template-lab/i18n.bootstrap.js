// Bootstraps the shared i18n singleton for the forensic lab, then switches to
// the language requested via ?lang= so templates resolve the same translation
// keys as they do inside the real builder.
import i18n from '../src/i18n';

const language = new URLSearchParams(window.location.search).get('lang') || 'en';
i18n.changeLanguage(language).catch(() => {});

export default i18n;
