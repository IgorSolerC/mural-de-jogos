import { regrasDoLembrete, type LembreteV1 } from '../../../contrato/api-v1/calendario';
import {
  camposDoGoogle,
  conferirOpLembrete,
  editarLembreteV1,
  lembreteDoPedido,
  type ApagarLembreteV1,
  type CamposDoLembrete,
  type CriarLembreteV1,
  type EditarLembreteV1,
  type OpLembrete,
} from '../../../contrato/api-v1/operacoes-calendario';
import { andList } from './api-keys';
import { lembreteV1 } from './api-mirror-calendar';
import { type RequestStamps, onlyOwnSince } from './api-requests-spending';
import { REPEAT_LABEL, type Reminder, dayAndMonth, drawColor, occurrenceStart, sanitizeReminder, timeLabel } from './calendar';
import type { CalendarStore } from './calendar-store';

/**
 * Os pedidos do Calendário aplicados pelo site (PLANO-API.md, 9.2; rodada 7), pelas mesmas funções da
 * folha do lembrete: o lembrete pelo `CalendarStore.save` (passando por `sanitizeReminder`, como o que
 * vem do armazenamento), o dia tirado por `skipDay`, o apagado por `remove`. O Google Agenda vai
 * sozinho depois, como numa edição da tela.
 */

export type CalendarResult = { lembrete: LembreteV1 | null } | { erro: string; lembrete?: LembreteV1 };

export interface CalendarApplied {
  estado: 'aplicado' | 'conflito' | 'falhou';
  resultado: CalendarResult;
  /** O lembrete como era (o Desfazer); null no criar. */
  antes: unknown;
  carimbo?: string;
  /** A versão de antes do carimbo (null: o pedido criou o lembrete). */
  desde?: string | null;
}

export interface CalendarApplyContext {
  now: string;
  /** As mudanças feitas aqui por pedidos (ver `RequestStamps`). */
  stamps: RequestStamps;
  /** A anotação existe e é sua (as presas num lembrete)? */
  noteExists(id: string): boolean;
}

/** É um pedido do Calendário? */
export function isCalendarOp(op: string): boolean {
  return op.startsWith('lembrete.');
}

const failed = (erro: string, lembrete?: LembreteV1): CalendarApplied => ({ estado: 'falhou', resultado: lembrete ? { erro, lembrete } : { erro }, antes: null });

/**
 * O lembrete v1 de volta ao formato do Murall, por cima de `base` (o que a v1 não mostra fica: a ligação
 * com o Google, a hora de criar). O "semana começa no domingo" do Google só fica se a repetição não mudou.
 */
function toReminder(v: LembreteV1, base: Reminder, sameRepeat: boolean): Reminder {
  const {
    time: _t, end: _e, endTime: _et, repeat: _r, every: _ev, days: _d, nth: _n, strict: _s, weekStart, until: _u, count: _c, quiet: _q,
    ...rest
  } = base;
  const r = v.repete;
  return {
    ...rest,
    title: v.titulo,
    date: v.dia,
    color: v.cor ?? base.color,
    notes: v.notas,
    skip: v.pulados,
    ...(v.hora ? { time: v.hora } : {}),
    ...(v.fim ? { end: v.fim } : {}),
    ...(v.hora_fim ? { endTime: v.hora_fim } : {}),
    ...(v.silencioso ? { quiet: true as const } : {}),
    ...(r
      ? {
          repeat: r.cada,
          ...(r.intervalo > 1 ? { every: r.intervalo } : {}),
          ...(r.dias_da_semana.length ? { days: r.dias_da_semana } : {}),
          ...(r.vez_no_mes !== null ? { nth: r.vez_no_mes } : {}),
          ...(r.so_nos_meses_com_o_dia ? { strict: true as const } : {}),
          ...(r.vezes ? { count: r.vezes } : r.ate ? { until: r.ate } : {}),
          ...(sameRepeat && weekStart === 0 ? { weekStart } : {}),
        }
      : {}),
  };
}

