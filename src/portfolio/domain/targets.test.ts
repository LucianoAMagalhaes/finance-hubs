import { describe, expect, it } from "vitest";
import {
  apply,
  ASSET_CLASSES,
  emptyPortfolio,
  projectPortfolio,
  type IsoDate,
  type PortfolioState,
  type PortfolioView,
  type Targets,
} from "@/portfolio/domain";

const TODAY: IsoDate = "2026-09-25";

describe("the targets of the classes", () => {
  it("a new portfolio starts with 25 / 15 / 45 / 10 / 5, in the order of the screen", () => {
    const view = projectPortfolio(emptyPortfolio(), TODAY);

    expect(view.classes.map((c) => [c.name, c.target])).toEqual([
      ["Ações Nacionais", 25],
      ["Ações Internacionais", 15],
      ["Renda Fixa", 45],
      ["FIIs", 10],
      ["Cripto", 5],
    ]);
  });

  it("saving the five targets rewrites them, and the dashboard shows the new ones", () => {
    const saved = saveOk(emptyPortfolio(), targets(30, 20, 40, 10, 0));

    expect(targetsOf(projectPortfolio(saved, TODAY))).toEqual([30, 20, 40, 10, 0]);
  });

  it("a target of zero is accepted", () => {
    const saved = saveOk(emptyPortfolio(), targets(0, 0, 100, 0, 0));

    expect(targetsOf(projectPortfolio(saved, TODAY))).toEqual([0, 0, 100, 0, 0]);
  });

  it("targets that add up to less than 100 are refused, saying how much is missing", () => {
    expect(save(emptyPortfolio(), targets(25, 15, 45, 10, 0))).toEqual({
      ok: false,
      error: "Os alvos somam 95%: faltam 5 pontos para 100.",
    });
    expect(save(emptyPortfolio(), targets(25, 15, 45, 9, 5))).toEqual({
      ok: false,
      error: "Os alvos somam 99%: falta 1 ponto para 100.",
    });
  });

  it("targets that add up to more than 100 are refused, saying by how much they pass", () => {
    expect(save(emptyPortfolio(), targets(30, 15, 45, 10, 5))).toEqual({
      ok: false,
      error: "Os alvos somam 105%: passam de 100 em 5 pontos.",
    });
    expect(save(emptyPortfolio(), targets(25, 15, 45, 10, 6))).toEqual({
      ok: false,
      error: "Os alvos somam 101%: passam de 100 em 1 ponto.",
    });
  });

  it("a target outside 0 to 100 is refused, naming its class", () => {
    expect(save(emptyPortfolio(), targets(-5, 15, 45, 40, 5))).toEqual({
      ok: false,
      error: "Ações Nacionais: o alvo é um inteiro de 0 a 100.",
    });
    expect(save(emptyPortfolio(), targets(0, 0, 101, 0, -1))).toEqual({
      ok: false,
      error: "Renda Fixa: o alvo é um inteiro de 0 a 100.",
    });
  });

  it("a target that is not an integer is refused, even when the sum closes", () => {
    expect(save(emptyPortfolio(), targets(25.5, 14.5, 45, 10, 5))).toEqual({
      ok: false,
      error: "Ações Nacionais: o alvo é um inteiro de 0 a 100.",
    });
    expect(save(emptyPortfolio(), targets(25, 15, 45, 10, NaN))).toEqual({
      ok: false,
      error: "Cripto: o alvo é um inteiro de 0 a 100.",
    });
  });

  it("what comes from the browser is checked whole: a missing, extra or non-numeric target is refused", () => {
    const { crypto: _, ...four } = targets(25, 15, 45, 10, 5);
    expect(save(emptyPortfolio(), four as Targets)).toEqual({ ok: false, error: "Cripto: o alvo é um inteiro de 0 a 100." });
    expect(save(emptyPortfolio(), { ...targets(25, 15, 45, 10, 5), stocks: 0 } as Targets)).toEqual({
      ok: false,
      error: "Só existem as cinco classes.",
    });
    expect(save(emptyPortfolio(), { ...targets(25, 15, 45, 10, 5), crypto: "5" } as unknown as Targets)).toEqual({
      ok: false,
      error: "Cripto: o alvo é um inteiro de 0 a 100.",
    });
    expect(save(emptyPortfolio(), null as unknown as Targets)).toEqual({ ok: false, error: "Informe os cinco alvos." });
  });

  it("a refused save leaves the targets as they were", () => {
    const before = saveOk(emptyPortfolio(), targets(30, 20, 40, 10, 0));

    const result = save(before, targets(30, 20, 40, 10, 10));

    expect(result.ok).toBe(false);
    expect(targetsOf(projectPortfolio(before, TODAY))).toEqual([30, 20, 40, 10, 0]);
  });

  it("applying does not change the received state", () => {
    const state = emptyPortfolio();
    const copy = structuredClone(state);

    saveOk(state, targets(30, 20, 40, 10, 0));

    expect(state).toEqual(copy);
  });

  it("an unknown command is refused", () => {
    expect(apply(emptyPortfolio(), { type: "nope" } as never, TODAY)).toEqual({
      ok: false,
      error: "Não sei fazer isso.",
    });
  });
});

describe("the empty portfolio", () => {
  it("is worth nothing, has gained nothing and received no payouts", () => {
    const view = projectPortfolio(emptyPortfolio(), TODAY);

    expect(view).toMatchObject({ currentValue: 0, cost: 0, totalGain: 0, payoutsReceived: 0 });
  });

  it("shows the five classes zeroed: no value, no share, no gain, no assets and nothing to reach the target", () => {
    const view = projectPortfolio(emptyPortfolio(), TODAY);

    expect(view.classes.map((c) => c.key)).toEqual(ASSET_CLASSES.map((c) => c.id));
    for (const c of view.classes) {
      expect(c).toMatchObject({ value: 0, share: 0, totalGain: 0, assetCount: 0, toTarget: 0 });
    }
  });
});

function save(state: PortfolioState, t: Targets) {
  return apply(state, { type: "save-targets", targets: t }, TODAY);
}

function saveOk(state: PortfolioState, t: Targets): PortfolioState {
  const result = save(state, t);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function targets(...values: [number, number, number, number, number]): Targets {
  return Object.fromEntries(ASSET_CLASSES.map((c, i) => [c.id, values[i]])) as Targets;
}

const targetsOf = (view: PortfolioView) => view.classes.map((c) => c.target);
