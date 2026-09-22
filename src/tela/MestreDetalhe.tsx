"use client";

import {
  formatReais,
  groups,
  monthName,
  jarName,
  paymentMethodName,
  allExpenses,
  type Axis,
  type Group,
  type Occurrence,
  type JarInView,
  type MonthView,
} from "@/domain";
import { corDaTag, corDoPote, faixaDeParcelas, PilulaDaTag, plural, Valor } from "./pecas";

export const NOME_DO_EIXO: Record<Axis, string> = { jar: "Pote", "payment-method": "Tipo de pagamento", tag: "Tag" };

/** O que está aberto no detalhe: um grupo do eixo, ou o feed do mês inteiro (o card Despesas). */
export type Aberto = { tipo: "grupo"; chave: string | null } | { tipo: "todos" };

type Props = {
  vista: MonthView;
  eixo: Axis;
  aberto: Aberto | null;
  abrir: (aberto: Aberto | null) => void;
  abrirOcorrencia: (ocorrencia: Occurrence) => void;
  /** Abre o formulário que troca o nome desta tag no histórico todo. */
  renomearTag: (tag: string) => void;
};

/**
 * Os grupos do eixo como grade. Com um grupo aberto, a grade vira uma coluna
 * com os mesmos cards, só empilhados, e o detalhe fica ao lado: trocar de
 * grupo custa um clique. Um grupo que não existe no mês volta à grade.
 *
 * Em janela estreita o CSS põe o detalhe como folha inferior sobre a grade, e
 * aí o fundo — inerte no layout largo — é o que fecha ao tocar fora dela.
 */
