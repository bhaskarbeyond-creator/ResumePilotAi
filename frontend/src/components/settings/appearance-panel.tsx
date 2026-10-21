/**
 * Settings → Appearance: the colour theme. The theme provider applies it to
 * the document and keeps it on this device (localStorage), so it survives a
 * reload but does not follow the account to other devices.
 */
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/theme-provider';

const THEMES = [
  { id: 'light', label: 'Light', description: 'Light backgrounds', preview: 'border border-neutral-200 bg-white' },
  { id: 'dark', label: 'Dark', description: 'Dark backgrounds', preview: 'bg-neutral-900' },
  { id: 'system', label: 'System', description: 'Follows your device setting', preview: 'bg-linear-to-r from-white to-neutral-900' },
] as const;

export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const [notice, setNotice] = useState<Notice | null>(null);

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
                    aria-labelledby={`settings-theme-${option.id}-label`}
                    aria-describedby={`settings-theme-${option.id}-description`}
                    onChange={() => {
                      setTheme(option.id);
                      setNotice({ tone: 'success', text: `Theme set to ${option.label}.` });
                    }}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className={cn('h-12 w-full rounded-lg', option.preview)} />
                  <span className="flex items-center justify-between text-sm font-medium text-ink">
                    <span id={`settings-theme-${option.id}-label`}>{option.label}</span>
                    {checked && <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" />}
                  </span>
                  <span id={`settings-theme-${option.id}-description`} className="text-xs text-ink-muted">{option.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <NoticeRegions notice={notice} />
      </CardContent>
    </Card>
  );
}
