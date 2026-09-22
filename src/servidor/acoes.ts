"use server";

import type { Command, State, Result } from "@/domain";
import { executarNoBanco } from "@/persistencia";
import { bancoDoApp, hojeLocal } from "./app";

/** A casca fina entre a tela e o banco. Devolve o estado novo ou o erro. */
export async function executar(comando: Command): Promise<Result<State>> {
  return executarNoBanco(bancoDoApp(), [comando], hojeLocal());
}
