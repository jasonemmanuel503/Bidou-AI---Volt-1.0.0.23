import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  onGoToStudio?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled view error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Something went wrong in this view';
      const message =
        this.props.fallbackMessage ||
        this.state.error?.message ||
        'An unexpected error occurred while rendering this section.';

      return (
        <div className="w-full max-w-2xl mx-auto my-12 p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#18181B] border border-black/10 dark:border-white/10 shadow-xl flex flex-col items-center text-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-[#FF8800]/10 text-[#FF8800] flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>

          <div className="flex flex-col gap-1.5 max-w-md">
            <h3 className="text-lg font-bold text-[#1A1A1E] dark:text-[#F5F5F7]">
              {title}
            </h3>
            <p className="text-xs text-[#6B6B75] dark:text-[#A0A0AA] line-clamp-3">
              {message}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#1A1A1E] dark:text-[#F5F5F7] transition-colors cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Try Again</span>
            </button>

            {this.props.onGoToStudio && (
              <button
                type="button"
                onClick={this.props.onGoToStudio}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-brand-gradient text-white shadow-sm hover:brightness-110 transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                <span>Go to Studio</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
