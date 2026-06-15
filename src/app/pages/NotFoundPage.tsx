import { Link } from "react-router";
import { useLang } from "../LangContext";

export function NotFoundPage() {
  const { t } = useLang();
  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-[#0f0f0f] px-6 text-center"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <p className="text-[80px] font-light leading-none text-neutral-700">
        {t("notFound.pageNotFound")}
      </p>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl text-[#fafafa]">{t("notFound.notFoundTitle")}</h1>
        <p className="max-w-md text-sm text-neutral-400">
          {t("notFound.notFoundMessage")}
        </p>
      </div>
      <Link
        to="/app/dashboard"
        className="rounded-lg border border-neutral-800 bg-[#1a1a1a] px-5 py-2.5 text-sm text-[#fafafa] transition-colors hover:bg-neutral-800"
      >
        {t("notFound.goHome")}
      </Link>
    </div>
  );
}