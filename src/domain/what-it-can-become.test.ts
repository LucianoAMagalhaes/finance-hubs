import { describe, expect, it } from "vitest";
import {
  apply,
  emptyState,
  whatItCanBecome,
  whyNoInstallments,
  type Command,
  type IsoDate,
  type State,
  type Expense,
  type ExpenseToSave,
  type Month,
  type RecurringToCreate,
} from "@/domain";

const HOJE: IsoDate = "2026-09-18";

// Cada caso confere os dois lados: o que a consulta diz travado, `aplicar`
// recusa com a mesma frase; o que ela diz livre, `aplicar` aceita.

describe("o que um lançamento pode virar", () => {
  it("um lançamento novo pode ter qualquer forma, com tudo livre e nada a encerrar", () => {
    expect(whatItCanBecome(null, "2026-09")).toEqual({
      shapes: { upfront: null, installments: null, recurring: null },
      lock: null,
      end: null,
    });
    expect(aceita(emptyState(), salvarLancamento(COMPRA))).toBe(true);
    expect(aceita(emptyState(), salvarLancamento({ ...COMPRA, installments: 3 }))).toBe(true);
    expect(aceita(emptyState(), { type: "create-recurring", recurring: ALUGUEL })).toBe(true);
  });

  it("um recorrente não vira compra, com a mesma recusa que salvá-lo como compra daria", () => {
    const estado = apos({ type: "create-recurring", recurring: ALUGUEL });

    const { shapes: formas, lock: trava } = whatItCanBecome(lancamentoDe(estado), "2026-07");

    expect(formas.upfront).toBe("Um recorrente não vira compra: apague e lance de novo.");
    expect(recusa(estado, salvarLancamento({ ...COMPRA, id: 1 }))).toBe(formas.upfront);
    expect(recusa(estado, salvarLancamento({ ...COMPRA, id: 1, installments: 3 }))).toBe(formas.installments);
    expect(formas.recurring).toBeNull();
    expect(trava).toBeNull();
    expect(aceita(estado, { type: "change-recurring", id: 1, month: "2026-07", period: { ...ALUGUEL, amount: 160_000 } })).toBe(true);
  });

  it("uma compra à vista vira parcelado e volta, mas não vira recorrente", () => {
    const estado = apos(salvarLancamento(COMPRA));

    const { shapes: formas, lock: trava } = whatItCanBecome(lancamentoDe(estado), "2026-07");

    expect(formas.upfront).toBeNull();
    expect(formas.installments).toBeNull();
    expect(trava).toBeNull();
    expect(aceita(estado, salvarLancamento({ ...COMPRA, id: 1, installments: 3 }))).toBe(true);
    expect(formas.recurring).toBe("Uma compra não vira recorrente: apague e lance de novo.");
    expect(recusa(estado, { type: "change-recurring", id: 1, month: "2026-07", period: COMPRA })).toBe(formas.recurring);
  });

  it("um parcelado sem antecipação muda de data, total e parcelas, e volta a ser à vista", () => {
    const estado = apos(salvarLancamento(EM_DEZ));

    const { shapes: formas, lock: trava } = whatItCanBecome(lancamentoDe(estado), "2026-07");

    expect(trava).toBeNull();
    expect(formas.upfront).toBeNull();
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, date: "2026-02-15", amount: 400_000, installments: 12 }))).toBe(true);
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, installments: 1 }))).toBe(true);
  });

  describe("um parcelado com antecipação", () => {
    const estado = apos(salvarLancamento(EM_DEZ), ANTECIPAR_3_EM_JULHO);
    const { shapes: formas, lock: trava } = whatItCanBecome(lancamentoDe(estado), "2026-07");
    const corrigido = { ...EM_DEZ, id: 1 };

    it("trava data, total e parcelas com a mesma recusa que mudá-los daria", () => {
      expect(trava).toBe("Este parcelado tem antecipação: desfaça-a antes de mudar a data, o total ou o número de parcelas.");
      expect(recusa(estado, salvarLancamento({ ...corrigido, date: "2026-02-15" }))).toBe(trava);
      expect(recusa(estado, salvarLancamento({ ...corrigido, amount: 400_000 }))).toBe(trava);
      expect(recusa(estado, salvarLancamento({ ...corrigido, installments: 12 }))).toBe(trava);
    });

    it("continua livre para descrição, pote e tag", () => {
      expect(aceita(estado, salvarLancamento({ ...corrigido, description: "Notebook novo", jar: "metas", tag: "trabalho" }))).toBe(true);
    });

    it("não volta a ser à vista, pela mesma trava", () => {
      expect(formas.installments).toBeNull();
      expect(formas.upfront).toBe(trava);
      expect(recusa(estado, salvarLancamento({ ...corrigido, installments: 1 }))).toBe(trava);
    });

    it("não vira recorrente por ser compra, que é o motivo que vence a trava", () => {
      expect(formas.recurring).toBe("Uma compra não vira recorrente: apague e lance de novo.");
      expect(recusa(estado, { type: "change-recurring", id: 1, month: "2026-07", period: EM_DEZ })).toBe(formas.recurring);
    });
  });

  it("um parcelado cuja antecipação foi desfeita volta a ficar livre", () => {
    const estado = apos(salvarLancamento(EM_DEZ), ANTECIPAR_3_EM_JULHO, { type: "delete", record: "prepayment", id: 1 });

    const { shapes: formas, lock: trava } = whatItCanBecome(lancamentoDe(estado), "2026-07");

    expect(trava).toBeNull();
    expect(formas.upfront).toBeNull();
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, date: "2026-02-15", amount: 400_000 }))).toBe(true);
    expect(aceita(estado, salvarLancamento({ ...EM_DEZ, id: 1, installments: 1 }))).toBe(true);
  });

  it("um parcelado na lixeira não se diz travado pela antecipação: a recusa é de quem grava", () => {
    const estado = apos(salvarLancamento(EM_DEZ), ANTECIPAR_3_EM_JULHO, { type: "delete", record: "expense", id: 1 });

    expect(whatItCanBecome(lancamentoDe(estado), "2026-07").lock).toBeNull();
    expect(recusa(estado, salvarLancamento({ ...EM_DEZ, id: 1, installments: 12 }))).toBe("Esse lançamento não existe mais.");
  });
});

