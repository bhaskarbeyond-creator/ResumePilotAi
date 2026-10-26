/**
 * The state machine that stops an admin surface from showing invented data.
 *
 * Each test names the defect it prevents. They are written against the reducer rather than a
 * component because the reducer is where the guarantee lives: `data` is null until a request
 * succeeds, and a failure clears it.
 */
import { describe, expect, it } from 'vitest';
import {
  adminResourceReducer,
  describeAdminFailure,
  initialAdminResourceState,
  type AdminResourceState,
} from '@/components/admin/admin-data-state';

type Row = { id: string };

const rows: Row[] = [{ id: 'usr_1' }];
type Rows = Row[];

describe('adminResourceReducer', () => {
  it('starts with no data, so no component can render a row before the server answers', () => {
    const state = initialAdminResourceState<Rows>();
    expect(state).toEqual({ status: 'loading', data: null, error: null, loadedAt: null });
  });

  it('keeps a previous payload on screen while a reload is in flight', () => {
    const ready = adminResourceReducer<Rows>(initialAdminResourceState<Rows>(), {
      type: 'success',
      data: rows,
      at: 1_700_000_000_000,
    });
    const reloading = adminResourceReducer<Rows>(ready, { type: 'load' });
    expect(reloading.status).toBe('loading');
    expect(reloading.data).toEqual(rows);
    expect(reloading.loadedAt).toBe(1_700_000_000_000);
  });

  it('clears the payload on failure instead of leaving stale rows beside a banner', () => {
    const ready = adminResourceReducer<Rows>(initialAdminResourceState<Rows>(), {
      type: 'success',
      data: rows,
      at: 1,
    });
    const failed = adminResourceReducer<Rows>(ready, {
      type: 'failure',
      error: { code: 'USER_DIRECTORY_UNAVAILABLE', message: 'nope', requestId: 'rq-1', httpStatus: 503 },
      at: 2,
    });
    expect(failed.status).toBe('failed');
    expect(failed.data).toBeNull();
    expect(failed.error?.requestId).toBe('rq-1');
  });

  it('treats an empty success as ready, not as a failure', () => {
    const state = adminResourceReducer<Rows>(initialAdminResourceState<Rows>(), {
      type: 'success',
      data: [],
      at: 5,
    });
    expect(state.status).toBe('ready');
    expect(state.data).toEqual([]);
    expect(state.error).toBeNull();
  });

  it('drops a stale error as soon as a new attempt starts', () => {
    const failed: AdminResourceState<Rows> = {
      status: 'failed',
      data: null,
      error: { code: 'HTTP_503', message: 'down', requestId: null, httpStatus: 503 },
      loadedAt: null,
    };
    expect(adminResourceReducer<Rows>(failed, { type: 'load' }).error).toBeNull();
  });
});

describe('describeAdminFailure', () => {
  it('reads the auth/policy denial envelope', () => {
    const failure = describeAdminFailure({
      response: {
        status: 403,
        data: { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permission', requestId: 'rq-9' } },
      },
    });
    expect(failure).toEqual({
      code: 'FORBIDDEN',
      message: 'Insufficient permission',
      requestId: 'rq-9',
      httpStatus: 403,
    });
  });

  it('reads the handler envelope where `error` is a sentence and `code` is a sibling', () => {
    const failure = describeAdminFailure({
      response: {
        status: 503,
        data: { success: false, code: 'USER_DIRECTORY_UNAVAILABLE', error: 'Unable to read the identity directory.' },
      },
    });
    expect(failure.code).toBe('USER_DIRECTORY_UNAVAILABLE');
    expect(failure.message).toBe('Unable to read the identity directory.');
    expect(failure.httpStatus).toBe(503);
  });

  it('reports an unreachable API as such rather than as an empty result', () => {
    const failure = describeAdminFailure({ code: 'ERR_NETWORK', message: 'Network Error' });
    expect(failure.code).toBe('NETWORK_UNREACHABLE');
    expect(failure.httpStatus).toBeNull();
  });

  it('does not present a cancelled request as a server failure', () => {
    expect(describeAdminFailure({ name: 'CanceledError' }).code).toBe('REQUEST_CANCELLED');
  });

  it('falls back to a usable message for an unknown throwable', () => {
    const failure = describeAdminFailure(undefined);
    expect(failure.code).toBe('UNEXPECTED_CLIENT_ERROR');
    expect(failure.message.length).toBeGreaterThan(10);
  });
  it('the reducer is total: an action outside the union cannot leave state undefined', () => {
    // Exhaustiveness guards are unreachable by construction, which is the point of the `never`
    // assignment. It is still driven once, through a cast, because the alternative — deleting
    // the guard to raise a coverage number — removes the compile-time check that a future
    // action type is handled.
    const state = { status: 'ready' as const, data: { id: 'x' }, error: null, loadedAt: 1 };
    const rogue = { type: 'not-a-real-action' } as unknown as Parameters<typeof adminResourceReducer>[1];
    // The guard returns the unhandled action itself: a value that is not a state, so a caller
    // that renders it fails visibly instead of showing the previous payload as if it were fresh.
    expect(adminResourceReducer(state, rogue)).toBe(rogue);
  });

  it('maps a request that timed out to REQUEST_TIMEOUT with advice, not to a server error', () => {
    const failure = describeAdminFailure({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' });
    expect(failure.code).toBe('REQUEST_TIMEOUT');
    expect(failure.httpStatus).toBeNull();
    expect(failure.message).toMatch(/did not answer in time/i);
  });

  it('maps a superseded request to REQUEST_CANCELLED rather than reporting a failure', () => {
    const failure = describeAdminFailure({ name: 'AbortError', message: 'aborted' });
    expect(failure.code).toBe('REQUEST_CANCELLED');
    expect(failure.message).toMatch(/superseded/i);
  });

  it('reads a flat { code, message } body, which some guards return without an error object', () => {
    const failure = describeAdminFailure({ response: { status: 403, data: { code: 'FORBIDDEN_ROLE', message: 'Not your role' } } });
    expect(failure).toEqual({ code: 'FORBIDDEN_ROLE', message: 'Not your role', requestId: null, httpStatus: 403 });
  });

  it('falls back to a HTTP_<status> code and a sentence when the body carries neither', () => {
    const failure = describeAdminFailure({ response: { status: 500, data: {} } });
    expect(failure.code).toBe('HTTP_500');
    expect(failure.message).toMatch(/rejected the request \(HTTP 500\)/);
    expect(failure.requestId).toBeNull();
  });

  it('names the status as unknown when the response carries no numeric status', () => {
    const failure = describeAdminFailure({ response: { data: {} } });
    expect(failure.code).toBe('HTTP_0');
    expect(failure.httpStatus).toBeNull();
    expect(failure.message).toMatch(/HTTP unknown/);
  });

});
