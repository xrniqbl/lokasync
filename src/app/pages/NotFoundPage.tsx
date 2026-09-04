import { Link } from "react-router";
import { useLang } from "../LangContext";
import { LokaLogo } from "../components/LokaLogo";
import { SEOHead } from "../components/SEOHead";
import { ArrowLeft, Home } from "lucide-react";

export function NotFoundPage() {
  const { t } = useLang();

  return (
    <div
      className="dark flex h-screen w-screen flex-col items-center justify-center bg-[#0f0f0f] px-6 text-center relative overflow-hidden"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <SEOHead title="Page Not Found — LokaSync" robots="noindex, nofollow" />
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Soft radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/[0.04] blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-lg">
        {/* Logo */}
        <LokaLogo size="md" link={false} />

        {/* 404 number with gradient */}
        <div className="relative">
          <span className="text-[120px] md:text-[160px] font-bold leading-none tracking-tight bg-gradient-to-b from-neutral-600 to-neutral-800/50 bg-clip-text text-transparent select-none">
            404
          </span>
          {/* Glitch line accent */}
          <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
        </div>

        {/* Text content */}
        <div className="flex flex-col gap-3 -mt-2">
          <h1 className="text-[20px] md:text-[24px] font-semibold text-neutral-50">
            {t("notFound.notFoundTitle")}
          </h1>
          <p className="text-[14px] text-neutral-400 leading-relaxed max-w-sm mx-auto">
            {t("notFound.notFoundMessage")}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-[#141414] px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <ArrowLeft size={14} />
            Landing page
          </Link>
          <Link
            to="/app/dashboard"
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500"
          >
            <Home size={14} />
            {t("notFound.goHome")}
          </Link>
        </div>

        {/* Decorative separator */}
        <div className="flex items-center gap-3 text-neutral-600 text-[11px] mt-4">
          <div className="w-8 h-px bg-neutral-800" />
          LokaSync
          <div className="w-8 h-px bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}