import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { freeBoardPath } from '../core/areas';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { FB_NAME_MAX, FreeBoard, boardInGroup } from '../core/free-board';
import { Camera } from '../core/free-board-geometry';
import { FreeBoardProblem, FreeBoardStore } from '../core/free-board-store';
import { KanbanStore } from '../core/kanban-store';
import { NO_TABS, NoteTab, sameTabs, tabKeyOf, tabsToMore } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { groupKey, studyGroupId } from '../core/study';
import { WallView } from '../core/wall-view';
import { ContextMenu, ContextMenuTrigger, MenuBy, MenuItem, MenuSections } from '../ui/context-menu';
import { FreeBoardCard } from '../ui/free-board/board-card';
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
  imports: [ContextMenu, FreeBoardCard, FreeBoardView, IconModule, StudyGroupTabs],
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
  private readonly toasts = inject(Toasts);
  private readonly removal = inject(RemoveAsking);
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly Icons = { novo: ICON.adicionar, voltar: ICON.voltar, cheia: ICON.telaCheia, sair: ICON.diminuir };
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
    return id ? this.store.get(id) : null;
  });
  protected readonly wantedBoard = computed(() => this.params().board);
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
    return [
      [{ id: 'abrir', label: 'Abrir', icon: ICON.aumentar, run: () => void this.router.navigateByUrl(this.boardPath(b)) }],
      [
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.startRename(b) },
        { id: 'duplicar', label: 'Duplicar', icon: ICON.copiar, run: () => void this.duplicate(b.id) },
        ...(this.groups().length > 1 ? [{ id: 'mover', label: 'Mover para o grupo…', icon: ICON.pasta, dialog: true, run: () => this.reopenForMove(b.id) }] : []),
      ],
      [{ id: 'apagar', label: 'Apagar', icon: ICON.apagar, danger: true, dialog: true, run: () => void this.removal.board(b.id) }],
    ];
  });
  private lastMenu: { x: number; y: number; back: HTMLElement | null } | null = null;

  constructor() {
    void this.store.ready.then(() => this.loaded.set(true));
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

  protected readonly fullscreen = signal(false);

  protected saveCamera(id: string, cam: Camera): void {
    void this.store.setCamera(id, cam);
  }

  /** Volta para a lista do grupo do quadro (o Esc também). */
  protected close(): void {
    const b = this.open();
    this.exitFullscreen();
    void this.router.navigateByUrl(freeBoardPath(this.params().group ?? (b ? studyGroupId(b.grupo) : null)));
  }

  /** A tela cheia do navegador (esconde também as barras dele). */
  protected toggleFullscreen(): void {
    const el = this.host.querySelector<HTMLElement>('.tela-cheia');
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  protected onFullscreenChange(): void {
    this.fullscreen.set(!!document.fullscreenElement);
  }

  private exitFullscreen(): void {
    if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }

  protected escape(e: KeyboardEvent): void {
    if (!this.wantedBoard() || e.defaultPrevented) return;
    // o Esc de um menu, de uma folha ou da ampliação de uma foto é dela
    if (document.querySelector(':popover-open, dialog[open]')) return;
    e.preventDefault();
    this.close();
  }
}
