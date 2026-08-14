import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function RouteFocus() {
  const location = useLocation();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector('main h1, main[role="main"], main');
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);
  return null;
}
