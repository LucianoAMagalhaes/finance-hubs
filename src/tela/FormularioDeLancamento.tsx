"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  centavosParaCampo,
  divisaoEmParcelas,
  formatarReais,
  mesDaData,
  nomeDoMes,
  normalizarTag,
  POTES,
  reaisParaCentavos,
  somarMeses,
  TIPOS_DE_PAGAMENTO,
  type Data,
  type Lancamento,
  type LancamentoASalvar,
  type PoteId,
  type TipoDePagamento,
} from "@/dominio";
import { PilulaDaTag } from "./pecas";

type Props = {
  /** O lançamento que se corrige; null num gasto novo. */
  lancamento: Lancamento | null;
  /** As tags já usadas, sugeridas enquanto se digita. */
  tags: string[];
  /** A data que o formulário propõe num gasto novo. */
  dataProposta: Data;
  /** Devolve o erro de validação, ou null se salvou. */
  salvar: (lancamento: LancamentoASalvar) => Promise<string | null>;
  /** Manda o lançamento que se corrige para a lixeira. Devolve o erro, ou null se apagou. */
  apagar: () => Promise<string | null>;
  fechar: () => void;
};

type Forma = "a-vista" | "parcelado";

const FORMAS: { id: Forma; nome: string }[] = [
  { id: "a-vista", nome: "À vista" },
  { id: "parcelado", nome: "Parcelado" },
];

/**
 * Um gasto: uma compra à vista ou parcelada, que trocam de forma entre si
 * mesmo depois de salva. O recorrente chega no seu ticket. O reembolso é
 * digitado positivo e gravado negativo, em qualquer forma.
 */
