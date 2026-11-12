import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { freeBoardPath } from '../core/areas';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { FB_NAME_MAX, FreeBoard, boardInGroup } from '../core/free-board';
import { Desk } from '../core/desk';
import { ImageStore } from '../core/image-store';
import { hasTransparency } from '../core/images';
import { NOTES } from '../core/kinds';
import { NoteLinks } from '../core/note-links';
import { Review } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { DEFAULT_TABLE_LOOK, readTable, tableText } from '../core/tables';
import { WidgetSize, parseWidgetLine, widgetDef, widgetLines } from '../core/widgets';
import { Camera } from '../core/free-board-geometry';
import { FreeBoardProblem, FreeBoardStore } from '../core/free-board-store';
import { FreeBoardSync } from '../core/free-board-sync';
import { FreeBoardNoteAsk } from '../core/free-board-note-ask';
import { KanbanStore } from '../core/kanban-store';
import { NO_TABS, NoteTab, sameTabs, tabKeyOf, tabsToMore } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { groupKey, studyGroupId } from '../core/study';
import { WallView } from '../core/wall-view';
import { CardPicker } from '../ui/card-picker';
import { ContextMenu, ContextMenuTrigger, MenuBy, MenuItem, MenuSections } from '../ui/context-menu';
import { BoardShare } from '../ui/board-share';
import { FreeBoardOwner } from '../ui/free-board/owner-tools';
import { WidgetDone, WidgetSheet } from '../ui/widget-sheet';
import { FreeBoardCard } from '../ui/free-board/board-card';
import { FreeBoardTop } from '../ui/free-board/board-top';
import { FreeBoardView } from '../ui/free-board/free-board-view';
import { ICON, IconModule } from '../ui/icons';
import { RemoveAsking } from '../ui/remove-asking';
import { StudyGroupTabs, StudyTab } from '../ui/study-group-tabs';
import { Toasts } from '../ui/toast';

/** Um grupo das anotações como aba do Quadro livre, com os quadros dele. */
interface BoardGroup {
  id: string;
  key: string;
  label: string;
  look: CategoryLook;
  color: string | null;
  boards: FreeBoard[];
}

/**
 * O Quadro livre (PLANO-QUADRO-LIVRE.md, 4.1 a 4.3): as abas dos grupos (as mesmas dos Flashcards), os quadros
 * de cada um em folhas de papel kraft (Tudo: os de todos), o "Novo quadro" como a primeira folha, o menu do
 * botão direito (Abrir, Renomear, Duplicar, Mover para o grupo, Apagar) e o quadro aberto em tela cheia, só
 * para ver (Editar chega na rodada 4). A câmera de cada quadro fica neste aparelho.
 */
