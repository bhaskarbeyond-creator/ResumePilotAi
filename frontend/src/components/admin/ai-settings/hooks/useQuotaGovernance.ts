import { useState, useCallback } from 'react';
import { get, normalizeError, post } from '@/lib/api-client';
import type {
  EngineMetricsResponse,
  EngineStatusResponse,
  QuotaDashboardResponse,
} from '../types/ai-settings.types';

interface UseQuotaGovernanceOptions {
  isSuperAdmin: boolean;
  dialogTarget: string;
  closeDialog: () => void;
  showToast: (msg: string) => void;
  redirectOn401: (err: unknown) => boolean;
  setV2Enabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useQuotaGovernance({
  isSuperAdmin,
  dialogTarget,
  closeDialog,
  showToast,
  redirectOn401,
  setV2Enabled,
}: UseQuotaGovernanceOptions) {
  const [quotaData, setQuotaData] = useState<QuotaDashboardResponse | null>(null);
  const [quotaLoading, setQuotaLoading] = useState<boolean>(true);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaRequiresReauth, setQuotaRequiresReauth] = useState<boolean>(false);
  const [basicLimitDraft, setBasicLimitDraft] = useState<string>('10');
  const [premiumLimitDraft, setPremiumLimitDraft] = useState<string>('100');
  const [enterpriseLimitDraft, setEnterpriseLimitDraft] = useState<string>('5000');
  const [adminLimitDraft, setAdminLimitDraft] = useState<string>('10000');
  const [quotaSaving, setQuotaSaving] = useState<boolean>(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatusResponse | null>(null);
  const [engineMetrics, setEngineMetrics] = useState<EngineMetricsResponse | null>(null);

  const loadQuotaAndTelemetry = useCallback(async () => {
    setQuotaLoading(true);
    setQuotaError(null);
    try {
      const requests: Promise<any>[] = [
        get<QuotaDashboardResponse>('/admin/ai/quota-stats').catch((err) => ({ __err: err })),
        get<EngineStatusResponse>('/freellmapi/status').catch(() => null),
      ];
      if (isSuperAdmin) {
        requests.push(get<EngineMetricsResponse>('/freellmapi/metrics').catch(() => null));
      } else {
        requests.push(
          get<{ value?: boolean }>('/admin/operations/feature-flags/ai_settings_v2_enabled').catch(
            () => null
          )
        );
      }
      const [qRes, statusRes, thirdRes] = await Promise.all(requests);
      if (qRes && qRes.__err) {
        if (redirectOn401(qRes.__err)) return;
        setQuotaError(qRes.__err.message || 'Unable to load AI quota statistics.');
      } else if (qRes && qRes.limits) {
        setQuotaData(qRes);
        setBasicLimitDraft(String(qRes.limits.basic ?? 10));
        setPremiumLimitDraft(String(qRes.limits.premium ?? 100));
        setEnterpriseLimitDraft(String(qRes.limits.enterprise ?? 5000));
        setAdminLimitDraft(String(qRes.limits.admin ?? 10000));
      }
      if (statusRes) setEngineStatus(statusRes);
      if (isSuperAdmin && thirdRes) {
        setEngineMetrics(thirdRes);
      } else if (!isSuperAdmin && thirdRes && typeof thirdRes.value === 'boolean') {
        setV2Enabled(thirdRes.value);
      }
    } finally {
      setQuotaLoading(false);
    }
  }, [isSuperAdmin, redirectOn401, setV2Enabled]);

  const handleSaveQuotaLimits = async (e: React.FormEvent) => {
    if (e?.preventDefault) e.preventDefault();
    setQuotaSaving(true);
    setQuotaError(null);
    setQuotaRequiresReauth(false);
    try {
      const res = await post<{
        revision?: number;
        limits?: QuotaDashboardResponse['limits'];
        message?: string;
      }>('/admin/ai/quota-limits', {
        basicDailyLimit: Number(basicLimitDraft),
        premiumDailyLimit: Number(premiumLimitDraft),
        enterpriseDailyLimit: Number(enterpriseLimitDraft),
        adminDailyLimit: Number(adminLimitDraft),
        expectedRevision: quotaData?.quotaRevision ?? 0,
      });
      if (res && res.limits) {
        setQuotaData((prev) => (prev ? { ...prev, limits: res.limits! } : prev));
      }
      showToast(res.message || 'AI daily quota limits saved.');
      await loadQuotaAndTelemetry();
    } catch (err: any) {
      if (redirectOn401(err)) return;
      const norm = normalizeError(err);
      if (norm.code === 'RECENT_AUTH_REQUIRED' || norm.status === 403) {
        setQuotaRequiresReauth(true);
        setQuotaError(norm.message || 'Recent authentication required. Re-login to continue.');
      } else {
        setQuotaError(norm.message || 'Unable to save AI quota limits.');
      }
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleConfirmQuotaReset = async (globalAll = false) => {
    setQuotaSaving(true);
    setQuotaError(null);
    setQuotaRequiresReauth(false);
    try {
      const body = globalAll ? { all: true } : { uid: dialogTarget };
      const res = await post<{ message?: string }>('/admin/ai/reset-quota', body);
      showToast(res.message || (globalAll ? 'All quotas reset.' : 'User quota reset.'));
      closeDialog();
      await loadQuotaAndTelemetry();
    } catch (err: any) {
      if (redirectOn401(err)) return;
      const norm = normalizeError(err);
      if (norm.code === 'RECENT_AUTH_REQUIRED' || norm.status === 403) {
        setQuotaRequiresReauth(true);
        setQuotaError(norm.message || 'Recent authentication required. Re-login to continue.');
      } else {
        setQuotaError(norm.message || 'Unable to reset quota.');
      }
      closeDialog();
    } finally {
      setQuotaSaving(false);
    }
  };

  return {
    quotaData,
    setQuotaData,
    quotaLoading,
    quotaError,
    quotaRequiresReauth,
    basicLimitDraft,
    setBasicLimitDraft,
    premiumLimitDraft,
    setPremiumLimitDraft,
    enterpriseLimitDraft,
    setEnterpriseLimitDraft,
    adminLimitDraft,
    setAdminLimitDraft,
    quotaSaving,
    engineStatus,
    engineMetrics,
    loadQuotaAndTelemetry,
    handleSaveQuotaLimits,
    handleConfirmQuotaReset,
  };
}
