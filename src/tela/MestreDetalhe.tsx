"use client";

import {
  formatarReais,
  grupos,
  nomeDoPote,
  nomeDoTipo,
  todosOsGastos,
  type Eixo,
  type Grupo,
  type Ocorrencia,
  type PoteNaVista,
  type VistaDoMes,
} from "@/dominio";
import { corDaTag, corDoPote, PilulaDaTag, Valor } from "./pecas";

export const NOME_DO_EIXO: Record<Eixo, string> = { pote: "Pote", tipo: "Tipo de pagamento", tag: "Tag" };

/** O que está aberto no detalhe: um grupo do eixo, ou o feed do mês inteiro (o card Despesas). */
export type Aberto = { tipo: "grupo"; chave: string | null } | { tipo: "todos" };

type Props = {
  vista: VistaDoMes;
  eixo: Eixo;
  aberto: Aberto | null;
  abrir: (aberto: Aberto | null) => void;
  abrirOcorrencia: (ocorrencia: Ocorrencia) => void;
};

/**
 * Os grupos do eixo como grade. Com um grupo aberto, a grade vira uma coluna
 * com os mesmos cards, só empilhados, e o detalhe fica ao lado: trocar de
 * grupo custa um clique. Um grupo que não existe no mês volta à grade.
 */
export function MestreDetalhe({ vista, eixo, aberto, abrir, abrirOcorrencia }: Props) {
  const gruposDoEixo = grupos(vista, eixo);
  const detalhe = aberto?.tipo === "todos" ? todosOsGastos(vista) : aberto && gruposDoEixo.find((g) => g.chave === aberto.chave);
  const cartoes = gruposDoEixo.map((g) => {
    const selecionado = aberto?.tipo === "grupo" && aberto.chave === g.chave;
    const clicar = () => abrir(selecionado ? null : { tipo: "grupo", chave: g.chave });
    // Tag nunca é vazia depois de normalizada: "" não colide com nenhuma.
    const chave = g.chave ?? "";
    return eixo === "pote" ? (
      <CartaoDoPote key={chave} pote={vista.potes.find((p) => p.id === g.chave)!} selecionado={selecionado} clicar={clicar} />
    ) : (
      <CartaoDoGrupo key={chave} grupo={g} eixo={eixo} selecionado={selecionado} clicar={clicar} />
    );
  });

  if (!detalhe) {
    if (gruposDoEixo.length === 0) return <p className="grade-vazia">Nenhum gasto neste mês.</p>;
    return <div className="grade">{cartoes}</div>;
  }
  return (
    <div className="mestre-detalhe">
      <div className="coluna">
        {cartoes}
        <div className="soma-despesas">
          <span>Soma = despesas</span>
          <strong className="num">
            <Valor centavos={vista.agregados.despesas} />
          </strong>
        </div>
      </div>
      <Detalhe
        vista={vista}
        grupo={detalhe}
        eixo={aberto?.tipo === "todos" ? null : eixo}
        fechar={() => abrir(null)}
        abrirOcorrencia={abrirOcorrencia}
      />
    </div>
  );
}

type PropsDoCartao = { selecionado: boolean; clicar: () => void };

function CartaoDoPote({ pote, selecionado, clicar }: { pote: PoteNaVista } & PropsDoCartao) {
  const semLimite = pote.limite === null;
  const classe = semLimite ? "sem-limite" : pote.veredito === "estourou" ? "estourou" : "";
  return (
    <button
      type="button"
      className={`cartao pote ${classe} ${selecionado ? "aberto" : ""}`}
      style={corDoPote(pote.id)}
      aria-pressed={selecionado}
      onClick={clicar}
    >
      <span className="cartao-topo">
        <span>
          <span className="quadrado" />
          {pote.nome}
        </span>
        <span className="num">{pote.percentual}%</span>
      </span>
      <span className="cartao-total num">
        <Valor centavos={pote.total} />
      </span>
      <Barra pote={pote} />
      <span className="cartao-pe">
        <Veredito pote={pote} />
        <span className="lim">{semLimite ? "sem limite" : `limite ${formatarReais(pote.limite!)}`}</span>
      </span>
    </button>
  );
}

