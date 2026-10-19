import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { KanbanDeps } from '../core/kanban-deps';
import { NoteDone } from '../core/note-done';
import { Review } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { ICON, IconModule } from './icons';

let uid = 0;
/** O mouse parado no selo abre a tira depois deste tempo (passar por cima não abre nada). */
const OPEN_DELAY = 220;
/** O mouse saiu: a tira espera este tempo antes de fechar, para dar tempo de ir do selo até ela. */
const CLOSE_DELAY = 260;

/**
 * O selo das dependências de uma anotação no quadro (ver `KanbanCard.deps`): o desenho delas e quantas
 * já foram finalizadas, de quantas ("1/2"), na etiqueta de bloco da família da importância. Todas
 * finalizadas, a tinta fica verde: dá para finalizar esta.
 *
 * Com o mouse parado em cima (ou tocando, ou Enter no teclado), abre a tira de papel com as
 * dependências, presa com fita crepe como a do volume: cada uma com o check (finalizar ou abrir de
 * novo, ali mesmo), o nome (que abre a leitura) e onde ela está no quadro. A tira é um `popover`: fica
 * por cima de tudo, fora do corte da coluna, e fecha com o mouse indo embora, tocando fora ou com Esc.
 */
@Component({
  selector: 'app-kanban-deps',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.mini]': 'mini()',
    '[class.aberta]': 'open()',
    '(pointerenter)': 'enter($event)',
    '(pointerleave)': 'leave($event)',
  },
  template: `
    <button
      #chip
      type="button"
      class="selo"
      [class.prontas]="ready()"
      [attr.popovertarget]="panelId"
      [attr.aria-label]="'Dependências: ' + p().done + ' de ' + p().total + (p().total === 1 ? ' finalizada' : ' finalizadas') + '. Ver'"
      [title]="mini() ? 'Dependências: ' + p().done + ' de ' + p().total : null"
      (click)="toggle($event)"
    >
      <lucide-icon [img]="DepsIcon" [size]="mini() ? 13 : 14" aria-hidden="true" />
      <span class="conta" aria-hidden="true">{{ p().done }}/{{ p().total }}</span>
    </button>
    <div
      #panel
      class="tira-deps"
      popover="auto"
      [id]="panelId"
      role="group"
      [attr.aria-label]="'Dependências de ' + owner()"
      [class.posta]="placed()"
      (toggle)="onToggle($event)"
      (pointerenter)="enter($event)"
      (pointerleave)="leave($event)"
      (click)="$event.stopPropagation()"
      (pointerdown)="$event.stopPropagation()"
      (keydown)="$event.stopPropagation(); $event.key === 'Escape' && close()"
    >
      <span class="fita" aria-hidden="true"></span>
      <span class="cabeca">
        <span class="titulo">Depende de</span>
        <span class="numero">{{ p().done }} de {{ p().total }}</span>
      </span>
      <ul class="lista">
        @for (d of rows(); track d.note.id) {
          <li class="dep" [class.feita]="d.done" [attr.data-cor]="d.stock" [style.--stock]="'var(--stock-' + d.stock + ')'">
            <button
              type="button"
              class="caixa"
              [attr.aria-pressed]="d.done"
              [attr.aria-label]="(d.done ? 'Abrir de novo ' : 'Finalizar ') + d.note.game.name"
              [title]="d.done ? 'Abrir de novo' : 'Finalizar'"
              (click)="check(d.note)"
            >
              @if (d.done) {
                <lucide-icon [img]="CheckIcon" [size]="14" aria-hidden="true" />
              }
            </button>
            <span class="texto">
              <button type="button" class="nome" [title]="'Ler ' + d.note.game.name" (click)="read(d.note.id)">{{ d.note.game.name }}</button>
              <span class="onde">{{ d.where }}</span>
            </span>
          </li>
        }
      </ul>
      <button type="button" class="mudar" (click)="change()">
        <lucide-icon [img]="EditIcon" [size]="14" aria-hidden="true" />
        Mudar as dependências
      </button>
    </div>
  `,
  styleUrl: './kanban-deps.scss',
})
export class KanbanDepsBadge {
  /** A anotação dona das dependências (o id) e o nome dela, para o leitor de tela. */
  readonly noteId = input.required<string>();
  readonly owner = input.required<string>();
  readonly deps = input.required<readonly string[]>();
  /** O selo pequeno da vista "Só os títulos". */
  readonly mini = input(false);
  /** O nome de uma dependência: abrir a leitura dela. */
  readonly opened = output<string>();
  /** Mudar as dependências: a folha da anotação no quadro. */
  readonly edit = output<void>();

