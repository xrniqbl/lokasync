import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Plus } from "lucide-react";

interface CreatableSelectProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Optional hint shown when the input is empty. */
  hint?: string;
}

/**
 * A lightweight creatable select: shows existing options in a dropdown,
 * filters as you type, and lets the user create a new value when nothing
 * matches.  Dark-themed to match the app's design system.
 */
export function CreatableSelect({
  label,
  placeholder = "Type to search or create…",
  value,
  onChange,
  options,
  hint,
}: CreatableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when value changes externally.
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value); // reset to committed value
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [query, options]);

  const exactMatch = options.some((o) => o.toLowerCase() === query.toLowerCase());
  const showCreate = query.trim().length > 0 && !exactMatch;

  const selectOption = (opt: string) => {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
  };

  const createAndSelect = () => {
    const trimmed = query.trim();
    if (trimmed) {
      onChange(trimmed);
      setQuery(trimmed);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-neutral-400 text-[12px] mb-1.5">{label}</label>
      <div
        className="flex items-center gap-1.5 w-full bg-[#0f0f0f] border border-neutral-800 focus-within:border-indigo-600/60 rounded-lg px-3 py-2.5 transition-colors cursor-text"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showCreate) { e.preventDefault(); createAndSelect(); }
            if (e.key === "Escape") { setOpen(false); setQuery(value); }
          }}
          className="flex-1 bg-transparent text-neutral-200 text-[13px] outline-none placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif] min-w-0"
        />
        <ChevronDown size={14} className={`text-neutral-600 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-50 mt-1 w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-xl max-h-[180px] overflow-y-auto p-1">
          {filtered.map((opt) => (
            <button
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-colors ${
                opt.toLowerCase() === query.toLowerCase()
                  ? "bg-indigo-950/30 text-indigo-300"
                  : "text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {opt}
            </button>
          ))}
          {showCreate && (
            <button
              onMouseDown={(e) => { e.preventDefault(); createAndSelect(); }}
              className="w-full text-left px-3 py-2 rounded-lg text-[12px] text-emerald-400 hover:bg-emerald-950/30 flex items-center gap-2 transition-colors"
            >
              <Plus size={12} />
              Create: <span className="text-emerald-300 font-medium">"{query.trim()}"</span>
            </button>
          )}
        </div>
      )}

      {hint && !open && !value && (
        <p className="text-neutral-600 text-[11px] mt-1.5">{hint}</p>
      )}
    </div>
  );
}
