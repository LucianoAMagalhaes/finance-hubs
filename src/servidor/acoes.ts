"use server";

import { aplicar, type Comando, type Estado, type Resultado } from "@/dominio";
import { carregarEstado, gravarEstado } from "@/persistencia";
import { bancoDoApp, hojeLocal } from "./app";

/**
 * A casca fina entre a tela e o domínio: carrega o estado, aplica o comando e,
 * se deu certo, grava numa transação. Devolve o estado novo ou o erro.
 */
export async function executar(comando: Comando): Promise<Resultado<Estado>> {
  const banco = bancoDoApp();
  const resultado = aplicar(carregarEstado(banco), comando, hojeLocal());
  if (resultado.ok) gravarEstado(banco, resultado.valor);
  return resultado;
}
