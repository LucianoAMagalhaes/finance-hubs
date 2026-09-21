"use client";

import { useState, useSyncExternalStore } from "react";
import {
  dataProposta,
  formatarReais,
  lancamentosComATag,
  mesDaData,
  nomeDaFonte,
  nomeDoMes,
  nomeDoTipo,
  somarMeses,
  tagsEmUso,
  tagsNoHistorico,
  type AgregadosDoMes,
  type Centavos,
  type Data,
  type Eixo,
  type Entrada,
  type Estado,
  type VistaDoMes,
} from "@/dominio";
import { executar } from "@/servidor/acoes";
import { AlternadorDeTema } from "./AlternadorDeTema";
import { BotaoFlutuante } from "./BotaoFlutuante";
import { EditorDePercentuais } from "./EditorDePercentuais";
import { criarFluxoDoMes } from "./fluxoDoMes";
import { FormularioDeAntecipacao } from "./FormularioDeAntecipacao";
import { FormularioDeEntrada } from "./FormularioDeEntrada";
import { FormularioDeLancamento } from "./FormularioDeLancamento";
import { FormularioDeRenomearTag } from "./FormularioDeRenomearTag";
import { Lixeira } from "./Lixeira";
import { MestreDetalhe, NOME_DO_EIXO } from "./MestreDetalhe";
import { BotoesDeLancar, Valor } from "./pecas";

type Props = { estadoInicial: Estado; hoje: Data };

/**
 * A tela do mês: só desenha o fluxo do mês, que guarda o estado, projeta o
 * mês e manda os comandos ao servidor.
 */
