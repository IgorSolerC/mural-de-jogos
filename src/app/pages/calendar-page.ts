import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BellOff, CalendarDays, CalendarRange, CalendarSearch, CalendarSync, ChevronLeft, ChevronRight, Clock, LucideAngularModule, LucideIconData, Paperclip, Pencil, Plus, Repeat, Square } from 'lucide-angular';
import { map } from 'rxjs';
import { MONTHS_LONG } from '../core/dates';
import {
  Reminder,
  Segment,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  isDay,
  isPast,
  longDay,
  monthLabel,
  monthOf,
  rangeLabel,
  remindersByDay,
  remindersOn,
  repeatShort,
  segmentOn,
  spanLabel,
  spanOf,
  timeLabel,
  weekDays,
  weekLabel,
  weekday,
} from '../core/calendar';
import { CalendarStore } from '../core/calendar-store';
import { Desk } from '../core/desk';
import { Review } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { readText, writeText } from '../core/storage';
import { cap } from '../core/text';
import { CalendarMonth } from '../ui/calendar-month';
import { GoogleAgenda } from '../core/google-agenda-sync';
import { GoogleAgendaSheet } from '../ui/google-agenda-sheet';
import { ClippedReviewCard } from '../ui/calendar-note';
import { ReminderSheet } from '../ui/reminder-sheet';

/** As três vistas, no endereço (`?vista=semana&dia=2026-10-18`). */
export type CalendarView = 'mes' | 'semana' | 'dia';

/** A última vista aberta neste aparelho: `/anotacoes/calendario` sem nada volta nela. */
const VIEW_KEY = 'meu-mural:calendario-vista:v1';

function isView(v: unknown): v is CalendarView {
  return v === 'mes' || v === 'semana' || v === 'dia';
}

interface ViewTab {
  id: CalendarView;
  label: string;
  icon: LucideIconData;
  key: string;
}

const VIEWS: readonly ViewTab[] = [
  { id: 'mes', label: 'Mês', icon: CalendarDays, key: 'm' },
  { id: 'semana', label: 'Semana', icon: CalendarRange, key: 's' },
  { id: 'dia', label: 'Dia', icon: Square, key: 'd' },
];

/** Um dia da semana na vista da semana: o cabeçalho e os lembretes dele. */
interface WeekDay {
  day: string;
  n: number;
  short: string;
  label: string;
  today: boolean;
  sunday: boolean;
  list: Reminder[];
}

