import type { Centavos } from "./dinheiro";
import type { Data } from "./mes";
import type { TipoDeEntrada } from "./pagamento";

// A lista fixa de quatro fontes (CONTEXT.md). A ordem é a da tela.
export const FONTES = [
  { id: "salario", nome: "Salário" },
  { id: "freela", nome: "Freela" },
  { id: "rendimentos", nome: "Rendimentos" },
  { id: "outras-receitas", nome: "Outras Receitas" },
] as const;

export type FonteId = (typeof FONTES)[number]["id"];

export function ehFonte(id: unknown): id is FonteId {
  return FONTES.some((f) => f.id === id);
}

export function nomeDaFonte(id: FonteId): string {
  return FONTES.find((f) => f.id === id)!.nome;
}

/**
 * Dinheiro entrando (ADR-0003). Não tem pote, não parcela e não se repete:
 * impacta só o mês da sua própria data.
 */
export type Entrada = {
  id: number;
  data: Data;
  descricao: string;
  fonte: FonteId;
  tipo: TipoDeEntrada;
  /** Sempre positivo. Dinheiro de volta de um lançamento é reembolso, não entrada. */
  valor: Centavos;
  /** A marca de lixeira: o dia em que foi apagada; null enquanto está viva. */
  apagadoEm: Data | null;
};

/** O que a pessoa preenche no formulário; o id vem do domínio numa entrada nova. */
export type NovaEntrada = Omit<Entrada, "id" | "apagadoEm">;

/** O que se manda salvar: sem id, é uma entrada nova; com id, corrige a que já existe. */
export type EntradaASalvar = NovaEntrada & { id?: number };
