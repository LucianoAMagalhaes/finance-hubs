"use client";

import { useMemo, useState } from "react";
import {
  aplicar,
  dataProposta,
  formatarReais,
  mesDaData,
  nomeDaFonte,
  nomeDoMes,
  nomeDoTipo,
  projetarMes,
  somarMeses,
  tagsEmUso,
  type AgregadosDoMes,
  type Centavos,
  type Comando,
  type Data,
  type Eixo,
  type Entrada,
  type EntradaASalvar,
  type Estado,
  type Lancamento,
  type LancamentoASalvar,
  type Mes,
  type Ocorrencia,
  type Percentuais,
  type VistaDoMes,
} from "@/dominio";
import { executar } from "@/servidor/acoes";
import { AlternadorDeTema } from "./AlternadorDeTema";
import { EditorDePercentuais, percentuaisParaPrevia, rascunhoDe, type Rascunho } from "./EditorDePercentuais";
import { FormularioDeEntrada } from "./FormularioDeEntrada";
import { FormularioDeLancamento } from "./FormularioDeLancamento";
import { MestreDetalhe, NOME_DO_EIXO, type Aberto } from "./MestreDetalhe";
import { Valor } from "./pecas";

type Props = { estadoInicial: Estado; hoje: Data };

/** O formulário aberto: um registro novo (null), ou o que se corrige. */
type Formulario = { registro: "entrada"; entrada: Entrada | null } | { registro: "lancamento"; lancamento: Lancamento | null };

/** Depois de salvar algo com data em outro mês, a tela fica onde está e aponta para lá. */
type Aviso = { texto: string; mes: Mes };

/**
 * A tela do mês. Mantém o estado em memória e projeta o mês no navegador;
 * trocar de mês é só trocar a projeção, e nunca grava nada. Salvar manda o
 * comando ao servidor e troca o estado pelo que ele devolve.
 */
