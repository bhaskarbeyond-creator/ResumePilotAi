import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { post } from '@/lib/api-client';
import type {
  AiSettingsApiResponse,
  DialogSlug,
  ProviderCatalogEntry,
} from '../types/ai-settings.types';
import { splitKeys } from '../utils/masking';

interface UseProviderMutationsOptions {
  providers: ProviderCatalogEntry[];
  setProviders: React.Dispatch<React.SetStateAction<ProviderCatalogEntry[]>>;
  primaryProvider: string;
  setPrimaryProvider: React.Dispatch<React.SetStateAction<string>>;
  commitSettingsPatch: (
    payload: Record<string, any>,
    successMessage: string,
    options?: { force?: boolean }
  ) => Promise<AiSettingsApiResponse | null>;
  dialogTarget: string;
  openDialog: (slug: DialogSlug, target?: string) => void;
  closeDialog: () => void;
  showToast: (msg: string) => void;
  setActionError: React.Dispatch<React.SetStateAction<string | null>>;
  redirectOn401: (err: unknown) => boolean;
}

export function useProviderMutations({
  providers,
  setProviders,
  primaryProvider,
  setPrimaryProvider,
  commitSettingsPatch,
  dialogTarget,
  openDialog,
  closeDialog,
  showToast,
  setActionError,
  redirectOn401,
}: UseProviderMutationsOptions) {
  // Row State & Drafts
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [singleKeyDrafts, setSingleKeyDrafts] = useState<Record<string, string>>({});
  const [poolKeyDrafts, setPoolKeyDrafts] = useState<Record<string, string>>({});
  const [showRowKey, setShowRowKey] = useState<Record<string, boolean>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [baseUrlDrafts, setBaseUrlDrafts] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState<boolean>(false);

  useEffect(() => {
    if (providers && providers.length > 0) {
      const nextModels: Record<string, string> = {};
      const nextUrls: Record<string, string> = {};
      for (const item of providers) {
        nextModels[item.id] = item.defaultModel || '';
        nextUrls[item.id] = (item as any).customBaseUrl || '';
      }
      setModelDrafts(nextModels);
      setBaseUrlDrafts(nextUrls);
    }
  }, [providers]);

  // Configure Modal State
  const [modalTab, setModalTab] = useState<'single' | 'pool' | 'endpoint'>('single');
  const [modalSelectedId, setModalSelectedId] = useState<string>('gemini');
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState<boolean>(false);
  const [modalPlatformQuery, setModalPlatformQuery] = useState<string>('');
  const [modalApiKey, setModalApiKey] = useState<string>('');
  const [modalShowKey, setModalShowKey] = useState<boolean>(false);
  const [modalPoolText, setModalPoolText] = useState<string>('');
  const [modalCustomBaseUrl, setModalCustomBaseUrl] = useState<string>('');
  const [modalCustomModel, setModalCustomModel] = useState<string>('');
  const [modalTesting, setModalTesting] = useState<boolean>(false);
  const [modalTestStatus, setModalTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const modalKeyInputRef = useRef<HTMLInputElement>(null);

  const resetModalDrafts = useCallback(() => {
    setModalApiKey('');
    setModalPoolText('');
    setModalCustomBaseUrl('');
    setModalCustomModel('');
    setModalTestStatus(null);
    setModalError(null);
    setPlatformDropdownOpen(false);
    setModalPlatformQuery('');
  }, []);

  const modalSelectedPlatform = useMemo(
    () => providers.find((p) => p.id === modalSelectedId) || null,
    [modalSelectedId, providers]
  );

  const modalFilteredPlatforms = useMemo(() => {
    const q = modalPlatformQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.label && p.label.toLowerCase().includes(q))
    );
  }, [modalPlatformQuery, providers]);

  const canProbeInModal = Boolean(
    modalSelectedPlatform &&
      modalTab !== 'endpoint' &&
      !modalCustomBaseUrl.trim() &&
      (modalSelectedPlatform.keyless ||
        (modalTab === 'single' && modalApiKey.trim().length > 0) ||
        (modalTab === 'pool' && splitKeys(modalPoolText).length > 0))
  );

  const probeStoredProvider = async (providerId: string) => {
    setTestingId(providerId);
    setActionError(null);
    try {
      const res = await post<{
        success?: boolean;
        latencyMs?: number;
        message?: string;
        model?: string;
      }>('/admin/ai/test-provider', { provider: providerId });
      if (res.success === false) {
        throw new Error(res.message || 'Connection check failed');
      }
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, status: 'healthy', latencyMs: res.latencyMs ?? p.latencyMs ?? null }
            : p
        )
      );
      showToast(res.message || `${providerId} verified.`);
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setProviders((prev) =>
        prev.map((p) => (p.id === providerId ? { ...p, status: 'issues' } : p))
      );
      setActionError(err?.message || `Verification failed for ${providerId}.`);
    } finally {
      setTestingId(null);
    }
  };

  const handleCheckAll = async () => {
    const candidates = providers.filter((p) => p.enabled && (p.configuredOnServer || p.keyless));
    if (candidates.length === 0) {
      showToast('No enabled providers to verify.');
      return;
    }
    setCheckingAll(true);
    for (const candidate of candidates) {
      await probeStoredProvider(candidate.id);
    }
    setCheckingAll(false);
  };

  const handleToggleProvider = async (p: ProviderCatalogEntry, nextEnabled: boolean) => {
    if (!nextEnabled && p.id === primaryProvider) {
      setActionError(
        `Cannot disable ${p.name} because it is currently the active primary provider. Switch primary provider first.`
      );
      return;
    }
    if (nextEnabled && !p.keyless && !p.hasKey && !p.configuredOnServer) {
      setModalSelectedId(p.id);
      setModalTab('single');
      openDialog('configure-provider', p.id);
      return;
    }
    setProviders((prev) =>
      prev.map((item) =>
        item.id === p.id
          ? {
              ...item,
              enabled: nextEnabled,
              disabled: !nextEnabled,
              status: !nextEnabled ? 'disabled' : item.status === 'disabled' ? 'unverified' : item.status,
            }
          : item
      )
    );
    try {
      await commitSettingsPatch(
        { enabledProviders: { [p.id]: nextEnabled } },
        `${p.name} ${nextEnabled ? 'enabled' : 'disabled'}.`
      );
    } catch {
      setProviders((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? {
                ...item,
                enabled: !nextEnabled,
                disabled: nextEnabled,
                status: nextEnabled ? 'disabled' : item.status,
              }
            : item
        )
      );
    }
  };

  const handleSaveRowSingleKey = async (p: ProviderCatalogEntry) => {
    const draft = (singleKeyDrafts[p.id] || '').trim();
    if (!draft) return;
    try {
      await commitSettingsPatch(
        {
          [`${p.id}ApiKey`]: draft,
          enabledProviders: { [p.id]: true },
        },
        `${p.name} API key saved and masked.`
      );
      setSingleKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setShowRowKey((prev) => ({ ...prev, [p.id]: false }));
      await probeStoredProvider(p.id);
    } catch {
      /* handled */
    }
  };

  const handleSaveRowPool = async (p: ProviderCatalogEntry) => {
    const keys = splitKeys(poolKeyDrafts[p.id] || '');
    if (keys.length === 0) return;
    try {
      await commitSettingsPatch(
        {
          [`${p.id}ApiKeys`]: keys,
          enabledProviders: { [p.id]: true },
        },
        `${p.name} rotation pool (${keys.length} keys) saved.`
      );
      setPoolKeyDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      await probeStoredProvider(p.id);
    } catch {
      /* handled */
    }
  };

  const handleSaveRowConfig = async (p: ProviderCatalogEntry) => {
    const nextModel = (modelDrafts[p.id] || '').trim();
    const nextBaseUrl = (baseUrlDrafts[p.id] || '').trim();
    try {
      await commitSettingsPatch(
        {
          [`${p.id}Model`]: nextModel,
          [`${p.id}BaseUrl`]: nextBaseUrl || 'none',
        },
        `${p.name} model and endpoint settings saved.`
      );
    } catch {
      /* handled */
    }
  };

  const handleSetPrimaryImmediate = async (p: ProviderCatalogEntry) => {
    setPrimaryProvider(p.id);
    try {
      await commitSettingsPatch(
        {
          provider: p.id,
          enabledProviders: { [p.id]: true },
        },
        `${p.name} set as primary provider.`
      );
    } catch {
      /* handled */
    }
  };

  const handleConfirmClearKey = async () => {
    if (!dialogTarget) return;
    const targetProvider = providers.find((p) => p.id === dialogTarget);
    try {
      await commitSettingsPatch(
        { clearSecrets: { [dialogTarget]: true } },
        `Stored credential removed for ${targetProvider?.name || dialogTarget}.`
      );
      closeDialog();
    } catch {
      closeDialog();
    }
  };

  const handleModalProbeBeforeSave = async () => {
    if (!modalSelectedPlatform || !canProbeInModal) return;
    setModalTesting(true);
    setModalTestStatus(null);
    setModalError(null);
    try {
      const candidateKey =
        modalTab === 'pool'
          ? splitKeys(modalPoolText)[0]
          : modalApiKey.trim() || undefined;
      const res = await post<{ success?: boolean; message?: string; latencyMs?: number }>(
        '/admin/ai/test-provider',
        {
          provider: modalSelectedPlatform.id,
          ...(candidateKey ? { apiKey: candidateKey } : {}),
          ...(modalCustomModel.trim() ? { model: modalCustomModel.trim() } : {}),
        }
      );
      if (res.success === false) {
        setModalTestStatus({ ok: false, msg: res.message || 'Provider rejected key.' });
      } else {
        setModalTestStatus({
          ok: true,
          msg: res.message || `Verified (${res.latencyMs ?? 1}ms).`,
        });
      }
    } catch (err: any) {
      if (redirectOn401(err)) return;
      setModalTestStatus({
        ok: false,
        msg: err?.message || 'Connection test failed.',
      });
    } finally {
      setModalTesting(false);
    }
  };

  const handleModalSaveAndActivate = async () => {
    if (!modalSelectedPlatform) {
      setModalError('Select a provider platform first.');
      return;
    }
    const pId = modalSelectedPlatform.id;
    const payload: Record<string, any> = {
      enabledProviders: { [pId]: true },
    };

    if (modalTab === 'pool') {
      const pool = splitKeys(modalPoolText);
      if (pool.length === 0 && !modalSelectedPlatform.keyless) {
        setModalError('Enter at least one API key for the rotation pool.');
        return;
      }
      if (pool.length > 0) payload[`${pId}ApiKeys`] = pool;
    } else {
      const single = modalApiKey.trim();
      if (!single && !modalSelectedPlatform.keyless && !modalSelectedPlatform.hasKey) {
        setModalError('Enter an API key to activate this provider.');
        return;
      }
      if (single) payload[`${pId}ApiKey`] = single;
      else if (modalSelectedPlatform.keyless) payload[`${pId}ApiKey`] = 'keyless';
    }

    if (modalCustomBaseUrl.trim()) {
      payload[`${pId}BaseUrl`] = modalCustomBaseUrl.trim();
    }
    if (modalCustomModel.trim()) {
      payload[`${pId}Model`] = modalCustomModel.trim();
    }

    setModalError(null);
    try {
      await commitSettingsPatch(payload, `${modalSelectedPlatform.name} configured and activated.`);
      resetModalDrafts();
      closeDialog();
      await probeStoredProvider(pId);
    } catch (err: any) {
      setModalError(err?.message || 'Unable to save provider configuration.');
    }
  };

  return {
    expandedRowId,
    setExpandedRowId,
    singleKeyDrafts,
    setSingleKeyDrafts,
    poolKeyDrafts,
    setPoolKeyDrafts,
    showRowKey,
    setShowRowKey,
    modelDrafts,
    setModelDrafts,
    baseUrlDrafts,
    setBaseUrlDrafts,
    testingId,
    checkingAll,

    modalTab,
    setModalTab,
    modalSelectedId,
    setModalSelectedId,
    platformDropdownOpen,
    setPlatformDropdownOpen,
    modalPlatformQuery,
    setModalPlatformQuery,
    modalApiKey,
    setModalApiKey,
    modalShowKey,
    setModalShowKey,
    modalPoolText,
    setModalPoolText,
    modalCustomBaseUrl,
    setModalCustomBaseUrl,
    modalCustomModel,
    setModalCustomModel,
    modalTesting,
    modalTestStatus,
    setModalTestStatus,
    modalError,
    setModalError,
    modalKeyInputRef,
    resetModalDrafts,
    modalSelectedPlatform,
    modalFilteredPlatforms,
    canProbeInModal,

    probeStoredProvider,
    handleCheckAll,
    handleToggleProvider,
    handleSaveRowSingleKey,
    handleSaveRowPool,
    handleSaveRowConfig,
    handleSetPrimaryImmediate,
    handleConfirmClearKey,
    handleModalProbeBeforeSave,
    handleModalSaveAndActivate,
  };
}
