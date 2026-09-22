"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { mergeOnRename, normalizeTag } from "@/domain";
import { plural, PilulaDaTag } from "./pecas";

type Props = {
  /** A tag que se renomeia, como está gravada. */
  tag: string;
  /** As tags em uso, sugeridas enquanto se digita: escolher uma delas é fundir. */
  tags: string[];
  /** As tags de todo o histórico, lixeira incluída: é contra elas que o nome novo funde. */
  tagsDoHistorico: string[];
  /** Quantos lançamentos usam uma tag, para dizer o tamanho da renomeação e da fusão. */
  lancamentosComATag: (tag: string) => number;
  /** Manda renomear. Devolve o erro de validação, ou null se renomeou. */
  renomear: (para: string, fundir: boolean) => Promise<string | null>;
  fechar: () => void;
};

/**
 * Renomear uma tag no histórico todo. Quando o nome novo já é de outra tag, o
 * que sai é uma fusão — as duas viram uma e nada mais separa as ocorrências —,
 * então ela só sai com a confirmação marcada, que é o que o comando exige.
 */
export function FormularioDeRenomearTag({ tag, tags, tagsDoHistorico, lancamentosComATag, renomear, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [nome, setNome] = useState(tag);
  const [confirmada, setConfirmada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const nova = normalizeTag(nome);
  const gastos = lancamentosComATag(tag);
  // A mesma pergunta que o comando faz: a confirmação pedida aqui é a que ele exige.
  const fusao = mergeOnRename(tagsDoHistorico, tag, nome);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    const recusa = await renomear(nome, fusao !== null && confirmada);
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
            O nome novo vale no histórico todo: em {plural(gastos, "gasto")}, em todos os meses, nas compras e nas vigências dos
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
                Já existe a tag <PilulaDaTag tag={fusao} />,{" "}
                {/* Zero é a tag que só dorme na lixeira: ela não está em nenhum gasto vivo, mas volta ao restaurar. */}
                {lancamentosComATag(fusao) === 0 ? "num gasto que está na lixeira" : `em ${plural(lancamentosComATag(fusao), "gasto")}`}.
                Renomear <strong>funde as duas</strong>: {plural(gastos, "gasto")} de #{tag} passam para #{fusao}, e #{tag}{" "}
                deixa de existir. Depois nada diz de qual nome cada gasto veio.
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
