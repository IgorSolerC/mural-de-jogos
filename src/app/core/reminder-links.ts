import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CALENDAR_PATH } from './areas';
import { Reminder, byWhen, isPast, nearDayLabel, repeatShort, timeLabel, whenItMatters } from './calendar';
import { CalendarStore } from './calendar-store';
import { nameKey } from './text';

/**
 * Os links para um lembrete do Calendário no texto das anotações: "[Ir à reunião](murall://lembrete/ID)".
 * É o link de sempre do markdown, com um endereço do próprio Murall (o esquema da imagem colada,
 * `murall://imagem/ID`; ver `reminderLinkId` em core/rich-text.ts): o texto é o que a pessoa escreveu, e o
 * id faz o link sobreviver a renomear o lembrete (e a dois lembretes com o mesmo nome). Nada novo é
 * guardado: o link mora no texto, o lembrete no Calendário.
 *
 * - Na leitura e no editor, o link tem a caneta azul do link de anotação, com o desenho do calendário
 *   depois do texto; o dia e a hora vão no `title` e no leitor de tela. Tocar abre o Calendário no dia que
 *   importa (o de hoje, a próxima vez, ou o último, se já passou: `whenItMatters`), com ele em destaque.
 * - O lembrete que não está no seu Calendário (apagado, ou de quem escreveu a compartilhada) fica
 *   tracejado, como o link para uma anotação que não existe.
 * - Na cópia (Ctrl+C das marcadas, o copiar do Visual) e no PDF, o texto sai com a data ("Ir à reunião
 *   (02/11/2026, 9h)"): fora daqui, o link não abre nada.
 * - No mural de outra pessoa, o link só aparece (o Calendário é só de quem escreveu).
 */

/** O que o texto mostra de um lembrete ligado. */
export interface ReminderLinkInfo {
  title: string;
  /** O dia que importa, perto de quem lê: "Amanhã, 9h", "ter, 21 de out." (ver `nearDayLabel`). */
  when: string;
  /** O mesmo dia por inteiro, para a cópia e o PDF: "02/11/2026, 9h". */
  date: string;
  /** Já passou (a vez de hoje com o horário já ido, ou o último dia, se não volta mais). */
  past: boolean;
  /** O dia que o link abre no Calendário. */
  day: string;
}

/** A dica do link de lembrete, na leitura e no Visual: "Lembrete: Reunião · Amanhã, 9h" (e "já passou"). */
export function reminderLinkTitle(info: ReminderLinkInfo): string {
  return `Lembrete: ${info.title} · ${info.when}${info.past ? ' (já passou)' : ''}`;
}

/** "02/11/2026" do dia 'AAAA-MM-DD'. */
function fullDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** O que o link mostra do lembrete `r`, para quem olha hoje (`today`) a esta hora (`now`, 'HH:MM'). */
export function reminderLinkInfo(r: Reminder, today: string, now: string): ReminderLinkInfo {
  const w = whenItMatters(r, today);
  const at = w.time ? `, ${timeLabel(w.time)}` : '';
  return { title: r.title, when: nearDayLabel(w.day, today) + at, date: fullDay(w.day) + at, past: w.past || isPast(r, w.day, today, now), day: w.day };
}

/** Uma opção do seletor de lembretes (Inserir › Lembrete do calendário). */
export interface ReminderOption {
  id: string;
  title: string;
  /** "Amanhã, 9h · Toda semana". */
  meta: string;
  past: boolean;
}

/**
 * Os lembretes do seletor: os que têm a busca no nome (sem acento nem caixa), os que começam com ela
 * primeiro, e em cada leva os que vêm primeiro (do mais perto para o mais longe), depois os que passaram
 * (do mais recente). Até `max`.
 */
export function reminderOptions(list: readonly Reminder[], query: string, today: string, now: string, max = 8): ReminderOption[] {
  const q = nameKey(query);
  const found = list
    .map((r) => ({ r, key: nameKey(r.title), w: whenItMatters(r, today) }))
    .filter((x) => !q || x.key.includes(q))
    .sort((a, b) => (q ? Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) : 0) || byWhen(a.w, b.w) || a.r.title.localeCompare(b.r.title, 'pt-BR'));
  return found.slice(0, max).map(({ r }) => {
    const info = reminderLinkInfo(r, today, now);
    const meta = [info.when, r.repeat ? repeatShort(r) : '', info.past ? 'já passou' : ''].filter(Boolean).join(' · ');
    return { id: r.id, title: r.title, meta, past: info.past };
  });
}

/**
 * Os links de lembrete do seu Calendário: o que mostrar de um id (null: não está no seu Calendário) e
 * abrir o dia dele. Lido dentro dos moldes, acompanha o Calendário (um lembrete apagado vira tracejado).
 */
@Injectable({ providedIn: 'root' })
export class ReminderLinks {
  private readonly calendar = inject(CalendarStore);
  private readonly router = inject(Router);

  info(id: string): ReminderLinkInfo | null {
    const r = this.calendar.reminders().find((x) => x.id === id);
    return r ? reminderLinkInfo(r, this.calendar.today(), this.calendar.time()) : null;
  }

  /** A data inteira, para a cópia; null, não está no seu Calendário. */
  dateOf(id: string): string | null {
    return this.info(id)?.date ?? null;
  }

  /** Os lembretes do seletor (ver `reminderOptions`). */
  options(query: string): ReminderOption[] {
    return reminderOptions(this.calendar.reminders(), query, this.calendar.today(), this.calendar.time());
  }

  /** Lido dentro de um effect, faz ele rodar de novo quando o que os links mostram muda (os lembretes, o dia, a hora). */
  watch(): void {
    this.calendar.reminders();
    this.calendar.today();
    this.calendar.time();
  }

  /** Há algum lembrete no Calendário (o seletor vazio explica de onde eles vêm). */
  any(): boolean {
    return this.calendar.reminders().length > 0;
  }

  /** O Calendário no dia que importa, na vista do dia, com o lembrete em destaque. Devolve se foi. */
  open(id: string): boolean {
    const info = this.info(id);
    if (!info) return false;
    void this.router.navigate([CALENDAR_PATH], { queryParams: { vista: 'dia', dia: info.day, lembrete: id } });
    return true;
  }
}
