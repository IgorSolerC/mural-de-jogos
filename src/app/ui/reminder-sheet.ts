import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, input, linkedSignal, output, signal, untracked, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import {
  MAX_COUNT,
  MAX_NOTES,
  REPEATS,
  REPEAT_LABEL,
  Reminder,
  Repeat,
  TITLE_MAX,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  countEnd,
  dayAndMonth,
  isDay,
  isLastOfMonth,
  longDay,
  nextOccurrence,
  nthLabel,
  nthOf,
  occurrenceStart,
  rangeLabel,
  repeatSentence,
  repeatShort,
  sanitizeReminder,
  spanOf,
  timeLabel,
  unitLabel,
  weekday,
} from '../core/calendar';
import { MONTHS_LONG } from '../core/dates';
import { CalendarStore } from '../core/calendar-store';
import { Desk } from '../core/desk';
import { NOTES } from '../core/kinds';
import { LIGHT_STOCKS, LightStock, Review } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { CardPicker } from './card-picker';
import { Confirm } from './confirm';
import { Pin } from './pin';
import { Toasts } from './toast';

const STOCK_LABEL: Record<LightStock, string> = {
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  lilas: 'Lilás',
  rosa: 'Rosa',
  cinza: 'Cinza',
  branco: 'Branco',
};

/** Os jeitos de repetir, na ordem da cartela: o "não repete" primeiro. */
const REPEAT_OPTIONS: readonly (Repeat | 'nunca')[] = ['nunca', ...REPEATS];

/** O horário que o lembrete ganha ao sair do "dia todo". */
const FIRST_TIME = '09:00';

/** Como a repetição acaba: nunca, num dia, ou depois de N vezes. */
type EndMode = 'nunca' | 'dia' | 'vezes';

/**
 * A folha de um lembrete do Calendário (novo ou para mudar): o que lembrar, o dia, o horário (ou o dia
 * todo), como se repete (com a frase por extenso e a próxima vez), a cor da cartolina e as anotações
 * anexadas ("Anexar nota", das que já existem, ou "Escrever uma nota nova", que abre o editor e prende a
 * anotação salva aqui). Nada muda no calendário até "Salvar"; Esc, o X e Cancelar deixam como estava.
 * Apagar um lembrete que se repete pergunta se é só aquele dia ou todos, com Desfazer.
 */
