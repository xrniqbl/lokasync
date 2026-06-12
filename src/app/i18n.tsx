/**
 * Shared EN/ID language helpers for the public pages (landing, legal).
 * Persists the choice to localStorage under `loka-lang`.
 */

export type Lang = "en" | "id";

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("loka-lang");
    if (saved === "en" || saved === "id") return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith("id") ? "id" : "en";
}

export function persistLang(lang: Lang) {
  try {
    localStorage.setItem("loka-lang", lang);
  } catch {
    /* storage unavailable */
  }
}

/** EN / ID pill toggle. */
export function LangToggle({
  lang,
  onChange,
  className = "",
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className={`flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] p-0.5 ${className}`}
    >
      {(["en", "id"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={lang === option}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide transition-colors ${
            lang === option
              ? "bg-neutral-50 text-neutral-900"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
