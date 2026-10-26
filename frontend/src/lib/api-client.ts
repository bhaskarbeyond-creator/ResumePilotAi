/**
 * IME365 API Client
 *
 * Typed HTTP client for communicating with the backend API.
 * Handles Firebase Auth token injection, 401 retry, and error normalization.
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { auth } from '@/lib/firebase';
import { readPreviewSession } from '@/lib/preview-session';
import { resolveActiveTenantId, setActiveTenantId, autoResolveTenantFromError } from '@/lib/tenant-context';

/** Standardized API error shape */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Wrap an unknown error into a consistent ApiError */
export function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string | { code?: string; message?: string }; code?: string; message?: string }>;
    const data = axiosError.response?.data;
    const nested = data?.error && typeof data.error === 'object' ? data.error : undefined;
    const flatMessage = typeof data?.error === 'string' ? data.error : undefined;
    return {
      status: axiosError.response?.status ?? 0,
      code: nested?.code ?? data?.code ?? 'NETWORK_ERROR',
      message: nested?.message ?? flatMessage ?? data?.message ?? axiosError.message,
      details: data,
    };
  }
  if (error instanceof Error) {
    return { status: 0, code: 'CLIENT_ERROR', message: error.message };
  }
  return { status: 0, code: 'UNKNOWN_ERROR', message: String(error) };
}

// Single-flight token refresh to coalesce concurrent 401 retries
let refreshPromise: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      const token = await user.getIdToken(true);
      return token ? `Bearer ${token}` : null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Get current auth header */
async function getAuthHeader(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) return `Bearer ${token}`;
    }
  } catch {
    // Continue to fallback
  }

  // Non-production preview session (well-formed, unexpired rptest token), then
  // the legacy stored-token keys. The backend verifies every token it receives.
  try {
    const preview = readPreviewSession();
    if (preview) return `Bearer ${preview.token}`;
    const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (token) return `Bearer ${token}`;
  } catch {
    // Ignore parse error
  }

  return null;
}

/** Create configured API client */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api',
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: attach Firebase Auth token, tenant context, and normalize URL
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if (config.url) {
      config.url = config.url.replace(/^\/?api\//, '/');
    }
    const authorization = await getAuthHeader();
    if (authorization) {
      config.headers.Authorization = authorization;
    }

    // Inject X-Tenant-Id for AI governance and quota routing.
    // Only attach when not already set (enterprise-api.ts manages its own tenant headers)
    // and only for non-enterprise, non-platform-admin routes (per LEGACY ISOLATION invariant).
    // Platform-wide admin and platform routes must NOT receive tenant context.
    const isPlatformAdmin = config.url && (/^\/?(api\/)?(admin|platform|v1)\b/i.test(config.url));
    if (!config.headers['X-Tenant-Id'] && !isPlatformAdmin) {
      const tenantId = resolveActiveTenantId();
      if (tenantId) {
        config.headers['X-Tenant-Id'] = tenantId;
      }
    }

    return config;
  });

  // Response interceptor: 401 retry with token refresh + TENANT_CONTEXT_REQUIRED auto-resolution
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
        _tenantRetry?: boolean;
      };

      // 401 retry with token refresh
      if (
        error.response?.status === 401 &&
        !originalRequest._retry &&
        originalRequest.url
      ) {
        originalRequest._retry = true;
        const newAuth = await refreshToken();
        if (newAuth) {
          originalRequest.headers.Authorization = newAuth;
          return client(originalRequest);
        }
      }

      // TENANT_CONTEXT_REQUIRED auto-resolution retry
      // When the backend returns 400 with TENANT_CONTEXT_REQUIRED (because user
      // has multiple active tenant memberships and no X-Tenant-Id was sent),
      // auto-resolve from the error payload and retry once.
      if (
        error.response?.status === 400 &&
        !originalRequest._tenantRetry &&
        originalRequest.url
      ) {
        const data = error.response?.data as {
          error?: {
            code?: string;
            message?: string;
            primaryTenantId?: string;
            availableTenants?: Array<{ tenantId?: string }>;
          };
        } | undefined;
        const errorInfo = data?.error;
        const isTenantRequired =
          errorInfo?.code === 'TENANT_CONTEXT_REQUIRED' ||
          (typeof errorInfo?.message === 'string' &&
            errorInfo.message.includes('Multiple active tenant memberships'));

        if (isTenantRequired) {
          originalRequest._tenantRetry = true;
          const resolvedTenant = await autoResolveTenantFromError(
            errorInfo,
            getAuthHeader,
          );
          if (resolvedTenant) {
            originalRequest.headers['X-Tenant-Id'] = resolvedTenant;
            return client(originalRequest);
          }
        }
      }

      // TENANT_ACCESS_DENIED auto-healing:
      // When a request fails with 403 TENANT_ACCESS_DENIED (e.g. stored tenant is
      // a personal workspace or user no longer has membership in that tenant),
      // purge the invalid tenant from storage and retry once WITHOUT X-Tenant-Id.
      // This immediately unblocks candidate dashboard requests and lets them use
      // their individual entitlement cleanly.
      if (
        error.response?.status === 403 &&
        !originalRequest._tenantRetry &&
        originalRequest.url
      ) {
        const data = error.response?.data as {
          error?: {
            code?: string;
            message?: string;
          };
        } | undefined;
        const errorInfo = data?.error;
        if (
          errorInfo?.code === 'TENANT_ACCESS_DENIED' ||
          (typeof errorInfo?.message === 'string' &&
            errorInfo.message.includes('not active or accessible'))
        ) {
          originalRequest._tenantRetry = true;
          setActiveTenantId(null);
          delete originalRequest.headers['X-Tenant-Id'];
          return client(originalRequest);
        }
      }

      return Promise.reject(error);
    },
  );

  return client;
}


export const apiClient = createApiClient();

// Convenience methods with typed responses
/**
 * `config` is threaded through so a caller can pass an `AbortSignal`. Administrative reads
 * use it: a tab that unmounts mid-flight must cancel its request rather than resolve into a
 * dead component, and a reload must supersede the request it replaces instead of racing it.
 */
export async function get<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: import('axios').AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.get<T>(url, { ...config, params });
  return response.data;
}

export async function post<T>(url: string, data?: unknown, config?: import('axios').AxiosRequestConfig): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

export async function patch<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.patch<T>(url, data);
  return response.data;
}

export async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<T>(url, data);
  return response.data;
}

export async function del<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.delete<T>(url, { data });
  return response.data;
}