@Component({
  selector: 'app-reminder-sheet',
  imports: [BackdropClose, CardPicker, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet lembrete" aria-labelledby="lb-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @let d = draft();
      <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.color + ')'" [attr.data-cor]="d.color">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="lb-titulo">{{ isNew() ? 'Novo lembrete' : 'Editar lembrete' }}</h2>
            <p class="sub">{{ whenLine() }}</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <form class="body" id="lb-form" (submit)="$event.preventDefault(); save()">
          @if (lockText(); as lt) {
            <p class="nota-google">
              {{ lt }} As anotações você prende aqui.
              @if (d.google?.link; as link) {
                <a [href]="link" target="_blank" rel="noopener noreferrer">Abrir no Google Agenda</a>
              }
            </p>
          }
          <section class="grupo" aria-labelledby="lb-nome-t">
            <h3 class="grupo-titulo" id="lb-nome-t">O que lembrar</h3>
            <label class="campo nome" [class.erro]="missing()">
              <span class="sr-only">Nome do lembrete</span>
              <input
                #nome
                type="text"
                autocomplete="off"
                enterkeyhint="done"
                placeholder="Ex.: Aniversário da Bruna"
                [maxLength]="titleMax"
                [value]="d.title"
                [readOnly]="!!locked()"
                [attr.aria-invalid]="missing() || null"
                [attr.aria-describedby]="missing() ? 'lb-nome-erro' : null"
                (input)="setTitle($any($event.target).value)"
              />
            </label>
            @if (missing()) {
              <p class="erro-msg" id="lb-nome-erro" role="alert">Falta o nome do lembrete.</p>
            }
          </section>

          <section class="grupo" aria-labelledby="lb-tipo-t">
            <h3 class="grupo-titulo" id="lb-tipo-t">Tipo</h3>
            <div class="segmentos dois" role="radiogroup" aria-labelledby="lb-tipo-t" aria-describedby="lb-tipo-d">
              <label class="segmento">
                <input type="radio" name="lb-tipo" [checked]="!d.quiet" [disabled]="!!locked()" (change)="setQuiet(false)" />
                <lucide-icon [img]="BellIcon" [size]="17" aria-hidden="true" />
                <span class="seg-nome">Lembrete</span>
              </label>
              <label class="segmento">
                <input type="radio" name="lb-tipo" [checked]="!!d.quiet" [disabled]="!!locked()" (change)="setQuiet(true)" />
                <lucide-icon [img]="QuietIcon" [size]="17" aria-hidden="true" />
                <span class="seg-nome">Marcação</span>
              </label>
            </div>
            <p class="linha-desc" id="lb-tipo-d">
              {{ d.quiet ? 'Fica marcado no calendário, sem aviso no celular.' : 'Com o Google Agenda ligado, ele avisa no celular, com os avisos da sua agenda.' }}
            </p>
          </section>

          <section class="grupo" aria-labelledby="lb-quando-t">
            <h3 class="grupo-titulo" id="lb-quando-t">Quando</h3>
            <div class="quando">
              <label class="campo data">
                <span class="campo-nome">Dia</span>
                <input type="date" required [value]="d.date" [disabled]="!!locked()" (change)="setDate($any($event.target).value)" />
              </label>
              @if (d.time) {
                <label class="campo hora">
                  <span class="campo-nome">Às</span>
                  <input type="time" required [value]="d.time" [disabled]="!!locked()" (change)="setTime($any($event.target).value)" />
                </label>
              }
            </div>
            @if (d.end || d.time) {
              <div class="quando fim">
                @if (d.end) {
                  <label class="campo data">
                    <span class="campo-nome">Até o dia</span>
                    <input type="date" required [min]="minEnd()" [value]="d.end" [disabled]="!!locked()" (change)="setEnd($any($event.target).value)" />
                  </label>
                }
                @if (d.time) {
                  <label class="campo hora">
                    <span class="campo-nome">Acaba às</span>
                    <input type="time" [value]="d.endTime ?? ''" [disabled]="!!locked()" [attr.aria-describedby]="d.end ? null : 'lb-fim-d'" (change)="setEndTime($any($event.target).value)" />
                  </label>
                }
              </div>
              @if (d.time && !d.end && !d.endTime) {
                <p class="linha-desc fim-desc" id="lb-fim-d">Sem a hora do fim, ele dura uma hora.</p>
              }
            }
            <div class="linha">
              <div class="linha-texto">
                <p class="linha-nome" id="lb-todo">Dia todo</p>
                <p class="linha-desc" id="lb-todo-d">{{ d.time ? 'Com horário, ele entra no dia na ordem das horas.' : 'Sem horário, ele fica no alto do dia.' }}</p>
              </div>
              <button type="button" class="interruptor" role="switch" [attr.aria-checked]="!d.time" [disabled]="!!locked()" aria-labelledby="lb-todo" aria-describedby="lb-todo-d" (click)="toggleAllDay()">
                <span class="bolinha"></span>
              </button>
            </div>
            <div class="linha">
              <div class="linha-texto">
                <p class="linha-nome" id="lb-varios">Vários dias</p>
                <p class="linha-desc" id="lb-varios-d">{{ d.end ? 'Ele aparece em cada dia, do primeiro ao último.' : 'Ele começa e acaba no mesmo dia.' }}</p>
              </div>
              <button type="button" class="interruptor" role="switch" [attr.aria-checked]="!!d.end" [disabled]="!!locked()" aria-labelledby="lb-varios" aria-describedby="lb-varios-d" (click)="toggleManyDays()">
                <span class="bolinha"></span>
              </button>
            </div>
          </section>

          <section class="grupo" aria-labelledby="lb-rep-t">
            <h3 class="grupo-titulo" id="lb-rep-t">Repetir</h3>
            <p class="frase" aria-live="polite">{{ sentence() }}</p>
            <div class="segmentos" role="radiogroup" aria-labelledby="lb-rep-t">
              @for (o of repeatOptions; track o) {
                <label class="segmento">
                  <input type="radio" name="lb-repetir" [checked]="(d.repeat ?? 'nunca') === o" [disabled]="!!locked()" (change)="setRepeat(o)" />
                  <span class="seg-nome">{{ repeatLabel[o] }}</span>
                </label>
              }
            </div>
            @if (d.repeat && !locked()) {
              <button type="button" class="papel personalizar-btn" [attr.aria-expanded]="custom()" aria-controls="lb-personalizar" (click)="custom.set(!custom())">
                <lucide-icon [img]="CustomIcon" [size]="16" aria-hidden="true" />
                {{ custom() ? 'Fechar o personalizar' : 'Personalizar' }}
              </button>
            }
            @if (d.repeat && custom() && !locked()) {
              <div class="personalizar" id="lb-personalizar">
                <label class="campo intervalo">
                  <span class="campo-nome">A cada</span>
                  <input type="number" inputmode="numeric" min="1" max="99" [value]="d.every ?? 1" (change)="setEvery($any($event.target).value)" />
                  <span class="unidade">{{ unit() }}</span>
                </label>

                @if (d.repeat === 'semana') {
                  <fieldset class="sub">
                    <legend class="sub-nome">Nos dias</legend>
                    <div class="dias-semana">
                      @for (w of weekdaysShort; track $index) {
                        <label class="segmento dia-semana" [title]="weekdaysLong[$index]">
                          <input type="checkbox" [checked]="weekDays().includes($index)" [attr.aria-label]="weekdaysLong[$index]" (change)="toggleDay($index)" />
                          <span class="seg-nome" aria-hidden="true">{{ w }}</span>
                        </label>
                      }
                    </div>
                  </fieldset>
                }

                @if (d.repeat === 'mes' || d.repeat === 'ano') {
                  <fieldset class="sub">
                    <legend class="sub-nome">{{ d.repeat === 'mes' ? 'Em que dia do mês' : 'Em que dia de ' + monthName() }}</legend>
                    <div class="segmentos" [class.dois]="monthModes().length === 2">
                      @for (o of monthModes(); track o.nth) {
                        <label class="segmento">
                          <input type="radio" name="lb-mes" [checked]="(d.nth ?? 0) === o.nth" (change)="setNth(o.nth)" />
                          <span class="seg-nome">{{ o.label }}</span>
                        </label>
                      }
                    </div>
                  </fieldset>
                }

                <fieldset class="sub">
                  <legend class="sub-nome">Termina</legend>
                  <div class="segmentos">
                    @for (o of endOptions; track o.id) {
                      <label class="segmento">
                        <input type="radio" name="lb-termina" [checked]="endMode() === o.id" (change)="setEndMode(o.id)" />
                        <span class="seg-nome">{{ o.label }}</span>
                      </label>
                    }
                  </div>
                  @if (endMode() === 'dia') {
                    <label class="campo data termina">
                      <span class="campo-nome">No dia</span>
                      <input type="date" [min]="d.date" [value]="d.until ?? ''" (change)="setUntil($any($event.target).value)" />
                    </label>
                  }
                  @if (endMode() === 'vezes') {
                    <label class="campo intervalo termina">
                      <span class="campo-nome">Depois de</span>
                      <input type="number" inputmode="numeric" min="1" [max]="maxCount" [value]="d.count ?? ''" (change)="setCount($any($event.target).value)" />
                      <span class="unidade">{{ d.count === 1 ? 'vez' : 'vezes' }}</span>
                    </label>
                  }
                </fieldset>
              </div>
            }
          </section>

          <section class="grupo" aria-labelledby="lb-cor-t">
            <h3 class="grupo-titulo" id="lb-cor-t">Cor</h3>
            <div class="ops" role="radiogroup" aria-labelledby="lb-cor-t">
              @for (s of stocks; track s) {
                <button
                  type="button"
                  role="radio"
                  class="op cor"
                  [style.--stock]="'var(--stock-' + s + ')'"
                  [attr.aria-checked]="d.color === s"
                  [disabled]="!!locked()"
                  [attr.aria-label]="stockLabel[s]"
                  [title]="stockLabel[s]"
                  (click)="patch({ color: s })"
                >
                  @if (d.color === s) {
                    <lucide-icon [img]="CheckIcon" [size]="18" aria-hidden="true" />
                  }
                </button>
              }
            </div>
          </section>

          <section class="grupo" aria-labelledby="lb-notas-t">
            <h3 class="grupo-titulo" id="lb-notas-t">Anotações anexadas</h3>
            @if (attached().length) {
              <ul class="anexos">
                @for (n of attached(); track n.id) {
                  <li class="anexo">
                    <span class="anexo-cor cartolina" [attr.data-cor]="stockOf(n)" [style.--stock]="'var(--stock-' + stockOf(n) + ')'" aria-hidden="true"></span>
                    <span class="anexo-texto">
                      <span class="anexo-nome">{{ n.game.name }}</span>
                      @if (n.category) {
                        <span class="anexo-cat">{{ n.category }}</span>
                      }
                    </span>
                    <button type="button" class="icon-btn tira" [attr.aria-label]="'Tirar “' + n.game.name + '” do lembrete'" [title]="'Tirar do lembrete'" (click)="detach(n.id)">
                      <lucide-icon [img]="CloseIcon" [size]="18" aria-hidden="true" />
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="sem-anexo">Prenda aqui a receita, o contador, o que for ajudar no dia.</p>
            }
            <div class="anexar">
              <button type="button" class="papel" [disabled]="d.notes.length >= maxNotes" (click)="picking.set(true)">
                <lucide-icon [img]="ClipIcon" [size]="16" aria-hidden="true" />
                Anexar nota
              </button>
              <button type="button" class="papel" [disabled]="d.notes.length >= maxNotes" (click)="writeNote()">
                <lucide-icon [img]="NewNoteIcon" [size]="16" aria-hidden="true" />
                Escrever uma nota nova
              </button>
            </div>
          </section>
        </form>

        <footer class="foot">
          @if (!isNew() && removable()) {
            <button type="button" class="papel perigo" (click)="remove()">
              <lucide-icon [img]="TrashIcon" [size]="16" aria-hidden="true" />
              Apagar
            </button>
          }
          <div class="actions">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            <button type="submit" form="lb-form" class="btn-ink">Salvar lembrete</button>
          </div>
        </footer>
      </div>
    </dialog>

    <app-card-picker
      [(open)]="picking"
      [onlyKind]="notesKind"
      [exclude]="draft().notes"
      heading="Anexar nota"
      hint="Uma anotação para prender neste lembrete. Ela continua no mural."
      footHint="Toque numa anotação para anexar."
      emptyText="Nenhuma anotação para anexar. Escreva uma nova, aqui mesmo."
      (picked)="attach($event)"
    />
  `,
  styleUrl: './reminder-sheet.scss',
})
export class ReminderSheet {
  /** O lembrete a mudar; sem ele, um novo. */
  readonly reminder = input<Reminder | null>(null);
  /** O dia de onde ela foi aberta: o dia do lembrete novo, e o "só neste dia" de apagar. */
  readonly day = input.required<string>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly ClipIcon = ICON.clipe;
  protected readonly NewNoteIcon = ICON.novaNota;
  protected readonly CustomIcon = ICON.ajustar;
  protected readonly BellIcon = ICON.avisos;
  protected readonly QuietIcon = ICON.silenciar;
  protected readonly weekdaysShort = WEEKDAYS_SHORT;
  protected readonly weekdaysLong = WEEKDAYS_LONG;
  protected readonly maxCount = MAX_COUNT;
  protected readonly stocks = LIGHT_STOCKS;
  protected readonly stockLabel = STOCK_LABEL;
  protected readonly repeatOptions = REPEAT_OPTIONS;
  protected readonly repeatLabel = REPEAT_LABEL;
  protected readonly titleMax = TITLE_MAX;
  protected readonly maxNotes = MAX_NOTES;
  protected readonly notesKind = NOTES;

  private readonly calendar = inject(CalendarStore);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nome = viewChild<ElementRef<HTMLInputElement>>('nome');

  /** O lembrete sendo escrito: só vai para o calendário no Salvar. */
  protected readonly draft = linkedSignal<Reminder>(() => this.reminder() ?? this.calendar.blank(this.day()));
  protected readonly isNew = computed(() => !this.reminder());
  protected readonly picking = signal(false);
  /** Tentou salvar sem nome. */
  protected readonly tried = signal(false);
  protected readonly missing = computed(() => this.tried() && !this.draft().title.trim());
  /** A nota nova que esta folha pediu ao editor (o número da resposta), ou null. */
  private waiting: number | null = null;

  /** As anotações anexadas que existem (uma apagada some daqui sem mexer no lembrete). */
  protected readonly attached = computed(() => this.draft().notes.map((id) => this.store.get(id)).filter((r): r is Review => !!r));

  /** Embaixo do título: o dia (ou de quando a quando) por extenso, o horário e, ligado, que está no Google Agenda. */
  protected readonly whenLine = computed(() => {
    const d = this.draft();
    const many = spanOf(d) > 1;
    const days = many ? `De ${rangeLabel(d.date, d.end!)}` : `${WEEKDAYS_LONG[weekday(d.date)]}, ${longDay(d.date)}`;
    const end = d.endTime ? (many ? `, acaba às ${timeLabel(d.endTime)}` : ` às ${timeLabel(d.endTime)}`) : '';
    const hours = d.time ? `${many ? 'começa às ' : ''}${timeLabel(d.time)}${end}` : '';
    const when = hours ? `${days} · ${hours}` : days;
    return d.google ? `${when} · No Google Agenda` : when;
  });

  /** Um evento do Google que o Murall não pode mudar (convite, repetição só do Google, tipo especial). */
  protected readonly locked = computed(() => this.draft().google?.lock ?? null);
  /** Apagar dá num evento seu, mesmo de uma repetição que só o Google muda; um convite ou um aniversário, não. */
  protected readonly removable = computed(() => !this.locked());

  /** O personalizar da repetição aberto: começa aberto num lembrete que já repete de um jeito personalizado. */
  protected readonly custom = linkedSignal(() => {
    const r = this.reminder();
    return !!r && (!!r.every || !!r.days?.length || !!r.nth || !!r.strict || !!r.until || !!r.count);
  });
  /** "semana" ou "semanas", para o "a cada". */
  protected readonly unit = computed(() => {
    const d = this.draft();
    return d.repeat ? unitLabel(d.repeat, d.every ?? 1) : '';
  });
  /** Os dias da semana em que ele acontece (sem os dias escolhidos, o do começo). */
  protected readonly weekDays = computed(() => {
    const d = this.draft();
    return d.days?.length ? d.days : [weekday(d.date)];
  });
  protected readonly monthName = computed(() => MONTHS_LONG[Number(this.draft().date.slice(5, 7)) - 1]);
  /** No mês: o dia do mês, a vez do dia da semana ("na terceira terça") e, se for, a última. */
  protected readonly monthModes = computed(() => {
    const date = this.draft().date;
    const n = nthOf(date);
    const male = [0, 6].includes(weekday(date));
    const modes: { nth: number; label: string }[] = [{ nth: 0, label: `No dia ${Number(date.slice(8))}` }];
    if (n < 5) modes.push({ nth: n, label: `${male ? 'No' : 'Na'} ${nthLabel(date, n, false)}` });
    if (isLastOfMonth(date)) modes.push({ nth: -1, label: `${male ? 'No' : 'Na'} ${nthLabel(date, -1, false)}` });
    return modes;
  });
  protected readonly endOptions: readonly { id: EndMode; label: string }[] = [
    { id: 'nunca', label: 'Nunca' },
    { id: 'dia', label: 'Num dia' },
    { id: 'vezes', label: 'Depois de' },
  ];
  protected readonly endMode = computed<EndMode>(() => {
    const d = this.draft();
    return d.count ? 'vezes' : d.until ? 'dia' : 'nunca';
  });
  /** O último dia vem depois do primeiro. */
  protected readonly minEnd = computed(() => addDays(this.draft().date, 1));
  protected readonly lockText = computed(() => {
    switch (this.locked()) {
      case 'convite':
        return 'Este evento é um convite de outra pessoa no Google Agenda: só quem convidou muda.';
      case 'google':
        return 'Este é um evento especial do Google Agenda: só dá para mudar lá.';
      default:
        return null;
    }
  });

  /** Como se repete, por extenso, e quando é a próxima vez (se não for o próprio dia). */
  protected readonly sentence = computed(() => {
    const d = this.draft();
    const base = repeatSentence(d.repeat, d.date, d);
    if (!d.repeat) return base;
    const next = nextOccurrence(d, this.calendar.today());
    return next && next !== d.date ? `${base} Próxima vez: ${WEEKDAYS_LONG[weekday(next)]}, ${longDay(next)}.` : base;
  });

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      const input = this.nome()?.nativeElement;
      if (this.isNew() && input) input.focus();
      else this.dialog().nativeElement.querySelector<HTMLElement>('.fecha')?.focus();
    });
    // a anotação escrita a pedido desta folha: presa aqui assim que é salva
    effect(() => {
      const made = this.calendar.createdNote();
      if (!made || made.token !== this.waiting) return;
      untracked(() => {
        this.waiting = null;
        this.calendar.createdNote.set(null);
        this.attachId(made.id);
      });
    });
  }

  protected patch(p: Partial<Reminder>): void {
    this.put({ ...this.draft(), ...p });
  }

  /**
   * Toda mudança passa aqui: o que não vale para o jeito de repetir sai (os dias da semana fora da
   * semana, a vez do mês fora do mês e do ano), a vez acompanha o dia ("a terceira terça" de outro
   * dia), e o "depois de N vezes" recalcula o último dia.
   */
  private put(next: Reminder): void {
    const r: Reminder = { ...next };
    const drop = (...keys: (keyof Reminder)[]) => keys.forEach((k) => delete r[k]);
    if (!r.repeat) drop('every', 'days', 'nth', 'strict', 'weekStart', 'until', 'count');
    if (r.repeat !== 'semana') drop('days', 'weekStart');
    if (r.repeat !== 'mes' && r.repeat !== 'ano') drop('nth', 'strict');
    if (r.nth) r.nth = r.nth === -1 && isLastOfMonth(r.date) ? -1 : nthOf(r.date) === 5 ? -1 : nthOf(r.date);
    if (r.strict && Number(r.date.slice(8)) < 29) drop('strict');
    if (r.until && r.until < r.date) drop('until');
    if (r.count) {
      const last = countEnd(r, r.count);
      if (last) r.until = last;
      else drop('count', 'until');
    }
    this.draft.set(r);
  }

  protected setTitle(v: string): void {
    this.patch({ title: v.slice(0, TITLE_MAX) });
  }

  /** Mudar o primeiro dia leva o último junto (cada vez continua com os mesmos dias). */
  protected setDate(v: string): void {
    if (!isDay(v)) return;
    const d = this.draft();
    this.patch(d.end ? { date: v, end: addDays(v, spanOf(d) - 1) } : { date: v });
  }

  protected setTime(v: string): void {
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    const d = this.draft();
    // no mesmo dia, o fim que ficou antes do começo sai (volta a durar uma hora)
    if (!d.end && d.endTime && d.endTime <= v) {
      const { endTime: _, ...rest } = d;
      this.put({ ...rest, time: v });
    } else this.patch({ time: v });
  }

  protected setEnd(v: string): void {
    if (isDay(v) && v > this.draft().date) this.patch({ end: v });
  }

  /** A hora do fim; vazia, sai (um dia só dura uma hora; vários dias vão até o fim do último). */
  protected setEndTime(v: string): void {
    const d = this.draft();
    if (/^\d{2}:\d{2}$/.test(v) && (d.end || (d.time && v > d.time))) {
      this.patch({ endTime: v });
      return;
    }
    const { endTime: _, ...rest } = d;
    this.put(rest);
  }

  protected toggleAllDay(): void {
    const d = this.draft();
    if (d.time) {
      const { time: _, endTime: __, ...rest } = d;
      this.put(rest);
    } else this.patch({ time: FIRST_TIME });
  }

  /** Vários dias: o último começa no dia seguinte (com horário, acabando na mesma hora). */
  protected toggleManyDays(): void {
    const d = this.draft();
    if (d.end) {
      const { end: _, endTime, ...rest } = d;
      this.put(endTime && d.time && endTime > d.time ? { ...rest, endTime } : rest);
    } else this.patch({ end: addDays(d.date, 1), ...(d.time ? { endTime: d.endTime ?? d.time } : {}) });
  }

  /** Outro jeito de repetir recomeça o personalizar (o "a cada", os dias, a vez); o fim fica. */
  protected setRepeat(o: Repeat | 'nunca'): void {
    const { repeat: _, every: __, days: ___, nth: ____, strict: _____, weekStart: ______, ...rest } = this.draft();
    this.put(o === 'nunca' ? rest : { ...rest, repeat: o });
  }

  protected setEvery(v: string): void {
    const n = Math.round(Number(v));
    const { every: _, ...rest } = this.draft();
    this.put(Number.isFinite(n) && n > 1 ? { ...rest, every: Math.min(99, n) } : rest);
  }

  /** Um dia da semana a mais ou a menos (sempre fica um; só o do começo é o de sempre). */
  protected toggleDay(w: number): void {
    const d = this.draft();
    const now = this.weekDays();
    const next = now.includes(w) ? now.filter((x) => x !== w) : [...now, w].sort();
    if (!next.length) return;
    const { days: _, ...rest } = d;
    this.put(next.length === 1 && next[0] === weekday(d.date) ? rest : { ...rest, days: next });
  }

  /** O dia no mês: o número (0), a vez do dia da semana (1 a 5) ou a última (-1). */
  protected setNth(nth: number): void {
    const { nth: _, ...rest } = this.draft();
    this.put(nth ? { ...rest, nth } : rest);
  }

  protected setEndMode(mode: EndMode): void {
    const { until: _, count: __, ...rest } = this.draft();
    if (mode === 'nunca') this.put(rest);
    else if (mode === 'vezes') this.put({ ...rest, count: 10 });
    // num dia: um mês depois do começo, para começar
    else this.put({ ...rest, until: addMonths(rest.date, rest.repeat === 'ano' ? 60 : rest.repeat === 'mes' ? 12 : 1) });
  }

  protected setUntil(v: string): void {
    if (isDay(v) && v >= this.draft().date) this.patch({ until: v });
  }

  protected setCount(v: string): void {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 1) this.patch({ count: Math.min(MAX_COUNT, n) });
  }

  protected setQuiet(quiet: boolean): void {
    const { quiet: _, ...rest } = this.draft();
    this.put(quiet ? { ...rest, quiet: true } : rest);
  }

  protected stockOf(r: Review): string {
    return pinningFor(r.id, r.stock).stock;
  }

  protected attach(r: Review): void {
    this.attachId(r.id);
  }

  private attachId(id: string): void {
    const d = this.draft();
    if (d.notes.includes(id) || d.notes.length >= MAX_NOTES) return;
    this.patch({ notes: [...d.notes, id] });
  }

  protected detach(id: string): void {
    this.patch({ notes: this.draft().notes.filter((n) => n !== id) });
  }

  /** O editor de anotações, com o nome do lembrete de título: a anotação salva é presa aqui. */
  protected writeNote(): void {
    this.waiting = this.calendar.askNote();
    this.desk.newNote(this.draft().title.trim());
  }

  protected save(): void {
    const d = this.draft();
    const title = d.title.replace(/\s+/g, ' ').trim();
    if (!title) {
      this.tried.set(true);
      this.nome()?.nativeElement.focus();
      return;
    }
    // os dias tirados só valem num lembrete que se repete; o fim, quando vem depois do começo
    const clean = sanitizeReminder({ ...d, title, skip: d.repeat ? d.skip : [] }) ?? { ...d, title };
    this.calendar.save({ ...clean, notes: d.notes });
    this.toasts.show(this.isNew() ? `“${title}” marcado para ${dayAndMonth(d.date)}${d.repeat ? ` (${repeatShort(d)})` : ''}` : 'Lembrete atualizado');
    this.close();
  }

  protected async remove(): Promise<void> {
    const before = this.reminder();
    if (!before) return;
    const name = `“${before.title}”`;
    // a vez aberta: num de vários dias, a que passa pelo dia de onde a folha abriu
    const day = occurrenceStart(before, this.day());
    if (before.repeat && day) {
      const many = spanOf(before) > 1;
      const which = many ? `a de ${rangeLabel(day, addDays(day, spanOf(before) - 1))}` : `o de ${dayAndMonth(day)}`;
      const choice = await this.confirm.choose({
        title: 'Apagar o lembrete?',
        text: `${name} se repete (${repeatShort(before)}). Apagar só ${which}, ou ${many ? 'todas' : 'todos'}?`,
        confirm: many ? 'Apagar todas' : 'Apagar todos',
        secondary: many ? 'Só esta vez' : 'Só neste dia',
      });
      if (!choice) return;
      if (choice === 'secondary') {
        this.calendar.skipDay(before.id, day);
        this.toasts.show(many ? `${name} saiu de ${rangeLabel(day, addDays(day, spanOf(before) - 1))}` : `${name} saiu de ${dayAndMonth(day)}`, {
          label: 'Desfazer',
          run: () => this.calendar.restore(before),
        });
        this.close();
        return;
      }
    } else {
      const sure = await this.confirm.ask({ title: 'Apagar o lembrete?', text: `${name} sai do calendário. As anotações anexadas continuam no mural.`, confirm: 'Apagar' });
      if (!sure) return;
    }
    this.calendar.remove(before.id);
    this.toasts.show(`${name} saiu do calendário`, { label: 'Desfazer', run: () => this.calendar.restore(before) });
    this.close();
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
