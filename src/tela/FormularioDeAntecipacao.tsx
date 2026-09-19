"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  centavosParaCampo,
  ehDataValida,
  formatarReais,
  maximoAntecipavel,
  mesDaData,
  mesDaParcela,
  nomeDoMes,
  nomeDoPote,
  nomeDoTipo,
  parcelasAntecipadas,
  reaisParaCentavos,
  type Antecipacao,
  type Centavos,
  type Comando,
  type Compra,
  type Data,
  type Mes,
  type ParcelasAntecipadas,
} from "@/dominio";
import { faixaDeParcelas, PilulaDaTag } from "./pecas";

type Props = {
  /** O parcelado de quem é a antecipação. */
  parcelado: Compra;
  /** A antecipação que se revê; null numa nova. */
  antecipacao: Antecipacao | null;
  /** A data que o formulário propõe numa antecipação nova. */
  dataProposta: Data;
  /** Para avisar quando uma parcela removida cai num mês que já passou. */
  hoje: Data;
  /** Manda o comando e diz em que mês ele pesa. Devolve o erro de validação, ou null se salvou. */
  salvar: (comando: Comando, mes: Mes) => Promise<string | null>;
  /** Manda a antecipação para a lixeira. Devolve o erro, ou null se desfez. */
  desfazer: () => Promise<string | null>;
  fechar: () => void;
};

/**
 * Antecipar as últimas parcelas de um parcelado, como o cartão faz (ADR-0005):
 * data, quantas parcelas e valor pago. As parcelas antecipadas saem dos seus
 * meses e o valor pago vira uma ocorrência no mês da antecipação, com o pote,
 * o tipo de pagamento e a tag do parcelado.
 */
