import { useRef, useCallback, useState, useEffect } from "react";
import { Bold, Italic, List, Link } from "lucide-react";
import DOMPurify from "dompurify";

interface DescriptionTabProps {
  description: string;
  onChange: (html: string) => void;
}

// Descriptions are user-authored rich text (contenteditable + paste). They are
// stored as-is by the server and rendered as HTML here — the only render path —
// so both the stored value and what we echo back MUST be sanitized, otherwise a
// member could paste <img onerror=…>/<script> and run it in every teammate's
// session (stored XSS).
function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "s", "br", "p", "div", "span", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}

export function DescriptionTab({ description, onChange }: DescriptionTabProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [showPlaceholder, setShowPlaceholder] = useState(!description || description === "");

  // Re-sync content when description prop changes (e.g. project switch)
  useEffect(() => {
    if (!editorRef.current) return;
    const el = editorRef.current;
    if (document.activeElement === el) return; // Don't clobber user typing
    if (!description || description === "") {
      el.innerHTML = "";
      setShowPlaceholder(true);
    } else {
      el.innerHTML = sanitizeDescription(description);
      setShowPlaceholder(false);
    }
  }, [description]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const isEmpty = editorRef.current.textContent?.trim() === "";
    setShowPlaceholder(isEmpty);
    // No inner debounce — container's autoSave handles debouncing (Issue #12)
    onChange(isEmpty ? "" : sanitizeDescription(html));
  }, [onChange]);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    setShowPlaceholder(false);
    document.execCommand(cmd, false, value);
  };

  const handleLink = () => {
    const url = prompt("Enter URL:");
    if (url) exec("createLink", url);
  };

  const handleFocus = () => {
    setShowPlaceholder(false);
  };

  const handleBlur = () => {
    if (editorRef.current?.textContent?.trim() === "") {
      setShowPlaceholder(true);
    }
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 p-1 bg-neutral-800/30 rounded-lg w-fit">
        {[
          { icon: Bold, cmd: "bold", title: "Bold (Ctrl+B)" },
          { icon: Italic, cmd: "italic", title: "Italic (Ctrl+I)" },
          { icon: List, cmd: "insertUnorderedList", title: "Bullet List" },
        ].map(({ icon: Icon, cmd, title }) => (
          <button
            key={cmd}
            onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
            title={title}
            className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <Icon size={14} strokeWidth={1.8} />
          </button>
        ))}
        <button
          onMouseDown={(e) => { e.preventDefault(); handleLink(); }}
          title="Insert Link"
          className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <Link size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* Editor */}
      <div className="relative">
        {showPlaceholder && (
          <div className="absolute top-3 left-4 text-neutral-600 text-[13px] pointer-events-none select-none">
            Add a project description...
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className="min-h-[200px] bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/40 rounded-lg px-4 py-3 text-neutral-300 text-[13px] leading-relaxed outline-none transition-colors [&_a]:text-indigo-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_b]:text-neutral-100 [&_i]:text-neutral-400 empty:before:content-['']"
        />
      </div>
    </div>
  );
}
