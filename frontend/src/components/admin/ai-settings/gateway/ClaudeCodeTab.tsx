import React from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { getSnippetCode } from '../utils/snippets';

export function ClaudeCodeTab() {
  const { gatewayOrigin, copiedId, handleCopy } = useAiSettingsContext();
  const snippet = getSnippetCode('claude', gatewayOrigin);

  return (
    <Card className="border-border bg-surface">
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Terminal className="size-4 text-brand-600" />
            Claude Code CLI Configuration
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Configure Anthropic&apos;s Claude Code terminal agent to use the IME365 Unified Gateway router.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Shell Configuration</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCopy(snippet, 'claude-tab-snippet')}
            >
              {copiedId === 'claude-tab-snippet' ? (
                <Check className="size-3.5 mr-1.5 text-success-700" />
              ) : (
                <Copy className="size-3.5 mr-1.5" />
              )}
              {copiedId === 'claude-tab-snippet' ? 'Copied' : 'Copy Configuration'}
            </Button>
          </div>
          <pre
            tabIndex={0}
            role="region"
            aria-label="Claude Code environment configuration snippet"
            className="rounded-xl border border-border bg-canvas p-4 text-xs font-mono text-ink overflow-x-auto focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <code>{snippet}</code>
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