export function FormularioDeAntecipacao({ parcelado, antecipacao, dataProposta, hoje, salvar, desfazer, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<string>(antecipacao?.data ?? dataProposta);
  const [parcelas, setParcelas] = useState(String(antecipacao?.parcelas ?? 1));
  const [valor, setValor] = useState(antecipacao ? centavosParaCampo(antecipacao.valor) : "");
  // Enquanto a pessoa não mexer no valor, ele acompanha a soma das parcelas que saem.
  const [valorEditado, setValorEditado] = useState(antecipacao !== null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  const prova = { id: antecipacao?.id, data: data as Data, parcelas: Number(parcelas) };
  const dataValida = ehDataValida(data);
  const maximo = dataValida ? maximoAntecipavel(parcelado, { id: prova.id, data: prova.data }) : 0;
  const corte = dataValida ? parcelasAntecipadas(parcelado, prova) : null;
  const valorMostrado = valorEditado ? valor : corte ? centavosParaCampo(corte.soma) : "";

  function mudarValor(novo: string) {
    setValorEditado(true);
    setValor(novo);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const centavos = reaisParaCentavos(valorMostrado);
    if (centavos === null || centavos <= 0) {
      setErro("Informe o valor pago em reais, como 3.899,00.");
      return;
    }
    const comando: Comando = {
      tipo: "salvar-antecipacao",
      antecipacao: { lancamento: parcelado.id, ...(antecipacao && { id: antecipacao.id }), data: data as Data, parcelas: prova.parcelas, valor: centavos },
    };
    await enquantoSalva(() => salvar(comando, mesDaData(data as Data)));
  }

  async function enquantoSalva(acao: () => Promise<string | null>) {
    setSalvando(true);
    const recusa = await acao();
    setSalvando(false);
    setErro(recusa);
  }

  return (
    <dialog
      ref={dialogo}
      className="folha"
      onClose={fechar}
      onClick={(e) => e.target === dialogo.current && fechar()}
      aria-labelledby="titulo-antecipacao"
    >
      <form onSubmit={enviar}>
        <header>
          <h2 id="titulo-antecipacao">{antecipacao ? "Antecipação" : "Antecipar parcelas"}</h2>
          <p className="dica">
            Leva as <strong>últimas</strong> parcelas que ainda sobram, e só as de meses posteriores ao da antecipação.
          </p>
        </header>
        <div className="corpo">
          <FichaDoParcelado parcelado={parcelado} />
          <div className="linha-2">
            <label className="campo">
              <span>Data do pagamento</span>
              <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="campo">
              <span>
                Parcelas {maximo > 0 && <span className="dica">— até {maximo}</span>}
              </span>
              <input
                required
                type="number"
                min={1}
                max={Math.max(maximo, 1)}
                step={1}
                className="num"
                value={parcelas}
                onChange={(e) => setParcelas(e.target.value)}
              />
            </label>
          </div>
          {maximo === 0 && dataValida && (
            <p className="aviso ruim">
              Nenhuma parcela deste parcelado cai depois de {nomeDoMes(mesDaData(data as Data))}: não há o que antecipar nesta data.
            </p>
          )}
          {corte && <Previa parcelado={parcelado} corte={corte} />}
          <label className="campo">
            <span>
              Valor pago (R$) <span className="dica">— o que saiu, já com o desconto</span>
            </span>
            <input
              required
              inputMode="decimal"
              className="num"
              value={valorMostrado}
              onChange={(e) => mudarValor(e.target.value)}
              placeholder="0,00"
            />
          </label>
          {corte && <Desconto soma={corte.soma} pago={reaisParaCentavos(valorMostrado)} />}
          {corte && <AvisoDeMesPassado parcelado={parcelado} corte={corte} hoje={hoje} />}
          {erro && (
            <p className="aviso ruim" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer>
          {antecipacao && (
            <button
              type="button"
              className="btn apagar"
              disabled={salvando}
              onClick={() => enquantoSalva(desfazer)}
              title="A antecipação vai para a lixeira e as parcelas voltam aos seus meses"
            >
              Desfazer
            </button>
          )}
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" disabled={salvando || maximo === 0}>
            Salvar
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** De que parcelado é a antecipação, e de quem ela herda pote, tipo e tag. */
function FichaDoParcelado({ parcelado }: { parcelado: Compra }) {
  return (
    <p className="aviso">
      <strong>{parcelado.descricao}</strong> · {parcelado.parcelas}× de {formatarReais(parcelado.valor)} desde{" "}
      {nomeDoMes(mesDaData(parcelado.data))}. A antecipação entra em {nomeDoPote(parcelado.pote)}, por {nomeDoTipo(parcelado.tipo)}{" "}
      <PilulaDaTag tag={parcelado.tag} />, acompanhando o parcelado quando ele mudar.
    </p>
  );
}

/** Que parcelas saem, de que meses, e quanto elas somavam. */
function Previa({ parcelado, corte }: { parcelado: Compra; corte: ParcelasAntecipadas }) {
  const mes = (numero: number) => nomeDoMes(mesDaParcela(parcelado, numero));
  return (
    <p className="dica previa-parcelas num">
      Leva as parcelas {faixaDeParcelas(corte)}/{parcelado.parcelas} · {mes(corte.primeira)}
      {corte.primeira !== corte.ultima && ` a ${mes(corte.ultima)}`} · somam {formatarReais(corte.soma)}
    </p>
  );
}

/** Quanto a antecipação economizou, ou custou a mais, contra a soma das parcelas. */
function Desconto({ soma, pago }: { soma: Centavos; pago: Centavos | null }) {
  if (pago === null || pago <= 0 || pago === soma) return null;
  const diferenca = soma - pago;
  return (
    <p className="dica num">
      {diferenca > 0 ? `Desconto de ${formatarReais(diferenca)}` : `${formatarReais(-diferenca)} a mais que a soma das parcelas`}
    </p>
  );
}

/** O aviso de que uma parcela que sai já pesava num mês fechado, cujo veredito vai mudar. */
function AvisoDeMesPassado({ parcelado, corte, hoje }: { parcelado: Compra; corte: ParcelasAntecipadas; hoje: Data }) {
  const mesDeHoje = mesDaData(hoje);
  const passados = Array.from({ length: corte.ultima - corte.primeira + 1 }, (_, i) => mesDaParcela(parcelado, corte.primeira + i)).filter(
    (m) => m < mesDeHoje,
  );
  if (passados.length === 0) return null;
  return (
    <p className="aviso">
      {passados.length === 1
        ? `Uma das parcelas que saem cai em ${nomeDoMes(passados[0]!)}, um mês que já passou:`
        : `${passados.length} das parcelas que saem caem em meses que já passaram (de ${nomeDoMes(passados[0]!)} a ${nomeDoMes(passados.at(-1)!)}):`}{" "}
      o veredito desses meses muda.
    </p>
  );
}
