/**
 * Global language context for the LokaSync dashboard.
 * Wraps the entire app and provides `lang` + `t()` to all components.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { detectLang, persistLang, type Lang } from "./i18n";
import { t as translate, type TranslationKey } from "./i18n-dict";

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey | (string & {})) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persistLang(next);
    document.documentElement.lang = next;
  }, []);

  // Sync on mount
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Listen for changes from other tabs / settings page
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "loka-lang" && (e.newValue === "en" || e.newValue === "id")) {
        setLangState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useCallback(
    (key: TranslationKey | (string & {})) => translate(key, lang),
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

/** Hook: get the current language and translation function. */
export function useLang() {
  return useContext(LangContext);
}
