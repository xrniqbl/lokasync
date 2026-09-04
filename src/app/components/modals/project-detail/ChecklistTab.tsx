import { useState, useRef } from "react";
import { Plus, X, Check } from "lucide-react";
import type { LocalChecklistItem } from "./types";

interface ChecklistTabProps {
  items: LocalChecklistItem[];
  onAdd: (item: LocalChecklistItem) => void;
  onUpdate: (id: string, patch: Partial<LocalChecklistItem>) => void;
  onDelete: (id: string) => void;
}

export function ChecklistTab({ items, onAdd, onUpdate, onDelete }: ChecklistTabProps) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const completed = items.filter((i) => i.completed).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    onAdd({ id: crypto.randomUUID(), text, completed: false, createdAt: new Date().toISOString() });
    setNewText("");
    inputRef.current?.focus();
  };

  const startEdit = (item: LocalChecklistItem) => {
    setEditingId(item.id);
    setEditValue(item.text);
  };

  const saveEdit = (id: string) => {
    const text = editValue.trim();
    if (text) onUpdate(id, { text });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-[11px]">{completed} of {total} completed</span>
          <span className="text-neutral-400 text-[12px] font-['Lexend:SemiBold',_sans-serif]">{pct}%</span>
        </div>
        <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Add item */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            ref={inputRef}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Add checklist item..."
            className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg pl-8 pr-3 py-2 text-neutral-200 text-[12px] outline-none transition-colors"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {/* Items */}
      <div className="space-y-1">
        {items.length === 0 && (
          <p className="text-neutral-600 text-[12px] text-center py-8">No checklist items yet. Add one above.</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 group px-3 py-2 rounded-lg hover:bg-neutral-800/30 transition-colors"
          >
            {/* Checkbox */}
            <button
              onClick={() => onUpdate(item.id, { completed: !item.completed })}
              className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                item.completed
                  ? "bg-indigo-600 border-indigo-600"
                  : "border-neutral-600 hover:border-neutral-400"
              }`}
            >
              {item.completed && <Check size={11} strokeWidth={2.5} className="text-white" />}
            </button>

            {/* Text */}
            {editingId === item.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveEdit(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(item.id); if (e.key === "Escape") setEditingId(null); }}
                className="flex-1 bg-[#0f0f0f] border border-indigo-500/50 rounded px-2 py-0.5 text-neutral-200 text-[12px] outline-none"
              />
            ) : (
              <span
                onClick={() => startEdit(item)}
                className={`flex-1 text-[12px] cursor-pointer ${item.completed ? "text-neutral-500 line-through" : "text-neutral-300"}`}
              >
                {item.text}
              </span>
            )}

            {/* Delete */}
            <button
              onClick={() => onDelete(item.id)}
              className="p-1 rounded text-neutral-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
