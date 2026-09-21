"use server";

import type { Comando, Estado, Resultado } from "@/dominio";
import { executarNoBanco } from "@/persistencia";
import { bancoDoApp, hojeLocal } from "./app";

/** A casca fina entre a tela e o banco. Devolve o estado novo ou o erro. */
export async function executar(comando: Comando): Promise<Resultado<Estado>> {
  return executarNoBanco(bancoDoApp(), [comando], hojeLocal());
}
