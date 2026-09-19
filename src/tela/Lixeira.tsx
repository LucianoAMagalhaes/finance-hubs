"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatarReais,
  inicioDe,
  mesDaData,
  nomeDaFonte,
  nomeDoMes,
  nomeDoPote,
  type Data,
  type ItemNaLixeira,
  type Lancamento,
  type Registro,
} from "@/dominio";
import { Valor } from "./pecas";

type Props = {
  itens: ItemNaLixeira[];
  /** Devolve o erro, ou null se restaurou. */
  restaurar: (registro: Registro, id: number) => Promise<string | null>;
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

  async function devolver(item: ItemNaLixeira) {
    setRestaurando(true);
    setErro(await restaurar(item.registro, item.id));
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
              <li key={`${item.registro}-${item.id}`}>
                <div className="lixeira-texto">
                  <span className="lixeira-descricao">{descricaoDe(item)}</span>
                  <span className="dica">
                    {ondeCai(item)} · apagado em {dataCurta(item.apagadoEm)}
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

function descricaoDe(item: ItemNaLixeira): string {
  switch (item.registro) {
    case "entrada":
      return item.entrada.descricao;
    case "lancamento":
      return camposDe(item.lancamento).descricao;
    case "antecipacao":
      return item.parcelado.descricao;
  }
}

/** O que o lançamento mostra: a compra, ou a última vigência do recorrente. */
const camposDe = (l: Lancamento) => (l.forma === "compra" ? l : l.vigencias.at(-1)!);

/** Que registro é, e em que mês pesa quando volta. */
function ondeCai(item: ItemNaLixeira): string {
  if (item.registro === "entrada") {
    const e = item.entrada;
    return `Entrada · ${nomeDaFonte(e.fonte)} · ${nomeDoMes(mesDaData(e.data))}`;
  }
  if (item.registro === "antecipacao") {
    const a = item.antecipacao;
    const quantas = a.parcelas === 1 ? "1 parcela" : `${a.parcelas} parcelas`;
    return `Antecipação de ${quantas} · ${nomeDoMes(mesDaData(a.data))} · volta a cortar as últimas que sobrarem`;
  }
  const l = item.lancamento;
  const forma =
    l.forma === "recorrente"
      ? `recorrente desde ${nomeDoMes(inicioDe(l))}${l.encerradoEm ? `, encerrado em ${nomeDoMes(l.encerradoEm)}` : ""}`
      : l.parcelas > 1
        ? `${l.parcelas}× a partir de ${nomeDoMes(mesDaData(l.data))}`
        : nomeDoMes(mesDaData(l.data));
  return `Gasto · ${nomeDoPote(camposDe(l).pote)} · ${forma}`;
}

function valorDe(item: ItemNaLixeira) {
  if (item.registro === "entrada") return <span className="val entrada">+ {formatarReais(item.entrada.valor)}</span>;
  if (item.registro === "antecipacao") return <Valor centavos={item.antecipacao.valor} />;
  return <Valor centavos={camposDe(item.lancamento).valor} />;
}

const dataCurta = (data: Data) => `${data.slice(8)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
