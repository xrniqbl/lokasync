import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
  noPadding?: boolean;
}

export function BaseModal({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-md",
  noPadding = false,
}: BaseModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full ${width} bg-[#141414] border border-neutral-800 rounded-2xl shadow-2xl ${noPadding ? "p-0" : "p-6"} font-['Lexend:Regular',_sans-serif] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`}
        >
          {title !== undefined && title !== "" && (
            <div className="flex items-start justify-between mb-5">
              <div>
                <Dialog.Title className="text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif]">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="text-neutral-500 text-[12px] mt-1">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                onClick={onClose}
                aria-label="Close"
                className="text-neutral-500 hover:text-neutral-200 transition-colors ml-4 flex items-center justify-center w-9 h-9 rounded-lg hover:bg-neutral-800 active:bg-neutral-700"
              >
                <X size={16} strokeWidth={2} />
              </Dialog.Close>
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ModalInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}

export function ModalInput({ label, placeholder, value, onChange, type = "text" }: ModalInputProps) {
  return (
    <div>
      <label className="block text-neutral-400 text-[12px] mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
      />
    </div>
  );
}

export function ModalSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-neutral-400 text-[12px] mb-1.5">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg pl-3 pr-8 py-2.5 text-neutral-200 text-[13px] outline-none cursor-pointer transition-colors appearance-none font-['Lexend:Regular',_sans-serif]"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}

export function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel = "Save",
  confirmDisabled = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-neutral-800/60">
      <button
        onClick={onCancel}
        className="px-4 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 text-[13px] transition-colors border border-neutral-800 hover:bg-neutral-800"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
