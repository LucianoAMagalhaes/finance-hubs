"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, NEXT_THEME, type Theme } from "./theme";

const LABEL: Record<Theme, string> = { system: "◐ Sistema", light: "☀ Claro", dark: "☾ Escuro" };

export function ThemeToggle() {
  // The server does not know the choice stored in the browser: it starts at
  // "system" and corrects it after mounting. The <head> already applied the
  // right theme before painting.
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(readTheme()), []);

  function toggle() {
    const next = NEXT_THEME[theme];
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button type="button" className="btn" onClick={toggle} title="Tema: segue o sistema, ou força claro ou escuro">
      {LABEL[theme]}
    </button>
  );
}