export function FormularioDeLancamento({ lancamento, tags, dataProposta, salvar, apagar, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<string>(lancamento?.data ?? dataProposta);
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [valor, setValor] = useState(lancamento ? centavosParaCampo(Math.abs(lancamento.valor)) : "");
  const [reembolso, setReembolso] = useState(lancamento ? lancamento.valor < 0 : false);
  const [pote, setPote] = useState<PoteId>(lancamento?.pote ?? "custos-fixos");
  const [tipo, setTipo] = useState<TipoDePagamento>(lancamento?.tipo ?? "pix");
  const [tag, setTag] = useState(lancamento?.tag ?? "");
  const eraParcelado = lancamento !== null && lancamento.parcelas > 1;
  const [forma, setForma] = useState<Forma>(eraParcelado ? "parcelado" : "a-vista");
  const [parcelas, setParcelas] = useState(String(eraParcelado ? lancamento.parcelas : 2));
  const parcelado = forma === "parcelado";
  const podeParcelar = tipo === "cartao-de-credito";
  const tagNormalizada = normalizarTag(tag);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  // Só Cartão de Crédito parcela: sair dele volta a compra para à vista.
  function mudarTipo(novo: TipoDePagamento) {
    setTipo(novo);
    if (novo !== "cartao-de-credito") setForma("a-vista");
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const centavos = reaisParaCentavos(valor);
    if (centavos === null || centavos === 0) {
      setErro("Informe o valor em reais, como 297,90.");
      return;
    }
    const n = Number(parcelas);
    if (parcelado && (!Number.isInteger(n) || n < 2)) {
      setErro("Parcelado tem 2 parcelas ou mais.");
      return;
    }
    setSalvando(true);
    const recusa = await salvar({
      ...(lancamento && { id: lancamento.id }),
      data: data as Data,
      descricao,
      pote,
      tipo,
      valor: reembolso ? -centavos : centavos,
      parcelas: parcelado ? n : 1,
      tag,
    });
    setSalvando(false);
    setErro(recusa);
  }

  async function mandarParaLixeira() {
    setSalvando(true);
    const recusa = await apagar();
    setSalvando(false);
    setErro(recusa);
  }

  return (
    <dialog
      ref={dialogo}
      className="folha"
      onClose={fechar}
      onClick={(e) => e.target === dialogo.current && fechar()}
      aria-labelledby="titulo-lancamento"
    >
      <form onSubmit={enviar}>
        <header>
          <h2 id="titulo-lancamento">{lancamento ? "Gasto" : "Novo gasto"}</h2>
          <p className="dica">
            {parcelado
              ? "Parcelado: o total se divide entre os meses, a 1ª parcela no mês da compra."
              : "À vista: pesa inteiro no mês da própria data."}
          </p>
        </header>
        <div className="corpo">
          <div className="seletor-forma" role="group" aria-label="Forma do gasto">
            {FORMAS.map((f) => (
              <button
                type="button"
                key={f.id}
                aria-pressed={f.id === forma}
                disabled={f.id === "parcelado" && !podeParcelar}
                title={f.id === "parcelado" && !podeParcelar ? "Só Cartão de Crédito parcela" : undefined}
                onClick={() => setForma(f.id)}
              >
                {f.nome}
              </button>
            ))}
          </div>
          {eraParcelado && (
            <p className="aviso">
              Compra única em {lancamento.parcelas}×. Salvar muda <strong>todas as parcelas</strong>, inclusive as de meses
              passados, e com elas o veredito desses meses.
            </p>
          )}
          <label className="campo">
            <span>{parcelado ? "Data da compra (a 1ª parcela cai neste mês)" : "Data"}</span>
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            <span>Descrição</span>
            <input required value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Supermercado" />
          </label>
          <div className={parcelado ? "linha-2" : undefined}>
            <label className="campo">
              <span>{parcelado ? "Total da compra (R$)" : "Valor (R$)"}</span>
              <input
                required
                inputMode="decimal"
                className="num"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </label>
            {parcelado && (
              <label className="campo">
                <span>Parcelas</span>
                <input
                  required
                  type="number"
                  min={2}
                  step={1}
                  className="num"
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                />
              </label>
            )}
          </div>
          {parcelado && <PreviaDasParcelas valor={valor} parcelas={parcelas} data={data} reembolso={reembolso} />}
          <label className="check">
            <input type="checkbox" checked={reembolso} onChange={(e) => setReembolso(e.target.checked)} />
            <span>
              É reembolso <span className="dica">— dinheiro voltando de um gasto; grava valor negativo neste pote</span>
            </span>
          </label>
          <div className="linha-2">
            <label className="campo">
              <span>Pote</span>
              <select value={pote} onChange={(e) => setPote(e.target.value as PoteId)}>
                {POTES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>
                Tipo de pagamento {!podeParcelar && <span className="dica">— só cartão parcela</span>}
              </span>
              <select value={tipo} onChange={(e) => mudarTipo(e.target.value as TipoDePagamento)}>
                {TIPOS_DE_PAGAMENTO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="campo">
            <span>
              Tag <span className="dica">— opcional, no máximo uma</span>
            </span>
            <input list="tags-em-uso" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="sem tag" />
            <datalist id="tags-em-uso">
              {tags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {tagNormalizada && tagNormalizada !== tag && (
              <span className="dica">
                Grava como <PilulaDaTag tag={tagNormalizada} />
              </span>
            )}
          </label>
          {erro && (
            <p className="aviso ruim" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer>
          {lancamento && (
            <button
              type="button"
              className="btn apagar"
              disabled={salvando}
              onClick={mandarParaLixeira}
              title={
                eraParcelado
                  ? "A compra inteira vai para a lixeira, com todas as parcelas, e volta intacta"
                  : "Vai para a lixeira, de onde volta intacto"
              }
            >
              {eraParcelado ? `Apagar as ${lancamento.parcelas} parcelas` : "Apagar"}
            </button>
          )}
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" disabled={salvando}>
            Salvar
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/**
 * A divisão antes de salvar, pela mesma regra do domínio: "3× de R$ 333,33 (a
 * 1ª de R$ 333,34)", e em que meses caem. Com juros, o total já é o pago.
 */
function PreviaDasParcelas({ valor, parcelas, data, reembolso }: { valor: string; parcelas: string; data: string; reembolso: boolean }) {
  const centavos = reaisParaCentavos(valor);
  const n = Number(parcelas);
  if (!centavos || !Number.isInteger(n) || n < 2 || !data) return null;
  const total = reembolso ? -centavos : centavos;
  const { primeira, demais } = divisaoEmParcelas(total, n);
  const primeiroMes = mesDaData(data as Data);
  return (
    <p className="dica previa-parcelas num">
      {n}× de {formatarReais(demais)}
      {primeira !== demais && ` (a 1ª de ${formatarReais(primeira)})`} · de {nomeDoMes(primeiroMes)} a{" "}
      {nomeDoMes(somarMeses(primeiroMes, n - 1))}
    </p>
  );
}
