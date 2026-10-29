import { AGENDA_PARA_FRENTE, AGENDA_PARA_TRAS, VEZES_NO_MES_MAX, agendaDoMes, type AgendaDoMesV1, type LembreteV1, type VezV1 } from '../../../contrato/api-v1/calendario';
import { CalendarState, Reminder, addDays, addMonths, compareInDay, daysInMonth, monthOf, occurrenceStart, repeatSentence, spanOf } from './calendar';

/**
 * O Calendário no espelho da API das AIs (PLANO-API.md, seção 8; rodada 7): cada lembrete em v1 (com a
 * repetição em palavras, a mesma frase da folha) e a agenda de cada mês da janela, com as vezes que
 * passam por ele, abertas pelas contas da tela (core/calendar.ts). Só funções puras; quem chama é
 * `ApiMirror`.
 */

/** Um lembrete no formato público v1. */
export function lembreteV1(r: Reminder): LembreteV1 {
  return {
    id: r.id,
    titulo: r.title,
    dia: r.date,
    hora: r.time ?? null,
    fim: r.end ?? null,
    hora_fim: r.endTime ?? null,
    repete: r.repeat
      ? {
          cada: r.repeat,
          intervalo: r.every ?? 1,
          dias_da_semana: [...(r.days ?? [])],
          vez_no_mes: r.nth ?? null,
          so_nos_meses_com_o_dia: !!r.strict,
          ate: r.until ?? null,
          vezes: r.count ?? null,
        }
      : null,
    em_palavras: repeatSentence(r.repeat, r.date, r),
    pulados: [...r.skip],
    cor: r.color,
    silencioso: !!r.quiet,
    notas: [...r.notes],
    google: r.google ? { link: r.google.link ?? null, travado: r.google.lock ?? null } : null,
    criado_em: r.createdAt,
    versao: r.at,
  };
}

/** Os meses da janela da agenda: os 3 de antes do mês de hoje, ele e os 12 de depois. */
export function agendaMonths(today: string): string[] {
  const first = `${monthOf(today)}-01`;
  return Array.from({ length: AGENDA_PARA_TRAS + 1 + AGENDA_PARA_FRENTE }, (_, i) => monthOf(addMonths(first, i - AGENDA_PARA_TRAS)));
}

/**
 * A agenda de um mês (`AAAA-MM`): cada vez de cada lembrete que passa por ele (a de vários dias que
 * começou no mês de antes também), uma vez só, na ordem da folhinha: pelo primeiro dia e, no mesmo dia,
 * a ordem da tela (`compareInDay`).
 */
export function agendaV1(list: readonly Reminder[], month: string): AgendaDoMesV1 {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, '0')}`;
  const found: { r: Reminder; start: string }[] = [];
  for (const r of list) {
    const seen = new Set<string>();
    for (let day = first; day <= last; day = addDays(day, 1)) {
      const start = occurrenceStart(r, day);
      if (start && !seen.has(start)) {
        seen.add(start);
        found.push({ r, start });
      }
    }
  }
  found.sort((a, b) => a.start.localeCompare(b.start) || compareInDay(a.r, b.r, a.start));
  const vezes = found.slice(0, VEZES_NO_MES_MAX).map(({ r, start }): VezV1 => {
    const span = spanOf(r);
    return {
      lembrete: r.id,
      titulo: r.title,
      dia: start,
      fim: span > 1 ? addDays(start, span - 1) : null,
      hora: r.time ?? null,
      hora_fim: r.endTime ?? null,
      cor: r.color,
      silencioso: !!r.quiet,
      repete: !!r.repeat,
      notas: [...r.notes],
    };
  });
  return { mes: month, vezes };
}

/** O que o Calendário manda ao espelho: os lembretes e a agenda de cada mês da janela (mesmo vazia). */
export function calendarMirror(state: CalendarState, today: string): ({ tipo: 'lembrete'; id: string; dados: LembreteV1 } | { tipo: 'agenda'; id: string; dados: AgendaDoMesV1 })[] {
  return [
    ...state.reminders.map((r) => ({ tipo: 'lembrete' as const, id: r.id, dados: lembreteV1(r) })),
    ...agendaMonths(today).map((m) => ({ tipo: 'agenda' as const, id: agendaDoMes(m), dados: agendaV1(state.reminders, m) })),
  ];
}
