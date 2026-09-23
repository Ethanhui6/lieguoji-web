import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A top-layer dialog keeps map, drawer and bottom navigation inert together. */
export function ModalDialog({ titleId, className = '', locked, onDismiss, children }: { titleId: string; className?: string; locked: boolean; onDismiss: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = openerRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialogRef} className={`confirm-modal native-dialog ${className}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!locked) onDismiss(); }}>{children}</dialog>, document.body);
}
