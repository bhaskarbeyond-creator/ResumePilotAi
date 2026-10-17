/**
 * Feature Placeholder Page
 *
 * Temporary page for features that are being rebuilt.
 * Will be replaced with full implementations.
 */

import { useLocation, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Construction, ArrowLeft, Home } from 'lucide-react';

interface FeaturePlaceholderProps {
  title: string;
  description?: string;
  icon?: typeof Construction;
}

export function FeaturePlaceholder({
  title,
  description,
  icon: Icon = Construction,
}: FeaturePlaceholderProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-warning-50">
            <Icon className="size-8 text-warning-600" />
          </div>
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {description || 'This feature is being rebuilt as part of the new platform. It will be available soon.'}
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="size-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Not Found Page (404)
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <div className="text-8xl font-extrabold text-neutral-200">404</div>
        <h1 className="mt-4 text-2xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-ink-muted">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/">
              <Home className="size-4" />
              Go home
            </Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
