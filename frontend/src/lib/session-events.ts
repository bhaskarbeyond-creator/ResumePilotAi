/**
 * "Your session ended" — one signal, raised by the HTTP client, consumed by the UI.
 *
 * ## The gap this closes
 *
 * A 401 used to be invisible. The API client tried a token refresh, and when there was nothing
 * to refresh with (no Firebase user, an expired preview token) the request simply rejected. Every
 * panel on screen then showed its own "could not load" state, which reads as a broken product
 * rather than as an expired session: the operator retries, gets 401 again, and has no path back
 * to the sign-in screen except hunting for the menu.
 *
 * ## Why an event bus rather than a store
 *
 * The producer is a module-level axios interceptor with no React context, and the consumer is a
 * dialog that is mounted once for the whole router. A tiny subscription is the smallest thing
 * that connects them without making the client depend on React or turning this into global
 * state that other code might start reading authority from.
 *
 * ## What it deliberately does not do
 *
 * It does not clear the session, navigate, or decide what the person sees. The dialog owns that:
 * a network blip that happens to produce one 401 must be dismissible without signing the person
 * out, which is why the signal is "report", not "enforce".
 *
 * @module lib/session-events
 */

/** A subscriber, called once per expiry report. */
type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

/**
 * Subscribe to session-expiry reports.
 *
 * @param listener called when the API client concludes the session is over
 * @returns an unsubscribe function, for effect cleanup
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Report that a request was rejected as unauthenticated **after** the client's one retry.
 *
 * Concurrent failures collapse into one notification: a screen with six panels that all 401
 * reports six times, and the dialog is idempotent, but a listener that logs would otherwise write
 * six identical lines.
 *
 * @param source optional label for diagnostics; never user-facing
 */
export function reportSessionExpired(source = 'api-client'): void {
  if (listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      // A listener that throws must not take the request path down with it.
      console.warn(`[session-events] listener failed for ${source}:`, error);
    }
  }
}

/** Test seam: drop every subscriber so one test cannot leak into the next. */
export function __clearSessionExpiredListeners(): void {
  listeners.clear();
}
