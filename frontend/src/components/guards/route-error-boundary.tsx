/**
 * Route Error Boundary
 *
 * Catches rendering errors in route components and displays
 * a recovery-oriented error screen.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-error-50">
              <AlertTriangle className="size-6 text-error-600" />
            </div>
            <h2 className="text-xl font-semibold text-ink">Something went wrong</h2>
            <p className="mt-2 text-sm text-ink-muted">
              An unexpected error occurred. You can try refreshing the page or going back to the homepage.
            </p>
            {this.state.error && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-neutral-100 p-3 text-left text-xs text-ink-secondary">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="size-4" />
                Try again
              </Button>
              <Button onClick={this.handleGoHome}>
                <Home className="size-4" />
                Go home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
