import {
  findPrepayment,
  apply,
  trashItems,
  monthOf,
  monthName,
  normalizeTag,
  projectMonth,
  type Prepayment,
  type Command,
  type Purchase,
  type IsoDate,
  type Axis,
  type Income,
  type State,
  type TrashItem,
  type Expense,
  type Month,
  type Occurrence,
  type Percentages,
  type RecordType,
  type Result,
  type MonthView,
} from "@/domain";
import { percentuaisParaPrevia, rascunhoDe, type Rascunho } from "./rascunhoDePercentuais";
import type { Aberto } from "./MestreDetalhe";

/** O formulário aberto, já resolvido contra o estado: um registro novo (null), ou o que se corrige. */
export type FormularioAberto =
  | { registro: "income"; entrada: Income | null }
  | { registro: "expense"; lancamento: Expense | null }
  /** A antecipação de um parcelado: nova (null) ou a que se revê. */
  | { registro: "prepayment"; parcelado: Purchase; antecipacao: Prepayment | null };

/** Depois de salvar algo com data em outro mês, a tela fica onde está e aponta para lá. */
type Aviso = { texto: string; mes: Month };

/** Tudo que a tela do mês desenha. */
export type Tela = {
  estado: State;
  mes: Month;
  vista: MonthView;
  lixeira: TrashItem[];
  formulario: FormularioAberto | null;
  aviso: Aviso | null;
  /** Os percentuais sendo editados; enquanto existe, a projeção usa eles. */
  rascunho: Rascunho | null;
  eixo: Axis;
  /** O grupo aberto no mestre-detalhe; continua aberto ao trocar de mês, se existir lá. */
  aberto: Aberto | null;
  lixeiraAberta: boolean;
  /** A tag que se renomeia; não é um registro, e por isso não é um formulário como os outros. */
  tagARenomear: string | null;
};

/** A porta para o servidor: grava o comando e devolve o estado novo, ou a recusa. */
export type Executar = (comando: Command) => Promise<Result<State>>;

/** O formulário como o fluxo o guarda: a antecipação por ids, resolvida a cada leitura. */
type Formulario =
  | { registro: "income"; entrada: Income | null }
  | { registro: "expense"; lancamento: Expense | null }
  | { registro: "prepayment"; parcelado: number; antecipacao: number | null };

type Memoria = Omit<Tela, "vista" | "lixeira" | "formulario"> & { formulario: Formulario | null };

/**
 * O fluxo da tela do mês, fora do React. Mantém o estado em memória e projeta
 * o mês; trocar de mês é só trocar a projeção, e nunca grava nada. Salvar
 * confere no navegador, manda o comando ao servidor e troca o estado pelo que
 * ele devolve. As ações assíncronas devolvem o erro, ou null se deu certo.
 */
