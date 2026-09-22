import type { CSSProperties } from "react";
import { formatReais, tagHue, type Cents, type Jar } from "@/domain";

/** An expense amount: a negative one is a refund, in violet with ↺. */
export function Amount({ cents }: { cents: Cents }) {
  return cents < 0 ? <span className="val refund">↺ {formatReais(cents)}</span> : <span className="val">{formatReais(cents)}</span>;
}

/**
 * The pair that records: green is income, navy is the primary button. It
 * lives in the top bar in the wide layout and in the floating + button in the
 * narrow window, so it takes an extra class — each one's label and color are
 * the same in both.
 */
export function RecordButtons({
  className = "",
  newIncome,
  newExpense,
}: {
  className?: string;
  newIncome: () => void;
  newExpense: () => void;
}) {
  return (
    <>
      <button type="button" className={`btn income ${className}`} onClick={newIncome}>
        + Entrada
      </button>
      <button type="button" className={`btn primary ${className}`} onClick={newExpense}>
        + Gasto
      </button>
    </>
  );
}

/** "1 ocorrência", "3 ocorrências": the number with the noun it counts. */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The installments a prepayment took: "8–10" when there are several, "10" when there is one. */
export const installmentRange = ({ first, last }: { first: number; last: number }) =>
  first === last ? `${last}` : `${first}–${last}`;

/** The jar's fixed color as `--jar`: the swatch, the stripe and the bar use it. */
export const jarColor = (jar: Jar) => ({ "--jar": `var(--jar-${jar})` }) as CSSProperties;

/**
 * The tag's color as CSS variables: the hue comes from the name, the same in
 * every month. `--jar` makes the card's swatch and stripe use the tag's color.
 */
export function tagColor(tag: string): CSSProperties {
  const hue = tagHue(tag);
  return { "--hue": hue, "--jar": `hsl(${hue} var(--tag-color))` } as CSSProperties;
}

/** The tag as a tinted pill, so it does not look like a jar. Without a tag, a neutral pill. */
export function TagPill({ tag }: { tag: string | null }) {
  if (!tag) return <span className="tag-pill untagged">sem tag</span>;
  return (
    <span className="tag-pill" style={tagColor(tag)}>
      #{tag}
    </span>
  );
}