export function TelaDoMes({ estadoInicial, hoje }: Props) {
  const [fluxo] = useState(() => criarFluxoDoMes(estadoInicial, { hoje, executar }));
  const { estado, mes, vista, lixeira, formulario, aviso, rascunho, eixo, aberto, lixeiraAberta, tagARenomear } = useSyncExternalStore(
    fluxo.assinar,
    fluxo.agora,
    fluxo.agora,
  );
  const mesDeHoje = mesDaData(hoje);
  const novaEntrada = () => fluxo.abrirEntrada(null);
  const novoLancamento = () => fluxo.abrirLancamento(null);

  return (
    <main className="wrap">
      <header className="topo">
        <nav className="navegacao-mes" aria-label="Mês">
          <button type="button" className="btn seta" onClick={() => fluxo.mudarMes(somarMeses(mes, -1))} aria-label="Mês anterior">
            ‹
          </button>
          <h1>{maiuscula(nomeDoMes(mes))}</h1>
          <button type="button" className="btn seta" onClick={() => fluxo.mudarMes(somarMeses(mes, 1))} aria-label="Próximo mês">
            ›
          </button>
          {mes !== mesDeHoje && (
            <button type="button" className="btn" onClick={() => fluxo.mudarMes(mesDeHoje)}>
              Hoje
            </button>
          )}
        </nav>
        <div className="status">
          <span className="chip">{mes === mesDeHoje ? "mês em curso" : mes < mesDeHoje ? "mês passado · editável" : "mês futuro"}</span>
          {!vista.orcamento.nascido && (
            <span className="chip nascimento">
              ainda não nasceu · herdaria{" "}
              {vista.orcamento.herdadoDe ? `de ${nomeDoMes(vista.orcamento.herdadoDe)}` : "os padrão"}
            </span>
          )}
        </div>
        <div className="acoes">
          <AlternadorDeTema />
          <button type="button" className="btn" onClick={fluxo.abrirLixeira} title="O que foi apagado, para restaurar">
            Lixeira{lixeira.length > 0 && <span className="contagem num">{lixeira.length}</span>}
          </button>
          <BotoesDeLancar novaEntrada={novaEntrada} novoLancamento={novoLancamento} />
        </div>
      </header>

      {aviso && (
        <div className="aviso-salvo" role="status">
          <span>
            {aviso.texto} A tela continua em {nomeDoMes(mes)}.
          </span>
          <button type="button" className="btn" onClick={() => fluxo.mudarMes(aviso.mes)}>
            Ir para {nomeDoMes(aviso.mes)}
          </button>
          <button type="button" className="fechar" onClick={fluxo.dispensarAviso} aria-label="Dispensar aviso">
            ×
          </button>
        </div>
      )}

      <Secao titulo="O mês" primeira />
      <FaixaDeAgregados
        agregados={vista.agregados}
        entradas={vista.entradas.length}
        despesasAbertas={aberto?.tipo === "todos"}
        abrirDespesas={fluxo.alternarDespesas}
      />

      <Secao titulo={eixo === "pote" ? "Os potes" : `Por ${NOME_DO_EIXO[eixo].toLowerCase()}`}>
        <SeletorDeEixo eixo={eixo} mudar={fluxo.mudarEixo} />
        {eixo === "pote" && !rascunho && (
          <button type="button" className="btn" onClick={fluxo.editarPercentuais}>
            Editar percentuais
          </button>
        )}
        {eixo === "pote" ? (
          <span className="extra num">
            {vista.potes.map((p) => p.percentual).join(" / ")}
            {vista.naoAlocado.percentual > 0 && (
              <strong className="nao-alocado">
                {" "}
                · {vista.naoAlocado.percentual}% não alocado
                {vista.naoAlocado.valor !== null && ` (${formatarReais(vista.naoAlocado.valor)})`}
              </strong>
            )}
          </span>
        ) : (
          <span className="extra">Sem limite e sem veredito: só pote tem percentual da receita.</span>
        )}
      </Secao>
      {rascunho && (
        <EditorDePercentuais
          rascunho={rascunho}
          mudar={fluxo.mudarRascunho}
          salvar={fluxo.salvarPercentuais}
          cancelar={fluxo.cancelarRascunho}
        />
      )}
      {vista.receita === 0 && (
        <p className="aviso">
          Nenhuma entrada em {nomeDoMes(mes)}: sem receita, os potes não têm limite nem veredito.
        </p>
      )}
      <MestreDetalhe
        vista={vista}
        eixo={eixo}
        aberto={aberto}
        abrir={fluxo.abrir}
        abrirOcorrencia={fluxo.abrirOcorrencia}
        renomearTag={fluxo.abrirRenomear}
      />

      <Secao titulo="Entradas do mês">
        <button type="button" className="btn entrada" onClick={novaEntrada}>
          + Entrada
        </button>
      </Secao>
      <ListaDeEntradas vista={vista} abrir={fluxo.abrirEntrada} />

      {formulario?.registro === "entrada" && (
        <FormularioDeEntrada
          entrada={formulario.entrada}
          dataProposta={dataProposta(mes, hoje)}
          salvar={(entrada) => fluxo.salvar({ tipo: "salvar-entrada", entrada }, mesDaData(entrada.data))}
          apagar={fluxo.apagar}
          fechar={fluxo.fecharFormulario}
        />
      )}
      {formulario?.registro === "lancamento" && (
        <FormularioDeLancamento
          lancamento={formulario.lancamento}
          mes={mes}
          tags={tagsEmUso(estado)}
          dataProposta={dataProposta(mes, hoje)}
          salvar={fluxo.salvar}
          apagar={fluxo.apagar}
          encerrar={fluxo.encerrar}
          antecipar={fluxo.antecipar}
          fechar={fluxo.fecharFormulario}
        />
      )}
      {formulario?.registro === "antecipacao" && (
        <FormularioDeAntecipacao
          parcelado={formulario.parcelado}
          antecipacao={formulario.antecipacao}
          dataProposta={dataProposta(mes, hoje)}
          hoje={hoje}
          salvar={fluxo.salvar}
          desfazer={fluxo.apagar}
          fechar={fluxo.fecharFormulario}
        />
      )}
      {tagARenomear !== null && (
        <FormularioDeRenomearTag
          tag={tagARenomear}
          tags={tagsEmUso(estado)}
          tagsDoHistorico={tagsNoHistorico(estado)}
          lancamentosComATag={(tag) => lancamentosComATag(estado, tag)}
          renomear={fluxo.renomearTag}
          fechar={fluxo.fecharRenomear}
        />
      )}
      {lixeiraAberta && <Lixeira itens={lixeira} restaurar={fluxo.restaurar} fechar={fluxo.fecharLixeira} />}

      {/* Em janela estreita, lançar é por aqui; no layout largo, pelo topo. */}
      <BotaoFlutuante novaEntrada={novaEntrada} novoLancamento={novoLancamento} />
    </main>
  );
}

