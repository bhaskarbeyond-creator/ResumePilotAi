/**
 * Early Pre-Paint Theme Initialization — Zero-FOUC Guarantee
 *
 * Runs synchronously in <head> before DOM parsing or painting.
 * Resolves active theme from localStorage or system prefers-color-scheme,
 * setting data-theme and .dark class on <html> for instantaneous 0ms paint.
 */
(function () {
  try {
    var saved = localStorage.getItem('cuba_theme') || localStorage.getItem('theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');
    var doc = document.documentElement;
    if (doc) {
      doc.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        doc.classList.add('dark');
      } else {
        doc.classList.remove('dark');
      }
    }
  } catch (_) {}
})();
