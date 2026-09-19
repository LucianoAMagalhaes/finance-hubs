"use client";

import { useEffect, useState } from "react";

type Props = { novaEntrada: () => void; novoLancamento: () => void };

/**
 * Em janela estreita, lançar é por aqui: o + abre + Entrada e + Gasto. No
 * layout largo os dois botões ficam no topo e o CSS esconde este — por isso
 * escolher uma opção fecha o menu, mas nada mais depende da largura.
 */
export function BotaoFlutuante({ novaEntrada, novoLancamento }: Props) {
  const [aberto, setAberto] = useState(false);

  // Esc fecha o menu, como fecha um formulário.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const escolher = (abrir: () => void) => {
    setAberto(false);
    abrir();
  };

  return (
    <>
      {aberto && <div className="fundo-do-flutuante" onClick={() => setAberto(false)} aria-hidden />}
      <div className={`flutuante ${aberto ? "aberto" : ""}`}>
        <button type="button" className="btn entrada op" onClick={() => escolher(novaEntrada)}>
          + Entrada
        </button>
        <button type="button" className="btn primario op" onClick={() => escolher(novoLancamento)}>
          + Gasto
        </button>
        <button
          type="button"
          className="mais"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-label={aberto ? "Fechar o menu de lançar" : "Lançar"}
        >
          {aberto ? "×" : "+"}
        </button>
      </div>
    </>
  );
}
