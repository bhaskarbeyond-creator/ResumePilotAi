// Service workers are intentionally disabled until an authenticated-data-safe caching
// strategy is defined. The bootstrap module removes legacy registrations.
export function register() {}
export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then(registration => registration.unregister())
    .catch(() => {});
}
