import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ICON, IconModule } from '../ui/icons';
import { kanbanPath, studyPath } from '../core/areas';
import { boardIdFor } from '../core/kanban';
import { ALL_TAB, NO_CATEGORY_TAB, isGroupTab } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { SideBySide } from '../core/side-by-side';
import { WallMotion } from '../core/wall-motion';
import { pinningFor } from '../core/wall-physics';
import { FolderInfo, WallGroup, WallState } from '../core/wall-view';
import { NO_FOLDERS, NoteFolder, siblingNamed } from '../core/folders';
import { type Review, isNote } from '../core/review';
import { plural } from '../core/text';
import { FolderCard } from '../ui/folder-card';
import { DoneStamp } from '../ui/done-stamp';
import { NoteIndex } from '../ui/note-index';
import { NoteMenu, NoteMenuTrigger, WALL_NOTES, wallNoteId } from '../ui/note-menu';
import { ContextMenu, ContextMenuTrigger, MenuItem, MenuSections } from '../ui/context-menu';
import { FolderAsking } from '../ui/folder-asking';
import { Toasts } from '../ui/toast';
import { FolderActions, WallDrag, WallDragItem, WallDrop } from './wall-drag';
import { FolderMoveSheet } from '../ui/folder-move-sheet';
import { lookKey } from '../core/category-looks';
import { NoteSelection } from '../ui/note-selection';
import { Pin } from '../ui/pin';
import { SearchHighlight } from '../ui/search-highlight';
import { WallCardPool, WallCardProps, WallCards, copyKey } from './wall-cards';
import { stepFocus } from './wall-keys';

/** As ordens por um dia que não é a data da ficha: ela mostra esse dia (ver ReviewCard.dateFrom). */
const DATE_SORTS = ['criacao', 'alteracao', 'finalizacao'] as const;

const NONE: ReadonlySet<string> = new Set();

/** O que muda nas fichas conforme quem olha o mural (o dono ou quem visita); o resto vem da vista. */
export type WallAccess = Pick<WallCardProps, 'landingId' | 'picking' | 'picked' | 'masked' | 'secret' | 'reactCode' | 'checkable' | 'looks'>;

/**
 * A parede de um mural: as seções com as etiquetas que fecham (o maço preso com elástico), as fichas
 * (completas, inteiras em colagem, simples, só capa, ou a lista das anotações) e os cartões de
 * quando nada aparece; quantas a busca e os filtros acharam fica na pasta (WallToolbar). Lê a vista que a página fornece
 * (`WallState`): o seu mural e o de outra pessoa são a mesma parede, só muda `access` (o que o dono
 * pode fazer nas fichas) e o texto, que fala da pessoa quando o mural é dela.
 */
