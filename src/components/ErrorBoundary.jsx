/**
 * React error boundary.
 *
 * Catches render-time errors in a subtree and shows a fallback panel
 * with the error message + a Retry button. Used to wrap each tab so a
 * bug in one analyzer doesn't blank the whole editor.
 *
 * React doesn't have a hooks API for this — error boundaries still
 * require a class component as of React 19.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, ACCENT } from '../theme.js';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to console so the user / a future Sentry can see the stack.
    console.error('Vault ErrorBoundary caught:', error, info?.componentStack);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (this.state.error) {
      return (
        <div className="border p-6" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />
            <div className="flex-1 min-w-0">
              <div className="font-serif text-sm tracking-[0.2em] uppercase font-bold" style={{ color: ACCENT }}>
                {this.props.label || 'Something went wrong'}
              </div>
              <div className="font-mono text-xs mt-2 break-words" style={{ color: CREAM }}>
                {this.state.error.message || String(this.state.error)}
              </div>
              <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                The rest of the app still works — try a different tab, then come back. If this keeps happening, the deck data may have a malformed entry.
              </div>
              <button
                onClick={this.reset}
                className="mt-3 font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1.5"
                style={{ borderColor: CREAM_FAINT, color: CREAM }}
              >
                Retry →
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
