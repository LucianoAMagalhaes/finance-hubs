import type { Data } from "@/dominio";
import type { Banco } from "@/persistencia";
import { configuracaoDoAmbiente, inicializar } from "./inicializacao";

// Um processo, um banco. Guardado no globalThis porque o Next carrega este
// módulo em mais de um bundle (instrumentação, páginas, ações) e, em dev, a
// cada recarga: a inicialização, e portanto o backup, acontece uma vez só.
const processo = globalThis as typeof globalThis & { __financeHubsBanco?: Banco };

export function bancoDoApp(): Banco {
  processo.__financeHubsBanco ??= inicializar(configuracaoDoAmbiente());
  return processo.__financeHubsBanco;
}

/** A data de hoje no fuso da máquina, que é o fuso da pessoa: o app roda local. */
export function hojeLocal(agora: Date = new Date()): Data {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}` as Data;
}