/** As anotações presas que não existem (a API não as confere: a chave do Calendário pode não ler as notas). */
function missingNotes(c: CamposDoLembrete, ctx: CalendarApplyContext): string | null {
  const gone = (c.notas ?? []).filter((id) => !ctx.noteExists(id));
  return gone.length ? `Não achei ${gone.length === 1 ? 'a anotação' : 'as anotações'} ${gone.join(', ')} para prender no lembrete.` : null;
}

/** Aplica um pedido do Calendário e diz como foi. */
export function applyCalendarRequest(store: CalendarStore, req: { op: string; alvo: string; dados: unknown }, ctx: CalendarApplyContext): CalendarApplied {
  const op = req.op as OpLembrete;
  const checked = conferirOpLembrete(op, req.dados);
  if (!checked.ok) return failed(`${checked.erro} (campo ${checked.campo})`);
  /** Grava pela conferência de sempre e diz como ficou. */
  const save = (r: Reminder, antes: Reminder | null): CalendarApplied => {
    const clean = sanitizeReminder(r);
    if (!clean) return failed('O lembrete não pôde ser gravado (algum campo não combina).');
    store.save(clean);
    const after = store.get(clean.id) ?? clean;
    return { estado: 'aplicado', resultado: { lembrete: lembreteV1(after) }, antes, carimbo: after.at, desde: antes?.at ?? null };
  };

  if (op === 'lembrete.criar') {
    // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): o mesmo id, nada de novo
    const there = store.get(req.alvo);
    if (there) return { estado: 'aplicado', resultado: { lembrete: lembreteV1(there) }, antes: null };
    const d = checked.dados as CriarLembreteV1;
    const v = lembreteDoPedido(req.alvo, d, ctx.now);
    const broken = regrasDoLembrete(v);
    if (broken) return failed(`${broken.erro} (campo ${broken.campo})`);
    const missing = missingNotes(d, ctx);
    if (missing) return failed(missing);
    // sem cor, a de um lembrete novo na folha: sorteada, nunca a do último criado
    const base: Reminder = { id: req.alvo, title: d.titulo, date: d.dia, color: drawColor(store.reminders()), notes: [], skip: [], createdAt: ctx.now, at: ctx.now };
    return save(toReminder(v, base, false), null);
  }

  const before = store.get(req.alvo);
  if (!before) return failed('O lembrete não existe mais (foi apagado).');
  const versao = (checked.dados as { versao: string }).versao;
  // mudou depois que a AI leu (e não por um pedido dela aplicado aqui): a pessoa venceu
  if (!onlyOwnSince(before.id, before.at, versao, ctx.stamps)) {
    return { estado: 'conflito', resultado: { erro: 'O lembrete mudou depois que você o leu. Leia de novo e mande a versao nova.', lembrete: lembreteV1(before) }, antes: null };
  }

  if (op === 'lembrete.apagar') {
    const dia = (checked.dados as ApagarLembreteV1).dia;
    if (!dia) {
      // a volta mora no pedido: o Desfazer põe o lembrete de antes de novo
      store.remove(before.id);
      return { estado: 'aplicado', resultado: { lembrete: null }, antes: before };
    }
    if (!before.repeat) return failed(`“${before.title}” não se repete: para tirá-lo, apague sem o dia.`, lembreteV1(before));
    // a vez que começa no dia ("Apagar só neste dia" da folha)
    if (occurrenceStart(before, dia) !== dia) return failed(`“${before.title}” não tem uma vez que começa em ${dia}. Veja os dias na agenda.`, lembreteV1(before));
    if (before.skip.includes(dia)) return { estado: 'aplicado', resultado: { lembrete: lembreteV1(before) }, antes: null };
    store.skipDay(before.id, dia);
    const after = store.get(before.id) ?? before;
    return { estado: 'aplicado', resultado: { lembrete: lembreteV1(after) }, antes: before, carimbo: after.at, desde: before.at };
  }

  // lembrete.editar
  const { versao: _v, ...campos } = checked.dados as EditarLembreteV1;
  const google = camposDoGoogle(campos);
  if (before.google?.lock && google.length) {
    return failed(`“${before.title}” é do Google Agenda (${before.google.lock === 'convite' ? 'um convite de outra pessoa' : 'um evento do próprio Google'}): por aqui só mudam a cor e as notas.`, lembreteV1(before));
  }
  const v = editarLembreteV1(lembreteV1(before), checked.dados as EditarLembreteV1, ctx.now);
  const broken = regrasDoLembrete(v);
  if (broken) return failed(`${broken.erro} (campo ${broken.campo})`, lembreteV1(before));
  const missing = missingNotes(campos, ctx);
  if (missing) return failed(missing, lembreteV1(before));
  return save(toReminder(v, before, campos.repete === undefined), before);
}

