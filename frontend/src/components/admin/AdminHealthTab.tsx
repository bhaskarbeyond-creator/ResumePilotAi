import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/api-client';
import { ServiceDegradedBanner } from './ServiceDegradedBanner';

type HealthState = 'HEALTHY' | 'DEGRADED' | 'UNKNOWN';
type HealthService = { id: string; name: string; state: HealthState };

export function AdminHealthTab() {
  const [services, setServices] = useState<HealthService[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(false);
    setServices(null);
    try {
      const response = await get<unknown>('/platform/health/probes');
      if (!response || typeof response !== 'object' || !Array.isArray((response as { services?: unknown }).services)) throw new Error('Invalid response');
      const items = (response as { services: unknown[] }).services;
      if (!items.every(item => {
        if (!item || typeof item !== 'object') return false;
        const service = item as Record<string, unknown>;
        return typeof service.id === 'string' && typeof service.name === 'string' && ['HEALTHY', 'DEGRADED', 'UNKNOWN'].includes(String(service.state));
      })) throw new Error('Invalid response');
      setServices(items as HealthService[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-ink">Platform Health & Telemetry</h2>
        <p className="text-xs text-ink-muted">Current dependency checks, not historical uptime or isolation measurements.</p>
      </div>
      <Button variant="outline" onClick={() => void refresh()} disabled={loading}>Refresh health checks</Button>
    </div>
    {loading ? <p role="status">Checking services…</p> : error ?
      <ServiceDegradedBanner message="Health checks could not be collected." onRetry={() => void refresh()} /> :
      services?.length === 0 ? <p role="status">No service checks were returned.</p> :
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services?.map(service => <Card key={service.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h3 className="font-semibold text-ink">{service.name}</h3>
          <span className={service.state === 'HEALTHY' ? 'font-bold text-success-700' : service.state === 'DEGRADED' ? 'font-bold text-error-700' : 'font-bold text-ink-muted'}>{service.state}</span>
        </CardContent></Card>)}
      </div>}
  </section>;
}