export function TelaDoMes({ estadoInicial, hoje }: Props) {
  const mesDeHoje = mesDaData(hoje);
  const [estado, setEstado] = useState(estadoInicial);
  const [mes, setMesDaTela] = useState<Mes>(mesDeHoje);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  /** Os percentuais sendo editados; enquanto existe, a projeção usa eles. */
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [eixo, setEixoDaTela] = useState<Eixo>("pote");
  /** O grupo aberto no mestre-detalhe; continua aberto ao trocar de mês, se existir lá. */
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const vista = useMemo(
    () => projetarMes(estado, mes, rascunho ? percentuaisParaPrevia(rascunho) : undefined),
    [estado, mes, rascunho],
  );

  function setMes(novo: Mes) {
    setMesDaTela(novo);
    setAviso(null);
    setRascunho(null);
  }

  /** Confere no navegador, grava no servidor. Devolve o erro, ou null se salvou. */
  async function mandar(comando: Comando): Promise<string | null> {
    const previa = aplicar(estado, comando, hoje);
    if (!previa.ok) return previa.erro;
    const resultado = await executar(comando);
    if (!resultado.ok) return resultado.erro;
    setEstado(resultado.valor);
    return null;
  }

  /** Salva uma entrada ou um lançamento e, se a data cai em outro mês, avisa sem sair deste. */
  async function salvarRegistro(comando: Comando, data: Data, rotulo: string): Promise<string | null> {
    const erro = await mandar(comando);
    if (erro) return erro;
    setFormulario(null);
    const destino = mesDaData(data);
    setAviso(destino === mes ? null : { texto: `${rotulo} em ${nomeDoMes(destino)}.`, mes: destino });
    return null;
  }

  const salvarEntrada = (entrada: EntradaASalvar, rotulo: string) =>
    salvarRegistro({ tipo: "salvar-entrada", entrada }, entrada.data, rotulo);

  const salvarLancamento = (lancamento: LancamentoASalvar, rotulo: string) =>
    salvarRegistro({ tipo: "salvar-lancamento", lancamento }, lancamento.data, rotulo);

  /** Um eixo por vez. Trocar de eixo fecha o grupo aberto, mas não o feed do mês. */
  function setEixo(novo: Eixo) {
    setEixoDaTela(novo);
    setAberto((a) => (a?.tipo === "todos" ? a : null));
  }

  const abrirOcorrencia = (o: Ocorrencia) =>
    setFormulario({ registro: "lancamento", lancamento: estado.lancamentos.find((l) => l.id === o.lancamento)! });

  const novaEntrada = () => setFormulario({ registro: "entrada", entrada: null });
  const novoLancamento = () => setFormulario({ registro: "lancamento", lancamento: null });

  async function salvarPercentuais(percentuais: Percentuais): Promise<string | null> {
    const erro = await mandar({ tipo: "salvar-percentuais", mes, percentuais });
    if (!erro) setRascunho(null);
    return erro;
  }

  return (
    <main className="wrap">
      <header className="topo">
        <nav className="navegacao-mes" aria-label="Mês">
          <button type="button" className="btn seta" onClick={() => setMes(somarMeses(mes, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <h1>{maiuscula(nomeDoMes(mes))}</h1>
          <button type="button" className="btn seta" onClick={() => setMes(somarMeses(mes, 1))} aria-label="Próximo mês">
            ›
          </button>
          {mes !== mesDeHoje && (
            <button type="button" className="btn" onClick={() => setMes(mesDeHoje)}>
              Hoje
            </button>
          )}
        </nav>
        <div className="status">
          <span className="chip">{mes === mesDeHoje ? "mês em curso" : mes < mesDeHoje ? "mês passado · editável" : "mês futuro"}</span>
          {!vista.orcamento.nascido && (
            <span className="chip nascimento">
              ainda não nasceu · herdaria{" "}
              {vista.orcamento.herdadoDe ? `de ${nomeDoMes(vista.orcamento.herdadoDe)}` : "os padrão"}
            </span>
          )}
        </div>
        <div className="acoes">
          <AlternadorDeTema />
          <button type="button" className="btn entrada" onClick={novaEntrada}>
            + Entrada
          </button>
          <button type="button" className="btn primario" onClick={novoLancamento}>
            + Gasto
          </button>
        </div>
      </header>

      {aviso && (
        <div className="aviso-salvo" role="status">
          <span>
            {aviso.texto} A tela continua em {nomeDoMes(mes)}.
          </span>
          <button type="button" className="btn" onClick={() => setMes(aviso.mes)}>
            Ir para {nomeDoMes(aviso.mes)}
          </button>
          <button type="button" className="fechar" onClick={() => setAviso(null)} aria-label="Dispensar aviso">
            ×
          </button>
        </div>
      )}

      <Secao titulo="O mês" primeira />
      <FaixaDeAgregados
        agregados={vista.agregados}
        entradas={vista.entradas.length}
        despesasAbertas={aberto?.tipo === "todos"}
        abrirDespesas={() => setAberto((a) => (a?.tipo === "todos" ? null : { tipo: "todos" }))}
      />

      <Secao titulo={eixo === "pote" ? "Os potes" : `Por ${NOME_DO_EIXO[eixo].toLowerCase()}`}>
        <SeletorDeEixo eixo={eixo} mudar={setEixo} />
        {eixo === "pote" && !rascunho && (
          <button type="button" className="btn" onClick={() => setRascunho(rascunhoDe(vista.potes))}>
            Editar percentuais
          </button>
        )}
        {eixo === "pote" ? (
          <span className="extra num">
            {vista.potes.map((p) => p.percentual).join(" / ")}
            {vista.naoAlocado.percentual > 0 && (
              <strong className="nao-alocado">
                {" "}
                · {vista.naoAlocado.percentual}% não alocado
                {vista.naoAlocado.valor !== null && ` (${formatarReais(vista.naoAlocado.valor)})`}
              </strong>
            )}
          </span>
        ) : (
          <span className="extra">Sem limite e sem veredito: só pote tem percentual da receita.</span>
        )}
      </Secao>
      {rascunho && (
        <EditorDePercentuais
          rascunho={rascunho}
          mudar={setRascunho}
          salvar={salvarPercentuais}
          cancelar={() => setRascunho(null)}
        />
      )}
      {vista.receita === 0 && (
        <p className="aviso">
          Nenhuma entrada em {nomeDoMes(mes)}: sem receita, os potes não têm limite nem veredito.
        </p>
      )}
      <MestreDetalhe vista={vista} eixo={eixo} aberto={aberto} abrir={setAberto} abrirOcorrencia={abrirOcorrencia} />

      <Secao titulo="Entradas do mês">
        <button type="button" className="btn entrada" onClick={novaEntrada}>
          + Entrada
        </button>
      </Secao>
      <ListaDeEntradas vista={vista} abrir={(entrada) => setFormulario({ registro: "entrada", entrada })} />

      {formulario?.registro === "entrada" && (
        <FormularioDeEntrada
          entrada={formulario.entrada}
          dataProposta={dataProposta(mes, hoje)}
          salvar={(entrada) => salvarEntrada(entrada, formulario.entrada ? "Entrada salva" : "Entrada lançada")}
          fechar={() => setFormulario(null)}
        />
      )}
      {formulario?.registro === "lancamento" && (
        <FormularioDeLancamento
          lancamento={formulario.lancamento}
          tags={tagsEmUso(estado)}
          dataProposta={dataProposta(mes, hoje)}
          salvar={(lancamento) => salvarLancamento(lancamento, formulario.lancamento ? "Gasto salvo" : "Gasto lançado")}
          fechar={() => setFormulario(null)}
        />
      )}
    </main>
  );
}

function Secao({ titulo, primeira, children }: { titulo: string; primeira?: boolean; children?: React.ReactNode }) {
  return (
    <div className={primeira ? "secao primeira" : "secao"}>
      <h2>{titulo}</h2>
      <span className="fio" />
      {children}
    </div>
  );
}

type PropsDaFaixa = {
  agregados: AgregadosDoMes;
  entradas: number;
  despesasAbertas: boolean;
  abrirDespesas: () => void;
};

/** O card Despesas abre "Todos os gastos do mês" no mestre-detalhe. */
function FaixaDeAgregados({ agregados, entradas, despesasAbertas, abrirDespesas }: PropsDaFaixa) {
  const cards = [
    {
      rotulo: "Receitas",
      valor: <span className="val entrada">{formatarReais(agregados.receitas)}</span>,
      dica: entradas === 1 ? "1 entrada" : `${entradas} entradas`,
    },
    { rotulo: "Despesas", valor: <Valor centavos={agregados.despesas} />, dica: "líquido · ver todos os gastos", abrir: abrirDespesas },
    { rotulo: "Saldo do mês", valor: <Saldo centavos={agregados.saldoDoMes} />, dica: "receitas − despesas" },
    { rotulo: "Saldo em conta", valor: <Saldo centavos={agregados.saldoEmConta} />, dica: "sem cartão · aproximado" },
  ];
  return (
    <div className="faixa">
      {cards.map((c) => {
        const conteudo = (
          <>
            <span className="k">{c.rotulo}</span>
            <span className="v num">{c.valor}</span>
            <span className="h">{c.dica}</span>
          </>
        );
        return c.abrir ? (
          <button type="button" className={`agregado clicavel ${despesasAbertas ? "aberto" : ""}`} key={c.rotulo} onClick={c.abrir} aria-pressed={despesasAbertas}>
            {conteudo}
          </button>
        ) : (
          <div className="agregado" key={c.rotulo}>
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}

/** As entradas do mês, com a fonte como coluna. Fonte não tem drill-down (ADR-0003). */
function ListaDeEntradas({ vista, abrir }: { vista: VistaDoMes; abrir: (entrada: Entrada) => void }) {
  return (
    <div className="tabela">
      <div className="linha cabecalho" aria-hidden>
        <span>Data</span>
        <span>Descrição</span>
        <span>Fonte</span>
        <span>Tipo</span>
        <span className="direita">Valor</span>
      </div>
      {vista.entradas.map((e) => (
        <button type="button" key={e.id} className="linha clicavel" onClick={() => abrir(e)} title="Corrigir a entrada">
          <span className="data num">
            {e.data.slice(8)}/{e.data.slice(5, 7)}
          </span>
          <span>{e.descricao}</span>
          <span>
            <span className="pilula-fonte">{nomeDaFonte(e.fonte)}</span>
          </span>
          <span className="tipo">{nomeDoTipo(e.tipo)}</span>
          <span className="direita num val entrada">+ {formatarReais(e.valor)}</span>
        </button>
      ))}
      {vista.entradas.length === 0 && (
        <div className="linha vazia">
          <span />
          <span>Nenhuma entrada. Sem entrada, sem receita, sem limite.</span>
        </div>
      )}
      <div className="linha rodape">
        <span />
        <span>Receita do mês</span>
        <span />
        <span />
        <span className="direita num val entrada">{formatarReais(vista.receita)}</span>
      </div>
    </div>
  );
}

function SeletorDeEixo({ eixo, mudar }: { eixo: Eixo; mudar: (eixo: Eixo) => void }) {
  return (
    <div className="seletor-eixo" role="group" aria-label="Agrupar os gastos por">
      {(Object.keys(NOME_DO_EIXO) as Eixo[]).map((e) => (
        <button type="button" key={e} aria-pressed={e === eixo} onClick={() => mudar(e)}>
          {NOME_DO_EIXO[e]}
        </button>
      ))}
    </div>
  );
}

/** Saldo: negativo é déficit, em vermelho. */
function Saldo({ centavos }: { centavos: Centavos }) {
  return <span className={centavos < 0 ? "deficit" : undefined}>{formatarReais(centavos)}</span>;
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
