import { getWebsiteData } from '../services/api/platform';

// Compatibility helper for callers that need the current analytics configuration.
export async function Analytics() {
    return getWebsiteData();
}

// bs-component-foundation

export const AnalyticsContainer = () => <div className="container-fluid d-none bs-analytics" />;