  protected readonly DepsIcon = ICON.dependencias;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly EditIcon = ICON.editar;
  protected readonly panelId = `deps-${++uid}`;
  protected readonly open = signal(false);
  protected readonly placed = signal(false);

  private readonly depsOf = inject(KanbanDeps);
  private readonly noteDone = inject(NoteDone);
  private readonly chip = viewChild.required<ElementRef<HTMLButtonElement>>('chip');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;

  protected readonly p = computed(() => this.depsOf.progress(this.deps()));
  /** Todas finalizadas: a tinta verde. */
  protected readonly ready = computed(() => this.p().done === this.p().total);

  /** Cada dependência: se está finalizada, a cartolina dela e onde ela está. */
  protected readonly rows = computed(() =>
    this.p().all.map((note) => ({ note, done: !!note.doneAt, stock: pinningFor(note.id, note.stock).stock, where: this.depsOf.whereOf(note, this.noteId()) })),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.follow(false);
    });
  }

  /** O mouse chegou no selo ou na tira: abre depois de um instante (e não fecha mais, se ia fechar). */
  protected enter(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(this.timer);
    if (!this.open()) this.timer = setTimeout(() => this.show(), OPEN_DELAY);
  }

  protected leave(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(this.timer);
    if (this.open()) this.timer = setTimeout(() => this.close(), CLOSE_DELAY);
  }

  /**
   * Toque, clique ou Enter: o selo abre ou fecha a tira (pelo `popovertarget`). Já aberta pelo mouse
   * parado em cima, o clique dele não a fecha.
   */
  protected toggle(e: Event): void {
    e.stopPropagation();
    clearTimeout(this.timer);
    if (this.open() && (e as PointerEvent).pointerType === 'mouse') e.preventDefault();
  }

  private show(): void {
    const el = this.panel().nativeElement;
    if (!el.matches(':popover-open')) el.showPopover();
  }

  close(): void {
    clearTimeout(this.timer);
    const el = this.panel().nativeElement;
    if (el.matches(':popover-open')) el.hidePopover();
  }

  protected onToggle(e: Event): void {
    const open = (e as ToggleEvent).newState === 'open';
    this.open.set(open);
    if (open) this.place();
    this.placed.set(open);
    this.follow(open);
  }

  /** Finalizar (perguntando, se ela também depende de outra aberta) ou abrir de novo uma dependência. */
  protected check(note: Review): void {
    const done = !note.doneAt;
    const ok = done ? this.depsOf.allowFinish([note.id]) : true;
    if (ok === true) this.noteDone.set(note.id, done);
    else void ok.then((yes) => yes && this.noteDone.set(note.id, done));
  }

  protected read(id: string): void {
    this.close();
    this.opened.emit(id);
  }

  protected change(): void {
    this.close();
    this.edit.emit();
  }

  /** Embaixo do selo, alinhada pela esquerda dele; sem lugar embaixo, em cima. Sempre dentro da tela. */
  private place(): void {
    const b = this.chip().nativeElement.getBoundingClientRect();
    const panel = this.panel().nativeElement;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const gap = 10;
    const edge = 8;
    const below = b.bottom + gap;
    const want = below + h <= innerHeight - edge || b.top - gap - h < edge ? below : b.top - gap - h;
    const top = Math.max(edge, Math.min(want, innerHeight - h - edge));
    const left = Math.min(Math.max(edge, b.left - 6), innerWidth - w - edge);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  private readonly onMove = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.open()) this.place();
    });
  };

  private follow(on: boolean): void {
    if (on) {
      window.addEventListener('scroll', this.onMove, { capture: true, passive: true });
      window.addEventListener('resize', this.onMove);
    } else {
      window.removeEventListener('scroll', this.onMove, { capture: true });
      window.removeEventListener('resize', this.onMove);
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }
}
