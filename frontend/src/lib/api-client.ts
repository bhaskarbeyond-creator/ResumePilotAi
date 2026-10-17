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
    const axiosError = error as AxiosError<{ error?: { code?: string; message?: string }; message?: string }>;
    const data = axiosError.response?.data;
    return {
      status: axiosError.response?.status ?? 0,
      code: data?.error?.code ?? 'NETWORK_ERROR',
      message: data?.error?.message ?? data?.message ?? axiosError.message,
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
    if (!user) return null;
    const token = await user.getIdToken();
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/** Create configured API client */
function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: attach Firebase Auth token
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const authorization = await getAuthHeader();
    if (authorization) {
      config.headers.Authorization = authorization;
    }
    return config;
  });

  // Response interceptor: 401 retry with token refresh
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
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
      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();

// Convenience methods with typed responses
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<T>(url, { params });
  return response.data;
}

export async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.post<T>(url, data);
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

export async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<T>(url);
  return response.data;
}
