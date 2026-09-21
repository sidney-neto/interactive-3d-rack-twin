import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV)
      console.error(
        `[Interactive 3D Rack Twin] ${this.props.label}`,
        error,
        info.componentStack,
      );
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
