"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  prepaymentsOf,
  centsToField,
  splitIntoInstallments,
  formatReais,
  monthOf,
  monthName,
  jarName,
  paymentMethodName,
  normalizeTag,
  whatItCanBecome,
  whyNoInstallments,
  JARS,
  reaisToCents,
  startOf,
  addMonths,
  PAYMENT_METHODS,
  periodIn,
  periodsWithEnd,
  type Command,
  type Purchase,
  type IsoDate,
  type Ending,
  type ExpenseShape,
  type Expense,
  type Month,
  type Jar,
  type Recurring,
  type PaymentMethod,
} from "@/domain";
import { faixaDeParcelas, PilulaDaTag } from "./pecas";

type Props = {
  /** O lançamento que se corrige; null num gasto novo. */
  lancamento: Expense | null;
  /** O mês aberto na tela: é dele em diante que um recorrente muda ou se encerra. */
  mes: Month;
  /** As tags já usadas, sugeridas enquanto se digita. */
  tags: string[];
  /** A data que o formulário propõe num gasto novo. */
  dataProposta: IsoDate;
  /** Manda o comando e diz em que mês ele pesa. Devolve o erro de validação, ou null se salvou. */
  salvar: (comando: Command, mes: Month) => Promise<string | null>;
  /** Manda a compra que se corrige para a lixeira. Devolve o erro, ou null se apagou. */
  apagar: () => Promise<string | null>;
  /** Encerra o recorrente que se corrige a partir do mês aberto. Devolve o erro, ou null se encerrou. */
  encerrar: () => Promise<string | null>;
  /** Abre o formulário de antecipação para este parcelado. */
  antecipar: () => void;
  fechar: () => void;
};

const FORMAS: { id: ExpenseShape; nome: string }[] = [
  { id: "upfront", nome: "À vista" },
  { id: "installments", nome: "Parcelado" },
  { id: "recurring", nome: "Recorrente" },
];

/**
 * Um gasto: uma compra à vista ou parcelada, que trocam de forma entre si
 * mesmo depois de salva, ou um recorrente, que não troca de forma. O
 * recorrente se corrige a partir do mês aberto. O reembolso é digitado
 * positivo e gravado negativo, em qualquer forma.
 */
