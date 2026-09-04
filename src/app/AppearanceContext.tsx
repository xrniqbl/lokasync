/**
 * Global appearance settings (accent color + font size).
 *
 * The app's UI colors are hardcoded against Tailwind's `indigo` family, and
 * Tailwind v4 exposes every color as a CSS variable (`--color-indigo-600`,
 * etc). So to re-theme the whole app we simply repoint the `indigo` ramp at
 * another family's ramp on :root — every `bg-indigo-*` / `text-indigo-*`
 * utility updates automatically, with correct shades, touching no component.
 *
 * Font size scales the whole app via `zoom` on the root element (small/large),
 * which is the only safe lever given the app uses fixed-px text utilities.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as api from "./utils/api";

export type AccentFamily =
  | "indigo"
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "red";

export type FontSize = "small" | "medium" | "large";

export type Density = "compact" | "comfortable" | "spacious";

export type SidebarPosition = "left" | "right";

// Tailwind shade steps we mirror from the chosen family onto the indigo ramp.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// Full Tailwind v4 color ramps. We can't reference `var(--color-violet-600)`
// because Tailwind only emits variables for shades actually used in markup, and
// the non-indigo families aren't referenced anywhere — so we set explicit hex
// values onto the `--color-indigo-*` variables every `indigo-*` utility reads.
const RAMPS: Record<Exclude<AccentFamily, "indigo">, Record<number, string>> = {
  violet: {
    50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd", 400: "#a78bfa",
    500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95", 950: "#2e1065",
  },
  blue: {
    50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa",
    500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a", 950: "#172554",
  },
  emerald: {
    50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399",
    500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b", 950: "#022c22",
  },
  amber: {
    50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24",
    500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03",
  },
  red: {
    50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171",
    500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a",
  },
};

const FONT_ZOOM: Record<FontSize, string> = {
  small: "0.92",
  medium: "1",
  large: "1.08",
};

const DENSITY_SCALE: Record<Density, string> = {
  compact: "0.85",
  comfortable: "1",
  spacious: "1.15",
};

function applyAccent(family: AccentFamily) {
  const root = document.documentElement;
  for (const shade of SHADES) {
    if (family === "indigo") {
      // Restore the native ramp.
      root.style.removeProperty(`--color-indigo-${shade}`);
    } else {
      root.style.setProperty(
        `--color-indigo-${shade}`,
        RAMPS[family][shade],
      );
    }
  }
}

function applyFontSize(size: FontSize) {
  // `zoom` scales layout + text uniformly and is supported across modern
  // Chromium/WebKit/Firefox. Safe no-op fallback if unsupported.
  (document.documentElement.style as { zoom?: string }).zoom = FONT_ZOOM[size] ?? "1";
}

function applyDensity(density: Density) {
  document.documentElement.setAttribute("data-density", density);
  document.documentElement.style.setProperty("--density-scale", DENSITY_SCALE[density] ?? "1");
}

function applySidebarPosition(pos: SidebarPosition) {
  document.documentElement.setAttribute("data-sidebar", pos);
}

interface AppearanceValue {
  accent: AccentFamily;
  fontSize: FontSize;
  density: Density;
  sidebarPosition: SidebarPosition;
  /** Apply (and remember) appearance live — used by the Settings page. */
  applyAppearance: (next: { accent?: AccentFamily; fontSize?: FontSize; density?: Density; sidebarPosition?: SidebarPosition }) => void;
}

const AppearanceContext = createContext<AppearanceValue>({
  accent: "indigo",
  fontSize: "medium",
  density: "comfortable",
  sidebarPosition: "left",
  applyAppearance: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [accent, setAccent] = useState<AccentFamily>("indigo");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [density, setDensity] = useState<Density>("comfortable");
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>("left");

  // Load saved appearance once on mount and apply it to the DOM.
  useEffect(() => {
    let cancelled = false;
    api
      .getSettings<Record<string, string>>("appearance")
      .then((data) => {
        if (cancelled || !data) return;
        const fam = ACCENT_LABEL_TO_FAMILY[data.accent];
        if (fam) {
          setAccent(fam);
          applyAccent(fam);
        }
        if (data.fontSize) {
          setFontSize(data.fontSize as FontSize);
          applyFontSize(data.fontSize as FontSize);
        }
        if (data.density) {
          setDensity(data.density as Density);
          applyDensity(data.density as Density);
        }
        if (data.sidebarPosition) {
          setSidebarPosition(data.sidebarPosition as SidebarPosition);
          applySidebarPosition(data.sidebarPosition as SidebarPosition);
        }
      })
      .catch(() => {
        /* not signed in / no settings yet — keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAppearance = useCallback(
    (next: { accent?: AccentFamily; fontSize?: FontSize; density?: Density; sidebarPosition?: SidebarPosition }) => {
      if (next.accent) {
        setAccent(next.accent);
        applyAccent(next.accent);
      }
      if (next.fontSize) {
        setFontSize(next.fontSize);
        applyFontSize(next.fontSize);
      }
      if (next.density) {
        setDensity(next.density);
        applyDensity(next.density);
      }
      if (next.sidebarPosition) {
        setSidebarPosition(next.sidebarPosition);
        applySidebarPosition(next.sidebarPosition);
      }
    },
    [],
  );

  return (
    <AppearanceContext.Provider value={{ accent, fontSize, density, sidebarPosition, applyAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

// The settings API stores accent as a lowercase label; map it to a family.
export const ACCENT_LABEL_TO_FAMILY: Record<string, AccentFamily> = {
  indigo: "indigo",
  violet: "violet",
  blue: "blue",
  emerald: "emerald",
  amber: "amber",
  rose: "red",
};

export const ACCENT_FAMILY_TO_LABEL: Record<AccentFamily, string> = {
  indigo: "indigo",
  violet: "violet",
  blue: "blue",
  emerald: "emerald",
  amber: "amber",
  red: "rose",
};
