import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export default function LayerDialog({ className, label, onClose, children }: {
  className: string;
  label: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const close = async () => {
    const dialog = ref.current;
    if (!dialog || dialog.dataset.closing) return;
    dialog.dataset.closing = 'true';
    await Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished));
    if (!dialog.isConnected || !dialog.open) return;
    dialog.close();
    onClose();
  };

  return (
    <dialog ref={ref} className={`layer-dialog ${className}`} aria-label={label}
      onCancel={(event) => { event.preventDefault(); void close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) void close(); }}>
      {children(close)}
    </dialog>
  );
}
