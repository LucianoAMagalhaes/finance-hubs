import {
  antecipacaoEm,
  aplicar,
  itensNaLixeira,
  mesDaData,
  nomeDoMes,
  normalizarTag,
  projetarMes,
  type Antecipacao,
  type Comando,
  type Compra,
  type Data,
  type Eixo,
  type Entrada,
  type Estado,
  type ItemNaLixeira,
  type Lancamento,
  type Mes,
  type Ocorrencia,
  type Percentuais,
  type Registro,
  type Resultado,
  type VistaDoMes,
} from "@/dominio";
import { percentuaisParaPrevia, rascunhoDe, type Rascunho } from "./EditorDePercentuais";
import type { Aberto } from "./MestreDetalhe";

/** O formulário aberto, já resolvido contra o estado: um registro novo (null), ou o que se corrige. */
export type FormularioAberto =
  | { registro: "entrada"; entrada: Entrada | null }
  | { registro: "lancamento"; lancamento: Lancamento | null }
  /** A antecipação de um parcelado: nova (null) ou a que se revê. */
  | { registro: "antecipacao"; parcelado: Compra; antecipacao: Antecipacao | null };

/** Depois de salvar algo com data em outro mês, a tela fica onde está e aponta para lá. */
type Aviso = { texto: string; mes: Mes };

/** Tudo que a tela do mês desenha. */
export type Tela = {
  estado: Estado;
  mes: Mes;
  vista: VistaDoMes;
  lixeira: ItemNaLixeira[];
  formulario: FormularioAberto | null;
  aviso: Aviso | null;
  /** Os percentuais sendo editados; enquanto existe, a projeção usa eles. */
  rascunho: Rascunho | null;
  eixo: Eixo;
  /** O grupo aberto no mestre-detalhe; continua aberto ao trocar de mês, se existir lá. */
  aberto: Aberto | null;
  lixeiraAberta: boolean;
  /** A tag que se renomeia; não é um registro, e por isso não é um formulário como os outros. */
  tagARenomear: string | null;
};

/** A porta para o servidor: grava o comando e devolve o estado novo, ou a recusa. */
export type Executar = (comando: Comando) => Promise<Resultado<Estado>>;

/** O formulário como o fluxo o guarda: a antecipação por ids, resolvida a cada leitura. */
type Formulario =
  | { registro: "entrada"; entrada: Entrada | null }
  | { registro: "lancamento"; lancamento: Lancamento | null }
  | { registro: "antecipacao"; parcelado: number; antecipacao: number | null };

type Memoria = Omit<Tela, "vista" | "lixeira" | "formulario"> & { formulario: Formulario | null };

/**
 * O fluxo da tela do mês, fora do React. Mantém o estado em memória e projeta
 * o mês; trocar de mês é só trocar a projeção, e nunca grava nada. Salvar
 * confere no navegador, manda o comando ao servidor e troca o estado pelo que
 * ele devolve. As ações assíncronas devolvem o erro, ou null se deu certo.
 */
