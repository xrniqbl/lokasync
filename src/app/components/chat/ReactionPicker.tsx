import { memo } from "react";

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🔥"];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
}

export const ReactionPicker = memo(function ReactionPicker({ onSelect }: ReactionPickerProps) {
  return (
    <div className="flex items-center gap-1 bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-xl p-1.5">
      {ALLOWED_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-800 transition-colors text-[16px]"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
});
