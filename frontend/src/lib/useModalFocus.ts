import { useEffect, useRef } from "react";

/**
 * Focus management for QA Hub overlays. Keeps Tab and Shift+Tab in the modal,
 * closes on Escape, and restores focus to the element that opened it.
 * Does not infer a native browser dialog or modify the route/hash.
 */
const modalStack: HTMLElement[] = [];

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function useModalFocus(
  open: boolean,
  onClose: () => void,
  firstFocus?: string
) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const origin = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const previousDialog = modalStack.at(-1);
    const previousInert = previousDialog?.inert ?? false;
    if (previousDialog) previousDialog.inert = true;
    modalStack.push(dialog);
    const topmost = () => modalStack.at(-1) === dialog;
    const candidates = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((element) => !element.hidden && element.getClientRects().length > 0
        && element.getAttribute("aria-hidden") !== "true");
    const initial = firstFocus
      ? dialog.querySelector<HTMLElement>(firstFocus)
      : null;
    (initial || candidates()[0] || dialog).focus({ preventScroll: true });

    function keydown(event: KeyboardEvent) {
      if (!topmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = candidates();
      if (!list.length) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
    function guardFocus(event: FocusEvent) {
      if (topmost() && dialog && !dialog.contains(event.target as Node)) {
        (candidates()[0] || dialog).focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", guardFocus);
    return () => {
      const position = modalStack.indexOf(dialog);
      if (position >= 0) modalStack.splice(position, 1);
      if (previousDialog?.isConnected) previousDialog.inert = previousInert;
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", guardFocus);
      // When QAModal releases an inert page, that cleanup runs after this
      // hook. Restore focus in a microtask, only if the original control is
      // still visible and no new modal has made its ancestors inert.
      queueMicrotask(() => {
        // When closing a nested preview, restore focus to its parent dialog.
        // A mouse-activated action may leave the activeElement outside the
        // opening dialog. In that case, prefer a visible control in the parent
        // rather than losing keyboard focus to the inert background.
        if (previousDialog && modalStack.at(-1) !== previousDialog) return;
        const canReceiveFocus = (element:HTMLElement | null | undefined) =>
          Boolean(element?.isConnected && !element.closest("[inert]") &&
            element.getClientRects().length > 0);
        const original = previousDialog && origin && !previousDialog.contains(origin)
          ? null : origin;
        const parentControl = previousDialog
          ? [...previousDialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
            .find(canReceiveFocus) ?? previousDialog
          : null;
        const target = canReceiveFocus(original) ? original : parentControl;
        if (target && !target.closest("[inert]")) target.focus({ preventScroll: true });
      });
    };
  }, [open, firstFocus]);

  return dialogRef;
}
