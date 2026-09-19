"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  centavosParaCampo,
  divisaoEmParcelas,
  formatarReais,
  mesDaData,
  nomeDoMes,
  nomeDoPote,
  nomeDoTipo,
  normalizarTag,
  POTES,
  reaisParaCentavos,
  inicioDe,
  somarMeses,
  TIPOS_DE_PAGAMENTO,
  vigenciaEm,
  vigenciasComFim,
  type Comando,
  type Data,
  type Lancamento,
  type Mes,
  type PoteId,
  type Recorrente,
  type TipoDePagamento,
} from "@/dominio";
import { PilulaDaTag } from "./pecas";

type Props = {
  /** O lançamento que se corrige; null num gasto novo. */
  lancamento: Lancamento | null;
  /** O mês aberto na tela: é dele em diante que um recorrente muda ou se encerra. */
  mes: Mes;
  /** As tags já usadas, sugeridas enquanto se digita. */
  tags: string[];
  /** A data que o formulário propõe num gasto novo. */
  dataProposta: Data;
  /** Manda o comando e diz em que mês ele pesa. Devolve o erro de validação, ou null se salvou. */
  salvar: (comando: Comando, mes: Mes) => Promise<string | null>;
  /** Manda a compra que se corrige para a lixeira. Devolve o erro, ou null se apagou. */
  apagar: () => Promise<string | null>;
  /** Encerra o recorrente que se corrige a partir do mês aberto. Devolve o erro, ou null se encerrou. */
  encerrar: () => Promise<string | null>;
  fechar: () => void;
};

type Forma = "a-vista" | "parcelado" | "recorrente";

const FORMAS: { id: Forma; nome: string }[] = [
  { id: "a-vista", nome: "À vista" },
  { id: "parcelado", nome: "Parcelado" },
  { id: "recorrente", nome: "Recorrente" },
];

/**
 * Um gasto: uma compra à vista ou parcelada, que trocam de forma entre si
 * mesmo depois de salva, ou um recorrente, que não troca de forma. O
 * recorrente se corrige a partir do mês aberto. O reembolso é digitado
 * positivo e gravado negativo, em qualquer forma.
 */
