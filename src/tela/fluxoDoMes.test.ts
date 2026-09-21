import { describe, expect, it } from "vitest";
import {
  aplicar,
  estadoVazio,
  FONTES,
  PERCENTUAIS_PADRAO,
  type Comando,
  type Data,
  type Estado,
  type LancamentoASalvar,
  type Resultado,
} from "@/dominio";
import { criarFluxoDoMes } from "./fluxoDoMes";

const HOJE: Data = "2026-09-18";

const MERCADO: LancamentoASalvar = {
  data: "2026-09-10",
  descricao: "Mercado",
  pote: "custos-fixos",
  tipo: "pix",
  valor: 45_000,
  parcelas: 1,
};

describe("salvar um registro", () => {
  it("no mês aberto, o formulário fecha, o estado é o que o servidor devolveu, e não há aviso", async () => {
    const { fluxo } = montar();
    fluxo.abrirLancamento(null);

    const erro = await fluxo.salvar(lancar(MERCADO), "2026-09");

    expect(erro).toBeNull();
    expect(fluxo.agora()).toMatchObject({ formulario: null, aviso: null });
    expect(fluxo.agora().vista.ocorrencias.map((o) => o.descricao)).toEqual(["Mercado"]);
  });

  it("com data em outro mês, avisa e fica onde está; 'Ir para' troca o mês e some o aviso", async () => {
    const { fluxo } = montar();
    fluxo.abrirLancamento(null);

    await fluxo.salvar(lancar({ ...MERCADO, data: "2026-10-05" }), "2026-10");

    expect(fluxo.agora()).toMatchObject({ mes: "2026-09", formulario: null, aviso: { texto: "Gasto lançado em outubro de 2026.", mes: "2026-10" } });

    fluxo.mudarMes(fluxo.agora().aviso!.mes);

    expect(fluxo.agora()).toMatchObject({ mes: "2026-10", aviso: null });
  });

  it("o aviso diz se o registro é novo ou corrigido, em cada formulário", async () => {
    const { fluxo } = montar(com(lancar(MERCADO)));
    const mercado = fluxo.agora().estado.lancamentos[0]!;
    fluxo.abrirLancamento(mercado);
    await fluxo.salvar(lancar({ ...MERCADO, id: mercado.id, data: "2026-10-05" }), "2026-10");
    expect(fluxo.agora().aviso?.texto).toBe("Gasto salvo em outubro de 2026.");

    fluxo.abrirEntrada(null);
    await fluxo.salvar(entrar("2026-10-05"), "2026-10");
    expect(fluxo.agora().aviso?.texto).toBe("Entrada lançada em outubro de 2026.");
  });

  it("se a prévia no navegador recusa, o servidor nem é chamado e o formulário fica aberto", async () => {
    const { fluxo, servidor } = montar();
    fluxo.abrirLancamento(null);

    const erro = await fluxo.salvar(lancar({ ...MERCADO, descricao: " " }), "2026-09");

    expect(erro).toBe("Informe uma descrição.");
    expect(servidor.chamadas).toEqual([]);
    expect(fluxo.agora().formulario).toEqual({ registro: "lancamento", lancamento: null });
  });

  it("se o servidor recusa, o erro volta e o estado da tela não muda", async () => {
    // Outra aba já apagou o lançamento: a tela ainda o tem, o servidor não.
    const { fluxo } = montar(com(lancar(MERCADO)), estadoVazio());
    const antes = fluxo.agora().estado;
    fluxo.abrirLancamento(antes.lancamentos[0]!);

    const erro = await fluxo.apagar();

    expect(erro).toBe("Esse lançamento não existe mais.");
    expect(fluxo.agora().estado).toBe(antes);
    expect(fluxo.agora().formulario).not.toBeNull();
  });
});

