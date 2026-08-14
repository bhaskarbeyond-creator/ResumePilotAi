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
