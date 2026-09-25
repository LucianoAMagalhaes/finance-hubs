// The five classes belong to the app, not the user (CONTEXT.md). The order is the screen's.
export const ASSET_CLASSES = [
  { id: "domestic-stocks", name: "Ações Nacionais" },
  { id: "international-stocks", name: "Ações Internacionais" },
  { id: "fixed-income", name: "Renda Fixa" },
  { id: "real-estate-funds", name: "FIIs" },
  { id: "crypto", name: "Cripto" },
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number]["id"];

/** An integer from 0 to 100 per class; the five add up to exactly 100. */
export type Targets = Record<AssetClass, number>;

/** The targets of a new portfolio. */
export const DEFAULT_TARGETS: Targets = {
  "domestic-stocks": 25,
  "international-stocks": 15,
  "fixed-income": 45,
  "real-estate-funds": 10,
  crypto: 5,
};

export function sumTargets(t: Targets): number {
  return ASSET_CLASSES.reduce((sum, c) => sum + t[c.id], 0);
}

/**
 * Why the targets cannot be saved, or null if they can. Checks every field,
 * because the command comes from the browser.
 */
export function validateTargets(t: Targets): string | null {
  if (typeof t !== "object" || t === null) return "Informe os cinco alvos.";
  if (Object.keys(t).some((id) => !ASSET_CLASSES.some((c) => c.id === id))) return "Só existem as cinco classes.";
  for (const c of ASSET_CLASSES) {
    const v = t[c.id];
    if (!Number.isInteger(v) || v < 0 || v > 100) return `${c.name}: o alvo é um inteiro de 0 a 100.`;
  }
  const sum = sumTargets(t);
  const points = (n: number) => `${n} ${n === 1 ? "ponto" : "pontos"}`;
  if (sum < 100) return `Os alvos somam ${sum}%: ${100 - sum === 1 ? "falta" : "faltam"} ${points(100 - sum)} para 100.`;
  if (sum > 100) return `Os alvos somam ${sum}%: passam de 100 em ${points(sum - 100)}.`;
  return null;
}
