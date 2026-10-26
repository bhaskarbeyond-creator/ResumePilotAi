/**
 * `useAdminResource` — one request, three honest states.
 *
 * Every administrative tab that reads from the API uses this instead of seeding local
 * state with sample rows and swallowing failures. The loader receives an `AbortSignal` so
 * a tab that unmounts mid-flight cannot call `setState` on a dead component, and so a
 * reload supersedes the previous request instead of racing it.
 *
 * The loader is held in a ref: components pass an inline arrow function, which is a new
 * identity on every render, and depending on it would re-issue the request forever.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  adminResourceReducer,
  describeAdminFailure,
  initialAdminResourceState,
  type AdminResourceError,
  type AdminResourceStatus,
} from './admin-data-state';

export interface AdminResource<T> {
  status: AdminResourceStatus;
  /** `null` until a request has succeeded. */
  data: T | null;
  error: AdminResourceError | null;
  /** Epoch ms of the last success. */
  loadedAt: number | null;
  /** True while a reload is in flight *and* a previous payload is on screen. */
  refreshing: boolean;
  /** Re-issue the request. Safe to call while one is already in flight. */
  reload: () => void;
}

export function useAdminResource<T>(load: (signal: AbortSignal) => Promise<T>): AdminResource<T> {
  const [state, dispatch] = useReducer(
    adminResourceReducer<T>,
    undefined,
    initialAdminResourceState<T>,
  );
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    dispatch({ type: 'load' });
    loadRef.current(controller.signal).then(
      (data) => {
        if (!active || controller.signal.aborted) return;
        dispatch({ type: 'success', data, at: Date.now() });
      },
      (error: unknown) => {
        if (!active || controller.signal.aborted) return;
        dispatch({ type: 'failure', error: describeAdminFailure(error), at: Date.now() });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    loadedAt: state.loadedAt,
    refreshing: state.status === 'loading' && state.data !== null,
    reload,
  };
}
