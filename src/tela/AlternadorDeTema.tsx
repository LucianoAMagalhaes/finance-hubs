"use client";

import { useEffect, useState } from "react";
import { aplicarTema, lerTema, PROXIMO_TEMA, type Tema } from "./tema";

const ROTULO: Record<Tema, string> = { sistema: "◐ Sistema", claro: "☀ Claro", escuro: "☾ Escuro" };

export function AlternadorDeTema() {
  // O servidor não sabe a escolha guardada no navegador: começa em "sistema" e
  // corrige depois de montar. O <head> já aplicou o tema certo antes de pintar.
  const [tema, setTema] = useState<Tema>("sistema");
  useEffect(() => setTema(lerTema()), []);

  function alternar() {
    const proximo = PROXIMO_TEMA[tema];
    aplicarTema(proximo);
    setTema(proximo);
  }

  return (
    <button type="button" className="btn" onClick={alternar} title="Tema: segue o sistema, ou força claro ou escuro">
      {ROTULO[tema]}
    </button>
  );
}