@Component({
  selector: 'app-wall-board',
  imports: [ContextMenu, DoneStamp, FolderCard, FolderMoveSheet, IconModule, NoteIndex, NoteMenu, Pin, RouterLink, SearchHighlight, WallCards],
  providers: [WallCardPool],
  host: { '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-board.html',
  styleUrl: './wall-board.scss',
})
export class WallBoard {
  protected readonly view = inject(WallState);
  private readonly settings = inject(Settings);
  private readonly motion = inject(WallMotion);
  private readonly pool = inject(WallCardPool);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly access = input.required<WallAccess>();
  /** Tocou numa ficha (ou numa linha da lista): o id dela. */
  readonly opened = output<string>();
  /** Marcando para o lado a lado, tocou numa ficha. */
  readonly toggled = output<string>();
  /** "Nova anotação" no cartão de "Tudo finalizado" (só no seu mural). */
  readonly create = output<void>();
  /**
   * O que muda as pastas (só a página do dono passa, `NoteFolders`): com elas, arrastar organiza, a pasta
   * ganha nome e menu, e a anotação de uma pasta pode sair dela. A visita não tem como.
   */
  readonly folderActions = input<FolderActions | null>(null);

  protected readonly PlusIcon = ICON.adicionar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly BoardIcon = ICON.colunas;
  protected readonly StudyIcon = ICON.camadas;
  protected readonly studyLink = studyPath();
  /** As palavras do que está fora do mural: no Kanban, nos Estudos, ou nos dois (ver `WallView.boardPlace`). */
  protected readonly offWords = computed(() => {
    switch (this.view.boardPlace()) {
      case 'estudos':
        return { title: 'Tudo nos Flashcards', only: 'só nos Flashcards', hint: 'Abra os Flashcards, ou mostre as anotações aqui.', show: 'Mostrar as dos Flashcards' };
      case 'ambos':
        return { title: 'Tudo fora do mural', only: 'só no Kanban ou nos Flashcards', hint: 'Abra o quadro, ou mostre as anotações aqui.', show: 'Mostrar as do Kanban e dos Flashcards' };
      default:
        return { title: 'Tudo no Kanban', only: 'só no Kanban', hint: 'Abra o quadro, ou mostre as anotações aqui.', show: 'Mostrar as do Kanban' };
    }
  });

  /** O quadro do grupo da aba aberta (em "Tudo", o último aberto). */
  protected readonly boardLink = computed(() => {
    const tab = this.view.activeTab();
    return kanbanPath(tab.startsWith('c:') ? boardIdFor(tab.slice(2)) : undefined);
  });

  /**
   * A aba aberta é a de um grupo (e não o Tudo, as Fixadas ou as Compartilhadas): o grupo já está dito
   * na aba, então a orelha das fichas e a da lista dizem o assunto de cada anotação.
   */
  protected readonly groupTab = computed(() => this.notes() && isGroupTab(this.view.activeTab()));

  /** De quem é o mural: null, o seu. */
  protected readonly owner = this.view.owner;
  /** O mural de anotações: o vazio fala de anotação, não de resenha. */
  protected readonly notes = this.view.notes;
  /** As fichas daqui têm orelha (a categoria da anotação, o artista da música): a seção abre lugar para ela. */
  protected readonly ears = computed(() => this.notes() || this.view.music());
  /** "ficha" nos murais de resenhas, "anotação" no de anotações. */
  protected readonly word = computed(() => (this.notes() ? 'anotação' : 'ficha'));
  /** As fichas inteiras: o texto todo, encaixadas em colagem (ver `appFichasMosaico`). */
  protected readonly inteira = computed(() => this.view.density() === 'inteira');
  /** A lista (o índice do caderno), só no mural de anotações. */
  protected readonly lista = computed(() => this.notes() && this.view.density() === 'lista');
  /** A Visão geral: a Simples do mural de anotações (fichas pequenas para ver o quadro inteiro). */
  protected readonly overview = computed(() => this.notes() && this.view.density() === 'simples');
  /**
   * As etiquetas das seções (Fixadas, Outubro de 2026…) à mostra: com a opção dos Ajustes, e nunca nas
   * fichas inteiras, onde a parede é uma colagem só (as etiquetas ficam só para os leitores de tela).
   */
  protected readonly labels = computed(() => this.settings.groupLabels() && !this.inteira());
  /** As seções fecham em todo mural, com as etiquetas à mostra (sem elas, não haveria como abrir). */
  protected readonly foldable = computed(() => this.labels());
  /** O dia da última anotação finalizada: o carimbo do "Tudo finalizado". */
  protected readonly lastDone = computed(() =>
    this.view.wall().reduce<string | null>((max, r) => (r.doneAt && (!max || r.doneAt > max) ? r.doneAt : max), null),
  );

  /** "do mural", "de Trabalho" com uma aba aberta, "de Scripts" numa pasta; no mural de alguém, "de Marina". */
  protected readonly where = computed(() => {
    const folder = this.view.folderPath().at(-1);
    if (folder) return `de ${folder.name}`;
    const tab = this.view.activeTabLabel();
    if (this.view.activeTab() === NO_CATEGORY_TAB) return 'sem grupo';
    // as abas especiais (Fixadas, Compartilhadas) juntam os grupos: "das Fixadas"
    if (tab) return isGroupTab(this.view.activeTab()) ? `de ${tab}` : `das ${tab}`;
    return this.owner() === null ? 'do mural' : `de ${this.owner()}`;
  });

  /** As que estão só no Kanban e à mostra no mural agora: levam a etiqueta (nenhuma, escondidas). */
  protected readonly shownBoard = computed(() => (this.view.showBoard() ? this.view.boardOnly() : NONE));

  /** O que todas as fichas da parede recebem igual (ver WallCardPool). */
  private readonly cardProps = computed<WallCardProps>(() => ({
    ...this.access(),
    highlight: this.view.shownSort() === 'nota' ? this.view.activeScore() : null,
    compact: this.view.density() === 'simples',
    overview: this.overview(),
    subjectEar: this.groupTab(),
    capas: this.view.density() === 'capas',
    full: this.inteira(),
    dayOnly: this.view.shownSort() === 'data',
    dateFrom: DATE_SORTS.find((s) => s === this.view.shownSort()) ?? null,
    times: this.view.times(),
    boardOnly: this.shownBoard(),
    studyOnly: this.view.studyOnly(),
    folders: this.cardFolders(),
  }));

  /**
   * As pastas que as fichas leem: dentro de uma pasta, a ficha não repete o nome dela (a parede já diz onde
   * está); procurando, a lista junta as de várias pastas, e a orelha diz a de cada uma.
   */
  protected readonly cardFolders = computed(() => (this.view.folderGroup() !== null && !this.view.seeking() ? NO_FOLDERS : this.view.folders()));
  /** As pastas na parede, antes das fichas (a aba de um grupo, sem procurar). */
  protected readonly hasFolders = computed(() => this.view.folderKids().length > 0);
  /** A pasta aberta não tem nada: nem anotação, nem pasta. */
  protected readonly folderEmpty = computed(
    () => this.view.openFolder() !== null && !this.view.seeking() && !this.hasFolders() && !this.view.tabbed().length,
  );
  /** O nome da pasta aberta (o cartão da pasta vazia fala dela). */
  protected readonly openFolderName = computed(() => this.view.folderPath().at(-1)?.name ?? '');
  protected info(id: string): FolderInfo | undefined {
    return this.view.folderInfo().get(id);
  }

  /** Tocou numa pasta da parede: abre (e o Voltar do navegador volta para cá). */
  protected enter(id: string): void {
    this.motion.run(() => this.view.enterFolder(id));
  }

  /** O que o leitor de tela ouve depois de um toque que troca a pasta: "Pasta Funcional, 2 anotações". */
  protected readonly folderSaid = signal('');

  // ===== Organizar as pastas (PLANO-PASTAS.md, rodada 3): arrastar, dar nome, os menus =====

  private readonly side = inject(SideBySide);
  private readonly toasts = inject(Toasts);
  private readonly asking = inject(FolderAsking);
  /** Arrastar organiza: no seu Murall, numa aba de grupo, sem marcar para o lado a lado. */
  protected readonly dragOn = computed(
    () => !!this.folderActions() && this.notes() && this.owner() === null && this.view.folderGroup() !== null && !this.side.picking(),
  );
  /** A pasta sendo nomeada (a nova, ou Renomear), e a irmã com o nome que está escrito. */
  protected readonly naming = signal<string | null>(null);
  protected readonly clash = signal<string | null>(null);
  /** O menu do botão direito de uma pasta ou do vão da parede: o nome no alto e as opções. */
  protected readonly folderMenu = signal<{ caption: string; sections: MenuSections }>({ caption: '', sections: [] });
  private readonly folderMenuRef = viewChild<ContextMenu>('menuDaPasta');
  private noteTrigger: NoteMenuTrigger | null = null;
  private folderTrigger: ContextMenuTrigger | null = null;

  /** O nome de uma pasta (null: o do grupo). */
  private name(id: string | null): string {
    return id ? (this.view.folders().live(id)?.name ?? '') : this.view.folderGroupLabel();
  }

  private noteName(id: string): string {
    return this.view.wall().find((r) => r.id === id)?.game.name ?? 'A anotação';
  }

  private undoToast(text: string, undo: () => void): void {
    this.toasts.show(text, { label: 'Desfazer', run: () => this.motion.run(undo) });
  }

  /** Soltou arrastando: guarda, junta numa pasta nova ou põe uma pasta dentro de outra, com o Desfazer. */
  private dropped(item: WallDragItem, to: WallDrop): void {
    const fa = this.folderActions();
    if (!fa) return;
    if (to.kind === 'juntar') {
      const group = this.view.folderGroup();
      if (item.kind !== 'notas' || group === null) return;
      const ids = [...item.ids, to.with];
      let made: ReturnType<FolderActions['gather']> = null;
      this.motion.run(() => (made = fa.gather(ids, group, this.view.openFolder())));
      const m = made as ReturnType<FolderActions['gather']>;
      if (!m) {
        this.toasts.show('Não cabe mais nenhuma pasta aqui.');
        return;
      }
      this.selection.clear();
      this.naming.set(m.folder.id);
      this.undoToast(`Nova pasta com ${ids.length} anotações.`, m.undo);
      return;
    }
    const where = this.name(to.folder);
    if (item.kind === 'pasta') {
      const was = this.name(item.id);
      let undo: (() => void) | null = null;
      this.motion.run(() => (undo = fa.move(item.id, to.folder)));
      if (undo) this.undoToast(to.folder ? `${was} guardada em ${where}.` : `${was} foi para ${where}.`, undo);
      return;
    }
    let done: { moved: number; undo: () => void } = { moved: 0, undo: () => undefined };
    this.motion.run(() => (done = fa.place(item.ids, to.folder)));
    if (!done.moved) return;
    const one = done.moved === 1 ? this.noteName(item.lead) : '';
    const text = to.folder
      ? done.moved === 1
        ? `${one} guardada em ${where}.`
        : `${done.moved} anotações guardadas em ${where}.`
      : done.moved === 1
        ? `${one} saiu das pastas.`
        : `${done.moved} anotações saíram das pastas.`;
    this.selection.clear();
    this.undoToast(text, done.undo);
  }

  /** A cada letra do nome: a irmã que já tem esse nome (o Enter junta as duas). */
  protected drafted(f: NoteFolder, value: string): void {
    const tree = this.view.folders();
    this.clash.set(siblingNamed(tree, f.group, tree.parentOf(f.id), value, f.id)?.name ?? null);
  }

  /** Acabou de dar nome à pasta: renomeia, ou junta com a irmã de mesmo nome; o foco volta para ela. */
  protected named(f: NoteFolder, value: string | null): void {
    this.naming.set(null);
    this.clash.set(null);
    const fa = this.folderActions();
    const clean = value?.trim() ?? '';
    let focus = f.id;
    if (fa && clean && clean !== f.name) {
      const tree = this.view.folders();
      const twin = siblingNamed(tree, f.group, tree.parentOf(f.id), clean, f.id);
      if (twin) {
        let undo: () => void = () => undefined;
        this.motion.run(() => (undo = fa.join(f.id, twin.id)));
        this.undoToast(`${f.name} entrou em ${twin.name}: agora é uma pasta só.`, undo);
        focus = twin.id;
      } else {
        fa.rename(f.id, clean);
      }
    }
    this.view.folderFocus.update((x) => ({ to: focus, n: (x?.n ?? 0) + 1 }));
  }

  /** Uma pasta nova (vazia) em `parent`, já com o campo do nome. */
  private newFolder(parent: string | null): void {
    const fa = this.folderActions();
    const group = this.view.folderGroup();
    if (!fa || group === null) return;
    if (parent !== this.view.openFolder()) this.motion.run(() => this.view.enterFolder(parent));
    let made: NoteFolder | null = null;
    this.motion.run(() => (made = fa.create(group, parent, '')));
    if (made) this.naming.set((made as NoteFolder).id);
    else this.toasts.show('Não cabe mais nenhuma pasta aqui.');
  }

  /** Desfaz a pasta: o que tinha dentro sobe (pergunta antes, se não estiver vazia), com o Desfazer. */
  private async dissolve(f: NoteFolder): Promise<void> {
    const fa = this.folderActions();
    if (!fa) return;
    const up = this.name(this.view.folders().parentOf(f.id));
    if (!(await this.asking.dissolve(f.name, fa.contentsOf(f.id), up)) || !this.view.folders().live(f.id)) return;
    let undo: () => void = () => undefined;
    this.motion.run(() => (undo = fa.dissolve(f.id)));
    this.undoToast(`A pasta ${f.name} foi desfeita.`, undo);
  }

  /** As opções do menu de uma pasta da parede. */
  private folderSections(f: NoteFolder): MenuSections {
    return [
      [{ id: 'abrir', label: 'Abrir', icon: ICON.pastaDeNotas, run: () => this.enter(f.id) }],
      [
        {
          id: 'nova-nota',
          label: 'Nova anotação aqui',
          icon: ICON.adicionar,
          dialog: true,
          run: () => {
            this.motion.run(() => this.view.enterFolder(f.id));
            this.create.emit();
          },
        },
        { id: 'nova-pasta', label: 'Nova pasta dentro', icon: ICON.novaPasta, run: () => this.newFolder(f.id) },
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.naming.set(f.id) },
        {
          id: 'mover',
          label: 'Mover para…',
          icon: ICON.guardarNaPasta,
          dialog: true,
          run: () =>
            this.moving.set({ kind: 'pasta', id: f.id, name: f.name, category: f.group ? this.view.folderGroupLabel() : null, from: this.view.folders().parentOf(f.id), stock: 'branco' }),
        },
      ],
      [{ id: 'desfazer', label: 'Desfazer a pasta', icon: ICON.desfazerPasta, danger: true, hint: 'O que tem dentro sobe; nenhuma anotação é apagada', run: () => void this.dissolve(f) }],
    ];
  }

  /** O menu do vão da parede (numa aba de grupo): escrever ou criar uma pasta ali. */
  private gapSections(): MenuSections {
    const open = this.view.openFolder();
    return [
      [
        { id: 'nova-nota', label: 'Nova anotação aqui', icon: ICON.adicionar, dialog: true, run: () => this.create.emit() },
        { id: 'nova-pasta', label: 'Nova pasta aqui', icon: ICON.novaPasta, run: () => this.newFolder(open) },
      ],
    ];
  }

  /**
   * No menu de uma anotação: "Mover para pasta…" (a folha com a árvore do grupo dela) e, dentro de uma
   * pasta, "Tirar da pasta" (sobe um nível).
   */
  protected readonly noteMore = (r: Review): MenuItem[] => {
    if (!this.folderActions() || !isNote(r)) return [];
    const tree = this.view.folders();
    const items: MenuItem[] = [
      {
        id: 'mover-pasta',
        label: 'Mover para pasta…',
        icon: ICON.guardarNaPasta,
        dialog: true,
        run: () => this.moving.set({ kind: 'notas', ids: [r.id], name: r.game.name, category: r.category ?? null, from: tree.of(r), stock: pinningFor(r.id, r.stock).stock }),
      },
    ];
    const open = this.view.openFolder();
    if (open !== null && tree.of(r) === open) {
      const up = tree.parentOf(open);
      items.push({
        id: 'tirar-pasta',
        label: 'Tirar da pasta',
        icon: ICON.tirarDaPasta,
        hint: `Vai para ${this.name(up)}`,
        run: () => this.dropped({ kind: 'notas', lead: r.id, ids: [r.id] }, { kind: 'guardar', folder: up }),
      });
    }
    return items;
  };

  // ===== Mover sem arrastar: a folha com a árvore (PLANO-PASTAS.md, 4.8) =====

  /** O que está sendo movido pela folha: anotações (do grupo delas) ou uma pasta. */
  protected readonly moving = signal<
    | { kind: 'notas'; ids: readonly string[]; name: string; category: string | null; from: string | null; stock: string }
    | { kind: 'pasta'; id: string; name: string; category: string | null; from: string | null; stock: string }
    | null
  >(null);
  /** O que a folha precisa saber: o grupo, as contas e o que não se pode escolher. */
  protected readonly moveSheet = computed(() => {
    const m = this.moving();
    const fa = this.folderActions();
    if (!m || !fa) return null;
    const tree = this.view.folders();
    const groupName = m.category ?? 'Sem grupo';
    const from = m.from ? (tree.live(m.from)?.name ?? groupName) : groupName;
    return {
      title: m.kind === 'pasta' ? `Mover a pasta ${m.name}` : `Mover ${m.name}`,
      sub: `Está em ${from}`,
      group: lookKey(m.category ?? ''),
      groupName,
      counts: fa.countsIn(m.category),
      blocked: m.kind === 'pasta' ? tree.below(m.id) : new Set<string>(),
      rootLabel: m.kind === 'pasta' ? `Direto em ${groupName}` : 'Sem pasta',
      start: m.from,
      stock: m.stock,
    };
  });

  /** Escolheu na folha: move (as anotações, ou a pasta), com o bilhete e o Desfazer. */
  protected moveTo(id: string | null): void {
    const m = this.moving();
    this.moving.set(null);
    if (!m || id === m.from) return;
    if (m.kind === 'pasta') this.dropped({ kind: 'pasta', id: m.id }, { kind: 'guardar', folder: id });
    else this.dropped({ kind: 'notas', lead: m.ids[0], ids: m.ids }, { kind: 'guardar', folder: id });
  }

  /** "Criar 'Scripts' em Programação" na folha: a pasta nasce, e o que se move vai para ela. */
  protected moveToNew(e: { parent: string | null; name: string }): void {
    const m = this.moving();
    const fa = this.folderActions();
    if (!m || !fa) return;
    const made = fa.create(m.category, e.parent, e.name);
    if (!made) {
      this.moving.set(null);
      this.toasts.show('Não cabe mais nenhuma pasta aqui.');
      return;
    }
    this.moveTo(made.id);
  }

  /** Ctrl+clique marca anotações para copiar o texto delas (ver ui/note-selection.ts). */
  readonly selection: NoteSelection;
  /** O menu do botão direito numa anotação (ver ui/note-menu.ts). */
  private readonly noteMenu = viewChild<NoteMenu>('menuDaNota');

  constructor() {
    // a pasta aberta mora no endereço (`?pasta=`): o Voltar do navegador e do celular sobe uma pasta, e um
    // link abre o grupo nela (PLANO-PASTAS.md, P11)
    const router = inject(Router, { optional: true });
    const route = inject(ActivatedRoute, { optional: true });
    if (router && route) {
      // (voltando ao mural de outra página, o endereço chega sem a pasta: fica a que estava aberta)
      let first = true;
      route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => {
        const id = q.get('pasta');
        const skip = first && id === null;
        first = false;
        if (!skip && id !== untracked(this.view.openFolder)) this.view.openFolderFrom(id);
      });
      // (o "veio de um toque" é lido sem ser seguido: apagá-lo não pode navegar de novo, o que trocaria
      // a entrada nova do histórico por uma substituição)
      effect(() => {
        const id = this.view.openFolder();
        untracked(() => {
          const push = this.view.folderPushed();
          this.view.folderPushed.set(false);
          if ((route.snapshot.queryParamMap.get('pasta') ?? null) === id) return;
          void router.navigate([], { relativeTo: route, queryParams: { pasta: id }, queryParamsHandling: 'merge', replaceUrl: !push });
        });
      });
    }
    // trocou de pasta por um toque: o foco não se perde (entrando, vai para onde se está, no caminho;
    // subindo, para a pasta de onde se saiu), e o leitor de tela ouve onde está (PLANO-PASTAS.md, 4.11)
    let focused = untracked(this.view.folderFocus)?.n ?? 0;
    effect(() => {
      const f = this.view.folderFocus();
      if (!f || f.n === focused) return;
      untracked(() => {
        const here = this.view.folderPath().at(-1);
        const notes = this.view.visible().length;
        const folders = this.view.folderKids().length;
        const parts = [notes ? plural(notes, 'anotação', 'anotações') : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
        const name = here ? `Pasta ${here.name}` : this.view.folderGroupLabel();
        this.folderSaid.set(`${name}, ${parts.length ? parts.join(' e ') : 'vazia'}`);
      });
    });
    afterRenderEffect(() => {
      const f = this.view.folderFocus();
      if (!f || f.n === focused) return;
      focused = f.n;
      const target =
        f.to === null
          ? document.querySelector<HTMLElement>('app-folder-path .aqui')
          : this.el.querySelector<HTMLElement>(`app-folder-card[data-pasta="${CSS.escape(f.to)}"] button`);
      target?.focus({ preventScroll: f.to === null });
    });
    const side = this.side;
    const byId = computed(() => new Map(this.view.wall().map((r) => [r.id, r])));
    this.selection = new NoteSelection({
      host: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
      // a caixa da ficha (ver wall-cards.ts) ou a linha da lista (ver ui/note-index.ts)
      markable: WALL_NOTES,
      idOf: wallNoteId,
      // só no seu mural de anotações, e não enquanto o toque na ficha é para o lado a lado
      on: () => this.notes() && this.owner() === null && !side.picking(),
      notes: byId,
      // a parede mudou (busca, filtro, aba, outro mural): quem está nela, e não a lista, que muda a cada
      // anotação mexida (a nuvem, uma tarefa marcada, fixar), que não deve desmarcar; nem a ordem
      reset: computed(() => this.view.visible().map((r) => r.id).sort().join('|')),
      // as fichas redesenhadas recebem as marcas de volta
      layout: this.view.visible,
    });
    // o botão direito, o dedo segurado ou Shift+F10 numa ficha de qualquer mural (o seu ou o de quem se
    // visita) abre o menu dela (o que ela é diz o que aparece: ver ui/note-menu.ts)
    // (onde segurar arrasta, o menu abre quando o dedo segura e solta sem mexer: ver WallDrag)
    this.noteTrigger = new NoteMenuTrigger({
      host: this.el,
      markable: WALL_NOTES,
      idOf: wallNoteId,
      on: () => !side.picking(),
      notes: byId,
      menu: this.noteMenu,
      hold: () => !this.dragOn(),
    });
    // o botão direito numa pasta da parede ou no vão dela (no seu Murall, numa aba de grupo)
    this.folderTrigger = new ContextMenuTrigger({
      host: this.el,
      targets: 'app-folder-card[data-pasta], .wall',
      ignore: `${WALL_NOTES}, .grupo-etiqueta, input`,
      keyOf: (box) => {
        if (box.matches('app-folder-card')) return `pasta:${box.dataset['pasta']}`;
        return this.view.folderGroup() !== null ? 'vao' : null;
      },
      on: () => !side.picking() && !!this.folderActions() && this.owner() === null && this.notes(),
      hold: (box) => !box.matches('app-folder-card') || !this.dragOn(),
      isOpenFor: (key) => !!this.folderMenuRef()?.isOpenFor(key),
      open: (key, box, x, y, by) => {
        const f = key.startsWith('pasta:') ? this.view.folders().live(key.slice(6)) : undefined;
        if (key !== 'vao' && !f) return;
        this.folderMenu.set(
          f ? { caption: `Pasta ${f.name}`, sections: this.folderSections(f) } : { caption: this.name(this.view.openFolder()), sections: this.gapSections() },
        );
        this.folderMenuRef()?.show({ key, x, y, back: box.matches('app-folder-card') ? box.querySelector<HTMLElement>('button') : null, by });
      },
    });
    // arrastar organiza (PLANO-PASTAS.md, 4.5)
    const drag = new WallDrag({
      host: this.el,
      on: () => this.dragOn() && !this.naming(),
      marked: () => this.selection.ids(),
      openFolder: () => this.view.openFolder(),
      groupName: () => this.view.folderGroupLabel(),
      folderName: (id) => this.view.folders().live(id)?.name ?? null,
      folderOf: (id) => {
        const r = byId().get(id);
        return r ? this.view.folders().of(r) : null;
      },
      below: (id) => this.view.folders().below(id),
      parentOf: (id) => this.view.folders().parentOf(id),
      drop: (item, to) => this.dropped(item, to),
      open: (id) => this.motion.run(() => this.view.enterFolder(id)),
      menu: (item, box, x, y) => {
        if (item.kind === 'pasta') this.folderTrigger?.openAt(`pasta:${item.id}`, x, y, box);
        else this.noteTrigger?.openAt(item.lead, x, y, box);
      },
    });
    inject(DestroyRef).onDestroy(() => drag.off());
    this.pool.props = this.cardProps;
    this.pool.onOpen = (id) => this.opened.emit(id);
    this.pool.onToggle = (id) => this.toggled.emit(id);
    // a ficha que saiu do mural (filtro, apagada) vai embora; as outras ficam, prontas (e as cópias
    // das seções que ainda existem, ordenando por tag)
    effect(() => {
      const visible = this.view.visible();
      const copies = this.view.groups().flatMap((g) => [...(g.copies ?? [])].map((id) => copyKey(id, g.key)));
      untracked(() => this.pool.keepOnly(visible, copies));
    });
  }

  /**
   * O id da seção a partir da chave dela (que pode ter espaço, acento, ":"): continua o mesmo quando a
   * seção muda de lugar, para a etiqueta deslizar junto (ver WallMotion). O "_" também é trocado e o
   * código fecha com "_": duas chaves diferentes nunca dão o mesmo id ("c:x" e "c_3ax", ":b" e "Ϋ").
   */
  protected idOf(key: string): string {
    return key.replace(/[^a-zA-Z0-9-]/gu, (c) => `_${c.codePointAt(0)!.toString(16)}_`);
  }

  /** Fecha ou abre uma seção; as de baixo deslizam para o lugar novo. */
  protected toggleGroup(key: string): void {
    const closing = !this.view.isCollapsed(key);
    this.motion.run(() => this.view.toggleCollapsed(key));
    // fechou agora: o elástico estala no maço (o que já vem fechado ao abrir o mural fica parado)
    if (closing) {
      clearTimeout(this.snapTimer);
      this.snapping.set(key);
      this.snapTimer = setTimeout(() => this.snapping.set(null), 900);
    }
  }

  /** A seção que acabou de fechar: o elástico dela estala (ver `.estalando` no wall-board.scss). */
  protected readonly snapping = signal<string | null>(null);
  private snapTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * O maço da seção fechada: as primeiras fichas (até quatro), nas cores das cartolinas, a de cima por
   * último e reta; as de baixo, um pouco tortas, mostram só a beirada.
   */
  protected bundle(g: WallGroup): { color: string; transform: string | null }[] {
    const tilts = ['rotate(-8 32 22) translate(-2 2)', 'rotate(6 32 22) translate(2 1)', 'rotate(-3 32 22) translate(-1 0)'];
    const cards = g.reviews.slice(0, 4).reverse();
    return cards.map((r, i) => ({
      color: `var(--stock-${pinningFor(r.id, r.stock).stock})`,
      transform: i === cards.length - 1 ? null : tilts[(tilts.length - (cards.length - 1) + i) % tilts.length],
    }));
  }

  /**
   * As setas andam entre as fichas da Visão geral e as linhas da lista, como numa grade de escolher: na
   * lista (que corre em colunas), para cima e para baixo seguem a ordem e para os lados pulam de coluna;
   * na Visão geral, para os lados seguem a ordem e para cima e para baixo vão à ficha de cima ou de
   * baixo. Home e End vão à primeira e à última. Só com o foco numa ficha ou numa linha.
   */
  protected onKey(e: KeyboardEvent): void {
    if (!this.overview() && !this.lista()) return;
    const items = Array.from(this.el.querySelectorAll<HTMLElement>(this.lista() ? '.linha[data-ficha]' : '.lugar[data-lugar]'));
    const at = items.findIndex((el) => el.contains(e.target as Node) && (e.target as HTMLElement).classList.contains('hit'));
    if (at < 0) return;
    const next = stepFocus(items, at, e, this.lista() ? 'columns' : 'rows');
    if (next === null) return;
    e.preventDefault();
    const target = items[next];
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // longe da tela (End, Home), a ficha ainda é vaga: o foco vai quando ela for montada, ali
    let frames = 60;
    const land = (): void => {
      const hit = target.querySelector<HTMLElement>('.hit');
      if (hit) hit.focus({ preventScroll: true });
      else if (--frames > 0 && target.isConnected) requestAnimationFrame(land);
    };
    land();
  }

  protected clearFilters(): void {
    this.motion.run(() => this.view.clearFilters());
  }

  /** A busca sai da aba e procura no mural inteiro. */
  protected searchAll(): void {
    this.motion.run(() => this.view.setNoteTab(ALL_TAB));
  }

  /** "Mostrar as do Kanban": as que estão só no Kanban entram no mural, nesta visita. */
  protected showBoard(): void {
    this.motion.run(() => this.view.showBoard.set(true));
  }

  protected showDone(): void {
    this.motion.run(() => this.view.showDone.set(true));
  }
}
