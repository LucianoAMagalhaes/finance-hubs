"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  /** The id of the heading that names the sheet, inside `children`. */
  labelledBy: string;
  /** Added to `sheet`, for the ones that are not a form. */
  className?: string;
  close: () => void;
  /** Keeps an in-flight form mounted until its response arrives. */
  closingDisabled?: boolean;
  children: ReactNode;
};

/**
 * A form or a list as a sheet over the screen. Modal `<dialog>`: the browser
 * handles focus, Esc and the inert backdrop; what it does not handle is
 * closing on a click outside, which is the same three lines in every caller.
 * The header, the footer and the `<form>` stay with whoever opens it, because
 * they differ in every one.
 */
export function Sheet({ labelledBy, className, close, closingDisabled = false, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => dialog.current?.showModal(), []);

  return (
    <dialog
      ref={dialog}
      className={className ? `sheet ${className}` : "sheet"}
      onCancel={(e) => { if (closingDisabled) e.preventDefault(); }}
      onClose={() => { if (!closingDisabled) close(); }}
      onClick={(e) => !closingDisabled && e.target === dialog.current && close()}
      aria-labelledby={labelledBy}
    >
      {children}
    </dialog>
  );
}
