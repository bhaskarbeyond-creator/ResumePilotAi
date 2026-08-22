export const resolveOAuthSettings = (settings) => {
    const modules = settings?.modules || {};
    const socialAuth = settings?.socialAuth || {};
    const googleSettings = settings?.google || {};
    const fbSettings = settings?.facebook || {};

    const enableGoogle = modules.enableGoogleAuthModule !== undefined 
        ? !!modules.enableGoogleAuthModule 
        : (modules.enableGoogle !== undefined 
            ? !!modules.enableGoogle 
            : (googleSettings.enableGoogleLogin !== undefined 
                ? !!googleSettings.enableGoogleLogin 
                : (socialAuth.enableGoogleLogin !== undefined ? !!socialAuth.enableGoogleLogin : true)));

    const enableFacebook = modules.enableFacebookAuthModule !== undefined 
        ? !!modules.enableFacebookAuthModule 
        : (modules.enableFacebook !== undefined 
            ? !!modules.enableFacebook 
            : (fbSettings.enableFacebookLogin !== undefined 
                ? !!fbSettings.enableFacebookLogin 
                : (socialAuth.enableFacebookLogin !== undefined ? !!socialAuth.facebookAppId : true)));

    const enableLinkedIn = modules.enableLinkedinAuthModule !== undefined 
        ? !!modules.enableLinkedinAuthModule 
        : (modules.enableLinkedinLogin !== undefined 
            ? !!modules.enableLinkedinLogin 
            : (socialAuth.enableLinkedinLogin !== undefined 
                ? !!socialAuth.enableLinkedinLogin 
                : (modules.enableLinkedIn !== undefined ? !!modules.enableLinkedIn : true)));

    const enableGitHub = modules.enableGithubAuthModule !== undefined 
        ? !!modules.enableGithubAuthModule 
        : (modules.enableGithubLogin !== undefined 
            ? !!modules.enableGithubLogin 
            : (socialAuth.enableGithubLogin !== undefined 
                ? !!socialAuth.enableGithubLogin 
                : (modules.enableGitHub !== undefined ? !!modules.enableGitHub : true)));

    return { enableGoogle, enableFacebook, enableLinkedIn, enableGitHub };
};

/**
 * Fetches the public, secret-free service-availability contract. GitHub and
 * LinkedIn sign-in are served by backend routes, so a button for a provider the
 * backend cannot serve produces a "route not found"/502 on click. This lets the
 * auth screens hide those buttons instead of shipping a dead control.
 *
 * Returns `{ status, auth }` where status is 'ready' or 'unavailable'. When the
 * check cannot be made we report 'unavailable' and callers keep their
 * configured flags — an unknown answer is never upgraded to "enabled".
 */
export const fetchOAuthAvailability = async () => {
    try {
        const response = await fetch('/api/service-availability', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Availability check failed with ${response.status}`);
        const data = await response.json();
        if (!data || data.success !== true) throw new Error('Availability check returned an unusable payload');
        return { status: 'ready', auth: data.auth || {} };
    } catch (error) {
        return { status: 'unavailable', auth: {} };
    }
};

/**
 * Intersects the operator's configured OAuth toggles with what the backend can
 * actually serve. Configured OFF always wins. Only the backend-served providers
 * (GitHub, LinkedIn) are gated here; Google and Facebook run through the
 * Firebase client SDK and are not part of the backend availability contract.
 */
export const applyOAuthAvailability = (resolved, availability, status) => {
    if (status !== 'ready') return { ...resolved };
    return {
        ...resolved,
        enableLinkedIn: resolved.enableLinkedIn && availability?.linkedin === true,
        enableGitHub: resolved.enableGitHub && availability?.github === true,
    };
};
