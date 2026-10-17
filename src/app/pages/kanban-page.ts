import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CheckCheck, ChevronDown, Columns3, FilePlus, List, LucideAngularModule, Pencil, Plus, Rows2, Search, Settings, Tags, X } from 'lucide-angular';
import { map } from 'rxjs';
import { kanbanPath } from '../core/areas';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { Desk } from '../core/desk';
import { KanbanBoard, KanbanCard, MAX_COLUMNS, addColumn, belongs, boardIdFor, cardsIn, defaultColumns, resetBoard } from '../core/kanban';
import { KanbanActions } from '../core/kanban-actions';
import { KanbanStore } from '../core/kanban-store';
import { NOTES } from '../core/kinds';
import { Review, fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings as SettingsStore } from '../core/settings';
import { CardPicker } from '../ui/card-picker';
import { CategoryLabel } from '../ui/category-label';
import { KanbanBoardSheet } from '../ui/kanban-board-sheet';
import { KanbanCardSheet } from '../ui/kanban-card-sheet';
import { KanbanColumnSheet } from '../ui/kanban-column-sheet';
import { COLUMN_ICON } from '../ui/kanban-icons';
import { KanbanNote } from '../ui/kanban-note';
import { NoteSelection } from '../ui/note-selection';
import { Pin } from '../ui/pin';
import { SearchStrip } from '../ui/search-strip';
import { Toasts } from '../ui/toast';

/** O último quadro aberto, para `/anotacoes/kanban` sem quadro abrir nele. */
const LAST_KEY = 'meu-mural:kanban-aberto:v1';
/** Os quadros vistos só pelos títulos neste aparelho (os ids); os outros, nas fichas. */
const DENSE_KEY = 'meu-mural:kanban-titulos:v1';

