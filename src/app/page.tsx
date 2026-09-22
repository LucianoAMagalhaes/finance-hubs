import { loadState } from "@/persistence";
import { bancoDoApp, hojeLocal } from "@/servidor/app";
import { TelaDoMes } from "@/tela/TelaDoMes";

// O estado vem do banco a cada requisição; nada aqui é estático.
export const dynamic = "force-dynamic";

export default function Pagina() {
  return <TelaDoMes estadoInicial={loadState(bancoDoApp())} hoje={hojeLocal()} />;
}
