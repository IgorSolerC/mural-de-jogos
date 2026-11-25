import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { freeBoardPath } from '../core/areas';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { FB_NAME_MAX, FreeBoard, boardInGroup } from '../core/free-board';
import { FreeBoardProblem, FreeBoardStore } from '../core/free-board-store';
import { FreeBoardSync } from '../core/free-board-sync';
import { KanbanStore } from '../core/kanban-store';
import { ReviewStore } from '../core/review-store';
import { NO_TABS, NoteTab, sameTabs, tabKeyOf, tabsToMore } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { groupKey, studyGroupId } from '../core/study';
import { LabelEdits } from '../core/label-edits';
import { WallView } from '../core/wall-view';
import { ContextMenu, ContextMenuTrigger, MenuBy, MenuItem, MenuSections } from '../ui/context-menu';
import { BoardShare } from '../ui/board-share';
import { FreeBoardCard } from '../ui/free-board/board-card';
import { ICON, IconModule } from '../ui/icons';
import { RemoveAsking } from '../ui/remove-asking';
import { StudyGroupTabs, StudyTab } from '../ui/study-group-tabs';
import { Toasts } from '../ui/toast';
import { SaveKey } from '../ui/save-key';
import { BoardScreen } from './board-screen';

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
  imports: [SaveKey, BoardScreen, BoardShare, ContextMenu, FreeBoardCard, IconModule, StudyGroupTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './free-boards-page.html',
  styleUrl: './free-boards-page.scss',
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

  protected readonly Icons = { novo: ICON.adicionar, pessoas: ICON.pessoas };
  protected readonly nameMax = FB_NAME_MAX;
  protected readonly path = freeBoardPath;

  private readonly params = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => ({ group: p.get('grupo'), board: p.get('quadro') }))), {
    initialValue: { group: null, board: null },
  });
  /** A loja já leu o banco (antes disso, um quadro que não aparece ainda pode estar chegando). */
  protected readonly loaded = signal(false);

  /** Os quadros da lista: os dos canvas ficam no mural de anotações (PLANO-CANVAS.md), não aqui. */
  private readonly reviews = inject(ReviewStore);
  private readonly listedBoards = computed(() => {
    const canvases = new Set(this.reviews.notes().flatMap((n) => (n.canvas ? [n.canvas] : [])));
    return canvases.size ? this.store.boards().filter((b) => !canvases.has(b.id)) : this.store.boards();
  });
  /** Os grupos: os das anotações (os do Kanban) e os de algum quadro sem anotação, na ordem das abas do mural. */
  protected readonly groups = computed<BoardGroup[]>(() => {
    const looks = this.settings.categoryLooks();
    const labels = new Map<string, string>();
    for (const c of this.kanban.categories()) labels.set(c.key, c.label);
    for (const b of this.listedBoards()) if (!labels.has(groupKey(b.grupo))) labels.set(groupKey(b.grupo), b.grupo);
    const boards = this.listedBoards();
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
  protected readonly shown = computed(() => this.group()?.boards ?? this.listedBoards());
  /** O quadro aberto em tela cheia. */
  protected readonly open = computed(() => {
    const id = this.params().board;
    return id ? (this.store.boards().find((b) => b.id === id) ?? null) : null;
  });
  protected readonly wantedBoard = computed(() => this.params().board);
  /** O quadro recém-criado abre já no editar (está vazio: não há o que ver). */
  protected readonly editNext = signal<string | null>(null);
  /** Fechou o quadro (o Voltar, o Esc, o voltar do navegador): o foco volta para a folha dele na lista. */
  private openedBoard: string | null = null;
  private readonly focusBack = effect(() => {
    const id = this.wantedBoard() ?? null;
    const closed = this.openedBoard;
    this.openedBoard = id;
    if (id || !closed) return;
    afterNextRender(() => this.host.querySelector<HTMLElement>(`[data-quadro="${closed}"]`)?.focus({ preventScroll: false }), { injector: this.injector });
  });
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
  /**
   * O quadro do menu como a lista o mostra: o de outra pessoa, no grupo compartilhado dele com o nome daqui
   * (FreeBoardStore.setPlaces), e não no grupo de mesmo nome que é seu.
   */
  private listed(id: string): FreeBoard | null {
    return this.store.boards().find((x) => x.id === id) ?? null;
  }
  protected readonly menuCaption = computed(() => {
    const on = this.menuOn();
    const b = on ? this.listed(on.id) : null;
    return b ? (on!.move ? `Mover ${b.nome} para` : b.nome) : '';
  });
  protected readonly menuSections = computed<MenuSections>(() => {
    const on = this.menuOn();
    const b = on ? this.listed(on.id) : null;
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
  private readonly boardSync = inject(FreeBoardSync);

  constructor() {
    void this.store.ready.then(() => this.loaded.set(true));
    // o título da aba: o nome do quadro aberto (depois do título da rota)
    effect(() => {
      const b = this.open();
      if (b) setTimeout(() => this.title.setTitle(`${b.nome} · Quadro livre · Murall`));
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
  }

  protected boardPath(b: FreeBoard): string {
    return freeBoardPath(studyGroupId(b.grupo), b.id);
  }

  /** O endereço de um grupo para as abas. */
  protected readonly groupPath = (g?: string | null): string => freeBoardPath(g);

  protected openGroup(id: string): void {
    if (id && id !== this.group()?.id) void this.router.navigateByUrl(freeBoardPath(id));
  }

  private readonly edits = inject(LabelEdits);
  /** O grupo que já atende pelo nome escrito no "Novo grupo" do "Mais". */
  protected readonly groupNamed = this.edits.groupNamed;
  /** O "Novo grupo" do "Mais" (PLANO-NOVO-GRUPO.md): o grupo nasce (ou o de mesmo nome é achado), e abre. */
  protected createGroup(name: string): void {
    const r = this.edits.createCategory(name);
    if (r) this.openGroup(studyGroupId(r.label));
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
      this.editNext.set(b.id);
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

  /** Volta para a lista do grupo do quadro (o Esc também). */
  protected close(): void {
    const b = this.open();
    void this.router.navigateByUrl(freeBoardPath(this.params().group ?? (b ? studyGroupId(b.grupo) : null)));
  }

}
