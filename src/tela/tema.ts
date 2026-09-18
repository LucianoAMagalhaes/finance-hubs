export type Tema = "sistema" | "claro" | "escuro";

export const CHAVE_DO_TEMA = "fh-tema";

/** A ordem do alternador. */
export const PROXIMO_TEMA: Record<Tema, Tema> = { sistema: "claro", claro: "escuro", escuro: "sistema" };

export function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_DO_TEMA);
    return t === "claro" || t === "escuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

/** Grava a escolha e aplica no <html>. "sistema" tira o atributo e deixa o CSS seguir o sistema. */
export function aplicarTema(tema: Tema): void {
  try {
    if (tema === "sistema") localStorage.removeItem(CHAVE_DO_TEMA);
    else localStorage.setItem(CHAVE_DO_TEMA, tema);
  } catch {
    // Sem armazenamento (janela privada): o tema vale até recarregar.
  }
  if (tema === "sistema") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

/**
 * Roda no <head> antes da primeira pintura, para a página não piscar no tema
 * errado ao recarregar.
 */
export const SCRIPT_DO_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CHAVE_DO_TEMA)});if(t==="claro"||t==="escuro")document.documentElement.dataset.tema=t}catch(e){}`;
