/**
 * Settings → Appearance: the colour theme. The app's ThemeProvider
 * (providers/theme-provider.tsx) is the only theme store: this panel reads
 * `theme` from it and writes through `setTheme`. The provider applies the
 * choice to the document and keeps it on this device (localStorage), so it
 * survives a reload but does not follow the account to other devices.
 * "System" stays a real preference: the provider follows the device setting
 * and updates when it changes.
 *
 * The options are native radio inputs in a fieldset, so the browser supplies
 * the full radio keyboard model (Tab into the group, arrow keys move and
 * select) and the checked state; the visible card is the input's label.
 */
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/theme-provider';

const THEMES = [
  { id: 'light', label: 'Light', description: 'Light backgrounds', preview: 'border border-neutral-200 bg-white' },
  { id: 'dark', label: 'Dark', description: 'Dark backgrounds', preview: 'border border-neutral-700 bg-neutral-900' },
  { id: 'system', label: 'System', description: 'Follows your device setting', preview: 'border border-neutral-300 bg-linear-to-r from-white to-neutral-900' },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];

export function AppearancePanel() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [notice, setNotice] = useState<Notice | null>(null);

  const choose = (id: ThemeId, label: string) => {
    if (id === theme) return;
    setTheme(id);
    setNotice({ tone: 'success', text: `Theme set to ${label}.` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Saved on this device only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="min-w-0">
          <legend className="sr-only">Colour theme</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {THEMES.map((option) => {
              const checked = theme === option.id;
              const labelId = `settings-theme-${option.id}-label`;
              const descriptionId = `settings-theme-${option.id}-description`;
              return (
                <label
                  key={option.id}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-3 transition-colors',
                    'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500',
                    checked ? 'border-brand-500 ring-2 ring-brand-200' : 'border-border hover:border-brand-400',
                  )}
                >
                  <input
                    type="radio"
                    name="settings-theme"
                    value={option.id}
                    checked={checked}
                    aria-labelledby={labelId}
                    aria-describedby={descriptionId}
                    onChange={() => choose(option.id, option.label)}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className={cn('h-12 w-full rounded-lg', option.preview)} />
                  <span className="flex items-center justify-between text-sm font-medium text-ink">
                    <span id={labelId}>{option.label}</span>
                    {/* Fixed-size slot so the check mark never shifts the layout. */}
                    <span className="inline-flex size-4" aria-hidden="true">
                      {checked && <CheckCircle2 className="size-4 text-brand-600" />}
                    </span>
                  </span>
                  <span id={descriptionId} className="text-xs text-ink-muted">{option.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {theme === 'system' && (
          <p className="text-xs text-ink-muted">Your device currently uses the {resolvedTheme} theme.</p>
        )}
        <NoticeRegions notice={notice} />
      </CardContent>
    </Card>
  );
}
