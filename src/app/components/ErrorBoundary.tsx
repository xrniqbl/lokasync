import { logger } from "../utils/logger";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { LokaLogo } from "./LokaLogo";
import { t as translate } from "../i18n-dict";
import { detectLang } from "../i18n";

interface Props {
  children: ReactNode;
  /** Optional fallback UI for a specific section instead of full-page. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches unhandled render errors and shows a branded recovery UI instead of
 * a blank white screen.  Place at the top level in main.tsx or App.tsx.
 *
 * Class component — required by React's componentDidCatch API.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error("ErrorBoundary", error, { componentStack: info.componentStack });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;
    const lang = detectLang();

    return (
      <div
        className="dark flex min-h-screen w-full flex-col items-center justify-center bg-[#0f0f0f] px-6 text-center relative overflow-hidden"
        style={{ fontFamily: "Lexend, sans-serif" }}
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        {/* Red glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-red-600/[0.04] blur-[100px]" />

        <div className="relative z-10 flex flex-col items-center gap-8 max-w-lg">
          <LokaLogo size="md" link={false} />

          {/* Icon */}
          <div className="flex size-16 items-center justify-center rounded-2xl bg-red-950/40 border border-red-800/30">
            <AlertTriangle className="size-7 text-red-400" />
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[22px] font-semibold text-neutral-50">
              {translate("error.title", lang)}
            </h1>
            <p className="text-[14px] text-neutral-400 leading-relaxed max-w-md mx-auto">
              {translate("error.description", lang)}
            </p>
            {this.state.error && (
              <details className="mt-2 text-left">
                <summary className="text-neutral-500 text-[12px] cursor-pointer hover:text-neutral-400 transition-colors">
                  {translate("error.technicalDetails", lang)}
                </summary>
                <pre className="mt-2 bg-[#141414] border border-neutral-800 rounded-lg p-3 text-[11px] text-red-300/80 overflow-x-auto max-h-[120px]">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-[#141414] px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              <RefreshCw size={14} />
              {translate("error.tryAgain", lang)}
            </button>
            <a
              href="/app/dashboard"
              onClick={this.handleReload}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500"
            >
              <Home size={14} />
              {translate("error.goToDashboard", lang)}
            </a>
          </div>

          <div className="flex items-center gap-3 text-neutral-600 text-[11px] mt-4">
            <div className="w-8 h-px bg-neutral-800" />
            LokaSync
            <div className="w-8 h-px bg-neutral-800" />
          </div>
        </div>
      </div>
    );
  }
}