@Component({
  selector: 'app-free-boards-page',
  imports: [BoardShare, CardPicker, ContextMenu, FreeBoardCard, FreeBoardTop, WidgetSheet, FreeBoardView, IconModule, StudyGroupTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './free-boards-page.html',
  styleUrl: './free-boards-page.scss',
  host: { '(document:keydown.escape)': 'escape($any($event))' },
})
export class FreeBoardsPage {
  protected readonly store = inject(FreeBoardStore);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  private readonly wallView = inject(WallView);
  private readonly router = inject(Router);
  protected readonly toasts = inject(Toasts);
  private readonly removal = inject(RemoveAsking);
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly Icons = { novo: ICON.adicionar, editar: ICON.editar, pronto: ICON.pronto, pessoas: ICON.pessoas };
  protected readonly nameMax = FB_NAME_MAX;
  protected readonly path = freeBoardPath;

  private readonly params = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => ({ group: p.get('grupo'), board: p.get('quadro') }))), {
    initialValue: { group: null, board: null },
  });
  /** A loja já leu o banco (antes disso, um quadro que não aparece ainda pode estar chegando). */
  protected readonly loaded = signal(false);

  /** Os grupos: os das anotações (os do Kanban) e os de algum quadro sem anotação, na ordem das abas do mural. */
  protected readonly groups = computed<BoardGroup[]>(() => {
    const looks = this.settings.categoryLooks();
    const labels = new Map<string, string>();
    for (const c of this.kanban.categories()) labels.set(c.key, c.label);
    for (const b of this.store.boards()) if (!labels.has(groupKey(b.grupo))) labels.set(groupKey(b.grupo), b.grupo);
    const boards = this.store.boards();
    const list = [...labels].map(([key, label]): BoardGroup => {
      const look = looks[key] ?? {};
      return { id: studyGroupId(label), key, label, look, color: categoryColorHex(look.color), boards: boards.filter((b) => boardInGroup(b, label)) };
    });
    const at = new Map(this.wallTabs().map((t, i) => [t.key, i]));
    const place = (g: BoardGroup) => at.get(tabKeyOf(g.key)) ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => place(a) - place(b));
  });
  private readonly wallTabs = computed<NoteTab[]>(() => {
    const t = this.wallView.notes() ? this.wallView.noteTabs() : null;
    return (t?.tabs ?? []).filter((x) => x.key.startsWith('c:')).map((x) => ({ ...x, key: tabKeyOf(x.key.slice(2)) }));
  });
  protected readonly tabs = computed<StudyTab[]>(() =>
    this.groups().map((g) => {
      const n = g.boards.length;
      return { ...g, today: n, say: n ? `${n} ${n === 1 ? 'quadro' : 'quadros'}` : 'sem quadro', quiet: !n, n, total: n };
    }),
  );
  protected readonly tabsOrdered = computed(() => !!this.wallView.categoryOrder());
  private readonly emptyGroups = computed<ReadonlySet<string>>(
    () => (this.wallView.hideEmpty() ? new Set(this.groups().flatMap((g) => (g.boards.length ? [] : [tabKeyOf(g.key)]))) : NO_TABS),
    { equal: sameTabs },
  );
  protected readonly tabsHidden = computed(() => tabsToMore(this.wallView.hiddenTabs(), this.emptyGroups(), this.group() ? tabKeyOf(this.group()!.key) : ''));

  /** O grupo aberto (null: Tudo). */
  protected readonly group = computed(() => {
    const id = this.params().group;
    return id ? (this.groups().find((g) => g.id === id) ?? null) : null;
  });
  /** Os quadros à mostra: os do grupo, ou todos. */
  protected readonly shown = computed(() => this.group()?.boards ?? this.store.boards());
  /** O quadro aberto em tela cheia. */
  protected readonly open = computed(() => {
    const id = this.params().board;
    return id ? (this.store.boards().find((b) => b.id === id) ?? null) : null;
  });
  /**
   * O quadro na tela: o guardado ou, no editar, o último que a tela mandou (enquanto a gravação anda, o
   * guardado de antes não volta por cima da mudança nova).
   */
  protected readonly working = signal<FreeBoard | null>(null);
  protected readonly shownBoard = computed(() => {
    const w = this.working();
    const b = this.open();
    return w && b && w.id === b.id ? w : b;
  });
  /** O editar (rodada 4): Editar e Pronto no alto, o E e o Esc. */
  protected readonly editing = signal(false);
  /** O quadro recém-criado abre já no editar (está vazio: não há o que ver). */
  private editNext: string | null = null;
  private saving: Promise<unknown> = Promise.resolve();
  protected readonly wantedBoard = computed(() => this.params().board);
  /** Fechou o quadro (o Voltar, o Esc, o voltar do navegador): o foco volta para a folha dele na lista. */
  private openedBoard: string | null = null;
  private readonly focusBack = effect(() => {
    const id = this.wantedBoard() ?? null;
    const closed = this.openedBoard;
    this.openedBoard = id;
    if (id || !closed) return;
    afterNextRender(() => this.host.querySelector<HTMLElement>(`[data-quadro="${closed}"]`)?.focus({ preventScroll: false }), { injector: this.injector });
  });
  /** A câmera guardada do quadro aberto: `undefined` enquanto lê (a tela espera, para não abrir em outro lugar). */
  protected readonly camera = signal<Camera | null | undefined>(undefined);

  // ===== o Novo quadro =====
  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newGroup = signal('');
  protected readonly newGroupValue = computed(() => this.group()?.label || this.newGroup() || this.groups()[0]?.label || 'Geral');

  // ===== renomear (no lugar da folha) =====
  protected readonly renaming = signal<string | null>(null);
  protected readonly renameText = signal('');

  // ===== o menu =====
  private readonly menu = viewChild<ContextMenu>('menu');
  protected readonly menuOn = signal<{ id: string; move: boolean } | null>(null);
  protected readonly menuCaption = computed(() => {
    const on = this.menuOn();
    const b = on ? this.store.get(on.id) : null;
    return b ? (on!.move ? `Mover ${b.nome} para` : b.nome) : '';
  });
  protected readonly menuSections = computed<MenuSections>(() => {
    const on = this.menuOn();
    const b = on ? this.store.get(on.id) : null;
    if (!b) return [];
    if (on!.move) {
      return [
        this.groups()
          .filter((g) => !boardInGroup(b, g.label))
          .map((g): MenuItem => ({ id: `grupo:${g.id}`, label: g.label, icon: ICON.pasta, run: () => void this.moveTo(b.id, g.label) })),
      ];
    }
    // o quadro de outra pessoa (PLANO-COMPARTILHAR.md, rodada 6): o grupo, o público e apagar são do dono; quem só lê não renomeia
    const role = this.boardSync.roleOf(b.id);
    const share: MenuItem = { id: 'compartilhar', label: 'Compartilhar', icon: ICON.pessoas, dialog: true, run: () => this.sharing.set(b.id) };
    if (role !== 'dono') {
      return [
        [{ id: 'abrir', label: 'Abrir', icon: ICON.aumentar, run: () => void this.router.navigateByUrl(this.boardPath(b)) }],
        [
          ...(role === 'leitor' ? [] : [{ id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.startRename(b) }]),
          { id: 'duplicar', label: 'Duplicar', icon: ICON.copiar, run: () => void this.duplicate(b.id) },
          share,
        ],
      ];
    }
    return [
      [{ id: 'abrir', label: 'Abrir', icon: ICON.aumentar, run: () => void this.router.navigateByUrl(this.boardPath(b)) }],
      [
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.startRename(b) },
        { id: 'duplicar', label: 'Duplicar', icon: ICON.copiar, run: () => void this.duplicate(b.id) },
        share,
        ...(this.groups().length > 1 ? [{ id: 'mover', label: 'Mover para o grupo…', icon: ICON.pasta, dialog: true, run: () => this.reopenForMove(b.id) }] : []),
        {
          id: 'publico',
          label: b.publico ? 'Tornar privado' : 'Tornar público',
          icon: ICON.mundo,
          hint: b.publico ? 'Só você vê o quadro' : 'Quem visita o seu mural vê o quadro, com as imagens dele',
          run: () => void this.setPublic(b.id, !b.publico),
        },
      ],
      [{ id: 'apagar', label: 'Apagar', icon: ICON.apagar, danger: true, dialog: true, run: () => void this.removal.board(b.id) }],
    ];
  });
  private lastMenu: { x: number; y: number; back: HTMLElement | null } | null = null;

  // ===== compartilhar (PLANO-COMPARTILHAR.md, rodada 6) =====
  /** O quadro com a folha Compartilhar aberta. */
  protected readonly sharing = signal<string | null>(null);
  /** O seu papel no quadro aberto (o de outra pessoa pode ser só de ler: sem o Editar). */
  protected readonly openRole = computed(() => {
    const b = this.open();
    return b ? this.boardSync.roleOf(b.id) : 'dono';
  });

  // ===== o que só o dono faz, para a peça do quadro =====
  private readonly reviews = inject(ReviewStore);
  private readonly images = inject(ImageStore);
  private readonly desk = inject(Desk);
  private readonly boardSync = inject(FreeBoardSync);
  private readonly noteAsk = inject(FreeBoardNoteAsk);
  protected readonly notesKind = NOTES;
  protected readonly picking = signal(false);
  protected readonly pickGroup = signal<string | null>(null);
  private picked: ((r: { id: string; title: string } | null) => void) | null = null;
  protected readonly sheetStart = signal<{ name: string; values: Record<string, string> } | null>(null);
  /** A folha mexe num widget que já está no quadro (o Tirar aparece; tirado, a peça sai). */
  protected readonly sheetEditing = signal(false);
  private sheetDone: ((line: string | null) => void) | null = null;
  private sheetResult: string | null = null;
  /** Os links das notas coladas no quadro: tocar numa abre a leitura dela. */
  protected readonly boardLinks: NoteLinks = {
    resolve: (title) => this.reviews.notes().find((r) => r.game.name.trim().toLocaleLowerCase('pt-BR') === title.trim().toLocaleLowerCase('pt-BR')) ?? null,
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
      const n = this.reviews.notes().find((r) => r.game.name.trim().toLocaleLowerCase('pt-BR') === key);
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
    linkNotes: () => this.reviews.notes(),
  };

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
    this.desk.newNoteIn(this.pickGroup() ?? this.open()?.grupo ?? '', undefined, undefined, title);
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

  protected setEditing(on: boolean): void {
    this.editing.set(on);
    // o Pronto manda o quadro para a nuvem na hora (sem esperar os 4 s)
    if (!on) void this.saving.then(() => {
      this.working.set(null);
      void this.boardSync.flush();
    });
  }

  constructor() {
    void this.store.ready.then(() => this.loaded.set(true));
    // o quadro que acabou de nascer abre no editar; ao fechar o quadro, o editar desliga
    effect(() => {
      const b = this.open();
      untracked(() => {
        if (b && b.id === this.editNext) {
          this.editNext = null;
          this.editing.set(true);
        }
        if (!this.wantedBoard() && this.editing()) this.setEditing(false);
      });
    });
    // a câmera do quadro aberto, lida antes de montar a tela
    effect((onCleanup) => {
      const id = this.wantedBoard();
      let alive = true;
      onCleanup(() => (alive = false));
      untracked(() => this.camera.set(undefined));
      if (!id) return;
      void this.store.camera(id).then((c) => alive && this.camera.set(c));
    });
    // o título da aba: o nome do quadro aberto (depois do título da rota)
    effect(() => {
      const b = this.open();
      if (b) setTimeout(() => this.title.setTitle(`${b.nome} · Quadro livre · Murall`));
    });
    // com o quadro aberto, a página de trás não rola (nem mostra a barra de rolagem)
    effect((onCleanup) => {
      if (!this.wantedBoard()) return;
      const root = document.documentElement;
      const before = root.style.overflow;
      root.style.overflow = 'hidden';
      onCleanup(() => (root.style.overflow = before));
    });
    // o grupo que não existe mais (renomeado, apagado) leva a Tudo
    effect(() => {
      const { group } = this.params();
      if (group && this.loaded() && !this.group() && !this.wantedBoard()) void this.router.navigateByUrl(freeBoardPath());
    });
    new ContextMenuTrigger({
      host: this.host,
      targets: '[data-quadro]',
      keyOf: (box) => {
        const id = box.dataset['quadro'];
        return id && this.store.get(id) ? `quadro:${id}` : null;
      },
      hold: true,
      on: () => !this.open(),
      isOpenFor: (key) => !!this.menu()?.isOpenFor(key),
      open: (key, box, x, y, by) => this.openMenu(key.slice(7), box, x, y, by),
    });
    inject(DestroyRef).onDestroy(() => this.exitFullscreen());
  }

  protected boardPath(b: FreeBoard): string {
    return freeBoardPath(studyGroupId(b.grupo), b.id);
  }

  /** O endereço de um grupo para as abas. */
  protected readonly groupPath = (g?: string | null): string => freeBoardPath(g);

  protected openGroup(id: string): void {
    if (id && id !== this.group()?.id) void this.router.navigateByUrl(freeBoardPath(id));
  }

  // ===== criar =====

  protected startCreate(): void {
    this.creating.set(true);
    this.newName.set('');
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('.novo-nome input')?.focus(), { injector: this.injector });
  }

  protected async create(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;
    try {
      const b = await this.store.create(name, this.newGroupValue());
      this.creating.set(false);
      this.editNext = b.id;
      void this.router.navigateByUrl(this.boardPath(b));
    } catch (e) {
      this.toasts.show(e instanceof FreeBoardProblem ? e.message : 'Não deu para criar o quadro.');
    }
  }

  // ===== o menu e o que ele faz =====

  private openMenu(id: string, box: HTMLElement, x: number, y: number, by: MenuBy): void {
    this.menuOn.set({ id, move: false });
    this.lastMenu = { x, y, back: box };
    this.menu()?.show({ key: `quadro:${id}`, x, y, by, back: box });
  }

  /** "Mover para o grupo…": o mesmo menu, agora com os grupos. */
  private reopenForMove(id: string): void {
    const at = this.lastMenu;
    if (!at) return;
    setTimeout(() => {
      this.menuOn.set({ id, move: true });
      this.menu()?.show({ key: `mover:${id}`, x: at.x, y: at.y, by: 'teclado', back: at.back });
    });
  }

  private async moveTo(id: string, group: string): Promise<void> {
    const before = this.store.get(id);
    const moved = await this.store.moveToGroup(id, group);
    if (!moved || !before) return;
    this.toasts.show(`${moved.nome} foi para ${moved.grupo}`, { label: 'Desfazer', run: () => void this.store.moveToGroup(id, before.grupo) });
  }

  private async setPublic(id: string, on: boolean): Promise<void> {
    const b = await this.store.setPublic(id, on);
    if (b) this.toasts.show(on ? `${b.nome} ficou público: quem visita o seu mural vê` : `${b.nome} ficou só seu`, { label: 'Desfazer', run: () => void this.store.setPublic(id, !on) });
  }

  private async duplicate(id: string): Promise<void> {
    try {
      const copy = await this.store.duplicate(id);
      if (copy) this.toasts.show(`${copy.nome} foi criado`, { label: 'Abrir', run: () => void this.router.navigateByUrl(this.boardPath(copy)) });
    } catch (e) {
      this.toasts.show(e instanceof FreeBoardProblem ? e.message : 'Não deu para duplicar o quadro.');
    }
  }

  protected startRename(b: FreeBoard): void {
    this.renaming.set(b.id);
    this.renameText.set(b.nome);
    afterNextRender(
      () => {
        const input = this.host.querySelector<HTMLInputElement>('.renomear input');
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  protected async finishRename(save: boolean): Promise<void> {
    const id = this.renaming();
    if (!id) return;
    this.renaming.set(null);
    if (save) await this.store.rename(id, this.renameText());
    afterNextRender(() => this.host.querySelector<HTMLElement>(`[data-quadro="${id}"]`)?.focus(), { injector: this.injector });
  }

  // ===== a tela cheia =====

  protected saveCamera(id: string, cam: Camera): void {
    void this.store.setCamera(id, cam);
  }

  /** Volta para a lista do grupo do quadro (o Esc também). */
  protected close(): void {
    const b = this.open();
    this.exitFullscreen();
    void this.router.navigateByUrl(freeBoardPath(this.params().group ?? (b ? studyGroupId(b.grupo) : null)));
  }

  private exitFullscreen(): void {
    if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }

  protected escape(e: KeyboardEvent): void {
    // no editar, o Esc é do quadro (tira a seleção; sem nada, sai do editar)
    if (!this.wantedBoard() || e.defaultPrevented || this.editing()) return;
    // o Esc de um menu, de uma folha ou da ampliação de uma foto é dela
    if (document.querySelector(':popover-open, dialog[open]')) return;
    if (e.target instanceof Element && e.target.closest('.menu-contexto, dialog, app-context-menu')) return;
    e.preventDefault();
    this.close();
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
