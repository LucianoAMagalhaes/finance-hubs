import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** O orçamento do mês (ADR-0001): uma linha por mês nascido, nunca apagada. */
export const orcamentoDoMes = sqliteTable("orcamento_do_mes", {
  /** "AAAA-MM" */
  mes: text("mes").primaryKey(),
  custosFixos: integer("custos_fixos").notNull(),
  liberdadeFinanceira: integer("liberdade_financeira").notNull(),
  conforto: integer("conforto").notNull(),
  metas: integer("metas").notNull(),
  conhecimento: integer("conhecimento").notNull(),
  prazeres: integer("prazeres").notNull(),
});

/** Dinheiro entrando (ADR-0003). Nunca apagada de vez: a lixeira é uma marca. */
export const entrada = sqliteTable("entrada", {
  id: integer("id").primaryKey(),
  /** "AAAA-MM-DD" */
  data: text("data").notNull(),
  descricao: text("descricao").notNull(),
  fonte: text("fonte").notNull(),
  tipoDePagamento: text("tipo_de_pagamento").notNull(),
  /** Centavos inteiros, sempre positivo. */
  valor: integer("valor").notNull(),
  /** A marca de lixeira: "AAAA-MM-DD" do dia em que foi apagada; null enquanto está viva. */
  apagadoEm: text("apagado_em"),
});

/**
 * Um gasto em forma de compra, à vista ou parcelada (ADR-0003). Grava o total;
 * as ocorrências são derivadas (ADR-0002). Nunca apagado de vez: a lixeira é
 * uma marca. Divide a numeração com `recorrente`: o domínio dá o id.
 */
export const lancamento = sqliteTable("lancamento", {
  id: integer("id").primaryKey(),
  /** "AAAA-MM-DD" */
  data: text("data").notNull(),
  descricao: text("descricao").notNull(),
  pote: text("pote").notNull(),
  tipoDePagamento: text("tipo_de_pagamento").notNull(),
  /** Centavos inteiros do total; negativo quando é reembolso. */
  valor: integer("valor").notNull(),
  /** 1 é à vista. */
  parcelas: integer("parcelas").notNull(),
  /** Já normalizada pelo domínio; null é sem tag. */
  tag: text("tag"),
  /** A marca de lixeira: "AAAA-MM-DD" do dia em que foi apagado; null enquanto está vivo. */
  apagadoEm: text("apagado_em"),
});

/**
 * Um gasto em forma de recorrente. O que muda com o tempo está nas suas
 * vigências. Divide a numeração com `lancamento`: o domínio dá o id.
 */
export const recorrente = sqliteTable("recorrente", {
  id: integer("id").primaryKey(),
  /** O dia do mês em que cai, 1 a 31. */
  dia: integer("dia").notNull(),
  /** "AAAA-MM" do primeiro mês em que já não cai; null é sem fim. */
  encerradoEm: text("encerrado_em"),
  /** A marca de lixeira: "AAAA-MM-DD" do dia em que foi apagado; null enquanto está vivo. */
  apagadoEm: text("apagado_em"),
});

/**
 * Uma vigência de um recorrente, valendo de `desde` até a próxima. A
 * vigência descartada ao encerrar é apagada de vez: não vai para a lixeira.
 */
export const vigencia = sqliteTable(
  "vigencia",
  {
    recorrente: integer("recorrente")
      .notNull()
      .references(() => recorrente.id),
    /** "AAAA-MM" */
    desde: text("desde").notNull(),
    descricao: text("descricao").notNull(),
    pote: text("pote").notNull(),
    tipoDePagamento: text("tipo_de_pagamento").notNull(),
    /** Centavos inteiros, nunca zero; negativo quando é reembolso. */
    valor: integer("valor").notNull(),
    /** Já normalizada pelo domínio; null é sem tag. */
    tag: text("tag"),
  },
  (t) => [primaryKey({ columns: [t.recorrente, t.desde] })],
);
