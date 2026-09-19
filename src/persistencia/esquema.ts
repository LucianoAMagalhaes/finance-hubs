import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/** Dinheiro entrando (ADR-0003). Nunca apagada de vez: a lixeira será uma marca. */
export const entrada = sqliteTable("entrada", {
  id: integer("id").primaryKey(),
  /** "AAAA-MM-DD" */
  data: text("data").notNull(),
  descricao: text("descricao").notNull(),
  fonte: text("fonte").notNull(),
  tipoDePagamento: text("tipo_de_pagamento").notNull(),
  /** Centavos inteiros, sempre positivo. */
  valor: integer("valor").notNull(),
});
