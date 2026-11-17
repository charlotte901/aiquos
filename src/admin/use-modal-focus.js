import { useEffect, useRef } from 'react';

export function useModalFocus(dialog, onClose, { open = true, disabled = false } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')]
      .filter(element => element.getClientRects().length);
    (dialog.current.querySelector('button[aria-label*="关闭"]:not([disabled])') || controls()[0])?.focus();
    const handleKey = event => {
      if (event.key === 'Escape' && !disabled) { event.preventDefault(); close.current?.(); }
      if (event.key !== 'Tab') return;
      const items = controls();
      if (!items.length) { event.preventDefault(); return; }
      const index = items.indexOf(document.activeElement);
      if (index < 0 || (!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [dialog, open, disabled]);
}