describe("navegar pela tela", () => {
  it("trocar de mês some com o aviso e o rascunho, e o grupo aberto continua", async () => {
    const { fluxo } = montar();
    fluxo.abrirLancamento(null);
    await fluxo.salvar(lancar({ ...MERCADO, data: "2026-10-05" }), "2026-10");
    fluxo.abrir({ tipo: "grupo", chave: "custos-fixos" });
    fluxo.editarPercentuais();
    expect(fluxo.agora().aviso).not.toBeNull();

    fluxo.mudarMes("2026-08");

    expect(fluxo.agora()).toMatchObject({ mes: "2026-08", rascunho: null, aviso: null, aberto: { tipo: "grupo", chave: "custos-fixos" } });
  });

  it("trocar de eixo fecha o grupo aberto, mas não 'todos os gastos'", () => {
    const { fluxo } = montar();
    fluxo.abrir({ tipo: "grupo", chave: "custos-fixos" });
    fluxo.mudarEixo("tag");
    expect(fluxo.agora()).toMatchObject({ eixo: "tag", aberto: null });

    fluxo.alternarDespesas();
    fluxo.mudarEixo("pote");
    expect(fluxo.agora().aberto).toEqual({ tipo: "todos" });

    fluxo.alternarDespesas();
    expect(fluxo.agora().aberto).toBeNull();
  });

  it("a ocorrência de uma antecipação abre a antecipação; a de uma parcela, o parcelado", () => {
    const parcelado: LancamentoASalvar = { ...MERCADO, data: "2026-06-10", tipo: "cartao-de-credito", valor: 60_000, parcelas: 6 };
    const { fluxo } = montar(
      com(lancar(parcelado), { tipo: "salvar-antecipacao", antecipacao: { lancamento: 1, data: "2026-09-12", parcelas: 2, valor: 19_000 } }),
    );
    const [parcela, antecipacao] = fluxo.agora().vista.ocorrencias;

    fluxo.abrirOcorrencia(antecipacao!);
    expect(fluxo.agora().formulario).toMatchObject({
      registro: "antecipacao",
      parcelado: { id: 1, descricao: "Mercado" },
      antecipacao: { id: 1, parcelas: 2 },
    });

    fluxo.abrirOcorrencia(parcela!);
    expect(fluxo.agora().formulario).toMatchObject({ registro: "lancamento", lancamento: { id: 1 } });
  });

  it("do formulário do parcelado, antecipar abre uma antecipação nova dele", () => {
    const { fluxo } = montar(com(lancar({ ...MERCADO, tipo: "cartao-de-credito", parcelas: 3 })));
    fluxo.abrirLancamento(fluxo.agora().estado.lancamentos[0]!);

    fluxo.antecipar();

    expect(fluxo.agora().formulario).toMatchObject({ registro: "antecipacao", parcelado: { id: 1 }, antecipacao: null });
  });
});

describe("renomear uma tag", () => {
  it("o grupo aberto passa a ser o da tag nova, e o formulário de renomear fecha", async () => {
    const { fluxo } = montar(com(lancar({ ...MERCADO, tag: "casa" })));
    fluxo.mudarEixo("tag");
    fluxo.abrir({ tipo: "grupo", chave: "casa" });
    fluxo.abrirRenomear("casa");

    const erro = await fluxo.renomearTag("Minha Casa", false);

    expect(erro).toBeNull();
    expect(fluxo.agora()).toMatchObject({ tagARenomear: null, aberto: { tipo: "grupo", chave: "minha-casa" } });
  });
});

