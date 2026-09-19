"use client";

import { useMemo, useState, type CSSProperties } from "react";
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
  type AgregadosDoMes,
  type Centavos,
  type Comando,
  type Data,
  type Entrada,
  type Estado,
  type Mes,
  type PoteNaVista,
  type VistaDoMes,
} from "@/dominio";
import { executar } from "@/servidor/acoes";
import { AlternadorDeTema } from "./AlternadorDeTema";
import { FormularioDeEntrada } from "./FormularioDeEntrada";

type Props = { estadoInicial: Estado; hoje: Data };

/** O formulário aberto: uma entrada nova, ou a que se corrige. */
type Formulario = { entrada: Entrada | null };

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
  const vista = useMemo(() => projetarMes(estado, mes), [estado, mes]);

  function setMes(novo: Mes) {
    setMesDaTela(novo);
    setAviso(null);
  }

  /** Confere no navegador, grava no servidor. Devolve o erro, ou null se salvou. */
  async function mandar(comando: Comando, rotulo: string): Promise<string | null> {
    const previa = aplicar(estado, comando, hoje);
    if (!previa.ok) return previa.erro;
    const resultado = await executar(comando);
    if (!resultado.ok) return resultado.erro;
    setEstado(resultado.valor);
    setFormulario(null);
    const destino = mesDaData(comando.entrada.data);
    setAviso(destino === mes ? null : { texto: `${rotulo} em ${nomeDoMes(destino)}.`, mes: destino });
    return null;
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
          <button type="button" className="btn entrada" onClick={() => setFormulario({ entrada: null })}>
            + Entrada
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
      <FaixaDeAgregados agregados={vista.agregados} entradas={vista.entradas.length} />

      <Secao titulo="Os potes">
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
      </Secao>
      {vista.receita === 0 && (
        <p className="aviso">
          Nenhuma entrada em {nomeDoMes(mes)}: sem receita, os potes não têm limite nem veredito.
        </p>
      )}
      <GradeDePotes vista={vista} />

      <Secao titulo="Entradas do mês">
        <button type="button" className="btn entrada" onClick={() => setFormulario({ entrada: null })}>
          + Entrada
        </button>
      </Secao>
      <ListaDeEntradas vista={vista} abrir={(entrada) => setFormulario({ entrada })} />

      {formulario && (
        <FormularioDeEntrada
          entrada={formulario.entrada}
          dataProposta={dataProposta(mes, hoje)}
          salvar={(entrada) =>
            mandar({ tipo: "salvar-entrada", entrada }, formulario.entrada ? "Entrada salva" : "Entrada lançada")
          }
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

function FaixaDeAgregados({ agregados, entradas }: { agregados: AgregadosDoMes; entradas: number }) {
  const cards = [
    {
      rotulo: "Receitas",
      valor: <span className="val entrada">{formatarReais(agregados.receitas)}</span>,
      dica: entradas === 1 ? "1 entrada" : `${entradas} entradas`,
    },
    { rotulo: "Despesas", valor: <Valor centavos={agregados.despesas} />, dica: "líquido" },
    { rotulo: "Saldo do mês", valor: <Saldo centavos={agregados.saldoDoMes} />, dica: "receitas − despesas" },
    { rotulo: "Saldo em conta", valor: <Saldo centavos={agregados.saldoEmConta} />, dica: "sem cartão · aproximado" },
  ];
  return (
    <div className="faixa">
      {cards.map((c) => (
        <div className="agregado" key={c.rotulo}>
          <div className="k">{c.rotulo}</div>
          <div className="v num">{c.valor}</div>
          <div className="h">{c.dica}</div>
        </div>
      ))}
    </div>
  );
}

/** As entradas do mês, com a fonte como coluna. Fonte não tem drill-down (ADR-0003). */
function ListaDeEntradas({ vista, abrir }: { vista: VistaDoMes; abrir: (entrada: Entrada) => void }) {
  return (
    <div className="tabela-entradas">
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

function GradeDePotes({ vista }: { vista: VistaDoMes }) {
  return (
    <div className="grade">
      {vista.potes.map((p) => (
        <CartaoDoPote key={p.id} pote={p} />
      ))}
    </div>
  );
}

function CartaoDoPote({ pote }: { pote: PoteNaVista }) {
  const semLimite = pote.limite === null;
  return (
    <article className={`cartao pote ${semLimite ? "sem-limite" : ""}`} style={{ "--pote": `var(--p-${pote.id})` } as CSSProperties}>
      <div className="cartao-topo">
        <span>
          <span className="quadrado" />
          {pote.nome}
        </span>
        <span className="num">{pote.percentual}%</span>
      </div>
      <div className="cartao-total num">
        <Valor centavos={pote.total} />
      </div>
      <div className="barra" />
      <div className="cartao-pe">
        <Veredito pote={pote} />
        <span className="lim">{semLimite ? "sem limite" : `limite ${formatarReais(pote.limite!)}`}</span>
      </div>
    </article>
  );
}

function Veredito({ pote }: { pote: PoteNaVista }) {
  switch (pote.veredito) {
    case "sem-receita":
      return <span className="selo nenhum">— Sem receita</span>;
    case "sobra":
      return <span className="selo sobra">✓ Sobra</span>;
    case "estourou":
      return <span className="selo estourou">▲ Estourou</span>;
  }
}

/** Valor de gasto: negativo é reembolso, em violeta com ↺. */
function Valor({ centavos }: { centavos: Centavos }) {
  return centavos < 0 ? <span className="val reembolso">↺ {formatarReais(centavos)}</span> : <span className="val">{formatarReais(centavos)}</span>;
}

/** Saldo: negativo é déficit, em vermelho. */
function Saldo({ centavos }: { centavos: Centavos }) {
  return <span className={centavos < 0 ? "deficit" : undefined}>{formatarReais(centavos)}</span>;
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
