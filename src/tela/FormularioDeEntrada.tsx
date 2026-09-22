"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  centsToField,
  INCOME_SOURCES,
  reaisToCents,
  INCOME_METHODS,
  type IsoDate,
  type Income,
  type IncomeToSave,
  type IncomeSource,
  type IncomeMethod,
} from "@/domain";

type Props = {
  /** A entrada que se corrige; null numa entrada nova. */
  entrada: Income | null;
  /** A data que o formulário propõe numa entrada nova. */
  dataProposta: IsoDate;
  /** Devolve o erro de validação, ou null se salvou. */
  salvar: (entrada: IncomeToSave) => Promise<string | null>;
  /** Manda a entrada que se corrige para a lixeira. Devolve o erro, ou null se apagou. */
  apagar: () => Promise<string | null>;
  fechar: () => void;
};

export function FormularioDeEntrada({ entrada, dataProposta, salvar, apagar, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<string>(entrada?.date ?? dataProposta);
  const [descricao, setDescricao] = useState(entrada?.description ?? "");
  const [valor, setValor] = useState(entrada ? centsToField(entrada.amount) : "");
  const [fonte, setFonte] = useState<IncomeSource>(entrada?.source ?? "salario");
  const [tipo, setTipo] = useState<IncomeMethod>(entrada?.paymentMethod ?? "transferencia");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const centavos = reaisToCents(valor);
    if (centavos === null) {
      setErro("Informe o valor em reais, como 7.200,00.");
      return;
    }
    setSalvando(true);
    const recusa = await salvar({
      ...(entrada && { id: entrada.id }),
      date: data as IsoDate,
      description: descricao,
      source: fonte,
      paymentMethod: tipo,
      amount: centavos,
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
      aria-labelledby="titulo-entrada"
    >
      <form onSubmit={enviar}>
        <header>
          <h2 id="titulo-entrada">{entrada ? "Entrada" : "Nova entrada"}</h2>
          <p className="dica">Dinheiro entrando. Sem pote, sem parcela, sem repetição: pesa só no mês da própria data.</p>
        </header>
        <div className="corpo">
          <label className="campo">
            <span>Data</span>
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="campo">
            <span>Descrição</span>
            <input required value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Salário de setembro" />
          </label>
          <div className="linha-2">
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
            <label className="campo">
              <span>Fonte</span>
              <select value={fonte} onChange={(e) => setFonte(e.target.value as IncomeSource)}>
                {INCOME_SOURCES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="campo">
            <span>
              Tipo de pagamento <span className="dica">(só os três que creditam)</span>
            </span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as IncomeMethod)}>
              {INCOME_METHODS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {erro && (
            <p className="aviso ruim" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer>
          {entrada && (
            <button type="button" className="btn apagar" disabled={salvando} onClick={mandarParaLixeira} title="Vai para a lixeira, de onde volta intacta">
              Apagar
            </button>
          )}
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn entrada" disabled={salvando}>
            Salvar
          </button>
        </footer>
      </form>
    </dialog>
  );
}
