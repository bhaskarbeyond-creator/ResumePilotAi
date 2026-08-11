var config = {
    adminEmail: 'bhaskar.beyond@gmail.com', // The website will consider this email  as an admin
    brand: {
        useImg: true, // 320X70 Preferable Size , replace with true if you want to use image logo. and keep false if you want to keep the logo as text
        name: 'ResumePilot AI', // This will be shown in the absence of the logo
    },
    // PayPal Configuration
    paypalClientID: '', // Replace with your actual PayPal Client ID
    paypalEnvironment: 'sandbox', // Use 'sandbox' for testing, 'live' for production
    // Legacy PayPal config (remove this after updating)

    stripe_publishable_key: '', // Make sure its th publishable key
    backendUrl: typeof window !== 'undefined' ? (window.location.port === '5173' || window.location.hostname === 'ai-resume-builder.local' || window.location.hostname === 'localhost' ? window.location.hostname + ':8080' : window.location.host) : 'localhost:8080',
    provider: 'http',
};
export default config;
