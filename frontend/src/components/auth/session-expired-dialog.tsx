/**
 * "Your session ended" — the recovery surface for an expired or revoked session.
 *
 * ## Why the product needs it
 *
 * See `lib/session-events.ts`: a 401 used to be silent, and the only way back to the sign-in
 * screen was to find the account menu. This dialog is the path back. It is mounted once, by the
 * router, so it works on every authenticated screen including the ones nobody wrote a test for.
 *
 * ## Keyboard contract (asserted in `tests/session-lifecycle.spec.ts`)
 *
 * | Key | Behaviour |
 * |---|---|
 * | `Escape` | closes the dialog and returns focus to whatever was focused before it opened |
 * | `Tab` / `Shift+Tab` | cycles inside the dialog only — Radix moves focus into the content on open and traps it |
 * | `Enter` | activates the focused button; the primary action is first in DOM order, so it is the default |
 *
 * The dialog is *dismissible* on purpose. A single 401 can come from a flapping network, and
 * forcing a sign-out on one response would throw away whatever the operator was doing. The
 * session really being gone is a property the next request will re-establish.
 *
 * @module components/auth/session-expired-dialog
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ShieldAlert } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { onSessionExpired } from '@/lib/session-events';
import { useAuth } from '@/providers/auth-provider';

/** Where the sign-in screen reads the reason from, so it can explain why it appeared. */
export const SESSION_EXPIRED_PARAM = 'reason';
export const SESSION_EXPIRED_VALUE = 'session_expired';

export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  useEffect(() => onSessionExpired(() => setOpen(true)), []);

  /**
   * End the session properly, then send the person back to sign-in with an explanation.
   *
   * Clearing storage alone is not enough: `AuthProvider` holds the accepted preview identity in
   * React state, so `/login` would see an authenticated caller and redirect straight back to the
   * screen that just failed — a loop the browser test caught on the first run. `signOut()` from
   * the provider clears both, which is why this dialog consumes the auth context rather than the
   * storage helper.
   */
  const signInAgain = async () => {
    setOpen(false);
    try {
      await signOut();
    } catch (error) {
      // A sign-out that fails locally must not strand the person on a dead screen: the server
      // has already rejected the credential, so navigating is still the useful action.
      console.warn('[session-expired] sign-out failed, navigating anyway:', error);
    }
    navigate(`/login?${SESSION_EXPIRED_PARAM}=${SESSION_EXPIRED_VALUE}`, { replace: true });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" data-testid="session-expired-dialog">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <ShieldAlert aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Your session ended</DialogTitle>
          <DialogDescription>
            The sign-in for this browser is no longer valid, so the page you were on could not
            load its data. Sign in again to continue — nothing you saved has been lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Stay on this page
          </Button>
          <Button onClick={signInAgain} className="gap-2">
            <LogIn aria-hidden="true" className="size-4" />
            Sign in again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