function readDense(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DENSE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

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

/** Uma aba de quadro: a categoria, o id do quadro dela, quantas anotações ele tem e a cor da orelha. */
interface BoardTab {
  id: string;
  key: string;
  label: string;
  n: number;
  color: string | null;
  look: CategoryLook;
}

/**
 * Kanban (`/anotacoes/kanban/:quadro`): um quadro por categoria das anotações, com colunas de etapas
 * e, nelas, as anotações daquela categoria, na ficha simples (ver core/kanban.ts). As abas dos
 * quadros são as próprias categorias, com o ícone e a cor delas, como as abas do mural. Cada coluna
 * é uma tira de papel pardo presa na parede com fita crepe, com o cabeçalho dela no alto (ícone,
 * nome, quantas, e o lápis dos ajustes); as anotações ficam pregadas nela, com as tags delas na
 * ficha e a importância colada na beirada.
 *
 * Arrastar: com o mouse, depois de andar uns pixels; com o dedo, segurando um pouco parado (antes
 * disso, o dedo rola a tela). Uma cópia da ficha vai junto com o ponteiro e, no lugar onde ela cairia,
 * fica a vaga tracejada. Esc cancela. No teclado, Shift e as setas levam a anotação focada para a
 * coluna do lado ou para cima e para baixo. Quem finaliza é `KanbanActions`.
 */
@Component({
  selector: 'app-kanban-page',
  imports: [CardPicker, CategoryLabel, KanbanBoardSheet, KanbanCardSheet, KanbanColumnSheet, KanbanNote, LucideAngularModule, Pin, RouterLink, SearchStrip],
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
  protected readonly TagsIcon = Tags;
  protected readonly CardsIcon = Rows2;
  protected readonly TitlesIcon = List;
  protected readonly iconOf = COLUMN_ICON;
  protected readonly maxColumns = MAX_COLUMNS;
  protected readonly notesKind = NOTES;
  protected readonly firstColumns = defaultColumns();

  private readonly kanban = inject(KanbanStore);
  private readonly actions = inject(KanbanActions);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(SettingsStore);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly quadro = viewChild<ElementRef<HTMLElement>>('quadro');

  /** As categorias das anotações: cada uma é um quadro. */
  protected readonly categories = this.kanban.categories;
  private readonly param = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('quadro'))), { initialValue: null });
  /** A categoria do quadro aberto (a do endereço; sem ela, ou uma que sumiu, a página leva ao último ou ao primeiro). */
  protected readonly category = computed(() => this.categories().find((c) => boardIdFor(c.key) === this.param()) ?? null);
  /** O quadro aberto: o guardado da categoria, ou o de sempre (que só é guardado quando alguém mexe). */
  protected readonly board = computed<KanbanBoard | null>(() => {
    const c = this.category();
    return c ? this.kanban.boardFor(c.key) : null;
  });

  /** As abas: uma por categoria, com o ícone e a cor dela e quantas anotações o quadro tem. */
  protected readonly tabs = computed<BoardTab[]>(() => {
    const looks = this.settings.categoryLooks();
    return this.categories().map((c) => {
      const id = boardIdFor(c.key);
      const stored = this.kanban.boards().find((b) => b.id === id);
      const look = looks[c.key] ?? {};
      return { id, key: c.key, label: c.label, n: stored ? this.kanban.live(stored).length : 0, color: categoryColorHex(look.color), look };
    });
  });

  protected readonly query = signal('');
  /** A tag do filtro (sem acento nem caixa), ou "". */
  protected readonly tagFilter = signal('');
  protected readonly adding = signal<string | null>(null);
  protected readonly picking = signal(false);
  private pickColumn: string | null = null;
  protected readonly cardSheet = signal<string | null>(null);
  protected readonly columnSheet = signal<{ id: string; fresh: boolean } | null>(null);
  protected readonly boardSheet = signal<string | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  /** O que o leitor de tela ouve depois de mover pelo teclado. */
  protected readonly said = signal('');

  /** Os quadros vistos só pelos títulos (ver `setDense`). */
  private readonly denseBoards = signal<readonly string[]>(readDense());
  /** O quadro aberto na vista "Só os títulos": a tira com o nome e a importância, no lugar da ficha. */
  protected readonly dense = computed(() => {
    const b = this.board();
    return !!b && this.denseBoards().includes(b.id);
  });

  protected readonly filtering = computed(() => !!this.query().trim() || !!this.tagFilter());

  /**
   * As anotações do quadro que estão nele de verdade: existem e ainda são da categoria dele (uma
   * apagada, ou levada para outra categoria, some do quadro, sem apagar o lugar dela).
   */
  private readonly notes = computed(() => {
    const out = new Map<string, Review>();
    const b = this.board();
    if (!b) return out;
    for (const r of this.store.notes()) if (belongs(b, r)) out.set(r.id, r);
    return out;
  });
  /** As cartas do quadro com anotação à mostra. */
  private readonly live = computed(() => this.board()?.cards.filter((c) => this.notes().has(c.note)) ?? []);
  protected readonly liveCount = computed(() => this.live().length);

  /** As tags das anotações do quadro, de A a Z (a grafia mais usada), para o filtro. */
  protected readonly tagOptions = computed(() => {
    const seen = new Map<string, Map<string, number>>();
    for (const c of this.live()) {
      for (const t of this.notes().get(c.note)?.tags ?? []) {
        const k = fold(t);
        const m = seen.get(k) ?? new Map<string, number>();
        m.set(t, (m.get(t) ?? 0) + 1);
        seen.set(k, m);
      }
    }
    return [...seen]
      .map(([key, m]) => ({ key, label: [...m].reduce((a, e) => (e[1] > a[1] ? e : a))[0] }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
  });
  protected readonly tagLabel = computed(() => this.tagOptions().find((t) => t.key === this.tagFilter())?.label ?? 'Todas');

  /** As anotações que já estão no quadro: o "Buscar nota" não as mostra. */
  protected readonly onBoard = computed(() => this.live().map((c) => c.note));
  protected readonly pickerEmpty = computed(() => {
    const c = this.category();
    return c && this.liveCount() >= c.notes ? `Todas as anotações de ${c.label} já estão neste quadro.` : 'Nenhuma anotação para mostrar.';
  });

  /** As colunas como aparecem: o filtro aplicado e, arrastando, a anotação no lugar onde cairia. */
  protected readonly view = computed<ColumnView[]>(() => {
    const b = this.board();
    if (!b) return [];
    const notes = this.notes();
    const q = fold(this.query().trim());
    const tag = this.tagFilter();
    const d = this.drag();
    const shows = (c: KanbanCard) => {
      const n = notes.get(c.note);
      if (!n) return false;
      if (d?.note === c.note) return true;
      return (!q || fold(n.game.name).includes(q)) && (!tag || (n.tags ?? []).some((t) => fold(t) === tag));
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

  /**
   * Ctrl+clique marca anotações do quadro para copiar o texto delas, e Ctrl+C copia (ver
   * ui/note-selection.ts). Trocar de quadro, buscar ou filtrar desmarca; mover uma ficha não.
   */
  readonly selection = new NoteSelection({
    host: this.host,
    markable: '.lugar[data-nota]',
    idOf: (el) => el.getAttribute('data-nota'),
    on: () => !this.drag(),
    notes: this.notes,
    // (o id, e não o quadro: mexer nas fichas troca o quadro, e não deve desmarcar)
    reset: computed(() => [this.board()?.id, this.query(), this.tagFilter()].join('|')),
    layout: this.view,
  });

  constructor() {
    const destroy = inject(DestroyRef);
    // sem quadro no endereço (ou de uma categoria que sumiu): o último aberto, ou o primeiro
    effect(() => {
      const ids = this.categories().map((c) => boardIdFor(c.key));
      const id = this.param();
      if (!ids.length || (id && ids.includes(id))) return;
      untracked(() => {
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_KEY);
        } catch {
          /* sem armazenamento: o primeiro */
        }
        const to = ids.find((x) => x === last) ?? ids[0];
        void this.router.navigate([kanbanPath(to)], { replaceUrl: true });
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
        this.tagFilter.set('');
        this.adding.set(null);
      });
    });
    destroy.onDestroy(() => {
      this.kanban.openBoard.set(null);
      this.endDrag();
    });
  }

  /** Troca a vista do quadro aberto, lembrada neste aparelho (sem os quadros que não existem mais). */
  protected setDense(on: boolean): void {
    const b = this.board();
    if (!b || on === this.dense()) return;
    const alive = new Set(this.categories().map((c) => boardIdFor(c.key)));
    const next = this.denseBoards().filter((id) => id !== b.id && alive.has(id));
    if (on) next.push(b.id);
    this.denseBoards.set(next);
    try {
      localStorage.setItem(DENSE_KEY, JSON.stringify(next));
    } catch {
      /* fica só nesta visita */
    }
  }

  protected pathOf(id: string): string {
    return kanbanPath(id);
  }

  /** Nenhuma categoria ainda: o editor, para a primeira anotação (com a categoria, ela ganha o quadro). */
  protected firstNote(): void {
    this.desk.newReview();
  }

  /** Recomeça o quadro (a folha já perguntou): as três colunas de sempre e nenhuma anotação, com Desfazer. */
  protected resetBoard(id: string): void {
    const b = this.kanban.get(id);
    const label = this.category()?.label ?? '';
    if (!b) return;
    this.kanban.update(id, (board, at) => resetBoard(board, at));
    this.toasts.show(`O quadro de ${label} recomeçou`, { label: 'Desfazer', run: () => this.kanban.restore(b) });
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

  /**
   * Nova nota: o editor abre já na categoria do quadro, e a anotação salva cai no fim desta coluna
   * (ver App.onSaved).
   */
  protected createNote(column: string): void {
    const b = this.board();
    const c = this.category();
    if (!b || !c) return;
    this.adding.set(null);
    this.kanban.pending.set({ board: b.id, column });
    this.desk.newNoteIn(c.label);
  }

  protected read(id: string): void {
    this.desk.openReview(id);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.tagFilter.set('');
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
