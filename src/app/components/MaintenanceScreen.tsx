import { useState, useEffect } from "react";
import { Wrench, Shield, Clock, RefreshCw } from "lucide-react";
import { LokaLogo } from "./LokaLogo";
import { useLang } from "../LangContext";

/** Full-screen takeover shown to non-admin users while maintenance is on. */
export function MaintenanceScreen({ message }: { message: string }) {
  const { t } = useLang();
  const [checking, setChecking] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Show a live counter so users know the app is still alive.
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center justify-center bg-[#0f0f0f] px-6 text-center relative overflow-hidden"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Amber glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-600/[0.04] blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-lg">
        {/* Logo */}
        <LokaLogo size="md" link={false} />

        {/* Animated icon */}
        <div className="relative">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-950/40 border border-amber-800/30">
            <Wrench className="size-7 text-amber-400 animate-[spin_4s_ease-in-out_infinite]" />
          </div>
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-2xl border border-amber-500/20 animate-ping" style={{ animationDuration: "3s" }} />
        </div>

        {/* Text content */}
        <div className="flex flex-col gap-3">
          <h1 className="text-[22px] md:text-[26px] font-semibold text-neutral-50">
            {t("maintenance.title")}
          </h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed max-w-md mx-auto">
            {message || t("maintenance.message")}
          </p>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-3 flex flex-col items-center gap-1.5">
            <Shield size={16} className="text-emerald-500" />
            <span className="text-neutral-300 text-[11px] font-medium">{t("maintenance.dataSafe")}</span>
          </div>
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-3 flex flex-col items-center gap-1.5">
            <Clock size={16} className="text-indigo-400" />
            <span className="text-neutral-400 text-[11px]">{fmt(elapsed)}</span>
          </div>
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-3 flex flex-col items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-neutral-300 text-[11px] font-medium">{t("maintenance.inProgress")}</span>
          </div>
        </div>

        {/* Retry button */}
        <button
          onClick={() => {
            setChecking(true);
            window.location.reload();
          }}
          disabled={checking}
          className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-[#141414] px-5 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
          {checking ? t("maintenance.checking") : t("maintenance.checkAgain")}
        </button>

        {/* Footer */}
        <div className="flex items-center gap-3 text-neutral-600 text-[11px] mt-4">
          <div className="w-8 h-px bg-neutral-800" />
          LokaSync
          <div className="w-8 h-px bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}
