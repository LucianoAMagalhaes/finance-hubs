"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatReais,
  startOf,
  monthOf,
  incomeSourceName,
  monthName,
  jarName,
  type IsoDate,
  type TrashItem,
  type Expense,
  type RecordType,
} from "@/domain";
import { Valor } from "./pecas";

type Props = {
  itens: TrashItem[];
  /** Devolve o erro, ou null se restaurou. */
  restaurar: (registro: RecordType, id: number) => Promise<string | null>;
  fechar: () => void;
};

/**
 * O que foi apagado, o mais recente primeiro. Restaurar devolve o registro
 * intacto e a tela recalcula na hora; a lixeira fica aberta para restaurar
 * mais de um. Esvaziar não existe: nada se destrói de vez.
 */
export function Lixeira({ itens, restaurar, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  async function devolver(item: TrashItem) {
    setRestaurando(true);
    setErro(await restaurar(item.record, item.id));
    setRestaurando(false);
  }

  return (
    <dialog
      ref={dialogo}
      className="folha lixeira"
      onClose={fechar}
      onClick={(e) => e.target === dialogo.current && fechar()}
      aria-labelledby="titulo-lixeira"
    >
      <header>
        <h2 id="titulo-lixeira">Lixeira</h2>
        <p className="dica">O que foi apagado não gera receita nem gasto. Restaurar devolve o registro intacto, no mês dele.</p>
      </header>
      <div className="corpo">
        {itens.length === 0 && <p className="lixeira-vazia">Nada na lixeira.</p>}
        {itens.length > 0 && (
          <ul className="lixeira-itens">
            {itens.map((item) => (
              <li key={`${item.record}-${item.id}`}>
                <div className="lixeira-texto">
                  <span className="lixeira-descricao">{descricaoDe(item)}</span>
                  <span className="dica">
                    {ondeCai(item)} · apagado em {dataCurta(item.deletedAt)}
                  </span>
                </div>
                <span className="num">{valorDe(item)}</span>
                <button type="button" className="btn" disabled={restaurando} onClick={() => devolver(item)}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
        {erro && (
          <p className="aviso ruim" role="alert">
            {erro}
          </p>
        )}
      </div>
      <footer>
        <button type="button" className="btn" onClick={fechar}>
          Fechar
        </button>
      </footer>
    </dialog>
  );
}

function descricaoDe(item: TrashItem): string {
  switch (item.record) {
    case "income":
      return item.income.description;
    case "expense":
      return camposDe(item.expense).description;
    case "prepayment":
      return item.purchase.description;
  }
}

/** O que o lançamento mostra: a compra, ou a última vigência do recorrente. */
const camposDe = (l: Expense) => (l.kind === "purchase" ? l : l.periods.at(-1)!);

/** Que registro é, e em que mês pesa quando volta. */
function ondeCai(item: TrashItem): string {
  if (item.record === "income") {
    const e = item.income;
    return `Entrada · ${incomeSourceName(e.source)} · ${monthName(monthOf(e.date))}`;
  }
  if (item.record === "prepayment") {
    const a = item.prepayment;
    const quantas = a.installments === 1 ? "1 parcela" : `${a.installments} parcelas`;
    return `Antecipação de ${quantas} · ${monthName(monthOf(a.date))} · volta a cortar as últimas que sobrarem`;
  }
  const l = item.expense;
  const forma =
    l.kind === "recurring"
      ? `recorrente desde ${monthName(startOf(l))}${l.endedIn ? `, encerrado em ${monthName(l.endedIn)}` : ""}`
      : l.installments > 1
        ? `${l.installments}× a partir de ${monthName(monthOf(l.date))}`
        : monthName(monthOf(l.date));
  return `Gasto · ${jarName(camposDe(l).jar)} · ${forma}`;
}

function valorDe(item: TrashItem) {
  if (item.record === "income") return <span className="val entrada">+ {formatReais(item.income.amount)}</span>;
  if (item.record === "prepayment") return <Valor centavos={item.prepayment.amount} />;
  return <Valor centavos={camposDe(item.expense).amount} />;
}

const dataCurta = (data: IsoDate) => `${data.slice(8)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
