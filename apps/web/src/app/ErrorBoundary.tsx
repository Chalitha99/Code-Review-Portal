import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/common/states.tsx';
import common from '@/content/common.json';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level render error boundary.
 *
 * Still a class component: React has no hook equivalent for
 * `componentDidCatch`. Its only job is to stop one broken panel blanking the
 * whole application — a reviewer halfway through a long form should not lose
 * their work to an unrelated render error.
 *
 * Phase 2 forwards `logError` to the backend with the correlation ID.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replaced in Phase 2 by a POST to the logging endpoint with the correlation ID.
    console.error('Unhandled render error', error, info.componentStack);
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center p-6">
          <ErrorState
            title={common.errors.boundaryTitle}
            message={common.errors.boundaryBody}
            onRetry={this.handleReset}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
