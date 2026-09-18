import { carregarEstado } from "@/persistencia";
import { bancoDoApp, hojeLocal } from "@/servidor/app";
import { TelaDoMes } from "@/tela/TelaDoMes";

// O estado vem do banco a cada requisição; nada aqui é estático.
export const dynamic = "force-dynamic";

export default function Pagina() {
  return <TelaDoMes estado={carregarEstado(bancoDoApp())} hoje={hojeLocal()} />;
}
