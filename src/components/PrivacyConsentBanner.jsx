import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSystemSettings } from '../firestore/dbOperations';
import { sanitizeUrl } from '../utils/sanitizeHtml';
import { getAnalyticsConsent, setAnalyticsConsent } from '../utils/privacyConsent';

export const OPEN_PRIVACY_CHOICES_EVENT = 'resumepilot:open-privacy-choices';

export function openPrivacyChoicesModal() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(OPEN_PRIVACY_CHOICES_EVENT));
    }
}

const DEFAULTS = Object.freeze({
    enableCookieBanner: true,
    cookieMessage: 'We use optional analytics cookies to understand website traffic and improve the resume-building experience.',
    buttonText: 'Allow analytics',
    privacyPolicyUrl: '/p/privacy-policy',
});

export default function PrivacyConsentBanner() {
    const location = useLocation();
    const [config, setConfig] = useState(DEFAULTS);
    const [configLoaded, setConfigLoaded] = useState(false);
    const [consent, setConsent] = useState(() => getAnalyticsConsent());
    const [showChoices, setShowChoices] = useState(() => getAnalyticsConsent() === 'pending');

    useEffect(() => {
        let active = true;
        getSystemSettings().then((settings) => {
            if (active) setConfig({ ...DEFAULTS, ...(settings?.gdpr || {}) });
        }).catch(() => {}).finally(() => { if (active) setConfigLoaded(true); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        const handleOpen = () => setShowChoices(true);
        window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, handleOpen);
        return () => window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, handleOpen);
    }, []);

    const choose = (value) => {
        setAnalyticsConsent(value);
        setConsent(value);
        setShowChoices(false);
    };

    if (!configLoaded || !config.enableCookieBanner) return null;

    // Inside active dashboard, resume builder, or enterprise workspaces, completely suppress the banner so it never obstructs work
    const isAppWorkspace = /^\/(dashboard|dashboard2|build-resume|create-resume|export|shared|admin|adm|interview|job-tracker|portfolio|coverletter|cover-letter|billing|pricing|enterprise)/i.test(location.pathname);
    if (isAppWorkspace) return null;

    // When the user has already made their privacy choice, completely hide the banner (do not show a floating button)
    if (!showChoices) {
        return null;
    }

    return (
        <section role="dialog" aria-modal="false" aria-labelledby="privacy-consent-title" className="fixed right-4 bottom-4 z-[9999] max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex flex-col gap-4">
                <div>
                    <h2 id="privacy-consent-title" className="text-sm font-semibold text-slate-900">Optional analytics</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{config.cookieMessage}</p>
                    <p className="mt-1 text-xs text-slate-500">Your choice is currently: <strong>{consent}</strong>. Essential authentication and security storage are unaffected.</p>
                    <a href={sanitizeUrl(config.privacyPolicyUrl) || DEFAULTS.privacyPolicyUrl} className="mt-1 inline-block text-xs font-medium text-indigo-700 hover:underline">Privacy policy</a>
                </div>
                <div className="flex flex-row items-center gap-2">
                    <button type="button" onClick={() => choose('granted')} className="flex-1 rounded-md bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
                        {config.buttonText || DEFAULTS.buttonText}
                    </button>
                    <button type="button" onClick={() => choose('denied')} className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
                        Reject
                    </button>
                </div>
            </div>
        </section>
    );
}
