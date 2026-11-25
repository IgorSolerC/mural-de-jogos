import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Desk } from '../core/desk';
import { FreeBoard } from '../core/free-board';
import { Camera } from '../core/free-board-geometry';
import { FreeBoardNoteAsk } from '../core/free-board-note-ask';
import { FreeBoardProblem, FreeBoardStore } from '../core/free-board-store';
import { FreeBoardSync } from '../core/free-board-sync';
import { ImageStore } from '../core/image-store';
import { hasTransparency } from '../core/images';
import { NOTES } from '../core/kinds';
import { NoteLinks } from '../core/note-links';
import { Review, isCanvas } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { DEFAULT_TABLE_LOOK, readTable, tableText } from '../core/tables';
import { WidgetSize, parseWidgetLine, widgetDef, widgetLines } from '../core/widgets';
import { CardPicker } from '../ui/card-picker';
import { FreeBoardTop } from '../ui/free-board/board-top';
import { FreeBoardView } from '../ui/free-board/free-board-view';
import { FreeBoardOwner } from '../ui/free-board/owner-tools';
import { ICON, IconModule } from '../ui/icons';
import { Toasts } from '../ui/toast';
import { WidgetDone, WidgetSheet } from '../ui/widget-sheet';

/**
 * Um quadro aberto em tela cheia, do dono (PLANO-CANVAS.md, 3.2): a peça do quadro (`app-free-board`, a mesma da
 * visita) com o topo, o Editar e o Pronto, e o que só o dono faz nela (pôr uma anotação, a folha do widget, guardar
 * as imagens, guardar cada mudança e a câmera deste aparelho). O canvas aberto (pages/canvas-page.ts) a usa; o que
 * ele põe no topo vem dentro (os Detalhes, o Compartilhar).
 */
@Component({
  selector: 'app-board-screen',
  imports: [CardPicker, FreeBoardTop, FreeBoardView, IconModule, WidgetSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'escape($any($event))' },
  template: `
    <div class="tela-cheia" role="dialog" aria-modal="true" [attr.aria-label]="board() ? kind() + ' ' + shownName() : kind()">
      @if (board(); as b) {
        @if (camera() !== undefined) {
          <app-free-board
            class="quadro"
            [board]="shownBoard() ?? b"
            [camera]="camera() ?? null"
            [editing]="editing()"
            [owner]="owner"
            [links]="boardLinks"
            [autofocus]="!(renamable() && selectName())"
            (cameraChange)="saveCamera(b.id, $event)"
            (changed)="save($event)"
            (editToggle)="setEditing($event)"
            (notice)="toasts.show($event)"
          />
        }
        <app-free-board-top [name]="shownName()" [renamable]="renamable() && role() !== 'leitor'" [selectName]="selectName()" (renamed)="renamed.emit($event)" (back)="closed.emit()">
          <ng-content />
          @if (role() === 'leitor') {
            <!-- quem só lê o quadro de outra pessoa: sem o Editar -->
          } @else if (editing()) {
            <button type="button" class="etiqueta-topo pronto" (click)="setEditing(false)" title="Sair do editar (E)">
              <lucide-icon [img]="Icons.pronto" [size]="18" aria-hidden="true" />
              <span class="etiqueta-nome">Pronto</span>
            </button>
          } @else {
            <button type="button" class="etiqueta-topo editar" (click)="setEditing(true)" [title]="'Editar o ' + kind().toLowerCase() + ' (E)'">
              <lucide-icon [img]="Icons.editar" [size]="18" aria-hidden="true" />
              <span class="etiqueta-nome">Editar</span>
            </button>
          }
        </app-free-board-top>
      } @else if (!loaded()) {
        <p class="aviso">Trazendo o {{ kind().toLowerCase() }}…</p>
      } @else {
        <div class="aviso">
          <p>{{ missing() }}</p>
          <button type="button" class="btn-ink" (click)="closed.emit()">{{ backText() }}</button>
        </div>
      }
    </div>

    <!-- o que só o dono faz no quadro (a peça pede, ver ui/free-board/owner-tools.ts): a anotação e a folha do widget -->
    <app-card-picker
      [open]="picking()"
      (openChange)="onPickerOpen($event)"
      [onlyKind]="notesKind"
      [doneOption]="false"
      heading="Pôr uma anotação no quadro"
      hint="Qualquer anotação sua, de qualquer grupo, como o widget Nota. Ela continua onde está."
      footHint="Toque numa anotação para pôr no quadro."
      createLabel="Nova anotação"
      (picked)="onPicked($event)"
      (create)="onCreateNote($event)"
    />
    @if (sheetStart(); as st) {
      @defer (on immediate) {
        <app-widget-sheet [start]="st" [swap]="sheetEditing()" [onCard]="false" [inBoard]="true" (done)="onSheetDone($event)" (removed)="onSheetRemoved()" (closed)="onSheetClosed()" />
      }
    }
  `,
  styleUrl: './board-screen.scss',
})
export class BoardScreen {
  /** O quadro aberto. */
  readonly boardId = input.required<string>();
  /** O nome no topo (o do canvas é o título da anotação); sem ele, o do quadro. */
  readonly name = input<string | null>(null);
  /** O que é, para o leitor de tela e os avisos ("Quadro", "Canvas"). */
  readonly kind = input('Quadro');
  /** Abre já no editar (o quadro recém-criado está vazio: não há o que ver). */
  readonly startEditing = input(false);
  /** O nome no topo se escreve (o canvas: renomear muda a anotação). */
  readonly renamable = input(false);
  /** O nome já selecionado para escrever (o canvas novo). */
  readonly selectName = input(false);
  readonly missing = input('Este quadro não está aqui. Ele pode ter sido apagado.');
  readonly backText = input('Voltar para a lista');
  /** Voltar (o botão, o Esc fora do editar, o quadro que não está aqui). */
  readonly closed = output<void>();
  readonly renamed = output<string>();

