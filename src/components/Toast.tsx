import { useEffect } from 'react';
import type { ToastMessage, ToastTone } from '../types';

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'bg-leaf-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-800 text-white',
};

type ToastProps = {
  toast: ToastMessage | null;
  onDismiss: () => void;
};

export default function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(onDismiss, toast.duration ?? 2500);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto rounded-2xl px-6 py-4 text-tap font-semibold shadow-lg ${
          TONE_CLASS[toast.tone] ?? TONE_CLASS.info
        }`}
      >
        {toast.message}
      </div>
    </div>
  );
}