/** A pequena inclinação de cada tira, sempre a mesma para o mesmo lembrete (de -0,7 a 0,7 grau). */
function tiltOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${((Math.abs(h) % 15) - 7) / 10}deg`;
}

/**
 * O Calendário das anotações (`/anotacoes/calendario`): lembretes, de uma vez só ou que se repetem, cada
 * um na cor de uma cartolina e com as anotações que ajudam presas nele (ver core/calendar.ts). Três
 * vistas, como no Google Agenda e no da Apple, nas divisórias de manilha em cima da pasta:
 *
 * - **Mês**: a folhinha de parede, presa por uma espiral; os domingos em vermelho, hoje circulado a
 *   caneta e, em cada dia, uma bolinha adesiva na cor de cada lembrete. Tocar num dia abre o dia.
 * - **Semana**: a agenda semanal, os sete dias lado a lado (um embaixo do outro no celular), cada
 *   lembrete numa tira de cartolina com o horário, o nome, se repete e o clipe das anotações.
 * - **Dia**: o calendário pequeno ao lado (para pular de dia) e a página do dia, com cada lembrete
 *   inteiro (riscado, se já passou): o horário, como repete e as anotações anexadas, as fichas de verdade, presas
 *   por um clipe (tocar abre a leitura).
 *
 * Na pasta: Hoje, as setas do período e o nome dele, e "Ir para" uma data. Teclas: T (hoje), M, S e D
 * (as vistas), ← e → (o período); N é o "Novo lembrete" do topo.
 */
@Component({
  selector: 'app-calendar-page',
  imports: [CalendarMonth, ClippedReviewCard, GoogleAgendaSheet, LucideAngularModule, ReminderSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export class CalendarPage {
  protected readonly PrevIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;
  protected readonly JumpIcon = CalendarSearch;
  protected readonly GoogleIcon = CalendarSync;
  protected readonly PlusIcon = Plus;
  protected readonly RepeatIcon = Repeat;
  protected readonly ClipIcon = Paperclip;
  protected readonly ClockIcon = Clock;
  protected readonly QuietIcon = BellOff;
  protected readonly PencilIcon = Pencil;
  protected readonly views = VIEWS;
  protected readonly timeLabel = timeLabel;
  protected readonly spanLabel = spanLabel;
  protected readonly repeatShort = repeatShort;

  protected readonly tiltOf = tiltOf;

  private readonly calendar = inject(CalendarStore);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly router = inject(Router);
  protected readonly looks = inject(Settings).categoryLooks;
  private readonly jumpInput = viewChild<ElementRef<HTMLInputElement>>('ir');
  /** O Google Agenda (ver core/google-agenda-sync.ts): o botão na pasta e a folha dele. */
  protected readonly google = inject(GoogleAgenda);
  protected readonly googleOpen = signal(false);
  /** O botão aparece para quem pode ligar (a conta está na lista da API) ou já ligou. */
  protected readonly googleShown = computed(() => ['desligada', 'ligando', 'ligada'].includes(this.google.status()));
  /** Sem o calendário do aparelho (showPicker), o campo de data aparece ali mesmo. */
  protected readonly jumpShown = signal(false);

  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => ({ vista: q.get('vista'), dia: q.get('dia') }))), {
    initialValue: { vista: null, dia: null },
  });

  protected readonly today = this.calendar.today;
  protected readonly now = this.calendar.time;
  protected readonly reminders = this.calendar.reminders;
  /** A vista aberta: a do endereço, ou a última deste aparelho, ou o mês. */
  protected readonly view = computed<CalendarView>(() => {
    const v = this.query().vista;
    if (isView(v)) return v;
    const last = readText(VIEW_KEY);
    return isView(last) ? last : 'mes';
  });
  /** O dia aberto (na vista do mês, o dia do teclado; o mês da folha é o dele). */
  protected readonly day = computed(() => {
    const d = this.query().dia;
    return isDay(d) ? d : this.today();
  });

  /** A folha de um lembrete aberta: o lembrete (null: um novo) e o dia de onde ela abriu. */
  protected readonly sheet = signal<{ reminder: Reminder | null; day: string } | null>(null);

  /** O nome do período aberto, na pasta. */
  protected readonly period = computed(() => {
    const d = this.day();
    switch (this.view()) {
      case 'mes':
        return cap(monthLabel(monthOf(d)));
      case 'semana':
        return cap(weekLabel(d));
      case 'dia':
        return `${cap(WEEKDAYS_LONG[weekday(d)])}, ${longDay(d)}`;
    }
  });

  protected readonly stepNames = computed(() => {
    switch (this.view()) {
      case 'mes':
        return { prev: 'Mês anterior', next: 'Próximo mês' };
      case 'semana':
        return { prev: 'Semana anterior', next: 'Próxima semana' };
      case 'dia':
        return { prev: 'Dia anterior', next: 'Próximo dia' };
    }
  });

  /** O período aberto tem o dia de hoje? (o Hoje fica marcado) */
  protected readonly showsToday = computed(() => {
    const d = this.day();
    const t = this.today();
    switch (this.view()) {
      case 'mes':
        return monthOf(d) === monthOf(t);
      case 'semana':
        return weekDays(d).includes(t);
      case 'dia':
        return d === t;
    }
  });

  protected readonly week = computed<WeekDay[]>(() => {
    const days = weekDays(this.day());
    const byDay = remindersByDay(this.reminders(), days);
    const today = this.today();
    return days.map((day) => {
      const n = Number(day.slice(8));
      const w = weekday(day);
      return {
        day,
        n,
        short: WEEKDAYS_SHORT[w],
        label: `${cap(WEEKDAYS_LONG[w])}, ${n} de ${MONTHS_LONG[Number(day.slice(5, 7)) - 1]}${day === today ? ', hoje' : ''}`,
        today: day === today,
        sunday: w === 0,
        list: byDay.get(day) ?? [],
      };
    });
  });

  /** Os lembretes do dia aberto. */
  protected readonly dayList = computed(() => remindersOn(this.reminders(), this.day()));
  protected readonly dayHead = computed(() => {
    const d = this.day();
    return { n: Number(d.slice(8)), weekday: cap(WEEKDAYS_LONG[weekday(d)]), month: monthLabel(monthOf(d)), sunday: weekday(d) === 0, today: d === this.today() };
  });
  protected readonly monthOfDay = computed(() => cap(monthLabel(monthOf(this.day()))));
  /** Nenhum lembrete ainda: a folha do mês ganha a dica de por onde começar. */
  protected readonly empty = computed(() => this.reminders().length === 0);

  constructor() {
    // a última vista fica lembrada neste aparelho
    effect(() => writeText(VIEW_KEY, this.view()));
    // o "Novo lembrete" do topo (e o N): a folha abre no dia aberto (no mês, o do teclado; sem ele, hoje)
    effect(() => {
      const ask = this.calendar.compose();
      if (!ask) return;
      untracked(() => {
        this.calendar.compose.set(null);
        this.create(ask.day ?? this.day());
      });
    });
    // ligado, o Google Agenda acompanha o Calendário aberto
    this.google.use();
    // o dia vira à meia-noite com o site aberto, e ao voltar para a aba
    const timer = setInterval(() => this.calendar.tick(), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && this.calendar.tick();
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('keydown', onKey);
    });
  }

  /** Muda a vista e o dia no endereço (`replace`: sem deixar o passo no Voltar, como o teclado na folha). */
  protected go(view: CalendarView, day: string, replace = false): void {
    void this.router.navigate([], { queryParams: { vista: view, dia: day === this.today() ? null : day }, replaceUrl: replace });
  }

  protected step(dir: 1 | -1): void {
    const d = this.day();
    const view = this.view();
    this.go(view, view === 'mes' ? addMonths(d, dir) : addDays(d, view === 'semana' ? 7 * dir : dir));
  }

  protected goToday(): void {
    this.go(this.view(), this.today());
  }

  /** As setas do calendário pequeno (no Dia): o mesmo dia no mês do lado. */
  protected shiftMonth(dir: 1 | -1): void {
    this.go('dia', addMonths(this.day(), dir), true);
  }

  protected openDay(day: string): void {
    this.go('dia', day);
  }

  /** "Ir para": o calendário do aparelho, e a data escolhida abre na vista aberta. */
  protected openJump(): void {
    const input = this.jumpInput()?.nativeElement;
    if (!input) return;
    input.value = this.day();
    try {
      input.showPicker();
    } catch {
      this.jumpShown.set(true);
      requestAnimationFrame(() => input.focus());
    }
  }

  protected jump(value: string): void {
    if (isDay(value)) this.go(this.view(), value);
  }

  protected create(day: string): void {
    this.sheet.set({ reminder: null, day });
  }

  protected edit(r: Reminder, day: string): void {
    this.sheet.set({ reminder: r, day });
  }

  /** A folha fechou (o fechar chega depois: uma folha aberta em seguida não é fechada por ele). */
  protected closeSheet(s: { reminder: Reminder | null; day: string }): void {
    if (this.sheet() === s) this.sheet.set(null);
  }

  protected read(id: string): void {
    this.desk.openReview(id);
  }

  /** Esta vez do lembrete já passou (sai riscada; ninguém marca nem desmarca). */
  protected past(r: Reminder, day: string): boolean {
    return isPast(r, day, this.today(), this.now());
  }

  /** As anotações anexadas que existem (uma apagada some da lista sem mexer no lembrete). */
  protected notesOf(r: Reminder): Review[] {
    return r.notes.map((id) => this.store.get(id)).filter((n): n is Review => !!n);
  }

  /** O pedaço de uma vez de vários dias neste dia (null num lembrete de um dia só): as tiras se emendam. */
  protected segment(r: Reminder, day: string): Segment | null {
    return spanOf(r) > 1 ? segmentOn(r, day) : null;
  }

  /**
   * Quando, neste dia, por extenso: "9h", "9h às 10h30", "Dia todo"; nos de vários dias, qual dia é e
   * de quando a quando ("Dia 2 de 3 · 20 a 22 de outubro"), com o começo no primeiro e o fim no último.
   */
  protected whenOn(r: Reminder, day: string): string {
    const seg = this.segment(r, day);
    if (!seg) return r.time ? (r.endTime ? `${timeLabel(r.time)} às ${timeLabel(r.endTime)}` : timeLabel(r.time)) : 'Dia todo';
    const parts = [`Dia ${seg.n} de ${seg.total}`, rangeLabel(seg.start, addDays(seg.start, seg.total - 1))];
    if (seg.first && r.time) parts.push(`começa às ${timeLabel(r.time)}`);
    if (seg.last && r.endTime) parts.push(`acaba às ${timeLabel(r.endTime)}`);
    return parts.join(' · ');
  }

  /** O que o leitor de tela ouve numa tira da semana. */
  protected spoken(r: Reminder, day: string): string {
    const parts = [r.title, this.segment(r, day) ? this.whenOn(r, day) : r.time ? `às ${timeLabel(r.time)}` : 'dia todo'];
    if (r.repeat) parts.push(repeatShort(r));
    if (r.quiet) parts.push('marcação, sem aviso');
    const n = this.notesOf(r).length;
    if (n) parts.push(n === 1 ? '1 anotação anexada' : `${n} anotações anexadas`);
    if (this.past(r, day)) parts.push('já passou');
    return `${parts.join(', ')}. Editar`;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || this.sheet()) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    const view = VIEWS.find((v) => v.key === key);
    if (view) this.go(view.id, this.day());
    else if (key === 't') this.goToday();
    else if (e.key === 'ArrowLeft' && !t?.closest('app-calendar-month')) this.step(-1);
    else if (e.key === 'ArrowRight' && !t?.closest('app-calendar-month')) this.step(1);
    else return;
    e.preventDefault();
  }
}

