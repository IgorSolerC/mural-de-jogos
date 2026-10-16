import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CheckCheck, ChevronDown, Columns3, FilePlus, LucideAngularModule, Pencil, Plus, Search, Settings, SquareKanban, Tags, X } from 'lucide-angular';
import { map } from 'rxjs';
import { kanbanPath } from '../core/areas';
import { Desk } from '../core/desk';
import { KanbanBoard, KanbanCard, MAX_BOARDS, MAX_COLUMNS, NAME_MAX, addColumn, cardsIn, defaultColumns } from '../core/kanban';
import { KanbanActions } from '../core/kanban-actions';
import { KanbanStore } from '../core/kanban-store';
import { NOTES } from '../core/kinds';
import { Review, fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CardPicker } from '../ui/card-picker';
import { KanbanBoardSheet } from '../ui/kanban-board-sheet';
import { KanbanCardSheet } from '../ui/kanban-card-sheet';
import { KanbanColumnSheet } from '../ui/kanban-column-sheet';
import { COLUMN_ICON } from '../ui/kanban-icons';
import { KanbanNote } from '../ui/kanban-note';
import { Pin } from '../ui/pin';
import { SearchStrip } from '../ui/search-strip';
import { Toasts } from '../ui/toast';

/** O último quadro aberto, para `/anotacoes/kanban` sem quadro abrir nele. */
const LAST_KEY = 'meu-mural:kanban-aberto:v1';

/** Quanto o ponteiro anda antes de virar arrastar (o mouse); o dedo segura `HOLD` ms parado. */
const SLOP = 6;
const HOLD = 280;
const TOUCH_SLOP = 10;
/** A faixa perto da beirada onde o quadro (ou a página) rola sozinho enquanto se arrasta. */
const EDGE = 70;

/** Uma anotação numa coluna, como aparece: a ficha, o lugar no quadro e se é a que está sendo arrastada. */
interface Item {
  card: KanbanCard;
  note: Review;
  dragged: boolean;
}

interface ColumnView {
  col: KanbanBoard['columns'][number];
  items: Item[];
  /** Quantas anotações a coluna tem de verdade (com o filtro, mostra menos). */
  total: number;
}

/** O arrastar em andamento: qual anotação, de onde, e onde ela cairia agora. */
interface Drag {
  note: string;
  from: string;
  over: string;
  /** A posição entre as anotações à mostra da coluna `over`. */
  index: number;
  /** A altura da ficha, para a vaga do mesmo tamanho. */
  height: number;
}

/**
 * Kanban (`/anotacoes/kanban/:quadro`): quadros com colunas de etapas e, nelas, as suas anotações,
 * na ficha simples (ver core/kanban.ts). Cada coluna é uma tira de papel pardo presa na parede com
 * fita crepe, com a etiqueta de cartolina dela no alto (ícone, nome, quantas, e o lápis dos ajustes);
 * as anotações ficam pregadas nela, com a importância e as características coladas na beirada.
 *
 * Arrastar: com o mouse, depois de andar uns pixels; com o dedo, segurando um pouco parado (antes
 * disso, o dedo rola a tela). Uma cópia da ficha vai junto com o ponteiro e, no lugar onde ela cairia,
 * fica a vaga tracejada. Esc cancela. No teclado, Shift e as setas levam a anotação focada para a
 * coluna do lado ou para cima e para baixo. Quem finaliza é `KanbanActions`.
 */
