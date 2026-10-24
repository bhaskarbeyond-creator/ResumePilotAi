import React from 'react';
import { Loader2, Play, Terminal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function PlaygroundTab() {
  const {
    discoveredModels,
    playgroundModel,
    setPlaygroundModel,
    playgroundPrompt,
    setPlaygroundPrompt,
    playgroundOutput,
    playgroundMeta,
    playgroundRunning,
    handleRunPlayground,
  } = useAiSettingsContext();

  return (
    <Card className="border-border bg-surface">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Terminal className="size-4 text-brand-600" />
              Live Router Playground
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Execute an authenticated test completion against `/api/v1/chat/completions`.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="playground-model-select" className="text-xs font-semibold text-ink">
              Model
            </label>
            <select
              id="playground-model-select"
              value={playgroundModel}
              onChange={(e) => setPlaygroundModel(e.target.value)}
              className="rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
            >
              <option value="auto">auto (Live Router Policy)</option>
              {discoveredModels.map((m) => (
                <option key={`${m.providerId}:${m.id}`} value={m.id}>
                  {m.providerId}: {m.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="playground-prompt-input" className="block text-xs font-semibold text-ink mb-1">
            Prompt
          </label>
          <textarea
            id="playground-prompt-input"
            rows={3}
            value={playgroundPrompt}
            onChange={(e) => setPlaygroundPrompt(e.target.value)}
            className="w-full rounded-xl border border-border bg-canvas p-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-muted">{playgroundMeta}</span>
          <Button
            type="button"
            onClick={() => void handleRunPlayground()}
            disabled={playgroundRunning || !playgroundPrompt.trim()}
          >
            {playgroundRunning ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="size-3.5 mr-1.5" />
            )}
            {playgroundRunning ? 'Running...' : 'Execute Inference'}
          </Button>
        </div>

        {playgroundOutput && (
          <pre className="rounded-xl border border-border bg-canvas p-4 text-xs font-mono text-ink whitespace-pre-wrap wrap-break-word">
            {playgroundOutput}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