export function FormularioDeLancamento({ lancamento, mes, tags, dataProposta, salvar, apagar, encerrar, antecipar, fechar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const compra = lancamento?.kind === "purchase" ? lancamento : null;
  const recorrente = lancamento?.kind === "recurring" ? lancamento : null;
  // O recorrente abre com a vigência que vale no mês aberto.
  const campos = compra ?? (recorrente && (periodIn(recorrente, mes) ?? recorrente.periods.at(-1)!));
  const [data, setData] = useState<string>(compra?.date ?? dataProposta);
  const [descricao, setDescricao] = useState(campos?.description ?? "");
  const [valor, setValor] = useState(campos ? centsToField(Math.abs(campos.amount)) : "");
  const [reembolso, setReembolso] = useState(campos ? campos.amount < 0 : false);
  const [pote, setPote] = useState<Jar>(campos?.jar ?? "fixed-costs");
  const [tipo, setTipo] = useState<PaymentMethod>(campos?.paymentMethod ?? "pix");
  const [tag, setTag] = useState(campos?.tag ?? "");
  const eraParcelado = compra !== null && compra.installments > 1;
  const [forma, setForma] = useState<ExpenseShape>(recorrente ? "recurring" : eraParcelado ? "installments" : "upfront");
  const [parcelas, setParcelas] = useState(String(eraParcelado ? compra.installments : 2));
  const parcelado = forma === "installments";
  const naoParcela = whyNoInstallments(tipo);
  const tagNormalizada = normalizeTag(tag);
  // O domínio diz o que este gasto ainda pode virar, com a mesma recusa que daria ao salvar.
  const podeVirar = whatItCanBecome(lancamento, mes);
  // Com antecipação ativa, data, total e parcelas ficam travados (ADR-0005).
  const travado = podeVirar.lock !== null;
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // <dialog> modal: o navegador cuida do foco, do Esc e do fundo inerte.
  useEffect(() => dialogo.current?.showModal(), []);

  // Só Cartão de Crédito parcela: sair dele volta a compra para à vista.
  function mudarTipo(novo: PaymentMethod) {
    setTipo(novo);
    if (whyNoInstallments(novo) && parcelado) setForma("upfront");
  }

  /** Por que a forma não pode ser escolhida; null quando pode. O tipo em edição só pesa no parcelado. */
  function bloqueio(f: ExpenseShape): string | null {
    return podeVirar.shapes[f] ?? (f === "installments" ? naoParcela : null);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const centavos = reaisToCents(valor);
    if (centavos === null || centavos === 0) {
      setErro("Informe o valor em reais, como 297,90.");
      return;
    }
    const n = Number(parcelas);
    if (parcelado && (!Number.isInteger(n) || n < 2)) {
      setErro("Parcelado tem 2 parcelas ou mais.");
      return;
    }
    const comuns = { description: descricao, jar: pote, paymentMethod: tipo, amount: reembolso ? -centavos : centavos, tag };
    const [comando, mesDoComando]: [Command, Month] = recorrente
      ? [{ type: "change-recurring", id: recorrente.id, month: mes, period: comuns }, mes]
      : forma === "recurring"
        ? [{ type: "create-recurring", recurring: { ...comuns, date: data as IsoDate } }, monthOf(data as IsoDate)]
        : [
            {
              type: "save-expense",
              expense: { ...(compra && { id: compra.id }), ...comuns, date: data as IsoDate, installments: parcelado ? n : 1 },
            },
            monthOf(data as IsoDate),
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
          <h2 id="titulo-lancamento">{recorrente ? `Recorrente, aberto em ${monthName(mes)}` : lancamento ? "Gasto" : "Novo gasto"}</h2>
          <p className="dica">
            {forma === "recurring"
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
              Compra única em {compra.installments}×. Salvar muda <strong>todas as parcelas</strong>, inclusive as de meses
              passados, e com elas o veredito desses meses.
            </p>
          )}
          {travado && compra && <Antecipacoes compra={compra} />}
          {recorrente && <Vigencias recorrente={recorrente} mes={mes} />}
          {recorrente ? (
            <label className="campo">
              <span>Dia do mês</span>
              <input disabled value={`todo dia ${recorrente.day} · desde ${monthName(startOf(recorrente))}`} />
            </label>
          ) : (
            <label className="campo">
              <span>
                {forma === "recurring"
                  ? "Primeira ocorrência (o dia se repete todo mês)"
                  : parcelado
                    ? "Data da compra (a 1ª parcela cai neste mês)"
                    : "Data"}
              </span>
              <input type="date" required disabled={travado} value={data} onChange={(e) => setData(e.target.value)} />
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
                disabled={travado}
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
                  disabled={travado}
                  className="num"
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                />
              </label>
            )}
          </div>
          {parcelado && <PreviaDasParcelas valor={valor} parcelas={parcelas} data={data} reembolso={reembolso} />}
          {forma === "recurring" && !recorrente && <PreviaDoRecorrente data={data} />}
          <label className="check">
            <input type="checkbox" disabled={travado} checked={reembolso} onChange={(e) => setReembolso(e.target.checked)} />
            <span>
              É reembolso <span className="dica">— dinheiro voltando de um gasto; grava valor negativo neste pote</span>
            </span>
          </label>
          <div className="linha-2">
            <label className="campo">
              <span>Pote</span>
              <select value={pote} onChange={(e) => setPote(e.target.value as Jar)}>
                {JARS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>
                Tipo de pagamento {naoParcela && <span className="dica">— só cartão parcela</span>}
              </span>
              <select value={tipo} onChange={(e) => mudarTipo(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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
          {podeVirar.end && <p className="dica">{oQueEncerrarFaz(podeVirar.end, mes)}</p>}
          {erro && (
            <p className="aviso ruim" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer>
          {eraParcelado && (
            <button
              type="button"
              className="btn"
              onClick={antecipar}
              title="Pagar adiantado as últimas parcelas que ainda sobram, por um valor com desconto"
            >
              Antecipar parcelas
            </button>
          )}
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
              {eraParcelado ? `Apagar as ${compra.installments} parcelas` : "Apagar"}
            </button>
          )}
          {recorrente && (
            <button type="button" className="btn apagar" disabled={salvando} onClick={() => enquantoSalva(encerrar)}>
              Encerrar a partir de {monthName(mes)}
            </button>
          )}
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" disabled={salvando}>
            {recorrente ? `Salvar a partir de ${monthName(mes)}` : "Salvar"}
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
  const centavos = reaisToCents(valor);
  const n = Number(parcelas);
  if (!centavos || !Number.isInteger(n) || n < 2 || !data) return null;
  const total = reembolso ? -centavos : centavos;
  const { first: primeira, rest: demais } = splitIntoInstallments(total, n);
  const primeiroMes = monthOf(data as IsoDate);
  return (
    <p className="dica previa-parcelas num">
      {n}× de {formatReais(demais)}
      {primeira !== demais && ` (a 1ª de ${formatReais(primeira)})`} · de {monthName(primeiroMes)} a{" "}
      {monthName(addMonths(primeiroMes, n - 1))}
    </p>
  );
}

/**
 * As antecipações que valem, e o que elas travam: com uma delas viva, data,
 * total e número de parcelas do parcelado não mudam (ADR-0005).
 */
function Antecipacoes({ compra }: { compra: Purchase }) {
  const { cuts: cortes } = prepaymentsOf(compra);
  return (
    <>
      <p className="aviso">
        Este parcelado tem {cortes.length === 1 ? "uma antecipação" : `${cortes.length} antecipações`}:{" "}
        <strong>data, total e número de parcelas ficam travados</strong>. Desfaça-a na própria ocorrência para mexer neles.
        Descrição, pote, tipo e tag continuam livres, e a antecipação os acompanha.
      </p>
      <div>
        <span className="dica">Antecipações</span>
        <ol className="vigencias">
          {cortes.map(({ prepayment: antecipacao, first: primeira, last: ultima }) => (
            <li key={antecipacao.id}>
              <span className="num">{monthName(monthOf(antecipacao.date))}</span>
              <span>
                parcelas {faixaDeParcelas({ first: primeira, last: ultima })}/{compra.installments}
              </span>
              <span className="num direita">{formatReais(antecipacao.amount)}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/**
 * As vigências do recorrente, cada uma com os meses em que vale, e a do mês
 * aberto em destaque. Diz até quando a mudança de agora vai valer.
 */
function Vigencias({ recorrente, mes }: { recorrente: Recurring; mes: Month }) {
  const vigencias = periodsWithEnd(recorrente);
  const proxima = vigencias.find((v) => v.since > mes);
  const inicio = startOf(recorrente);
  return (
    <>
      <p className="aviso">
        Mudar vale de <strong>{monthName(mes)}</strong> em diante,{" "}
        {proxima
          ? `até ${monthName(addMonths(proxima.since, -1))}: em ${monthName(proxima.since)} já há outra mudança, que continua valendo.`
          : recorrente.endedIn
            ? `até ${monthName(addMonths(recorrente.endedIn, -1))}, quando ele termina.`
            : "sem fim."}{" "}
        Os meses antes não mudam
        {mes !== inicio && `; para corrigir desde o começo, abra ${monthName(inicio)}`}.
      </p>
      <div>
        <span className="dica">Vigências</span>
        <ol className="vigencias">
          {vigencias.map((v) => (
            <li key={v.since} className={v.since <= mes && (v.until === null || mes <= v.until) ? "agora" : undefined}>
              <span className="num">
                {monthName(v.since)} → {v.until ? monthName(v.until) : "sem fim"}
              </span>
              <span>
                {v.description} · {jarName(v.jar)} · {paymentMethodName(v.paymentMethod)}
                {v.tag && <> · #{v.tag}</>}
              </span>
              <span className="num direita">{formatReais(v.amount)}</span>
            </li>
          ))}
          {recorrente.endedIn && (
            <li className="fim">
              <span className="num">{monthName(recorrente.endedIn)}</span>
              <span>encerrado</span>
            </li>
          )}
        </ol>
      </div>
    </>
  );
}

function oQueEncerrarFaz(encerramento: Ending, mes: Month): string {
  if (encerramento.type === "trash") {
    return "Este é o mês de início: encerrar apaga o recorrente inteiro, que vai para a lixeira, de onde volta intacto.";
  }
  const { discarded: descartadas } = encerramento;
  return (
    `Encerrar a partir de ${monthName(mes)}: a última ocorrência passa a ser ${monthName(addMonths(mes, -1))}.` +
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
      {dia > 28 && " (no último dia dos meses mais curtos)"}, a partir de {monthName(monthOf(data as IsoDate))}, sem fim.
    </p>
  );
}