@Component({
  selector: 'app-kanban-page',
  imports: [CardPicker, KanbanBoardSheet, KanbanCardSheet, KanbanColumnSheet, KanbanNote, LucideAngularModule, Pin, RouterLink, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kanban-page.html',
  styleUrl: './kanban-page.scss',
})
export class KanbanPage {
  protected readonly PlusIcon = Plus;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly SettingsIcon = Settings;
  protected readonly PencilIcon = Pencil;
  protected readonly DoneIcon = CheckCheck;
  protected readonly SearchIcon = Search;
  protected readonly NewNoteIcon = FilePlus;
  protected readonly CloseIcon = X;
  protected readonly ColumnIcon = Columns3;
  protected readonly BoardIcon = SquareKanban;
  protected readonly TagsIcon = Tags;
  protected readonly iconOf = COLUMN_ICON;
  protected readonly maxBoards = MAX_BOARDS;
  protected readonly maxColumns = MAX_COLUMNS;
  protected readonly nameMax = NAME_MAX;
  protected readonly notesKind = NOTES;
  protected readonly firstColumns = defaultColumns();

  private readonly kanban = inject(KanbanStore);
  private readonly actions = inject(KanbanActions);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly quadro = viewChild<ElementRef<HTMLElement>>('quadro');

  protected readonly boards = this.kanban.boards;
  private readonly param = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('quadro'))), { initialValue: null });
  /** O quadro aberto: o do endereço, ou (sem ele, ou um que não existe mais) o último aberto ou o primeiro. */
  protected readonly board = computed<KanbanBoard | null>(() => {
    const list = this.boards();
    return list.find((b) => b.id === this.param()) ?? null;
  });

  protected readonly query = signal('');
  protected readonly traitFilter = signal('');
  protected readonly firstName = signal('');
  protected readonly adding = signal<string | null>(null);
  protected readonly picking = signal(false);
  private pickColumn: string | null = null;
  protected readonly cardSheet = signal<string | null>(null);
  protected readonly columnSheet = signal<{ id: string; fresh: boolean } | null>(null);
  protected readonly boardSheet = signal<string | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  /** O que o leitor de tela ouve depois de mover pelo teclado. */
  protected readonly said = signal('');

  protected readonly filtering = computed(() => !!this.query().trim() || !!this.traitFilter());
  protected readonly traitLabel = computed(() => this.board()?.traits.find((t) => t.id === this.traitFilter())?.name ?? 'Todas');

  /** As anotações do quadro que existem (uma apagada some do quadro, sem apagar o lugar dela). */
  private readonly notes = computed(() => {
    const out = new Map<string, Review>();
    for (const r of this.store.notes()) out.set(r.id, r);
    return out;
  });

  /** As anotações que já estão no quadro: o "Buscar nota" não as mostra. */
  protected readonly onBoard = computed(() => this.board()?.cards.map((c) => c.note) ?? []);
  protected readonly pickerEmpty = computed(() =>
    this.store.notes().length ? 'Todas as suas anotações já estão neste quadro.' : 'Você ainda não tem anotações. Crie uma com Nova nota.',
  );

  /** As colunas como aparecem: o filtro aplicado e, arrastando, a anotação no lugar onde cairia. */
  protected readonly view = computed<ColumnView[]>(() => {
    const b = this.board();
    if (!b) return [];
    const notes = this.notes();
    const q = fold(this.query().trim());
    const trait = this.traitFilter();
    const d = this.drag();
    const shows = (c: KanbanCard) => {
      const n = notes.get(c.note);
      if (!n) return false;
      if (d?.note === c.note) return true;
      return (!q || fold(n.game.name).includes(q)) && (!trait || c.traits.includes(trait));
    };
    const out = b.columns.map((col) => {
      const all = cardsIn(b, col.id).filter((c) => notes.has(c.note));
      const items = all.filter((c) => shows(c) && c.note !== d?.note).map((card) => ({ card, note: notes.get(card.note)!, dragged: false }));
      return { col, items, total: all.length };
    });
    if (d) {
      const card = b.cards.find((c) => c.note === d.note);
      const target = out.find((v) => v.col.id === d.over);
      const note = notes.get(d.note);
      if (card && target && note) target.items.splice(Math.min(d.index, target.items.length), 0, { card, note, dragged: true });
    }
    return out;
  });
  protected readonly shownCount = computed(() => this.view().reduce((n, v) => n + v.items.length, 0));

  constructor() {
    const destroy = inject(DestroyRef);
    // sem quadro no endereço (ou um que sumiu): o último aberto, ou o primeiro
    effect(() => {
      const list = this.boards();
      const id = this.param();
      if (!list.length || (id && list.some((b) => b.id === id))) return;
      untracked(() => {
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_KEY);
        } catch {
          /* sem armazenamento: o primeiro */
        }
        const to = list.find((b) => b.id === last) ?? list[0];
        void this.router.navigate([kanbanPath(to.id)], { replaceUrl: true });
      });
    });
    effect(() => {
      const b = this.board();
      this.kanban.openBoard.set(b?.id ?? null);
      if (!b) return;
      try {
        localStorage.setItem(LAST_KEY, b.id);
      } catch {
        /* fica sem lembrar */
      }
    });
    // trocou de quadro: o filtro e o que estava aberto eram do outro
    effect(() => {
      this.board()?.id;
      untracked(() => {
        this.traitFilter.set('');
        this.adding.set(null);
      });
    });
    destroy.onDestroy(() => {
      this.kanban.openBoard.set(null);
      this.endDrag();
    });
  }

  protected pathOf(id: string): string {
    return kanbanPath(id);
  }

  protected createFirst(): void {
    const id = this.kanban.create(this.firstName().trim() || 'Meu quadro');
    this.firstName.set('');
    if (id) void this.router.navigate([kanbanPath(id)]);
  }

  /** Um quadro novo, aberto com os ajustes para dar o nome. */
  protected newBoard(): void {
    const id = this.kanban.create(`Quadro ${this.boards().length + 1}`);
    if (!id) return;
    void this.router.navigate([kanbanPath(id)]).then(() => this.boardSheet.set(id));
  }

  /** Apaga o quadro (a folha já perguntou), com Desfazer. */
  protected removeBoard(id: string): void {
    const index = this.boards().findIndex((b) => b.id === id);
    const b = this.kanban.get(id);
    if (!b) return;
    this.kanban.remove(id);
    this.toasts.show(`O quadro ${b.name} foi apagado`, {
      label: 'Desfazer',
      run: () => {
        this.kanban.restore(b, index);
        void this.router.navigate([kanbanPath(b.id)]);
      },
    });
  }

  /** Uma coluna nova no fim, aberta com os ajustes para dar o nome. */
  protected newColumn(): void {
    const b = this.board();
    if (!b) return;
    let id = '';
    this.kanban.update(b.id, (board, at) => {
      const r = addColumn(board, 'Nova coluna', at);
      id = r.id;
      return r.board;
    });
    if (!id) return;
    this.columnSheet.set({ id, fresh: true });
    // a coluna nova aparece no fim do quadro: rola até ela
    requestAnimationFrame(() => this.host.querySelector(`[data-coluna="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }));
  }

  protected openAdd(column: string): void {
    this.adding.set(column);
    requestAnimationFrame(() => this.host.querySelector<HTMLElement>(`[data-coluna="${column}"] .adicionar-op`)?.focus());
  }

  protected searchNote(column: string): void {
    this.pickColumn = column;
    this.adding.set(null);
    this.picking.set(true);
  }

  protected placePicked(r: Review): void {
    const b = this.board();
    const col = this.pickColumn;
    this.pickColumn = null;
    if (!b || !col) return;
    this.actions.move(b.id, r.id, col);
    this.desk.land(r.id);
  }

  /** Nova nota: o editor abre, e a anotação salva cai no fim desta coluna (ver App.onSaved). */
  protected createNote(column: string): void {
    const b = this.board();
    if (!b) return;
    this.adding.set(null);
    this.kanban.pending.set({ board: b.id, column });
    this.desk.newPlainNote();
  }

  protected read(id: string): void {
    this.desk.openReview(id);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.traitFilter.set('');
  }

  // ===== Teclado: Shift e as setas =====

  protected onKey(e: KeyboardEvent, note: string, column: string): void {
    if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || !e.key.startsWith('Arrow')) return;
    // num campo (o texto de uma tarefa), Shift e as setas selecionam texto
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const b = this.board();
    if (!b) return;
    const cols = b.columns;
    const ci = cols.findIndex((c) => c.id === column);
    const list = cardsIn(b, column);
    const at = list.findIndex((c) => c.note === note);
    let to = column;
    let index = at;
    if (e.key === 'ArrowLeft') {
      if (ci <= 0) return;
      to = cols[ci - 1].id;
      index = Math.min(at, cardsIn(b, to).length);
    } else if (e.key === 'ArrowRight') {
      if (ci >= cols.length - 1) return;
      to = cols[ci + 1].id;
      index = Math.min(at, cardsIn(b, to).length);
    } else if (e.key === 'ArrowUp') {
      if (at <= 0) return;
      index = at - 1;
    } else if (e.key === 'ArrowDown') {
      if (at >= list.length - 1) return;
      index = at + 1;
    } else return;
    e.preventDefault();
    this.actions.move(b.id, note, to, index);
    const col = cols.find((c) => c.id === to)!;
    const n = this.store.get(note)?.game.name ?? 'A anotação';
    this.said.set(`${n}: ${col.name}, ${index + 1} de ${cardsIn(this.board()!, to).length}.`);
    // a ficha foi redesenhada em outro lugar: o foco vai com ela
    requestAnimationFrame(() => this.host.querySelector<HTMLElement>(`[data-nota="${note}"] .hit`)?.focus());
  }

  // ===== Puxar o quadro com o mouse (no papel vazio): ele rola para o lado =====

  protected readonly panning = signal(false);

  protected onBoardDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0 || this.drag()) return;
    if ((e.target as HTMLElement).closest('.lugar, .etiqueta, .adicionar, button, a, input, select, label')) return;
    const q = this.quadro()?.nativeElement;
    if (!q || q.scrollWidth <= q.clientWidth) return;
    const x0 = e.clientX;
    const left0 = q.scrollLeft;
    e.preventDefault();
    this.panning.set(true);
    const move = (ev: PointerEvent) => (q.scrollLeft = left0 - (ev.clientX - x0));
    const up = () => {
      this.panning.set(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ===== Arrastar: mouse, caneta e dedo =====

  private start: { x: number; y: number; note: string; column: string; el: HTMLElement; touch: boolean; id: number } | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private ghost: HTMLElement | null = null;
  /** Onde o ponteiro pegou a ficha, em relação ao canto dela. */
  private grab = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0 };
  private frame = 0;
  private readonly listeners: (() => void)[] = [];

  protected onPointerDown(e: PointerEvent, note: string, column: string): void {
    if (this.drag() || e.button !== 0 || !e.isPrimary) return;
    const target = e.target as HTMLElement;
    // as etiquetas, o botão delas e as caixinhas das tarefas são deles
    if (target.closest('.pe, input, label, a, select, textarea')) return;
    const el = e.currentTarget as HTMLElement;
    const touch = e.pointerType === 'touch';
    this.start = { x: e.clientX, y: e.clientY, note, column, el, touch, id: e.pointerId };
    this.pointer = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => this.onPointerMove(ev);
    const up = (ev: PointerEvent) => this.onPointerUp(ev);
    const cancel = () => this.endDrag();
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && this.drag()) {
        ev.preventDefault();
        this.endDrag();
      }
    };
    // enquanto arrasta com o dedo, a tela não rola (o toque segue com o arrastar)
    const touchmove = (ev: TouchEvent) => {
      if (this.drag()) ev.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('touchmove', touchmove, { passive: false });
    // segurar o dedo não abre o menu do navegador no meio do arrastar
    const menu = (ev: Event) => {
      if (this.drag()) ev.preventDefault();
    };
    window.addEventListener('contextmenu', menu);
    this.listeners.push(() => window.removeEventListener('contextmenu', menu));
    this.listeners.push(
      () => window.removeEventListener('pointermove', move),
      () => window.removeEventListener('pointerup', up),
      () => window.removeEventListener('pointercancel', cancel),
      () => window.removeEventListener('keydown', key, true),
      () => window.removeEventListener('touchmove', touchmove),
    );
    if (touch) this.holdTimer = setTimeout(() => this.begin(), HOLD);
  }

  private onPointerMove(e: PointerEvent): void {
    const s = this.start;
    if (!s || e.pointerId !== s.id) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    if (!this.drag()) {
      const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      // o dedo andou antes de segurar: é rolar a tela, não arrastar
      if (s.touch) {
        if (dist > TOUCH_SLOP) this.endDrag();
        return;
      }
      if (dist < SLOP) return;
      this.begin();
    }
    e.preventDefault();
    this.follow();
  }

  /** Começa a arrastar: a cópia da ficha sai da coluna com o ponteiro, e a vaga fica no lugar dela. */
  private begin(): void {
    const s = this.start;
    const b = this.board();
    if (!s || !b || this.drag()) return;
    const card = s.el.querySelector<HTMLElement>('app-kanban-note');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    this.grab = { x: s.x - rect.left, y: s.y - rect.top };
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('kanban-fantasma');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('data-ficha');
    Object.assign(ghost.style, { width: `${rect.width}px`, left: '0px', top: '0px' });
    this.host.appendChild(ghost);
    this.ghost = ghost;
    const index = this.view()
      .find((v) => v.col.id === s.column)!
      .items.findIndex((it) => it.card.note === s.note);
    this.drag.set({ note: s.note, from: s.column, over: s.column, index: Math.max(0, index), height: rect.height });
    document.documentElement.classList.add('kanban-arrastando');
    if (s.touch) navigator.vibrate?.(12);
    this.follow();
    this.scrollLoop();
  }

  /** A cópia segue o ponteiro; a vaga vai para a coluna e a posição embaixo dele. */
  private follow(): void {
    const d = this.drag();
    if (!d || !this.ghost) return;
    const { x, y } = this.pointer;
    this.ghost.style.translate = `${x - this.grab.x}px ${y - this.grab.y}px`;
    const col = this.columnAt(x);
    if (!col) return;
    const id = col.dataset['coluna']!;
    // as fichas à mostra da coluna (sem a vaga): cai antes da primeira cujo meio está abaixo do ponteiro
    const lis = Array.from(col.querySelectorAll<HTMLElement>('.fichas > .lugar:not(.vaga)'));
    let index = lis.length;
    for (let i = 0; i < lis.length; i++) {
      const r = lis[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    if (d.over !== id || d.index !== index) this.drag.set({ ...d, over: id, index });
  }

  /** A coluna na altura do ponteiro (pelo x: entre duas, a mais perto). */
  private columnAt(x: number): HTMLElement | null {
    const cols = Array.from(this.host.querySelectorAll<HTMLElement>('.coluna'));
    let best: HTMLElement | null = null;
    let dist = Infinity;
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return best;
  }

  /** Perto da beirada, o quadro rola para o lado e a página para cima ou para baixo. */
  private scrollLoop(): void {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (!this.drag()) return;
      const { x, y } = this.pointer;
      const q = this.quadro()?.nativeElement;
      const speed = (d: number) => Math.round(((EDGE - d) / EDGE) * 18);
      let moved = false;
      if (q) {
        const r = q.getBoundingClientRect();
        if (x < r.left + EDGE && q.scrollLeft > 0) {
          q.scrollLeft -= speed(Math.max(0, x - r.left));
          moved = true;
        } else if (x > r.right - EDGE && q.scrollLeft < q.scrollWidth - q.clientWidth) {
          q.scrollLeft += speed(Math.max(0, r.right - x));
          moved = true;
        }
      }
      if (y < EDGE) {
        window.scrollBy(0, -speed(Math.max(0, y)));
        moved = true;
      } else if (y > innerHeight - EDGE) {
        window.scrollBy(0, speed(Math.max(0, innerHeight - y)));
        moved = true;
      }
      if (moved) this.follow();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private onPointerUp(e: PointerEvent): void {
    const s = this.start;
    const d = this.drag();
    if (!s || e.pointerId !== s.id) return;
    if (d) {
      // o clique que vem depois de soltar não abre a anotação
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      this.drop(d);
    }
    this.endDrag();
  }

  /** Solta: a posição entre as à mostra vira a posição entre todas da coluna (o filtro esconde algumas). */
  private drop(d: Drag): void {
    const b = this.board();
    if (!b) return;
    const shown = this.view().find((v) => v.col.id === d.over)?.items.filter((it) => !it.dragged) ?? [];
    const before = shown[d.index]?.card.note;
    const all = cardsIn(b, d.over).filter((c) => c.note !== d.note);
    const index = before ? all.findIndex((c) => c.note === before) : all.length;
    this.actions.move(b.id, d.note, d.over, index < 0 ? undefined : index);
    const n = this.store.get(d.note)?.game.name ?? 'A anotação';
    const col = b.columns.find((c) => c.id === d.over);
    this.said.set(`${n}: ${col?.name ?? ''}.`);
  }

  private endDrag(): void {
    clearTimeout(this.holdTimer);
    cancelAnimationFrame(this.frame);
    for (const off of this.listeners.splice(0)) off();
    this.ghost?.remove();
    this.ghost = null;
    this.start = null;
    if (this.drag()) this.drag.set(null);
    document.documentElement.classList.remove('kanban-arrastando');
  }
}