/** Tipo de pagamento e tag não têm limite nem veredito: só total e contagem. */
function CartaoDoGrupo({ grupo, eixo, selecionado, clicar }: { grupo: Grupo; eixo: Exclude<Eixo, "pote"> } & PropsDoCartao) {
  const tingido = eixo === "tag" && grupo.chave !== null;
  return (
    <button
      type="button"
      className={`cartao grupo ${tingido ? "tag" : ""} ${selecionado ? "aberto" : ""}`}
      style={tingido ? corDaTag(grupo.chave!) : undefined}
      aria-pressed={selecionado}
      onClick={clicar}
    >
      <span className="cartao-topo">
        <span>
          {tingido && <span className="quadrado" />}
          {grupo.nome}
        </span>
      </span>
      <span className="cartao-total num">
        <Valor centavos={grupo.total} />
      </span>
      <span className="cartao-pe">
        <span>{contagem(grupo.ocorrencias.length)}</span>
      </span>
    </button>
  );
}

/**
 * A barra do pote: o total contra o limite. Quando o total passa do limite, a
 * escala vira o total e a marca vertical mostra onde o limite ficou.
 */
function Barra({ pote }: { pote: PoteNaVista }) {
  if (pote.limite === null) return <span className="barra" />;
  const saiu = Math.max(pote.total, 0);
  const escala = Math.max(pote.limite, saiu);
  const fracao = (v: number) => (escala > 0 ? (v / escala) * 100 : 0);
  return (
    <span className="barra">
      <i style={{ width: `${fracao(saiu)}%` }} />
      <b style={{ left: `calc(${fracao(pote.limite)}% - 1px)` }} />
    </span>
  );
}

function Veredito({ pote }: { pote: PoteNaVista }) {
  switch (pote.veredito) {
    case "sem-receita":
      return <span className="selo nenhum">— Sem receita</span>;
    case "sobra":
      return <span className="selo sobra">✓ Sobra {formatarReais(pote.limite! - pote.total)}</span>;
    case "estourou":
      return <span className="selo estourou">▲ Estourou {formatarReais(pote.estouro!)}</span>;
  }
}

type PropsDoDetalhe = {
  vista: VistaDoMes;
  grupo: Grupo;
  /** null é "Todos os gastos do mês", que não é grupo de eixo nenhum. */
  eixo: Eixo | null;
  fechar: () => void;
  abrirOcorrencia: (ocorrencia: Ocorrencia) => void;
};

/** O cabeçalho do pote tem percentual, limite e veredito; os outros, total e contagem. */
function Detalhe({ vista, grupo, eixo, fechar, abrirOcorrencia }: PropsDoDetalhe) {
  const pote = eixo === "pote" ? vista.potes.find((p) => p.id === grupo.chave) : undefined;
  const tag = eixo === "tag" ? grupo.chave : null;
  return (
    <section className="detalhe" aria-label={grupo.nome}>
      <header>
        <button type="button" className="fechar" onClick={fechar} aria-label="Fechar o detalhe e voltar à grade">
          ×
        </button>
        <div className="kicker">{eixo ? NOME_DO_EIXO[eixo] : "Despesas"}</div>
        <h2 style={pote ? corDoPote(pote.id) : tag ? corDaTag(tag) : undefined}>
          {(pote || tag) && <span className="quadrado" />}
          {grupo.nome}
        </h2>
        <div className="detalhe-resumo">
          <span className="detalhe-total num">
            <Valor centavos={grupo.total} />
          </span>
          {pote && <Veredito pote={pote} />}
          <span className="dica">{contagem(grupo.ocorrencias.length)}</span>
        </div>
        {pote && (
          <p className="dica">
            {pote.limite === null
              ? `${pote.percentual}% · sem receita, sem limite`
              : `${pote.percentual}% de ${formatarReais(vista.receita)} · limite ${formatarReais(pote.limite)}`}
          </p>
        )}
        {grupo.total < 0 && <p className="nota-reembolso">Só reembolso neste mês; não é entrada e não move a receita.</p>}
      </header>
      {grupo.ocorrencias.map((o) => (
        <button type="button" key={o.lancamento} className="ocorrencia" onClick={() => abrirOcorrencia(o)} title="Corrigir o gasto">
          <span className="data num">
            {o.data.slice(8)}/{o.data.slice(5, 7)}
          </span>
          <span className="ocorrencia-corpo">
            <span>{o.descricao}</span>
            <span className="eixos-da-ocorrencia">
              <span style={corDoPote(o.pote)}>
                <span className="quadrado" />
                {nomeDoPote(o.pote)}
              </span>
              <span>{nomeDoTipo(o.tipo)}</span>
              <PilulaDaTag tag={o.tag} />
            </span>
          </span>
          <span className="direita num">
            <Valor centavos={o.valor} />
          </span>
        </button>
      ))}
      {grupo.ocorrencias.length === 0 && <p className="detalhe-vazio">Nada aqui neste mês.</p>}
    </section>
  );
}

const contagem = (n: number) => (n === 1 ? "1 ocorrência" : `${n} ocorrências`);
