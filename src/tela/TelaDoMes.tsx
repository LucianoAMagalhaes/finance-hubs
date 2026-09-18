"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  formatarReais,
  mesDaData,
  nomeDoMes,
  projetarMes,
  somarMeses,
  type AgregadosDoMes,
  type Centavos,
  type Data,
  type Estado,
  type Mes,
  type PoteNaVista,
  type VistaDoMes,
} from "@/dominio";
import { AlternadorDeTema } from "./AlternadorDeTema";

type Props = { estado: Estado; hoje: Data };

/**
 * A tela do mês. Mantém o estado em memória e projeta o mês no navegador;
 * trocar de mês é só trocar a projeção, e nunca grava nada.
 */
export function TelaDoMes({ estado, hoje }: Props) {
  const mesDeHoje = mesDaData(hoje);
  const [mes, setMes] = useState<Mes>(mesDeHoje);
  const vista = useMemo(() => projetarMes(estado, mes), [estado, mes]);

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
        </div>
      </header>

      <Secao titulo="O mês" primeira />
      <FaixaDeAgregados agregados={vista.agregados} />

      <Secao titulo="Os potes">
        <span className="extra num">
          {vista.potes.map((p) => p.percentual).join(" / ")}
          {vista.naoAlocado > 0 && <strong className="nao-alocado"> · {vista.naoAlocado}% não alocado</strong>}
        </span>
      </Secao>
      {vista.receita === 0 && (
        <p className="aviso">
          Nenhuma entrada em {nomeDoMes(mes)}: sem receita, os potes não têm limite nem veredito.
        </p>
      )}
      <GradeDePotes vista={vista} />
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

function FaixaDeAgregados({ agregados }: { agregados: AgregadosDoMes }) {
  const cards = [
    { rotulo: "Receitas", valor: <span className="val entrada">{formatarReais(agregados.receitas)}</span>, dica: "entradas do mês" },
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