function Secao({ titulo, primeira, children }: { titulo: string; primeira?: boolean; children?: React.ReactNode }) {
  return (
    <div className={primeira ? "secao primeira" : "secao"}>
      <h2>{titulo}</h2>
      <span className="fio" />
      {children}
    </div>
  );
}

type PropsDaFaixa = {
  agregados: AgregadosDoMes;
  entradas: number;
  despesasAbertas: boolean;
  abrirDespesas: () => void;
};

/** O card Despesas abre "Todos os gastos do mês" no mestre-detalhe. */
function FaixaDeAgregados({ agregados, entradas, despesasAbertas, abrirDespesas }: PropsDaFaixa) {
  const cards = [
    {
      rotulo: "Receitas",
      valor: <span className="val entrada">{formatarReais(agregados.receitas)}</span>,
      dica: entradas === 1 ? "1 entrada" : `${entradas} entradas`,
    },
    { rotulo: "Despesas", valor: <Valor centavos={agregados.despesas} />, dica: "líquido · ver todos os gastos", abrir: abrirDespesas },
    { rotulo: "Saldo do mês", valor: <Saldo centavos={agregados.saldoDoMes} />, dica: "receitas − despesas" },
    { rotulo: "Saldo em conta", valor: <Saldo centavos={agregados.saldoEmConta} />, dica: "sem cartão · aproximado" },
  ];
  return (
    <div className="faixa">
      {cards.map((c) => {
        const conteudo = (
          <>
            <span className="k">{c.rotulo}</span>
            <span className="v num">{c.valor}</span>
            <span className="h">{c.dica}</span>
          </>
        );
        return c.abrir ? (
          <button type="button" className={`agregado clicavel ${despesasAbertas ? "aberto" : ""}`} key={c.rotulo} onClick={c.abrir} aria-pressed={despesasAbertas}>
            {conteudo}
          </button>
        ) : (
          <div className="agregado" key={c.rotulo}>
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}

/** As entradas do mês, com a fonte como coluna. Fonte não tem drill-down (ADR-0003). */
function ListaDeEntradas({ vista, abrir }: { vista: VistaDoMes; abrir: (entrada: Entrada) => void }) {
  return (
    <div className="tabela">
      <div className="linha cabecalho" aria-hidden>
        <span>Data</span>
        <span>Descrição</span>
        <span>Fonte</span>
        <span>Tipo</span>
        <span className="direita">Valor</span>
      </div>
      {vista.entradas.map((e) => (
        <button type="button" key={e.id} className="linha clicavel" onClick={() => abrir(e)} title="Corrigir a entrada">
          <span className="data num">
            {e.data.slice(8)}/{e.data.slice(5, 7)}
          </span>
          <span>{e.descricao}</span>
          <span>
            <span className="pilula-fonte">{nomeDaFonte(e.fonte)}</span>
          </span>
          <span className="tipo">{nomeDoTipo(e.tipo)}</span>
          <span className="direita num val entrada">+ {formatarReais(e.valor)}</span>
        </button>
      ))}
      {vista.entradas.length === 0 && (
        <div className="linha vazia">
          <span />
          <span>Nenhuma entrada. Sem entrada, sem receita, sem limite.</span>
        </div>
      )}
      <div className="linha rodape">
        <span />
        <span>Receita do mês</span>
        <span />
        <span />
        <span className="direita num val entrada">{formatarReais(vista.receita)}</span>
      </div>
    </div>
  );
}

function SeletorDeEixo({ eixo, mudar }: { eixo: Eixo; mudar: (eixo: Eixo) => void }) {
  return (
    <div className="seletor-eixo" role="group" aria-label="Agrupar os gastos por">
      {(Object.keys(NOME_DO_EIXO) as Eixo[]).map((e) => (
        <button type="button" key={e} aria-pressed={e === eixo} onClick={() => mudar(e)}>
          {NOME_DO_EIXO[e]}
        </button>
      ))}
    </div>
  );
}

/** Saldo: negativo é déficit, em vermelho. */
function Saldo({ centavos }: { centavos: Centavos }) {
  return <span className={centavos < 0 ? "deficit" : undefined}>{formatarReais(centavos)}</span>;
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
