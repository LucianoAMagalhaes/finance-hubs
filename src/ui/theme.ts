export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "fh-theme";

/** The toggle's order. */
export const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Stores the choice and applies it to <html>. "system" removes the attribute and lets the CSS follow the system. */
export function applyTheme(theme: Theme): void {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // No storage (private window): the theme lasts until the page reloads.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/**
 * Runs in the <head> before the first paint, so the page does not flash the
 * wrong theme on reload.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
