"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  centavosParaCampo,
  normalizarTag,
  POTES,
  reaisParaCentavos,
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
  fechar: () => void;
};

/**
 * Um gasto à vista. As outras formas (parcelado, recorrente) chegam em
 * tickets próprios. O reembolso é digitado positivo e gravado negativo.
 */
export function FormularioDeLancamento({ lancamento, tags, dataProposta, salvar, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<string>(lancamento?.data ?? dataProposta);
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [valor, setValor] = useState(lancamento ? centavosParaCampo(Math.abs(lancamento.valor)) : "");
  const [reembolso, setReembolso] = useState(lancamento ? lancamento.valor < 0 : false);
  const [pote, setPote] = useState<PoteId>(lancamento?.pote ?? "custos-fixos");
  const [tipo, setTipo] = useState<TipoDePagamento>(lancamento?.tipo ?? "pix");
  const [tag, setTag] = useState(lancamento?.tag ?? "");
  const tagNormalizada = normalizarTag(tag);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const centavos = reaisParaCentavos(valor);
    if (centavos === null || centavos === 0) {
      setErro("Informe o valor em reais, como 297,90.");
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
      parcelas: 1,
      tag,
    });
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
          <p className="dica">À vista: pesa inteiro no mês da própria data.</p>
        </header>
        <div className="corpo">
          <label className="campo">
            <span>Data</span>
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            <span>Descrição</span>
            <input required value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Supermercado" />
          </label>
          <label className="campo">
            <span>Valor (R$)</span>
            <input
              required
              inputMode="decimal"
              className="num"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </label>
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
              <span>Tipo de pagamento</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDePagamento)}>
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
