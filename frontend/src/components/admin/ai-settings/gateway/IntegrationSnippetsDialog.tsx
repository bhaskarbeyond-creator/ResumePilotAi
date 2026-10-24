import React, { useMemo } from 'react';
import { Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { getSnippetCode } from '../utils/snippets';

export function IntegrationSnippetsDialog() {
  const {
    activeDialog,
    closeDialog,
    snippetLang,
    setSnippetLang,
    copiedId,
    gatewayOrigin,
    handleCopy,
  } = useAiSettingsContext();

  const snippetCode = useMemo(
    () => getSnippetCode(snippetLang, gatewayOrigin),
    [gatewayOrigin, snippetLang]
  );

  return (
    <Dialog open={activeDialog === 'snippets'} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Integration Snippets</DialogTitle>
          <DialogDescription>
            Connect internal services or CLI agents to <code className="font-mono">{gatewayOrigin}</code>.
            Credentials are never embedded in code examples.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'curl', label: 'cURL' },
                { id: 'typescript', label: 'JavaScript / TS' },
                { id: 'python', label: 'Python' },
                { id: 'claude', label: 'Claude Code' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSnippetLang(item.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer',
                  snippetLang === item.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-canvas text-ink-secondary border border-border'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <pre
            tabIndex={0}
            role="region"
            aria-label="Dialog integration code snippet"
            className="rounded-xl border border-border bg-canvas p-3 text-xs font-mono text-ink overflow-x-auto focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <code>{snippetCode}</code>
          </pre>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleCopy(snippetCode, 'dialog-snippet')}
          >
            <Code2 className="size-3.5 mr-1.5" />
            {copiedId === 'dialog-snippet' ? 'Copied' : 'Copy Code'}
          </Button>
          <Button type="button" size="sm" onClick={closeDialog}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