describe("só Cartão de Crédito parcela", () => {
  it("fora do cartão, a recusa é a mesma que salvar o parcelado daria", () => {
    expect(whyNoInstallments("pix")).toBe("Só Cartão de Crédito parcela.");
    expect(recusa(emptyState(), salvarLancamento({ ...COMPRA, paymentMethod: "pix", installments: 3 }))).toBe(whyNoInstallments("pix"));
  });

  it("no cartão, parcela", () => {
    expect(whyNoInstallments("cartao-de-credito")).toBeNull();
  });
});

describe("encerrar um recorrente", () => {
  // Aluguel desde junho, reajustado em agosto: duas vigências.
  const estado = apos(
    { type: "create-recurring", recurring: ALUGUEL },
    { type: "change-recurring", id: 1, month: "2026-08", period: { ...ALUGUEL, amount: 165_000 } },
  );
  const aluguel = lancamentoDe(estado);
  const encerrado = (mes: Month) => lancamentoDe(aplicarOk(estado, { type: "end-recurring", id: 1, month: mes }));

  it("no mês de início manda o recorrente inteiro para a lixeira", () => {
    expect(whatItCanBecome(aluguel, "2026-06").end).toEqual({ type: "trash" });
    expect(encerrado("2026-06").deletedAt).toBe(HOJE);
  });

  it("antes do reajuste descarta a vigência que vinha depois", () => {
    expect(whatItCanBecome(aluguel, "2026-07").end).toEqual({ type: "end", discarded: 1 });
    expect(encerrado("2026-07")).toMatchObject({ deletedAt: null, endedIn: "2026-07", periods: [{ since: "2026-06" }] });
  });

  it("depois do reajuste não descarta nenhuma", () => {
    expect(whatItCanBecome(aluguel, "2026-09").end).toEqual({ type: "end", discarded: 0 });
    expect(encerrado("2026-09")).toMatchObject({ periods: [{ since: "2026-06" }, { since: "2026-08" }] });
  });

  it("uma compra não tem o que encerrar", () => {
    expect(whatItCanBecome(lancamentoDe(apos(salvarLancamento(COMPRA))), "2026-07").end).toBeNull();
  });
});

const COMPRA: ExpenseToSave = {
  date: "2026-07-10",
  description: "Supermercado",
  jar: "custos-fixos",
  paymentMethod: "cartao-de-credito",
  amount: 30_000,
  installments: 1,
};

/** Um parcelado de 10× a partir de janeiro. */
const EM_DEZ: ExpenseToSave = {
  date: "2026-01-15",
  description: "Notebook",
  jar: "conforto",
  paymentMethod: "cartao-de-credito",
  amount: 389_900,
  installments: 10,
};

/** As 3 últimas parcelas do parcelado 1, antecipadas em julho. */
const ANTECIPAR_3_EM_JULHO: Command = {
  type: "save-prepayment",
  prepayment: { expense: 1, date: "2026-07-20", installments: 3, amount: 300_000 },
};

/** Um aluguel recorrente desde junho, com uma vigência só. */
const ALUGUEL: RecurringToCreate = { date: "2026-06-05", description: "Aluguel", jar: "custos-fixos", paymentMethod: "pix", amount: 150_000 };

const salvarLancamento = (lancamento: ExpenseToSave): Command => ({ type: "save-expense", expense: lancamento });

const aceita = (estado: State, comando: Command) => apply(estado, comando, HOJE).ok;

/** A recusa de um comando, falhando o teste se ele passar. */
function recusa(estado: State, comando: Command): string {
  const resultado = apply(estado, comando, HOJE);
  if (resultado.ok) throw new Error(`o comando ${comando.type} passou`);
  return resultado.error;
}

/** O estado depois dos comandos, em ordem, a partir do vazio. */
const apos = (...comandos: Command[]): State => comandos.reduce(aplicarOk, emptyState());

function aplicarOk(estado: State, comando: Command): State {
  const resultado = apply(estado, comando, HOJE);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.value;
}

function lancamentoDe(estado: State, id = 1): Expense {
  const l = estado.expenses.find((x) => x.id === id);
  if (!l) throw new Error(`${id} não existe`);
  return l;
}
