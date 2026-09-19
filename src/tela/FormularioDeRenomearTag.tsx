"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizarTag, type Comando } from "@/dominio";
import { PilulaDaTag } from "./pecas";

type Props = {
  /** A tag que se renomeia, como está gravada. */
  tag: string;
  /** As tags em uso, sugeridas enquanto se digita: escolher uma delas é fundir. */
  tags: string[];
  /** Quantos lançamentos usam uma tag, para dizer o tamanho da renomeação e da fusão. */
  gastosComATag: (tag: string) => number;
  /** Manda o comando. Devolve o erro de validação, ou null se renomeou. */
  renomear: (comando: Comando) => Promise<string | null>;
  fechar: () => void;
};

/**
 * Renomear uma tag no histórico todo. Quando o nome novo já é de outra tag, o
 * que sai é uma fusão — as duas viram uma e nada mais separa as ocorrências —,
 * então ela só sai com a confirmação marcada, que é o que o comando exige.
 */
export function FormularioDeRenomearTag({ tag, tags, gastosComATag, renomear, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [nome, setNome] = useState(tag);
  const [confirmada, setConfirmada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const nova = normalizarTag(nome);
  const gastos = gastosComATag(tag);
  // A fusão só existe contra outra tag em uso: o nome novo igual ao atual é só um nome igual.
  const fusao = nova !== null && nova !== tag && tags.includes(nova) ? nova : null;

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    const recusa = await renomear({ tipo: "renomear-tag", de: tag, para: nome, fundir: fusao !== null && confirmada });
    setSalvando(false);
    setErro(recusa);
  }

  return (
    <dialog
      ref={dialogo}
      className="folha"
      onClose={fechar}
      onClick={(e) => e.target === dialogo.current && fechar()}
      aria-labelledby="titulo-renomear-tag"
    >
      <form onSubmit={enviar}>
        <header>
          <h2 id="titulo-renomear-tag">
            Renomear <PilulaDaTag tag={tag} />
          </h2>
          <p className="dica">
            O nome novo vale no histórico todo: em {contagem(gastos)}, em todos os meses, nas compras e nas vigências dos
            recorrentes. A cor muda junto, porque sai do nome.
          </p>
        </header>
        <div className="corpo">
          <label className="campo">
            <span>Nome novo</span>
            <input
              required
              autoFocus
              list="tags-para-fundir"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setConfirmada(false);
              }}
              placeholder="Ex.: mobilidade"
            />
            <datalist id="tags-para-fundir">
              {tags
                .filter((t) => t !== tag)
                .map((t) => (
                  <option key={t} value={t} />
                ))}
            </datalist>
            {nova && nova !== nome && (
              <span className="dica">
                Grava como <PilulaDaTag tag={nova} />
              </span>
            )}
          </label>
          {fusao && (
            <>
              <p className="aviso">
                Já existe a tag <PilulaDaTag tag={fusao} />, em {contagem(gastosComATag(fusao))}. Renomear <strong>funde as
                duas</strong>: {contagem(gastos)} de #{tag} passam para #{fusao}, e #{tag} deixa de existir. Depois nada diz
                de qual nome cada gasto veio.
              </p>
              <label className="check">
                <input type="checkbox" checked={confirmada} onChange={(e) => setConfirmada(e.target.checked)} />
                <span>
                  Confirmo fundir #{tag} com #{fusao}
                </span>
              </label>
            </>
          )}
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
          <button type="submit" className="btn primario" disabled={salvando || (fusao !== null && !confirmada)}>
            {fusao ? "Fundir as duas" : "Renomear"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

const contagem = (n: number) => (n === 1 ? "1 gasto" : `${n} gastos`);
