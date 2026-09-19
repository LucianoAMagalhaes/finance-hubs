"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { POTES, somaDosPercentuais, validarPercentuais, type Percentuais, type PoteId, type PoteNaVista } from "@/dominio";

/** O que está escrito em cada campo, como a pessoa digitou. */
export type Rascunho = Record<PoteId, string>;

/** O rascunho começa com os percentuais que o mês mostra, próprios ou herdados. */
export function rascunhoDe(potes: PoteNaVista[]): Rascunho {
  return Object.fromEntries(potes.map((p) => [p.id, String(p.percentual)])) as Rascunho;
}

/** Os percentuais do rascunho; um campo em branco ou ilegível vira NaN, que a validação recusa. */
export function lerRascunho(rascunho: Rascunho): Percentuais {
  return Object.fromEntries(
    POTES.map((p) => [p.id, rascunho[p.id].trim() === "" ? NaN : Number(rascunho[p.id])]),
  ) as Percentuais;
}

/** Para a projeção ao vivo: o que não se lê como número conta como zero, e nada sai de 0 a 100. */
export function percentuaisParaPrevia(rascunho: Rascunho): Percentuais {
  const p = lerRascunho(rascunho);
  const limitar = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
  return Object.fromEntries(POTES.map((pote) => [pote.id, limitar(p[pote.id])])) as Percentuais;
}

type Props = {
  rascunho: Rascunho;
  mudar: (rascunho: Rascunho) => void;
  /** Devolve o erro, ou null se salvou. */
  salvar: (percentuais: Percentuais) => Promise<string | null>;
  cancelar: () => void;
};

/**
 * Os seis percentuais do mês. Fica na tela, junto dos potes, porque cada
 * tecla recalcula limites, Não alocado e vereditos ali mesmo.
 */
export function EditorDePercentuais({ rascunho, mudar, salvar, cancelar }: Props) {
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const percentuais = lerRascunho(rascunho);
  const erro = validarPercentuais(percentuais);
  const soma = somaDosPercentuais(percentuaisParaPrevia(rascunho));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (erro) return;
    setSalvando(true);
    const recusa = await salvar(percentuais);
    setSalvando(false);
    setErroDoServidor(recusa);
  }

  return (
    <form className="cartao editor-percentuais" onSubmit={enviar} aria-label="Percentuais do mês">
      <div className="campos-percentuais">
        {POTES.map((p) => (
          <label className="campo" key={p.id} style={{ "--pote": `var(--p-${p.id})` } as CSSProperties}>
            <span>
              <span className="quadrado" />
              {p.nome}
            </span>
            <span className="com-sufixo">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                className="num"
                value={rascunho[p.id]}
                onChange={(e) => {
                  setErroDoServidor(null);
                  mudar({ ...rascunho, [p.id]: e.target.value });
                }}
              />
              %
            </span>
          </label>
        ))}
      </div>
      <div className="editor-pe">
        <span className={`soma num ${soma > 100 ? "passou" : ""}`}>Soma {soma}%</span>
        <button type="button" className="btn" onClick={cancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn primario" disabled={erro !== null || salvando}>
          Salvar
        </button>
      </div>
      {(erroDoServidor ?? erro) && (
        <p className="aviso ruim" role="alert">
          {erroDoServidor ?? erro}
        </p>
      )}
    </form>
  );
}
