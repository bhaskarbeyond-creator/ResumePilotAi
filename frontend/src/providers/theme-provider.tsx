import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export interface TenantBranding {
  brandName?: string;
  logoUrl?: string;
  darkLogoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  customCss?: string;
  hidePlatformBadge?: boolean;
}

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  tenantBranding: TenantBranding | null;
  applyTenantBranding: (branding: TenantBranding | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'ime365_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // LocalStorage access may fail in private mode
    }
    return 'light';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [tenantBranding, setTenantBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    let actualTheme: 'light' | 'dark' = 'light';

    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      actualTheme = systemDark ? 'dark' : 'light';
    } else {
      actualTheme = theme;
    }

    setResolvedTheme(actualTheme);

    if (actualTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Listen to system changes if theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const actual = e.matches ? 'dark' : 'light';
      setResolvedTheme(actual);
      if (actual === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Dynamic Tenant Branding & Whitelabel Injection (Module 15 / FP-A15)
  useEffect(() => {
    const root = document.documentElement;
    const styleId = 'ime365-tenant-branding-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!tenantBranding) {
      root.style.removeProperty('--color-tenant-primary');
      root.style.removeProperty('--color-tenant-accent');
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
      return;
    }

    if (tenantBranding.primaryColor) {
      root.style.setProperty('--color-tenant-primary', tenantBranding.primaryColor);
    } else {
      root.style.removeProperty('--color-tenant-primary');
    }

    if (tenantBranding.accentColor) {
      root.style.setProperty('--color-tenant-accent', tenantBranding.accentColor);
    } else {
      root.style.removeProperty('--color-tenant-accent');
    }

    if (tenantBranding.faviconUrl) {
      let iconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = tenantBranding.faviconUrl;
    }

    if (tenantBranding.customCss) {
      // Security guard: verify no script or expression injection
      const sanitizedCss = tenantBranding.customCss
        .replace(/expression|javascript|<script|<\/script|@import/gi, '')
        .slice(0, 5000);

      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = sanitizedCss;
    } else if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  }, [tenantBranding]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const applyTenantBranding = (branding: TenantBranding | null) => {
    setTenantBranding(branding);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        tenantBranding,
        applyTenantBranding,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
