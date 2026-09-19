import { ehFonte, type Entrada, type EntradaASalvar } from "./entradas";
import type { Estado } from "./estado";
import { ehDataValida, mesDaData, type Data, type Mes } from "./mes";
import { ehTipoDeEntrada } from "./pagamento";
import { herdaria } from "./projecao";

/**
 * Tudo que a pessoa pode mandar fazer. Cada comando chega com o ticket que o usa.
 */
export type Comando = {
  tipo: "salvar-entrada";
  entrada: EntradaASalvar;
};

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Aplica um comando e devolve o estado novo ou o erro de validação. Puro:
 * nunca muda o estado recebido, e `hoje` entra de fora para o domínio não ler o relógio.
 */
export function aplicar(estado: Estado, comando: Comando, _hoje: Data): Resultado<Estado> {
  switch (comando.tipo) {
    case "salvar-entrada":
      return salvarEntrada(estado, comando.entrada);
  }
}

function salvarEntrada(estado: Estado, dados: EntradaASalvar): Resultado<Estado> {
  const erro = validarEntrada(dados);
  if (erro) return { ok: false, erro };

  const { id, ...campos } = dados;
  const limpa = { ...campos, descricao: campos.descricao.trim() };
  let entradas: Entrada[];
  if (id === undefined) {
    const proximo = Math.max(0, ...estado.entradas.map((e) => e.id)) + 1;
    entradas = [...estado.entradas, { id: proximo, ...limpa }];
  } else {
    if (!estado.entradas.some((e) => e.id === id)) return { ok: false, erro: "Essa entrada não existe mais." };
    entradas = estado.entradas.map((e) => (e.id === id ? { id, ...limpa } : e));
  }
  return { ok: true, valor: nascer({ ...estado, entradas }, mesDaData(limpa.data)) };
}

// O comando chega do navegador: nenhum campo é confiado ao tipo.
function validarEntrada(e: EntradaASalvar): string | null {
  if (typeof e.data !== "string" || !ehDataValida(e.data)) return "Informe uma data válida.";
  if (typeof e.descricao !== "string" || !e.descricao.trim()) return "Informe uma descrição.";
  if (!ehFonte(e.fonte)) return "Escolha uma fonte.";
  if (!ehTipoDeEntrada(e.tipo)) return "Entrada só aceita Dinheiro, PIX ou Transferência.";
  if (!Number.isInteger(e.valor) || e.valor <= 0) {
    return "Entrada tem valor positivo. Dinheiro de volta de um lançamento é reembolso, no pote de origem.";
  }
  return null;
}

/**
 * O mês nasce no primeiro registro com data nele (ADR-0001): ganha os
 * percentuais que herdaria. Um mês que já nasceu fica como está.
 */
function nascer(estado: Estado, mes: Mes): Estado {
  if (estado.orcamentos[mes]) return estado;
  return { ...estado, orcamentos: { ...estado.orcamentos, [mes]: { ...herdaria(estado, mes).percentuais } } };
}
