"use client";

import { useEffect, useState } from "react";
import { RecordButtons } from "./parts";

type Props = { newIncome: () => void; newExpense: () => void };

/**
 * In a narrow window, recording goes through here: the + opens "+ Entrada" and
 * "+ Gasto". In the wide layout both buttons sit in the top bar and the CSS
 * hides this one — which is why picking an option closes the menu, but
 * nothing else depends on the width.
 */
export function FloatingButton({ newIncome, newExpense }: Props) {
  const [open, setOpen] = useState(false);

  // Esc closes the menu, as it closes a form.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /** Picking closes the menu: the form that opens is what stays in front. */
  const pick = (openForm: () => void) => {
    setOpen(false);
    openForm();
  };

  return (
    <>
      {open && <div className="fab-backdrop" onClick={() => setOpen(false)} aria-hidden />}
      <div className={`fab ${open ? "open" : ""}`}>
        <RecordButtons
          className="option"
          newIncome={() => pick(newIncome)}
          newExpense={() => pick(newExpense)}
        />
        <button
          type="button"
          className="plus"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Fechar o menu de lançar" : "Lançar"}
        >
          {open ? "×" : "+"}
        </button>
      </div>
    </>
  );
}
