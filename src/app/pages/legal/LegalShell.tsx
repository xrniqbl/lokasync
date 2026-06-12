import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import {
  detectLang,
  LangToggle,
  persistLang,
  type Lang,
} from "../../i18n";

/**
 * Legal document content: each section is a heading plus a list of blocks.
 * A string block renders as a paragraph; a string[] block renders as bullets.
 */
export interface LegalSection {
  title: string;
  blocks: (string | string[])[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const SHELL_STRINGS = {
  en: {
    back: "Back to home",
    contact: "Questions? Contact us at",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    rights: "All rights reserved.",
  },
  id: {
    back: "Kembali ke beranda",
    contact: "Ada pertanyaan? Hubungi kami di",
    privacy: "Kebijakan Privasi",
    terms: "Syarat Layanan",
    rights: "Hak cipta dilindungi.",
  },
} as const;

export const SUPPORT_EMAIL = "support@lokasync.com";

export function LegalShell({ doc }: { doc: Record<Lang, LegalDoc> }) {
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = SHELL_STRINGS[lang];
  const d = doc[lang];

  const changeLang = (next: Lang) => {
    setLang(next);
    persistLang(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div
      className="dark min-h-screen w-full bg-[#0f0f0f] text-neutral-50"
      style={{
        fontFamily: "Lexend, sans-serif",
        background: [
          "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(99,102,241,0.10), transparent 60%)",
          "#0f0f0f",
        ].join(", "),
      }}
    >
      {/* Top bar */}
      <header className="border-b border-neutral-800/70">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-6">
          <Link to="/" aria-label="LokaSync home">
            <span className="text-[14px] font-bold tracking-[0.08em] text-[#fafafa]">
              LOKASYNC
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-[13px] text-neutral-400 transition-colors hover:text-neutral-100"
            >
              <ArrowLeft className="size-3.5" />
              {t.back}
            </Link>
            <LangToggle lang={lang} onChange={changeLang} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-14">
        <h1 className="text-[28px] leading-tight text-neutral-50">{d.title}</h1>
        <p className="mt-2 text-[12.5px] text-neutral-500">{d.updated}</p>
        <p className="mt-6 text-[14px] leading-relaxed text-neutral-300">
          {d.intro}
        </p>

        {d.sections.map((section, i) => (
          <section key={section.title} className="mt-10">
            <h2 className="text-[17px] text-neutral-100">
              {i + 1}. {section.title}
            </h2>
            {section.blocks.map((block, j) =>
              Array.isArray(block) ? (
                <ul
                  key={j}
                  className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed text-neutral-400 marker:text-neutral-600"
                >
                  {block.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p
                  key={j}
                  className="mt-3 text-[13.5px] leading-relaxed text-neutral-400"
                >
                  {block}
                </p>
              ),
            )}
          </section>
        ))}

        <p className="mt-12 rounded-2xl border border-white/[0.06] bg-[#1a1a1a]/80 p-5 text-[13.5px] leading-relaxed text-neutral-400">
          {t.contact}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-neutral-100 underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </main>

      <footer className="border-t border-neutral-800/70">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-6 py-6 sm:flex-row">
          <p className="text-[12px] text-neutral-600">
            © 2026 LokaSync. {t.rights}
          </p>
          <nav className="flex items-center gap-4 text-[12px]">
            <Link
              to="/privacy"
              className="text-neutral-500 transition-colors hover:text-neutral-200"
            >
              {t.privacy}
            </Link>
            <Link
              to="/terms"
              className="text-neutral-500 transition-colors hover:text-neutral-200"
            >
              {t.terms}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
