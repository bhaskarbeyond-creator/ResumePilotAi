import { useState, useMemo } from 'react';
import { normalizeError, post } from '@/lib/api-client';
import type { CatalogModel } from '../types/ai-settings.types';

interface UseDiscoveryPlaygroundOptions {
  discoveredModels: CatalogModel[];
  setDiscoveredModels: React.Dispatch<React.SetStateAction<CatalogModel[]>>;
  primaryProvider: string;
  maxTokens: number;
  temperature: number;
  redirectOn401: (err: unknown) => boolean;
  showToast: (msg: string) => void;
}

export function useDiscoveryPlayground({
  setDiscoveredModels,
  primaryProvider,
  maxTokens,
  temperature,
  redirectOn401,
}: UseDiscoveryPlaygroundOptions) {
  // Discovery State
  const [discoveryProvider, setDiscoveryProvider] = useState<string>('');
  const [discoveryModels, setDiscoveryModels] = useState<CatalogModel[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState<boolean>(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [modelsCapFilter, setModelsCapFilter] = useState<'all' | 'vision' | 'tools' | 'json'>('all');
  const [modelsSearch, setModelsSearch] = useState<string>('');

  // Playground & Snippets State
  const [playgroundModel, setPlaygroundModel] = useState<string>('auto');
  const [playgroundPrompt, setPlaygroundPrompt] = useState<string>(
    'Summarize three concrete engineering strengths for a senior backend resume in two concise sentences.'
  );
  const [playgroundOutput, setPlaygroundOutput] = useState<string>('');
  const [playgroundMeta, setPlaygroundMeta] = useState<string>('');
  const [playgroundRunning, setPlaygroundRunning] = useState<boolean>(false);

  const [snippetLang, setSnippetLang] = useState<'curl' | 'python' | 'typescript' | 'claude'>('curl');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const gatewayOrigin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/v1`;
    }
    return '/v1';
  }, []);

  const hasStaleDiscovery = useMemo(
    () => discoveryModels.some((m) => m.catalogStatus === 'stale' || m.catalogStatus === 'unverified'),
    [discoveryModels]
  );

  // Discovery Fetch
  const handleDiscoveryFetch = async (providerId: string) => {
    if (!providerId) return;
    setDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const res = await post<{
        models?: Array<{
          id: string;
          name?: string;
          contextWindow?: number | null;
          capabilities?: { vision?: boolean; tools?: boolean; json?: boolean };
          catalogStatus?: string;
        }>;
      }>('/admin/ai/fetch-models', { provider: providerId });
      const rows: CatalogModel[] = (res.models || []).map((m) => ({
        id: m.id,
        name: m.name || m.id,
        providerId,
        contextWindow: m.contextWindow ?? null,
        capabilities: m.capabilities || {},
        catalogStatus: m.catalogStatus || 'fresh',
      }));
      setDiscoveryModels(rows);
      setDiscoveredModels((prev) => [
        ...prev.filter((item) => item.providerId !== providerId),
        ...rows,
      ]);
    } catch (err: unknown) {
      if (redirectOn401(err)) return;
      const norm = normalizeError(err);
      setDiscoveryError(norm.message || 'Catalog discovery failed');
    } finally {
      setDiscoveryLoading(false);
    }
  };

  // Playground Inference
  const handleRunPlayground = async () => {
    if (!playgroundPrompt.trim() || playgroundRunning) return;
    setPlaygroundRunning(true);
    setPlaygroundOutput('');
    setPlaygroundMeta('');
    const started = performance.now();
    try {
      const res = await post<{
        choices?: Array<{ message?: { content?: string } }>;
        content?: string;
        model?: string;
        _freellmapi?: { provider?: string; actual_model?: string };
      }>('/v1/chat/completions', {
        model: playgroundModel,
        messages: [{ role: 'user', content: playgroundPrompt }],
        max_tokens: Math.min(maxTokens, 512),
        temperature,
      });
      const elapsed = Math.round(performance.now() - started);
      const content = res.choices?.[0]?.message?.content || res.content || '';
      setPlaygroundOutput(content || '(Empty completion)');
      setPlaygroundMeta(
        `Provider: ${res._freellmapi?.provider || primaryProvider} · Model: ${res._freellmapi?.actual_model || res.model || playgroundModel} · ${elapsed}ms`
      );
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setPlaygroundOutput(`Error: ${err?.message || 'Inference request failed.'}`);
    } finally {
      setPlaygroundRunning(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return {
    discoveryProvider,
    setDiscoveryProvider,
    discoveryModels,
    setDiscoveryModels,
    discoveryLoading,
    discoveryError,
    modelsCapFilter,
    setModelsCapFilter,
    modelsSearch,
    setModelsSearch,
    hasStaleDiscovery,
    handleDiscoveryFetch,

    playgroundModel,
    setPlaygroundModel,
    playgroundPrompt,
    setPlaygroundPrompt,
    playgroundOutput,
    playgroundMeta,
    playgroundRunning,
    handleRunPlayground,

    snippetLang,
    setSnippetLang,
    copiedId,
    gatewayOrigin,
    handleCopy,
  };
}
