// The six jars belong to the app, not the user (CONTEXT.md). The order is the screen's.
export const JARS = [
  { id: "fixed-costs", name: "Custos Fixos" },
  { id: "financial-freedom", name: "Liberdade Financeira" },
  { id: "comfort", name: "Conforto" },
  { id: "goals", name: "Metas" },
  { id: "knowledge", name: "Conhecimento" },
  { id: "pleasures", name: "Prazeres" },
] as const;

export type Jar = (typeof JARS)[number]["id"];

export function isJar(id: unknown): id is Jar {
  return JARS.some((j) => j.id === id);
}

export function jarName(id: Jar): string {
  return JARS.find((j) => j.id === id)!.name;
}

/** An integer from 0 to 100 per jar; the six add up to at most 100. */
export type Percentages = Record<Jar, number>;

/** The share of the income the six jars claim together; the rest up to 100 is the Unallocated. */
export function sumPercentages(p: Percentages): number {
  return JARS.reduce((sum, jar) => sum + p[jar.id], 0);
}

/**
 * Why the percentages cannot be saved, or null if they can. Checks every
 * field, because the command comes from the browser.
 */
export function validatePercentages(p: Percentages): string | null {
  if (typeof p !== "object" || p === null) return "Informe os seis percentuais.";
  if (Object.keys(p).some((id) => !JARS.some((jar) => jar.id === id))) return "Só existem os seis potes.";
  for (const jar of JARS) {
    const v = p[jar.id];
    if (!Number.isInteger(v) || v < 0 || v > 100) return `${jar.name}: o percentual é um inteiro de 0 a 100.`;
  }
  const excess = sumPercentages(p) - 100;
  if (excess > 0) {
    return `Os percentuais somam ${excess + 100}%: passam de 100 em ${excess} ${excess === 1 ? "ponto" : "pontos"}.`;
  }
  return null;
}

/** The percentages of the very first month (ADR-0001). */
export const DEFAULT_PERCENTAGES: Percentages = {
  "fixed-costs": 30,
  "financial-freedom": 25,
  comfort: 15,
  goals: 15,
  knowledge: 10,
  pleasures: 5,
};