export function FormularioDeLancamento({ lancamento, mes, tags, dataProposta, salvar, apagar, encerrar, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const compra = lancamento?.forma === "compra" ? lancamento : null;
  const recorrente = lancamento?.forma === "recorrente" ? lancamento : null;
  // O recorrente abre com a vigência que vale no mês aberto.
  const campos = compra ?? (recorrente && (vigenciaEm(recorrente, mes) ?? recorrente.vigencias.at(-1)!));
  const [data, setData] = useState<string>(compra?.data ?? dataProposta);
  const [descricao, setDescricao] = useState(campos?.descricao ?? "");
  const [valor, setValor] = useState(campos ? centavosParaCampo(Math.abs(campos.valor)) : "");
  const [reembolso, setReembolso] = useState(campos ? campos.valor < 0 : false);
  const [pote, setPote] = useState<PoteId>(campos?.pote ?? "custos-fixos");
  const [tipo, setTipo] = useState<TipoDePagamento>(campos?.tipo ?? "pix");
  const [tag, setTag] = useState(campos?.tag ?? "");
  const eraParcelado = compra !== null && compra.parcelas > 1;
  const [forma, setForma] = useState<Forma>(recorrente ? "recorrente" : eraParcelado ? "parcelado" : "a-vista");
  const [parcelas, setParcelas] = useState(String(eraParcelado ? compra.parcelas : 2));
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
    if (novo !== "cartao-de-credito" && parcelado) setForma("a-vista");
  }

  /** Por que a forma não pode ser escolhida; null quando pode. Recorrente não troca de forma depois de salvo. */
  function bloqueio(f: Forma): string | null {
    if (lancamento !== null && (recorrente !== null) !== (f === "recorrente")) {
      return "Recorrente não vira compra, nem o contrário: apague e lance de novo";
    }
    return f === "parcelado" && !podeParcelar ? "Só Cartão de Crédito parcela" : null;
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
    const comuns = { descricao, pote, tipo, valor: reembolso ? -centavos : centavos, tag };
    const [comando, mesDoComando]: [Comando, Mes] = recorrente
      ? [{ tipo: "mudar-recorrente", id: recorrente.id, mes, vigencia: comuns }, mes]
      : forma === "recorrente"
        ? [{ tipo: "criar-recorrente", recorrente: { ...comuns, data: data as Data } }, mesDaData(data as Data)]
        : [
            {
              tipo: "salvar-lancamento",
              lancamento: { ...(compra && { id: compra.id }), ...comuns, data: data as Data, parcelas: parcelado ? n : 1 },
            },
            mesDaData(data as Data),
          ];
    await enquantoSalva(() => salvar(comando, mesDoComando));
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
      aria-labelledby="titulo-lancamento"
    >
      <form onSubmit={enviar}>
        <header>
          <h2 id="titulo-lancamento">{recorrente ? `Recorrente, aberto em ${nomeDoMes(mes)}` : lancamento ? "Gasto" : "Novo gasto"}</h2>
          <p className="dica">
            {forma === "recorrente"
              ? "Recorrente: o mesmo valor todo mês, sem fim até ser encerrado."
              : parcelado
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
                disabled={bloqueio(f.id) !== null}
                title={bloqueio(f.id) ?? undefined}
                onClick={() => setForma(f.id)}
              >
                {f.nome}
              </button>
            ))}
          </div>
          {eraParcelado && (
            <p className="aviso">
              Compra única em {compra.parcelas}×. Salvar muda <strong>todas as parcelas</strong>, inclusive as de meses
              passados, e com elas o veredito desses meses.
            </p>
          )}
          {recorrente && <Vigencias recorrente={recorrente} mes={mes} />}
          {recorrente ? (
            <label className="campo">
              <span>Dia do mês</span>
              <input disabled value={`todo dia ${recorrente.dia} · desde ${nomeDoMes(inicioDe(recorrente))}`} />
            </label>
          ) : (
            <label className="campo">
              <span>
                {forma === "recorrente"
                  ? "Primeira ocorrência (o dia se repete todo mês)"
                  : parcelado
                    ? "Data da compra (a 1ª parcela cai neste mês)"
                    : "Data"}
              </span>
              <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </label>
          )}
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
          {forma === "recorrente" && !recorrente && <PreviaDoRecorrente data={data} />}
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
          {recorrente && <p className="dica">{oQueEncerrarFaz(recorrente, mes)}</p>}
          {erro && (
            <p className="aviso ruim" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer>
          {compra && (
            <button
              type="button"
              className="btn apagar"
              disabled={salvando}
              onClick={() => enquantoSalva(apagar)}
              title={
                eraParcelado
                  ? "A compra inteira vai para a lixeira, com todas as parcelas, e volta intacta"
                  : "Vai para a lixeira, de onde volta intacto"
              }
            >
              {eraParcelado ? `Apagar as ${compra.parcelas} parcelas` : "Apagar"}
            </button>
          )}
          {recorrente && (
            <button type="button" className="btn apagar" disabled={salvando} onClick={() => enquantoSalva(encerrar)}>
              Encerrar a partir de {nomeDoMes(mes)}
            </button>
          )}
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" disabled={salvando}>
            {recorrente ? `Salvar a partir de ${nomeDoMes(mes)}` : "Salvar"}
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

/**
 * As vigências do recorrente, cada uma com os meses em que vale, e a do mês
 * aberto em destaque. Diz até quando a mudança de agora vai valer.
 */
function Vigencias({ recorrente, mes }: { recorrente: Recorrente; mes: Mes }) {
  const vigencias = vigenciasComFim(recorrente);
  const proxima = vigencias.find((v) => v.desde > mes);
  const inicio = inicioDe(recorrente);
  return (
    <>
      <p className="aviso">
        Mudar vale de <strong>{nomeDoMes(mes)}</strong> em diante,{" "}
        {proxima
          ? `até ${nomeDoMes(somarMeses(proxima.desde, -1))}: em ${nomeDoMes(proxima.desde)} já há outra mudança, que continua valendo.`
          : recorrente.encerradoEm
            ? `até ${nomeDoMes(somarMeses(recorrente.encerradoEm, -1))}, quando ele termina.`
            : "sem fim."}{" "}
        Os meses antes não mudam
        {mes !== inicio && `; para corrigir desde o começo, abra ${nomeDoMes(inicio)}`}.
      </p>
      <div>
        <span className="dica">Vigências</span>
        <ol className="vigencias">
          {vigencias.map((v) => (
            <li key={v.desde} className={v.desde <= mes && (v.ate === null || mes <= v.ate) ? "agora" : undefined}>
              <span className="num">
                {nomeDoMes(v.desde)} → {v.ate ? nomeDoMes(v.ate) : "sem fim"}
              </span>
              <span>
                {v.descricao} · {nomeDoPote(v.pote)} · {nomeDoTipo(v.tipo)}
                {v.tag && <> · #{v.tag}</>}
              </span>
              <span className="num direita">{formatarReais(v.valor)}</span>
            </li>
          ))}
          {recorrente.encerradoEm && (
            <li className="fim">
              <span className="num">{nomeDoMes(recorrente.encerradoEm)}</span>
              <span>encerrado</span>
            </li>
          )}
        </ol>
      </div>
    </>
  );
}

function oQueEncerrarFaz(recorrente: Recorrente, mes: Mes): string {
  if (mes === inicioDe(recorrente)) {
    return "Este é o mês de início: encerrar apaga o recorrente inteiro, que vai para a lixeira, de onde volta intacto.";
  }
  const descartadas = recorrente.vigencias.filter((v) => v.desde >= mes).length;
  return (
    `Encerrar a partir de ${nomeDoMes(mes)}: a última ocorrência passa a ser ${nomeDoMes(somarMeses(mes, -1))}.` +
    (descartadas === 1 ? " A mudança daqui em diante some de vez." : "") +
    (descartadas > 1 ? ` As ${descartadas} mudanças daqui em diante somem de vez.` : "")
  );
}

/** Em que dia e desde quando o recorrente novo cai. */
function PreviaDoRecorrente({ data }: { data: string }) {
  if (!data) return null;
  const dia = Number(data.slice(8));
  return (
    <p className="dica previa-parcelas">
      Todo dia {dia}
      {dia > 28 && " (no último dia dos meses mais curtos)"}, a partir de {nomeDoMes(mesDaData(data as Data))}, sem fim.
    </p>
  );
}
