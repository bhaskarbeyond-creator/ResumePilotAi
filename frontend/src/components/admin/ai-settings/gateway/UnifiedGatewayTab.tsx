import { useMemo } from 'react';
import { Check, Copy, Globe } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { getSnippetCode } from '../utils/snippets';
import { IntegrationSnippetsDialog } from './IntegrationSnippetsDialog';

export function UnifiedGatewayTab() {
  const {
    gatewayOrigin,
    snippetLang,
    setSnippetLang,
    copiedId,
    handleCopy,
  } = useAiSettingsContext();

  const snippetCode = useMemo(
    () => getSnippetCode(snippetLang, gatewayOrigin),
    [gatewayOrigin, snippetLang]
  );

  return (
    <Card className="border-border bg-surface">
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Globe className="size-4 text-brand-600" />
            Unified Gateway
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            OpenAI- and Anthropic-compatible endpoints served from{' '}
            <code className="font-mono text-ink">{gatewayOrigin}</code> using your authenticated
            Bearer token (never static embedded secrets).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { title: 'OpenAI Chat', path: '/v1/chat/completions' },
            { title: 'Anthropic Messages', path: '/v1/messages' },
            { title: 'Model Catalog', path: '/v1/models' },
            { title: 'Engine Status', path: '/v1/status' },
          ].map((ep) => (
            <div key={ep.path} className="rounded-xl border border-border bg-canvas p-3.5">
              <div className="text-xs font-bold text-ink">{ep.title}</div>
              <div className="text-xs font-mono text-ink-secondary mt-1 break-all">
                {ep.path}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'curl', label: 'cURL' },
                  { id: 'claude', label: 'Claude Code CLI' },
                  { id: 'typescript', label: 'TypeScript' },
                  { id: 'python', label: 'Python' },
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

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCopy(snippetCode, 'gateway-snippet')}
            >
              {copiedId === 'gateway-snippet' ? (
                <Check className="size-3.5 mr-1.5 text-success-700" />
              ) : (
                <Copy className="size-3.5 mr-1.5" />
              )}
              {copiedId === 'gateway-snippet' ? 'Copied' : 'Copy Snippet'}
            </Button>
          </div>

          <pre
            tabIndex={0}
            role="region"
            aria-label="Gateway integration code snippet"
            className="rounded-xl border border-border bg-canvas p-4 text-xs font-mono text-ink overflow-x-auto focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <code>{snippetCode}</code>
          </pre>
        </div>

        <IntegrationSnippetsDialog />
      </CardContent>
    </Card>
  );
}
