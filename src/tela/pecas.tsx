import type { CSSProperties } from "react";
import { formatarReais, matizDaTag, type Centavos, type PoteId } from "@/dominio";

/** Valor de gasto: negativo é reembolso, em violeta com ↺. */
export function Valor({ centavos }: { centavos: Centavos }) {
  return centavos < 0 ? <span className="val reembolso">↺ {formatarReais(centavos)}</span> : <span className="val">{formatarReais(centavos)}</span>;
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
export const faixaDeParcelas = ({ primeira, ultima }: { primeira: number; ultima: number }) =>
  primeira === ultima ? `${ultima}` : `${primeira}–${ultima}`;

/** A cor fixa do pote como `--pote`: quadrado, filete e barra a usam. */
export const corDoPote = (pote: PoteId) => ({ "--pote": `var(--p-${pote})` }) as CSSProperties;

/**
 * A cor da tag como variáveis de CSS: o matiz sai do nome, igual em qualquer mês.
 * `--pote` faz o quadrado e o filete do card usarem a cor da tag.
 */
export function corDaTag(tag: string): CSSProperties {
  const matiz = matizDaTag(tag);
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
