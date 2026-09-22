import type { CSSProperties } from "react";
import { formatReais, tagHue, type Cents, type Jar } from "@/domain";

/** Valor de gasto: negativo é reembolso, em violeta com ↺. */
export function Valor({ centavos }: { centavos: Cents }) {
  return centavos < 0 ? <span className="val reembolso">↺ {formatReais(centavos)}</span> : <span className="val">{formatReais(centavos)}</span>;
}

/**
 * O par que lança: verde é entrada, marinho é o botão principal. Mora no topo
 * no layout largo e no botão + flutuante na janela estreita, e por isso aceita
 * uma classe a mais — o rótulo e a cor de cada um são os mesmos nos dois.
 */
export function BotoesDeLancar({
  classe = "",
  novaEntrada,
  novoLancamento,
}: {
  classe?: string;
  novaEntrada: () => void;
  novoLancamento: () => void;
}) {
  return (
    <>
      <button type="button" className={`btn entrada ${classe}`} onClick={novaEntrada}>
        + Entrada
      </button>
      <button type="button" className={`btn primario ${classe}`} onClick={novoLancamento}>
        + Gasto
      </button>
    </>
  );
}

/** "1 ocorrência", "3 ocorrências": o número com o substantivo que ele conta. */
export const plural = (n: number, substantivo: string) => `${n} ${substantivo}${n === 1 ? "" : "s"}`;

/** As parcelas que uma antecipação levou: "8–10" quando são várias, "10" quando é uma. */
export const faixaDeParcelas = ({ first: primeira, last: ultima }: { first: number; last: number }) =>
  primeira === ultima ? `${ultima}` : `${primeira}–${ultima}`;

/** A cor fixa do pote como `--pote`: quadrado, filete e barra a usam. */
export const corDoPote = (pote: Jar) => ({ "--pote": `var(--p-${pote})` }) as CSSProperties;

/**
 * A cor da tag como variáveis de CSS: o matiz sai do nome, igual em qualquer mês.
 * `--pote` faz o quadrado e o filete do card usarem a cor da tag.
 */
export function corDaTag(tag: string): CSSProperties {
  const matiz = tagHue(tag);
  return { "--matiz": matiz, "--pote": `hsl(${matiz} var(--tag-cor))` } as CSSProperties;
}

/** A tag como pílula tingida, para não parecer pote. Sem tag, uma pílula neutra. */
export function PilulaDaTag({ tag }: { tag: string | null }) {
  if (!tag) return <span className="pilula-tag sem">sem tag</span>;
  return (
    <span className="pilula-tag" style={corDaTag(tag)}>
      #{tag}
    </span>
  );
}