export function MestreDetalhe({ vista, eixo, aberto, abrir, abrirOcorrencia, renomearTag }: Props) {
  const gruposDoEixo = groups(vista, eixo);
  const detalhe = aberto?.tipo === "todos" ? allExpenses(vista) : aberto && gruposDoEixo.find((g) => g.key === aberto.chave);
  const cartoes = gruposDoEixo.map((g) => {
    const selecionado = aberto?.tipo === "grupo" && aberto.chave === g.key;
    const clicar = () => abrir(selecionado ? null : { tipo: "grupo", chave: g.key });
    // Tag nunca é vazia depois de normalizada: "" não colide com nenhuma.
    const chave = g.key ?? "";
    return eixo === "jar" ? (
      <CartaoDoPote key={chave} pote={vista.jars.find((p) => p.id === g.key)!} selecionado={selecionado} clicar={clicar} />
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
            <Valor centavos={vista.aggregates.monthExpenses} />
          </strong>
        </div>
      </div>
      <div className="fundo-da-folha" onClick={() => abrir(null)} aria-hidden />
      <Detalhe
        vista={vista}
        grupo={detalhe}
        eixo={aberto?.tipo === "todos" ? null : eixo}
        fechar={() => abrir(null)}
        abrirOcorrencia={abrirOcorrencia}
        renomearTag={renomearTag}
      />
    </div>
  );
}

type PropsDoCartao = { selecionado: boolean; clicar: () => void };

function CartaoDoPote({ pote, selecionado, clicar }: { pote: JarInView } & PropsDoCartao) {
  const semLimite = pote.limit === null;
  const classe = semLimite ? "sem-limite" : pote.verdict === "overrun" ? "estourou" : "";
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
          {pote.name}
        </span>
        <span className="num">{pote.percentage}%</span>
      </span>
      <span className="cartao-total num">
        <Valor centavos={pote.total} />
      </span>
      <Barra pote={pote} />
      <span className="cartao-pe">
        <Veredito pote={pote} />
        <span className="lim">{semLimite ? "sem limite" : `limite ${formatReais(pote.limit!)}`}</span>
      </span>
    </button>
  );
}

/** Tipo de pagamento e tag não têm limite nem veredito: só total e contagem. */
function CartaoDoGrupo({ grupo, eixo, selecionado, clicar }: { grupo: Group; eixo: Exclude<Axis, "jar"> } & PropsDoCartao) {
  const tingido = eixo === "tag" && grupo.key !== null;
  return (
    <button
      type="button"
      className={`cartao grupo ${tingido ? "tag" : ""} ${selecionado ? "aberto" : ""}`}
      style={tingido ? corDaTag(grupo.key!) : undefined}
      aria-pressed={selecionado}
      onClick={clicar}
    >
      <span className="cartao-topo">
        <span>
          {tingido && <span className="quadrado" />}
          {grupo.name}
        </span>
      </span>
      <span className="cartao-total num">
        <Valor centavos={grupo.total} />
      </span>
      <span className="cartao-pe">
        <span>{contagem(grupo.occurrences.length)}</span>
      </span>
    </button>
  );
}

/**
 * A barra do pote: o total contra o limite. Quando o total passa do limite, a
 * escala vira o total e a marca vertical mostra onde o limite ficou.
 */
function Barra({ pote }: { pote: JarInView }) {
  if (pote.limit === null) return <span className="barra" />;
  const saiu = Math.max(pote.total, 0);
  const escala = Math.max(pote.limit, saiu);
  const fracao = (v: number) => (escala > 0 ? (v / escala) * 100 : 0);
  return (
    <span className="barra">
      <i style={{ width: `${fracao(saiu)}%` }} />
      <b style={{ left: `calc(${fracao(pote.limit)}% - 1px)` }} />
    </span>
  );
}

function Veredito({ pote }: { pote: JarInView }) {
  switch (pote.verdict) {
    case "no-income":
      return <span className="selo nenhum">— Sem receita</span>;
    case "leftover":
      return <span className="selo sobra">✓ Sobra {formatReais(pote.limit! - pote.total)}</span>;
    case "overrun":
      return <span className="selo estourou">▲ Estourou {formatReais(pote.overrun!)}</span>;
  }
}

type PropsDoDetalhe = {
  vista: MonthView;
  grupo: Group;
  /** null é "Todos os gastos do mês", que não é grupo de eixo nenhum. */
  eixo: Axis | null;
  fechar: () => void;
  abrirOcorrencia: (ocorrencia: Occurrence) => void;
  renomearTag: (tag: string) => void;
};

/**
 * O cabeçalho do pote tem percentual, limite e veredito; os outros, total e
 * contagem. Só o de uma tag renomeia: pote e tipo de pagamento são listas fixas
 * do app, e "sem tag" não é uma tag.
 */
function Detalhe({ vista, grupo, eixo, fechar, abrirOcorrencia, renomearTag }: PropsDoDetalhe) {
  const pote = eixo === "jar" ? vista.jars.find((p) => p.id === grupo.key) : undefined;
  const tag = eixo === "tag" ? grupo.key : null;
  return (
    <section className="detalhe" aria-label={grupo.name}>
      <header>
        <span className="puxador" aria-hidden />
        <button type="button" className="fechar" onClick={fechar} aria-label="Fechar o detalhe e voltar à grade">
          ×
        </button>
        <div className="kicker">{eixo ? NOME_DO_EIXO[eixo] : "Despesas"}</div>
        <h2 style={pote ? corDoPote(pote.id) : tag ? corDaTag(tag) : undefined}>
          {(pote || tag) && <span className="quadrado" />}
          {grupo.name}
        </h2>
        <div className="detalhe-resumo">
          <span className="detalhe-total num">
            <Valor centavos={grupo.total} />
          </span>
          {pote && <Veredito pote={pote} />}
          <span className="dica">{contagem(grupo.occurrences.length)}</span>
          {tag && (
            <button
              type="button"
              className="btn renomear"
              onClick={() => renomearTag(tag)}
              title="Trocar o nome desta tag no histórico todo"
            >
              Renomear
            </button>
          )}
        </div>
        {pote && (
          <p className="dica">
            {pote.limit === null
              ? `${pote.percentage}% · sem receita, sem limite`
              : `${pote.percentage}% de ${formatReais(vista.monthIncome)} · limite ${formatReais(pote.limit)}`}
          </p>
        )}
        {grupo.total < 0 && <p className="nota-reembolso">Só reembolso neste mês; não é entrada e não move a receita.</p>}
      </header>
      {grupo.occurrences.map((o) => (
        // Num mês pode cair a parcela e a antecipação do mesmo parcelado: a chave distingue as duas.
        <button
          type="button"
          key={o.prepayment ? `antecipacao-${o.prepayment.id}` : o.expense}
          className="ocorrencia"
          onClick={() => abrirOcorrencia(o)}
          title={o.prepayment ? "Rever a antecipação" : "Corrigir o gasto"}
        >
          <span className="data num">
            {o.date.slice(8)}/{o.date.slice(5, 7)}
          </span>
          <span className="ocorrencia-corpo">
            <span>{o.description}</span>
            <span className="eixos-da-ocorrencia">
              <span style={corDoPote(o.jar)}>
                <span className="quadrado" />
                {jarName(o.jar)}
              </span>
              <span>{paymentMethodName(o.paymentMethod)}</span>
              <PilulaDaTag tag={o.tag} />
            </span>
            {o.installment && (
              <span className="anotacao num">
                ⤷ {o.installment.number}/{o.installment.of} de {formatReais(o.installment.total)}
              </span>
            )}
            {o.recurring && (
              <span className="anotacao">
                ⤷ recorrente desde {monthName(o.recurring.since)}
                {o.recurring.periodSince !== o.recurring.since && ` · valor desde ${monthName(o.recurring.periodSince)}`}
              </span>
            )}
            {o.prepayment && (
              <span className="anotacao num">
                ⤷ Antecipação {faixaDeParcelas(o.prepayment)}/{o.prepayment.of} de {formatReais(o.prepayment.total)}
              </span>
            )}
          </span>
          <span className="direita num">
            <Valor centavos={o.amount} />
          </span>
        </button>
      ))}
      {grupo.occurrences.length === 0 && <p className="detalhe-vazio">Nada aqui neste mês.</p>}
    </section>
  );
}

const contagem = (n: number) => plural(n, "ocorrência");
