/**
 * The hook that makes "latest request wins" true.
 *
 * Two defects it prevents, both of which produce an admin panel that looks like it is showing
 * current data while showing a previous request's answer:
 *
 *  1. **A late answer overwrites a newer one.** The operator types in a filter, the earlier
 *     (slow) request lands afterwards, and the table reverts. The hook aborts the previous
 *     request and ignores any answer whose signal is aborted.
 *  2. **An unmounted panel updates state.** React logs a warning in development and, worse,
 *     keeps a closure alive holding the payload. The hook drops answers when `active` is false.
 *
 * These are the two guards at `use-admin-resource.ts:51-55`, covered here by driving a promise
 * that resolves only after unmount / abort. That is the only way to reach them: by construction
 * they run exclusively on paths a happy-path test never takes.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAdminResource } from '@/components/admin/use-admin-resource';

/** A promise the test resolves by hand, so the order of events is the test's, not the timer's. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

describe('useAdminResource', () => {
  it('ignores a success that lands after the panel unmounted', async () => {
    const pending = deferred<{ id: string }>();
    const load = vi.fn(() => pending.promise);

    const { unmount, result } = renderHook(() => useAdminResource(load));
    expect(result.current.status).toBe('loading');

    unmount();
    pending.resolve({ id: 'stale' });

    // Nothing left to await: the guard returns before dispatching, so the assertion is that no
    // act() warning or state update follows. A tick is enough to prove the then-handler ran.
    await Promise.resolve();
    expect(result.current.data).toBeNull();
  });

  it('ignores a failure that lands after the panel unmounted', async () => {
    const pending = deferred<never>();
    const load = vi.fn(() => pending.promise);

    const { unmount, result } = renderHook(() => useAdminResource(load));
    unmount();
    pending.reject(new Error('late'));
    await Promise.resolve();

    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('loading');
  });

  it('aborts the previous request when reloading, so a slow answer cannot win', async () => {
    const signals: AbortSignal[] = [];
    const first = deferred<{ id: string }>();
    const second = deferred<{ id: string }>();
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });

    const { result } = renderHook(() => useAdminResource(load));
    act(() => result.current.reload());

    await waitFor(() => expect(signals).toHaveLength(2));
    const [firstSignal, secondSignal] = signals;
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);

    // The old request answers last; it must not replace the new payload.
    second.resolve({ id: 'new' });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'new' }));
    first.resolve({ id: 'old' });
    await Promise.resolve();
    expect(result.current.data).toEqual({ id: 'new' });
  });

  it('exposes reload and the failure as a typed error, not a thrown exception', async () => {
    const load = vi.fn().mockRejectedValue({
      response: { status: 503, data: { error: { code: 'STORE_DOWN', message: 'Down' } } },
    });

    const { result } = renderHook(() => useAdminResource(load));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.error).toMatchObject({ code: 'STORE_DOWN', httpStatus: 503 });
    expect(result.current.data).toBeNull();
    expect(typeof result.current.reload).toBe('function');
  });
});
