import { getWebsiteData } from '../firestore/dbOperations';

// Compatibility helper for callers that need the current analytics configuration.
export async function Analytics() {
    return getWebsiteData();
}
