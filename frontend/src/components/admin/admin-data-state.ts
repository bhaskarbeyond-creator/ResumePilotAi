/**
 * The state machine behind every administrative data surface.
 *
 * An admin console answers one question honestly or not at all: *is what I am looking at
 * real?* Three states are therefore mandatory and one state is forbidden.
 *
 *   loading → the request is in flight and nothing is known yet
 *   ready   → the server answered; `data` is the answer, including "no rows"
 *   failed  → the server refused, timed out or was unreachable; `error` says which
 *
 * The forbidden state is a plausible-looking row that no server produced. Several tabs in
 * this console used to seed their tables with sample records so the screen never looked
 * empty; an operator could suspend, export or "reset the password" of an account that did
 * not exist. `data: null` until a request succeeds is the whole defence — a component
 * cannot render a row it was never given.
 *
 * Kept free of React so the transitions and the failure mapping can be tested directly.
 */

/** The only three states an administrative surface may render. */
export type AdminResourceStatus = 'loading' | 'ready' | 'failed';

/**
 * A failure as the operator needs to see it: a stable code to quote in a ticket, the
 * server's message when it sent one, the request id that ties the failure to a server log
 * line, and the HTTP status when the server answered at all.
 *
 * Never carries a stack trace, never a raw exception string.
 */
export interface AdminResourceError {
  /** Stable, upper-snake-case code from the server, or one of this module's own codes. */
  code: string;
  /** One sentence an operator can act on. */
  message: string;
  /** `X-Request-Id`/`requestId` echoed by the server, when it sent one. */
  requestId: string | null;
  /** HTTP status, or `null` when no response arrived (DNS, refused, aborted). */
  httpStatus: number | null;
}

export interface AdminResourceState<T> {
  status: AdminResourceStatus;
  /** `null` until a request succeeds. Never seeded with sample data. */
  data: T | null;
  error: AdminResourceError | null;
  /** Epoch ms of the last successful load; `null` before the first success. */
  loadedAt: number | null;
}

export type AdminResourceAction<T> =
  | { type: 'load' }
  | { type: 'success'; data: T; at: number }
  | { type: 'failure'; error: AdminResourceError; at: number };

export function initialAdminResourceState<T>(): AdminResourceState<T> {
  return { status: 'loading', data: null, error: null, loadedAt: null };
}

/**
 * Transitions are total, so a stray `success` after a failure cannot resurrect stale
 * rows: a success replaces `data` outright, and a failure clears it. Showing the previous
 * payload beside a failure banner would invite the operator to act on a stale snapshot.
 */
export function adminResourceReducer<T>(
  state: AdminResourceState<T>,
  action: AdminResourceAction<T>,
): AdminResourceState<T> {
  switch (action.type) {
    case 'load':
      return { ...state, status: 'loading', error: null };
    case 'success':
      return { status: 'ready', data: action.data, error: null, loadedAt: action.at };
    case 'failure':
      return { status: 'failed', data: null, error: action.error, loadedAt: state.loadedAt };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Codes this module produces itself, for failures the server never answered. */
const LOCAL_CODES = {
  unreachable: 'NETWORK_UNREACHABLE',
  timeout: 'REQUEST_TIMEOUT',
  cancelled: 'REQUEST_CANCELLED',
  unknown: 'UNEXPECTED_CLIENT_ERROR',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/**
 * Normalise anything a rejected request can throw into the operator-facing shape.
 *
 * Handles the three envelopes this backend actually emits:
 *   - `{ success: false, error: { code, message, requestId } }` (auth/policy denials)
 *   - `{ success: false, code, error: 'text' }`                   (route handlers)
 *   - `{ success: false, code, error: { code, message } }`        (some nested guards)
 * plus axios' wrapping (`error.response.data`) and transport failures (`no response`).
 */
export function describeAdminFailure(error: unknown): AdminResourceError {
  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response)) {
      const httpStatus = typeof response.status === 'number' ? response.status : null;
      const body = isRecord(response.data) ? response.data : {};
      const nested = isRecord(body.error) ? body.error : null;
      const code =
        (nested ? readString(nested, 'code') : null) ??
        readString(body, 'code') ??
        `HTTP_${httpStatus ?? 0}`;
      const message =
        (nested ? readString(nested, 'message') : null) ??
        readString(body, 'error', 'message') ??
        `The server rejected the request (HTTP ${httpStatus ?? 'unknown'}).`;
      const requestId =
        (nested ? readString(nested, 'requestId') : null) ??
        readString(body, 'requestId');
      return { code, message, requestId, httpStatus };
    }

    // A cancelled request is not a failure the operator caused; it must not read as one.
    if (readString(error, 'name') === 'CanceledError' || readString(error, 'code') === 'ERR_CANCELED') {
      return {
        code: LOCAL_CODES.cancelled,
        message: 'The request was cancelled before it completed.',
        requestId: null,
        httpStatus: null,
      };
    }
    if (readString(error, 'code') === 'ECONNABORTED') {
      return {
        code: LOCAL_CODES.timeout,
        message: 'The server did not answer in time. Try again; if it repeats, check the API health page.',
        requestId: null,
        httpStatus: null,
      };
    }
    if (readString(error, 'name') === 'AbortError') {
      return { code: LOCAL_CODES.cancelled, message: 'The request was superseded.', requestId: null, httpStatus: null };
    }
    if (readString(error, 'message') !== null && readString(error, 'code') === 'ERR_NETWORK') {
      return {
        code: LOCAL_CODES.unreachable,
        message: 'The API could not be reached. Nothing was changed.',
        requestId: null,
        httpStatus: null,
      };
    }
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return { code: LOCAL_CODES.unknown, message: error.message, requestId: null, httpStatus: null };
  }

  return {
    code: LOCAL_CODES.unknown,
    message: 'The request failed and the server gave no reason. Nothing was changed.',
    requestId: null,
    httpStatus: null,
  };
}
