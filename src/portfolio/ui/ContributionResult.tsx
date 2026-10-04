"use client";

import { useEffect, useRef } from "react";
import { exchangeRateToField, formatReais, type ContributionSuggestion } from "@/portfolio/domain";
import { Sheet } from "@/ui/Sheet";
import { classColor, formatAccruedPrice, formatQuantity, formatShare, Tags } from "./parts";

export function ContributionResult({ suggestion, close, review }: { suggestion: ContributionSuggestion; close: () => void; review: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Show the totals first instead of scrolling to the footer's only button.
  useEffect(() => heading.current?.focus(), []);
  const withoutRecipient = suggestion.classes.filter(c => c.target > 0 && !c.assets.some(a => a.exclusions.length === 0));
  return (
    <Sheet labelledBy="contribution-title" className="contribution-result" close={close}>
      <header>
        <h2 id="contribution-title" ref={heading} tabIndex={-1}>Sugestão de aporte</h2>
        <p className="hint">Quantidades compráveis e aplicações em reais com os dados atuais.</p>
      </header>
      <div className="content">
        <dl className="contribution-totals">
          <div><dt>Aporte</dt><dd className="num">{formatReais(suggestion.contribution)}</dd></div>
          <div><dt>Distribuído</dt><dd className="num">{formatReais(suggestion.distributed)}</dd></div>
          <div><dt>Sem destino</dt><dd className="num">{formatReais(suggestion.unallocated)}</dd></div>
        </dl>
        {withoutRecipient.length > 0 && (
          <p className="hint">Classes com alvo positivo sem destinatário: {withoutRecipient.map(c => c.name).join(", ")}. O dinheiro sem destino não é transferido a outras classes.</p>
        )}
        {suggestion.unallocated > suggestion.classes.reduce((sum, c) => sum + c.unallocated, 0) && (
          <p className="hint">Sem destino: as faltas das classes aptas não absorvem todo o aporte em centavos. Frações de centavo ficam sem destino para não ultrapassar essas faltas.</p>
        )}
        {suggestion.classes.map(c => (
          <section key={c.key} className="contribution-class" style={classColor(c.key)} aria-label={c.name}>
            <h3><span className="swatch" />{c.name}<span className="num">{formatReais(c.amount)}</span></h3>
            <p className="hint">Alvo {c.target}% · valor atual {formatReais(c.currentValue)} · falta após o aporte {formatReais(c.shortfall)}</p>
            {c.target === 0 ? <p className="hint">Alvo zero: esta classe não recebe.</p>
              : c.shortfall === 0 && <p className="hint">Sem falta para o alvo após o aporte.</p>}
            {c.unallocated > 0 && <p className="hint">Sem destino em {c.name}: {formatReais(c.unallocated)}. {c.assets.some(a => a.quantityLimited) ? "O limite de precisão das quantidades impede aplicar todo o valor." : "Nenhum passo adicional cabe neste valor."} O dinheiro permanece nesta classe.</p>}
            {c.assets.length === 0 && <p className="hint">Nenhum ativo cadastrado.</p>}
            <ul className="contribution-assets">
              {c.assets.map(a => (
                <li key={a.id}>
                  <div className="contribution-asset-heading"><strong>{a.ticker}</strong><span className="num">{formatReais(a.amount)}</span></div>
                  <Tags tags={a.exclusions} />
                  <p className="hint">Nota {a.score ?? "não informada"} · valor atual {formatReais(a.currentValue)}</p>
                  {a.quantity === null ? <p className="hint">Aplicação em reais: {formatReais(a.amount)}</p>
                    : <p className="hint">Quantidade sugerida: <span className="num">{formatQuantity(a.quantity)}</span>{a.bondKind === "treasury-bond" ? " título(s)" : " unidade(s)"}</p>}
                  {a.bondKind !== "private-bond" && <p className="hint">Preço usado: {a.price === null ? "indisponível" : a.currency === "USD" ? `US$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(a.price / 100)}` : formatAccruedPrice(a.price)}
                    {a.currency === "USD" && ` · câmbio: ${a.exchangeRate === null ? "indisponível" : `R$ ${exchangeRateToField(a.exchangeRate)} por US$ 1`}`}
                  </p>}
                  {a.idealWeight !== null && <p className="hint">Peso ideal {formatShare(a.idealWeight * 100)} · falta {formatReais(a.shortfall)}{a.shortfall === 0 && a.amount === 0 ? " · sem falta: não recebe" : ""}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer><button type="button" className="btn" onClick={close}>Fechar</button><button type="button" className="btn primary" disabled={!suggestion.classes.some(c => c.assets.some(a => a.amount > 0 && (a.quantity === null || a.quantity > 0)))} onClick={review}>Registrar compras</button></footer>
    </Sheet>
  );
}