  private readonly store = inject(FreeBoardStore);
  private readonly boardSync = inject(FreeBoardSync);
  private readonly reviews = inject(ReviewStore);
  private readonly images = inject(ImageStore);
  private readonly desk = inject(Desk);
  private readonly noteAsk = inject(FreeBoardNoteAsk);
  protected readonly toasts = inject(Toasts);

  protected readonly Icons = { editar: ICON.editar, pronto: ICON.pronto };
  protected readonly notesKind = NOTES;
  /** A loja já leu o banco (antes disso, um quadro que não aparece ainda pode estar chegando). */
  protected readonly loaded = signal(false);
  protected readonly board = computed(() => {
    const id = this.boardId();
    return this.store.boards().find((b) => b.id === id) ?? null;
  });
  protected readonly shownName = computed(() => this.name() ?? this.board()?.nome ?? '');
  /** O seu papel no quadro (o de outra pessoa pode ser só de ler: sem o Editar). */
  protected readonly role = computed(() => this.boardSync.roleOf(this.boardId()));
  /**
   * O quadro na tela: o guardado ou, no editar, o último que a tela mandou (enquanto a gravação anda, o guardado de
   * antes não volta por cima da mudança nova).
   */
  private readonly working = signal<FreeBoard | null>(null);
  protected readonly shownBoard = computed(() => {
    const w = this.working();
    const b = this.board();
    return w && b && w.id === b.id ? w : b;
  });
  /** O editar: Editar e Pronto no alto, o E e o Esc. */
  readonly editing = signal(false);
  private saving: Promise<unknown> = Promise.resolve();
  /** A câmera guardada do quadro: `undefined` enquanto lê (a tela espera, para não abrir em outro lugar). */
  protected readonly camera = signal<Camera | null | undefined>(undefined);

  // ===== o que só o dono faz, para a peça do quadro =====
  protected readonly picking = signal(false);
  private readonly pickGroup = signal<string | null>(null);
  private picked: ((r: { id: string; title: string } | null) => void) | null = null;
  protected readonly sheetStart = signal<{ name: string; values: Record<string, string> } | null>(null);
  /** A folha mexe num widget que já está no quadro (o Tirar aparece; tirado, a peça sai). */
  protected readonly sheetEditing = signal(false);
  private sheetDone: ((line: string | null) => void) | null = null;
  private sheetResult: string | null = null;
  /** As anotações que um quadro alcança (o canvas não entra num quadro: PLANO-CANVAS.md, 4.1). */
  private readonly notes = computed(() => this.reviews.notes().filter((r) => !isCanvas(r)));
  /** Os links das notas coladas no quadro: tocar numa abre a leitura dela. */
  protected readonly boardLinks: NoteLinks = {
    resolve: (title) => this.notes().find((r) => r.game.name.trim().toLocaleLowerCase('pt-BR') === title.trim().toLocaleLowerCase('pt-BR')) ?? null,
    open: (note) => this.desk.openReview(note.id),
    openCard: (card) => this.desk.openReview(card.id),
  };
  readonly owner: FreeBoardOwner = {
    pickNote: (group) =>
      new Promise((resolve) => {
        this.picked?.(null);
        this.picked = resolve;
        this.pickGroup.set(group);
        this.picking.set(true);
      }),
    findNote: (title) => {
      const key = title.trim().toLocaleLowerCase('pt-BR');
      const n = this.notes().find((r) => r.game.name.trim().toLocaleLowerCase('pt-BR') === key);
      return n ? { id: n.id, title: n.game.name } : null;
    },
    storeImages: async (files) => {
      const out: { id: string; w: number; h: number; alpha?: boolean }[] = [];
      for (const f of files) {
        try {
          const [img, alpha] = await Promise.all([this.images.add(f), hasTransparency(f)]);
          out.push({ id: img.id, w: img.largura, h: img.altura, ...(alpha ? { alpha } : {}) });
        } catch {
          this.toasts.show('Uma imagem não pôde ser guardada.');
        }
      }
      return out;
    },
    editWidget: (line) =>
      new Promise((resolve) => {
        this.sheetDone?.(null);
        const start = sheetStartOf(line);
        if (!start) return resolve(null);
        this.sheetDone = resolve;
        this.sheetResult = null;
        // só o nome (`{{contador}}`): um widget novo; com o resto da linha, um que já está no quadro
        this.sheetEditing.set(!/^\{\{\s*[\p{L}-]+\s*\}\}$/u.test(line.trim()));
        this.sheetStart.set(start);
      }),
    openNote: (id) => this.desk.openReview(id),
    linkNotes: () => this.notes(),
  };

