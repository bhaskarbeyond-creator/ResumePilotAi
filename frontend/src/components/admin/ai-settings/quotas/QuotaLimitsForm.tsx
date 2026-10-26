import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function QuotaLimitsForm() {
  const {
    quotaData,
    basicLimitDraft,
    setBasicLimitDraft,
    premiumLimitDraft,
    setPremiumLimitDraft,
    enterpriseLimitDraft,
    setEnterpriseLimitDraft,
    adminLimitDraft,
    setAdminLimitDraft,
    quotaSaving,
    handleSaveQuotaLimits,
  } = useAiSettingsContext();

  return (
    <form onSubmit={(e) => void handleSaveQuotaLimits(e)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="quota-basic-limit" className="block text-xs font-semibold text-ink mb-1">
            Basic Daily Limit
          </label>
          <Input
            id="quota-basic-limit"
            type="number"
            min={1}
            max={10000}
            value={basicLimitDraft}
            onChange={(e) => setBasicLimitDraft(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="quota-premium-limit" className="block text-xs font-semibold text-ink mb-1">
            Premium Daily Limit
          </label>
          <Input
            id="quota-premium-limit"
            type="number"
            min={1}
            max={100000}
            value={premiumLimitDraft}
            onChange={(e) => setPremiumLimitDraft(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="quota-enterprise-limit" className="block text-xs font-semibold text-ink mb-1">
            Enterprise Daily Limit
          </label>
          <Input
            id="quota-enterprise-limit"
            type="number"
            min={100}
            max={1000000}
            value={enterpriseLimitDraft}
            onChange={(e) => setEnterpriseLimitDraft(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="quota-admin-limit" className="block text-xs font-semibold text-ink mb-1">
            Admin Daily Limit
          </label>
          <Input
            id="quota-admin-limit"
            type="number"
            min={1}
            max={1000000}
            value={adminLimitDraft}
            onChange={(e) => setAdminLimitDraft(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">
          Quota policy revision: #{quotaData?.quotaRevision ?? 0}
        </span>
        <Button type="submit" size="sm" disabled={quotaSaving}>
          {quotaSaving ? 'Saving Quotas...' : 'Save Quota Limits'}
        </Button>
      </div>
    </form>
  );
}