export function criarFluxoDoMes(estadoInicial: Estado, { hoje, executar }: { hoje: Data; executar: Executar }) {
  let memoria: Memoria = {
    estado: estadoInicial,
    mes: mesDaData(hoje),
    formulario: null,
    aviso: null,
    rascunho: null,
    eixo: "pote",
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
  async function mandar(comando: Comando, depois: () => Partial<Memoria> = () => ({})): Promise<string | null> {
    const previa = aplicar(memoria.estado, comando, hoje);
    if (!previa.ok) return previa.erro;
    const resultado = await executar(comando);
    if (!resultado.ok) return resultado.erro;
    mudar({ estado: resultado.valor, ...depois() });
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

    mudarMes: (mes: Mes) => mudar({ mes, aviso: null, rascunho: null }),
    dispensarAviso: () => mudar({ aviso: null }),

    /** Um eixo por vez. Trocar de eixo fecha o grupo aberto, mas não o feed do mês. */
    mudarEixo: (eixo: Eixo) => mudar({ eixo, aberto: memoria.aberto?.tipo === "todos" ? memoria.aberto : null }),
    abrir: (aberto: Aberto | null) => mudar({ aberto }),
    alternarDespesas: () => mudar({ aberto: memoria.aberto?.tipo === "todos" ? null : { tipo: "todos" } }),

    abrirEntrada: (entrada: Entrada | null) => mudar({ formulario: { registro: "entrada", entrada } }),
    abrirLancamento: (lancamento: Lancamento | null) => mudar({ formulario: { registro: "lancamento", lancamento } }),
    /** A ocorrência da antecipação abre a própria antecipação; as outras, o lançamento. */
    abrirOcorrencia: (o: Ocorrencia) =>
      mudar({
        formulario: o.antecipacao
          ? { registro: "antecipacao", parcelado: o.lancamento, antecipacao: o.antecipacao.id }
          : { registro: "lancamento", lancamento: memoria.estado.lancamentos.find((l) => l.id === o.lancamento)! },
      }),
    /** Do formulário do parcelado para uma antecipação nova dele. */
    antecipar() {
      const { lancamento } = formularioNaTela() as { lancamento: Lancamento };
      mudar({ formulario: { registro: "antecipacao", parcelado: lancamento.id, antecipacao: null } });
    },
    fecharFormulario: () => mudar({ formulario: null }),

    /** Salva o registro do formulário aberto e, se ele pesa a partir de outro mês, avisa sem sair deste. */
    async salvar(comando: Comando, destino: Mes): Promise<string | null> {
      const { mes } = memoria;
      const rotulo = rotuloDe(formularioNaTela());
      return mandar(comando, () => ({
        formulario: null,
        aviso: destino === mes ? null : { texto: `${rotulo} em ${nomeDoMes(destino)}.`, mes: destino },
      }));
    },
    /** Apagar manda para a lixeira e fecha o formulário; os meses afetados recalculam com o estado novo. */
    apagar: () => mandar(apagarDe(formularioNaTela()), () => ({ formulario: null })),
    /** Encerrar fecha o formulário, como apagar; no mês de início, o recorrente vai para a lixeira. */
    encerrar() {
      const { lancamento } = formularioNaTela() as { lancamento: Lancamento };
      return mandar({ tipo: "encerrar-recorrente", id: lancamento.id, mes: memoria.mes }, () => ({ formulario: null }));
    },

    abrirLixeira: () => mudar({ lixeiraAberta: true }),
    fecharLixeira: () => mudar({ lixeiraAberta: false }),
    restaurar: (registro: Registro, id: number) => mandar({ tipo: "restaurar", registro, id }),

    abrirRenomear: (tag: string) => mudar({ tagARenomear: tag }),
    fecharRenomear: () => mudar({ tagARenomear: null }),
    /**
     * Renomear troca o nome em todos os meses, então o grupo aberto passa a ser o
     * da tag nova — ou o da que ela absorveu, na fusão —, e o detalhe continua
     * onde estava em vez de sumir com o nome antigo.
     */
    renomearTag(para: string, fundir: boolean): Promise<string | null> {
      const de = memoria.tagARenomear!;
      return mandar({ tipo: "renomear-tag", de, para, fundir }, () => ({
        tagARenomear: null,
        aberto: { tipo: "grupo", chave: normalizarTag(para) },
      }));
    },

    editarPercentuais: () => mudar({ rascunho: rascunhoDe(tela.vista.potes) }),
    mudarRascunho: (rascunho: Rascunho) => mudar({ rascunho }),
    cancelarRascunho: () => mudar({ rascunho: null }),
    salvarPercentuais: (percentuais: Percentuais) =>
      mandar({ tipo: "salvar-percentuais", mes: memoria.mes, percentuais }, () => ({ rascunho: null })),
  };
}

/** A tela a partir da memória; a projeção e a lixeira só se refazem quando o que elas leem muda. */
function montarTela(memoria: Memoria, antes: Tela | null): Tela {
  const { estado, mes, rascunho, formulario } = memoria;
  const mesmoEstado = antes?.estado === estado;
  const vista =
    mesmoEstado && antes.mes === mes && antes.rascunho === rascunho
      ? antes.vista
      : projetarMes(estado, mes, rascunho ? percentuaisParaPrevia(rascunho) : undefined);
  const lixeira = mesmoEstado ? antes.lixeira : itensNaLixeira(estado);
  return { ...memoria, vista, lixeira, formulario: formulario && resolver(estado, formulario) };
}

function resolver(estado: Estado, formulario: Formulario): FormularioAberto {
  if (formulario.registro !== "antecipacao") return formulario;
  return {
    registro: "antecipacao",
    parcelado: estado.lancamentos.find((l) => l.id === formulario.parcelado) as Compra,
    antecipacao: formulario.antecipacao === null ? null : antecipacaoEm(estado, formulario.antecipacao)!.antecipacao,
  };
}

function rotuloDe(formulario: Formulario): string {
  switch (formulario.registro) {
    case "entrada":
      return formulario.entrada ? "Entrada salva" : "Entrada lançada";
    case "lancamento":
      return formulario.lancamento ? "Gasto salvo" : "Gasto lançado";
    case "antecipacao":
      return formulario.antecipacao ? "Antecipação salva" : "Parcelas antecipadas";
  }
}

/** O que o formulário aberto manda para a lixeira: a antecipação desfeita, ou o registro corrigido. */
function apagarDe(formulario: Formulario): Comando {
  switch (formulario.registro) {
    case "entrada":
      return { tipo: "apagar", registro: "entrada", id: formulario.entrada!.id };
    case "lancamento":
      return { tipo: "apagar", registro: "lancamento", id: formulario.lancamento!.id };
    case "antecipacao":
      return { tipo: "apagar", registro: "antecipacao", id: formulario.antecipacao! };
  }
}
