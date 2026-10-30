import { Button } from '@/components/ui/button';

export function ServiceDegradedBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <span>Service degraded — {message}</span>
      <Button type="button" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}
