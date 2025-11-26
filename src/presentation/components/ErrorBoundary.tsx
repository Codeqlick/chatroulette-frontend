import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';
import { logger } from '@infrastructure/logging/frontend-logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Error caught', { error, errorInfo });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="mb-6">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-red-500">Algo salió mal</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Ocurrió un error inesperado. Por favor, intenta recargar la página.
            </p>
            {this.state.error && (
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-8 font-mono">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-4 justify-center">
              <Button variant="primary" size="lg" onClick={() => window.location.reload()}>
                Recargar Página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