export function criarFluxoDoMes(estadoInicial: State, { hoje, executar }: { hoje: IsoDate; executar: Executar }) {
  let memoria: Memoria = {
    estado: estadoInicial,
    mes: monthOf(hoje),
    formulario: null,
    aviso: null,
    rascunho: null,
    eixo: "jar",
    aberto: null,
    lixeiraAberta: false,
    tagARenomear: null,
  };
  let tela = montarTela(memoria, null);
  const ouvintes = new Set<() => void>();

  function mudar(mudanca: Partial<Memoria>) {
    memoria = { ...memoria, ...mudanca };
    tela = montarTela(memoria, tela);
    for (const ouvinte of ouvintes) ouvinte();
  }

  /**
   * Confere no navegador, grava no servidor e troca o estado pelo que ele
   * devolve — junto com o que muda na tela depois, numa mudança só.
   */
  async function mandar(comando: Command, depois: () => Partial<Memoria> = () => ({})): Promise<string | null> {
    const previa = apply(memoria.estado, comando, hoje);
    if (!previa.ok) return previa.error;
    const resultado = await executar(comando);
    if (!resultado.ok) return resultado.error;
    mudar({ estado: resultado.value, ...depois() });
    return null;
  }

  /** O formulário aberto; as ações que o leem só existem com ele na tela. */
  const formularioNaTela = () => memoria.formulario!;

  return {
    agora: (): Tela => tela,
    assinar(ouvinte: () => void): () => void {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },

    mudarMes: (mes: Month) => mudar({ mes, aviso: null, rascunho: null }),
    dispensarAviso: () => mudar({ aviso: null }),

    /** Um eixo por vez. Trocar de eixo fecha o grupo aberto, mas não o feed do mês. */
    mudarEixo: (eixo: Axis) => mudar({ eixo, aberto: memoria.aberto?.tipo === "todos" ? memoria.aberto : null }),
    abrir: (aberto: Aberto | null) => mudar({ aberto }),
    alternarDespesas: () => mudar({ aberto: memoria.aberto?.tipo === "todos" ? null : { tipo: "todos" } }),

    abrirEntrada: (entrada: Income | null) => mudar({ formulario: { registro: "income", entrada } }),
    abrirLancamento: (lancamento: Expense | null) => mudar({ formulario: { registro: "expense", lancamento } }),
    /** A ocorrência da antecipação abre a própria antecipação; as outras, o lançamento. */
    abrirOcorrencia: (o: Occurrence) =>
      mudar({
        formulario: o.prepayment
          ? { registro: "prepayment", parcelado: o.expense, antecipacao: o.prepayment.id }
          : { registro: "expense", lancamento: memoria.estado.expenses.find((l) => l.id === o.expense)! },
      }),
    /** Do formulário do parcelado para uma antecipação nova dele. */
    antecipar() {
      const { lancamento } = formularioNaTela() as { lancamento: Expense };
      mudar({ formulario: { registro: "prepayment", parcelado: lancamento.id, antecipacao: null } });
    },
    fecharFormulario: () => mudar({ formulario: null }),

    /** Salva o registro do formulário aberto e, se ele pesa a partir de outro mês, avisa sem sair deste. */
    async salvar(comando: Command, destino: Month): Promise<string | null> {
      const { mes } = memoria;
      const rotulo = rotuloDe(formularioNaTela());
      return mandar(comando, () => ({
        formulario: null,
        aviso: destino === mes ? null : { texto: `${rotulo} em ${monthName(destino)}.`, mes: destino },
      }));
    },
    /** Apagar manda para a lixeira e fecha o formulário; os meses afetados recalculam com o estado novo. */
    apagar: () => mandar(apagarDe(formularioNaTela()), () => ({ formulario: null })),
    /** Encerrar fecha o formulário, como apagar; no mês de início, o recorrente vai para a lixeira. */
    encerrar() {
      const { lancamento } = formularioNaTela() as { lancamento: Expense };
      return mandar({ type: "end-recurring", id: lancamento.id, month: memoria.mes }, () => ({ formulario: null }));
    },

    abrirLixeira: () => mudar({ lixeiraAberta: true }),
    fecharLixeira: () => mudar({ lixeiraAberta: false }),
    restaurar: (registro: RecordType, id: number) => mandar({ type: "restore", record: registro, id }),

    abrirRenomear: (tag: string) => mudar({ tagARenomear: tag }),
    fecharRenomear: () => mudar({ tagARenomear: null }),
    /**
     * Renomear troca o nome em todos os meses, então o grupo aberto passa a ser o
     * da tag nova — ou o da que ela absorveu, na fusão —, e o detalhe continua
     * onde estava em vez de sumir com o nome antigo.
     */
    renomearTag(para: string, fundir: boolean): Promise<string | null> {
      const de = memoria.tagARenomear!;
      return mandar({ type: "rename-tag", from: de, to: para, merge: fundir }, () => ({
        tagARenomear: null,
        aberto: { tipo: "grupo", chave: normalizeTag(para) },
      }));
    },

    editarPercentuais: () => mudar({ rascunho: rascunhoDe(tela.vista.jars) }),
    mudarRascunho: (rascunho: Rascunho) => mudar({ rascunho }),
    cancelarRascunho: () => mudar({ rascunho: null }),
    salvarPercentuais: (percentuais: Percentages) =>
      mandar({ type: "save-percentages", month: memoria.mes, percentages: percentuais }, () => ({ rascunho: null })),
  };
}

/** A tela a partir da memória; a projeção e a lixeira só se refazem quando o que elas leem muda. */
function montarTela(memoria: Memoria, antes: Tela | null): Tela {
  const { estado, mes, rascunho, formulario } = memoria;
  const mesmoEstado = antes?.estado === estado;
  const vista =
    mesmoEstado && antes.mes === mes && antes.rascunho === rascunho
      ? antes.vista
      : projectMonth(estado, mes, rascunho ? percentuaisParaPrevia(rascunho) : undefined);
  const lixeira = mesmoEstado ? antes.lixeira : trashItems(estado);
  return { ...memoria, vista, lixeira, formulario: formulario && resolver(estado, formulario) };
}

function resolver(estado: State, formulario: Formulario): FormularioAberto {
  if (formulario.registro !== "prepayment") return formulario;
  return {
    registro: "prepayment",
    parcelado: estado.expenses.find((l) => l.id === formulario.parcelado) as Purchase,
    antecipacao: formulario.antecipacao === null ? null : findPrepayment(estado, formulario.antecipacao)!.prepayment,
  };
}

function rotuloDe(formulario: Formulario): string {
  switch (formulario.registro) {
    case "income":
      return formulario.entrada ? "Entrada salva" : "Entrada lançada";
    case "expense":
      return formulario.lancamento ? "Gasto salvo" : "Gasto lançado";
    case "prepayment":
      return formulario.antecipacao ? "Antecipação salva" : "Parcelas antecipadas";
  }
}

/** O que o formulário aberto manda para a lixeira: a antecipação desfeita, ou o registro corrigido. */
function apagarDe(formulario: Formulario): Command {
  switch (formulario.registro) {
    case "income":
      return { type: "delete", record: "income", id: formulario.entrada!.id };
    case "expense":
      return { type: "delete", record: "expense", id: formulario.lancamento!.id };
    case "prepayment":
      return { type: "delete", record: "prepayment", id: formulario.antecipacao! };
  }
}
