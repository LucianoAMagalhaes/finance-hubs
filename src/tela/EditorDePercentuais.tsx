"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { POTES, type Percentuais } from "@/dominio";
import { conferirRascunho, type Rascunho } from "./rascunhoDePercentuais";

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
  const { percentuais, erro, soma } = conferirRascunho(rascunho);

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
