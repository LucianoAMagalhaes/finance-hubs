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
