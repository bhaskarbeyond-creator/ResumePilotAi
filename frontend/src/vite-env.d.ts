/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_KEY: string;
  readonly VITE_FIREBASE_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_MEASUREMENT_ID: string;
  readonly VITE_RAZORPAY_KEY_ID: string;
  readonly VITE_DEV_BACKEND_URL: string;
  readonly VITE_ENTERPRISE_TENANCY_ENABLED: string;
  readonly VITE_LOCAL_AUTH: string;
  readonly VITE_PREVIEW_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