describe("apagar, encerrar e restaurar", () => {
  it("apagar e encerrar fecham o formulário", async () => {
    const recorrente: Comando = {
      tipo: "criar-recorrente",
      recorrente: { data: "2026-08-05", descricao: "Aluguel", pote: "custos-fixos", tipo: "pix", valor: 200_000 },
    };
    const { fluxo } = montar(com(lancar(MERCADO), recorrente));
    const [mercado, aluguel] = fluxo.agora().estado.lancamentos;

    fluxo.abrirLancamento(mercado!);
    expect(await fluxo.apagar()).toBeNull();
    expect(fluxo.agora().formulario).toBeNull();

    fluxo.abrirLancamento(aluguel!);
    expect(await fluxo.encerrar()).toBeNull();
    expect(fluxo.agora().formulario).toBeNull();
    expect(fluxo.agora().vista.ocorrencias).toEqual([]);
  });

  it("restaurar tira da lixeira e deixa a lixeira aberta", async () => {
    const { fluxo } = montar(com(lancar(MERCADO), { tipo: "apagar", registro: "lancamento", id: 1 }));
    fluxo.abrirLixeira();
    expect(fluxo.agora().lixeira).toHaveLength(1);

    expect(await fluxo.restaurar("lancamento", 1)).toBeNull();

    expect(fluxo.agora()).toMatchObject({ lixeiraAberta: true, lixeira: [] });
  });
});

describe("editar os percentuais", () => {
  it("enquanto há rascunho, a projeção usa ele; salvar some com o rascunho", async () => {
    const { fluxo } = montar();
    fluxo.editarPercentuais();
    const rascunho = fluxo.agora().rascunho!;

    fluxo.mudarRascunho({ ...rascunho, "custos-fixos": "70" });

    expect(fluxo.agora().vista.potes.find((p) => p.id === "custos-fixos")!.percentual).toBe(70);

    const erro = await fluxo.salvarPercentuais({ ...PERCENTUAIS_PADRAO, "custos-fixos": 35, conforto: 10 });

    expect(erro).toBeNull();
    expect(fluxo.agora().rascunho).toBeNull();
    expect(fluxo.agora().vista.potes.find((p) => p.id === "custos-fixos")!.percentual).toBe(35);
  });
});

describe("assinar", () => {
  it("avisa quem assina a cada mudança, e a leitura não muda entre elas", () => {
    const { fluxo } = montar();
    let avisos = 0;
    const cancelar = fluxo.assinar(() => avisos++);

    expect(fluxo.agora()).toBe(fluxo.agora());
    fluxo.abrirLixeira();
    cancelar();
    fluxo.fecharLixeira();

    expect(avisos).toBe(1);
  });

  it("uma ação que o servidor aceita muda a tela de uma vez: estado novo e formulário fechado juntos", async () => {
    const { fluxo } = montar();
    fluxo.abrirLancamento(null);
    const vistas: { formulario: unknown; ocorrencias: number }[] = [];
    fluxo.assinar(() => vistas.push({ formulario: fluxo.agora().formulario, ocorrencias: fluxo.agora().vista.ocorrencias.length }));

    await fluxo.salvar(lancar(MERCADO), "2026-09");

    expect(vistas).toEqual([{ formulario: null, ocorrencias: 1 }]);
  });
});

/**
 * Um fluxo ligado a um servidor em memória, que guarda o próprio estado e
 * responde com `aplicar` — pode divergir do da tela, como outra aba faria.
 */
function montar(inicial: Estado = estadoVazio(), noServidor: Estado = inicial) {
  const servidor = { estado: noServidor, chamadas: [] as Comando[] };
  const executar = async (comando: Comando): Promise<Resultado<Estado>> => {
    servidor.chamadas.push(comando);
    const resultado = aplicar(servidor.estado, comando, HOJE);
    if (resultado.ok) servidor.estado = resultado.valor;
    return resultado;
  };
  return { fluxo: criarFluxoDoMes(inicial, { hoje: HOJE, executar }), servidor };
}

const lancar = (lancamento: LancamentoASalvar): Comando => ({ tipo: "salvar-lancamento", lancamento });

const entrar = (data: Data): Comando => ({
  tipo: "salvar-entrada",
  entrada: { data, descricao: "Salário", fonte: FONTES[0]!.id, tipo: "pix", valor: 500_000 },
});

/** O estado vazio depois desses comandos. */
function com(...comandos: Comando[]): Estado {
  return comandos.reduce((estado, comando) => {
    const resultado = aplicar(estado, comando, HOJE);
    if (!resultado.ok) throw new Error(resultado.erro);
    return resultado.valor;
  }, estadoVazio());
}