  constructor() {
    void this.store.ready.then(() => this.loaded.set(true));
    // abre já no editar, uma vez, quando o quadro chega
    let started = false;
    effect(() => {
      const b = this.board();
      if (!b || started) return;
      started = true;
      if (untracked(() => this.startEditing())) this.editing.set(true);
    });
    // a câmera do quadro, lida antes de montar a tela
    effect((onCleanup) => {
      const id = this.boardId();
      let alive = true;
      onCleanup(() => (alive = false));
      untracked(() => this.camera.set(undefined));
      void this.store.camera(id).then((c) => alive && this.camera.set(c));
    });
    // com o quadro aberto, a página de trás não rola (nem mostra a barra de rolagem)
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => {
      root.style.overflow = before;
      if (this.editing()) this.setEditing(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      this.picked?.(null);
      this.sheetDone?.(null);
    });
  }

  protected onPicked(r: Review): void {
    const done = this.picked;
    this.picked = null;
    this.picking.set(false);
    done?.({ id: r.id, title: r.game.name });
  }

  /**
   * "Nova anotação" no seletor: o editor abre no grupo do quadro (com o que se procurava de título) e, salva, a
   * anotação vai para o quadro no lugar pedido. Fechar o editor sem salvar responde nada.
   */
  protected onCreateNote(title: string): void {
    const done = this.picked;
    this.picked = null;
    this.picking.set(false);
    if (!done) return;
    void this.noteAsk.ask().then(done);
    this.desk.newNoteIn(this.pickGroup() ?? this.board()?.grupo ?? '', undefined, undefined, title);
  }

  protected onPickerOpen(open: boolean): void {
    this.picking.set(open);
    if (!open && this.picked) {
      const done = this.picked;
      this.picked = null;
      done(null);
    }
  }

  protected onSheetDone(d: WidgetDone): void {
    this.sheetResult = widgetLines(d.name, d.args, d.size, d.body).join('\n');
  }

  protected onSheetRemoved(): void {
    this.sheetResult = '';
  }

  protected onSheetClosed(): void {
    const done = this.sheetDone;
    this.sheetDone = null;
    this.sheetStart.set(null);
    done?.(this.sheetResult);
  }

  // ===== o editar =====

  protected save(ev: { board: FreeBoard; from: FreeBoard }): void {
    this.working.set(ev.board);
    this.saving = this.saving.then(async () => {
      try {
        const saved = await this.store.save(ev.board, ev.from);
        // juntou com o que outra aba gravou no meio: a tela passa a mostrar o juntado (se não mudou de novo)
        if (saved !== ev.board && this.working() === ev.board) this.working.set(saved);
      } catch (e) {
        this.toasts.show(e instanceof FreeBoardProblem ? e.message : 'Não deu para guardar a mudança no quadro.');
      }
    });
  }

  /** Tudo o que a tela mandou já foi guardado (quem fecha espera antes de olhar o quadro). */
  settled(): Promise<unknown> {
    return this.saving;
  }

  protected setEditing(on: boolean): void {
    this.editing.set(on);
    // o Pronto manda o quadro para a nuvem na hora (sem esperar os 4 s)
    if (!on)
      void this.saving.then(() => {
        this.working.set(null);
        void this.boardSync.flush();
      });
  }

  protected saveCamera(id: string, cam: Camera): void {
    void this.store.setCamera(id, cam);
  }

  protected escape(e: KeyboardEvent): void {
    // no editar, o Esc é do quadro (tira a seleção; sem nada, sai do editar)
    if (e.defaultPrevented || this.editing()) return;
    // o Esc de um menu, de uma folha ou da ampliação de uma foto é dela
    if (document.querySelector(':popover-open, dialog[open]')) return;
    if (e.target instanceof Element && e.target.closest('.menu-contexto, dialog, app-context-menu')) return;
    e.preventDefault();
    this.closed.emit();
  }
}

/**
 * O começo da folha do widget a partir da linha dele (ou só do nome, `{{contador}}`, para um novo): os valores como
 * a folha lê. A tabela mora em várias linhas: o jeito na marca (se tiver) e o markdown embaixo.
 */
export function sheetStartOf(line: string): { name: string; values: Record<string, string> } | null {
  const lines = line.split('\n');
  const parsed = parseWidgetLine(lines[0]);
  if (!parsed && !line.trim().startsWith('|')) return null;
  const name = parsed?.name ?? 'tabela';
  const def = widgetDef(name);
  if (!def) return null;
  if (name === 'tabela') {
    const body = parsed ? lines.slice(1) : lines;
    const look = parsed?.args[0] ?? DEFAULT_TABLE_LOOK;
    return { name, values: { look, table: body.length ? tableText(readTable(body)) : '' } };
  }
  const size: WidgetSize = parsed?.size ?? 'medio';
  return { name, values: { ...def.read(parsed?.args ?? []), size } };
}