const FIELD_WORDS: Record<string, string> = {
  titulo: 'o nome',
  dia: 'o dia',
  hora: 'o horário',
  fim: 'o último dia',
  hora_fim: 'a hora em que acaba',
  repete: 'a repetição',
  cor: 'a cor',
  silencioso: 'o aviso',
  notas: 'as anotações presas',
};

/**
 * O pedido do Calendário em palavras: "Marcar “Dentista” para 3 de novembro, às 14h30" (esperando) ou
 * "marcou “Dentista” para 3 de novembro, às 14h30" (no histórico, `past`). `title` é o nome do lembrete.
 */
export function calendarWords(op: string, dados: unknown, title: string, past = false): string | null {
  const d = (dados ?? {}) as Record<string, unknown>;
  const v = (now: string, then: string) => (past ? then : now);
  const t = `“${title}”`;
  switch (op) {
    case 'lembrete.criar': {
      const when = typeof d['dia'] === 'string' ? ` para ${dayAndMonth(d['dia'])}` : '';
      const time = typeof d['hora'] === 'string' ? `, às ${timeLabel(d['hora'])}` : '';
      const rep = (d['repete'] as { cada?: keyof typeof REPEAT_LABEL } | null | undefined)?.cada;
      return `${v('Marcar', 'marcou')} ${t}${when}${time}${rep ? `, ${REPEAT_LABEL[rep].toLowerCase()}` : ''}`;
    }
    case 'lembrete.editar': {
      const fields = Object.keys(FIELD_WORDS).filter((k) => d[k] !== undefined);
      return `${v('Mudar', 'mudou')} ${fields.length ? `${andList(fields.map((k) => FIELD_WORDS[k]!))} de ` : ''}${t}`;
    }
    case 'lembrete.apagar':
      return typeof d['dia'] === 'string' ? `${v('Tirar', 'tirou')} ${t} de ${dayAndMonth(d['dia'])}` : `${v('Apagar', 'apagou')} o lembrete ${t}`;
    default:
      return null;
  }
}

/** O nome que a pessoa reconhece num pedido do Calendário: o do pedido, o de agora, o de depois, o de antes. */
export function calendarTitle(store: CalendarStore, t: { op: string; alvo: string; dados: unknown; resultado?: unknown; antes?: unknown }): string {
  if (t.op === 'lembrete.criar') return (t.dados as { titulo?: string } | null)?.titulo ?? 'um lembrete';
  return (
    store.get(t.alvo)?.title ??
    (t.resultado as { lembrete?: LembreteV1 | null } | null | undefined)?.lembrete?.titulo ??
    (t.antes as Reminder | null | undefined)?.title ??
    'um lembrete que não existe mais'
  );
}

/**
 * Desfaz um pedido do Calendário aplicado: o lembrete criado sai, o mudado (ou com o dia tirado) e o
 * apagado voltam como eram, mais novos que a mudança desfeita (`CalendarStore.restore`, que mantém a
 * ligação de agora com o Google).
 */
export function undoCalendar(store: CalendarStore, t: { op: string; alvo: string; antes?: unknown }): void {
  if (t.op === 'lembrete.criar') {
    store.remove(t.alvo);
    return;
  }
  const before = sanitizeReminder(t.antes);
  if (before) store.restore(before);
}
