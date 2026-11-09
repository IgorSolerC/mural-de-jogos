import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { categoryColorHex, lookKey, tagColorHex } from '../core/category-looks';
import { NO_FOLDERS } from '../core/folders';
import { IMPORTANCES, IMPORTANCE_LABEL, Importance } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { BulkPatch } from '../core/note-bulk';
import { NoteFolders } from '../core/note-folders';
import { categoryLibrary, tagLibrary } from '../core/note-labels';
import { Review, STOCKS, STOCK_LABEL, Stock, isDone, isNote, isPinnedNote } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { StudyStore } from '../core/study-store';
import { plural } from '../core/text';
import { BackdropClose } from './backdrop-close';
import { CategoryLabel } from './category-label';
import { FolderPicker } from './folder-picker';
import { roveRadios } from './focus';
import { GroupPicker } from './group-picker';
import { ICON, IconModule } from './icons';
import { IMPORTANCE_LEVEL, IMPORTANCE_STEPS } from './kanban-icons';
import { NoteTag } from './note-tag';
import { Pin } from './pin';
import { TagPicker } from './tag-picker';

/** As importâncias, da mais baixa à mais alta (como na folha do quadro, ui/kanban-props.ts). */
const SCALE: readonly Importance[] = [...IMPORTANCES].reverse();

/** Onde a folha abriu: no Kanban aparecem as coisas do quadro; nos Flashcards, onde eles aparecem. */
export type BulkPlace = 'mural' | 'kanban' | 'estudos';

/** O que a folha faz na hora, além de Aplicar: finalizar, abrir de novo, apagar. */
export type BulkAct = 'finalizar' | 'reabrir' | 'apagar';

/** Um campo das marcadas: igual em todas (o valor), ou diferente (`mixed`, com quantas de cada). */
interface Shared<T> {
  value: T | null;
  mixed: boolean;
}

function common<T>(list: readonly T[], key: (x: T) => string = String): Shared<T> {
  if (!list.length) return { value: null, mixed: false };
  const k = key(list[0]);
  return list.every((x) => key(x) === k) ? { value: list[0], mixed: false } : { value: null, mixed: true };
}

let uid = 0;

/** O "grupo" que não é nenhum: com grupos diferentes, o seletor abre sem nenhum colado. */
const MIXED = '\u200b';

/**
 * Editar as marcadas (PLANO-SELECAO.md, 3): a ficha de fichário com uma linha por campo, como a folha do
 * quadro. O que as marcadas têm igual aparece como sempre; o que difere diz "Vários" (com o tracejado do que
 * ainda não foi escolhido) e como está. Mexer num campo vale para todas, e a linha mexida ganha o traço de
 * marca-texto e o "Deixar como está". As tags não se sobrescrevem: a que só algumas têm aparece tracejada,
 * com quantas, e dá para pôr em todas ou tirar de todas. Aplicar manda só o que mudou (`BulkPatch`); quem
 * abre grava (core/note-bulk.ts).
 */
@Component({
  selector: 'app-bulk-edit-sheet',
  imports: [BackdropClose, CategoryLabel, FolderPicker, GroupPicker, IconModule, NoteTag, Pin, TagPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bulk-edit-sheet.html',
  styleUrls: ['./organize-sheet.scss', './bulk-edit-sheet.scss'],
})
export class BulkEditSheet {
  private readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);
  private readonly kanban = inject(KanbanStore);
  private readonly study = inject(StudyStore);
  protected readonly folders = inject(NoteFolders);

  /** As marcadas, como estão agora. */
  readonly notes = input.required<readonly Review[]>();
  readonly place = input<BulkPlace>('mural');
  /** Aplicar: só o que mudou. */
  readonly apply = output<BulkPatch>();
  /** Finalizar, abrir de novo ou apagar, na hora. */
  readonly act = output<BulkAct>();
  readonly closed = output<void>();

  protected readonly id = `massa-${++uid}`;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly GroupIcon = ICON.pasta;
  protected readonly FolderIcon = ICON.pastaDeNotas;
  protected readonly TagIcon = ICON.etiquetas;
  protected readonly EyeIcon = ICON.ver;
  protected readonly StockIcon = ICON.paleta;
  protected readonly PinIcon = ICON.fixar;
  protected readonly BoardIcon = ICON.colunas;
  protected readonly StudyIcon = ICON.camadas;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly ReopenIcon = ICON.recomecar;
  protected readonly DeleteIcon = ICON.apagar;
  protected readonly NowIcon = ICON.raio;
  protected readonly stocks = STOCKS;
  protected readonly stockLabels = STOCK_LABEL;
  protected readonly scale = SCALE;
  protected readonly impLabel = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = IMPORTANCE_STEPS;
  protected readonly rove = roveRadios;

  private readonly dialog = { el: null as HTMLDialogElement | null };
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Anotações (e não análises): grupo, pasta, tags, fixar e finalizar. */
  protected readonly isNotes = computed(() => this.notes().every(isNote));
  protected readonly n = computed(() => this.notes().length);
  /** Nos Flashcards, "o flashcard" (masculino); no resto, a anotação e a ficha. */
  protected readonly masc = computed(() => this.place() === 'estudos');
  protected readonly word = computed(() =>
    this.masc() ? plural(this.n(), 'flashcard', 'flashcards') : this.isNotes() ? plural(this.n(), 'anotação', 'anotações') : plural(this.n(), 'ficha', 'fichas'),
  );
  /** "as duas" / "todas as 5" (no masculino, "os dois" / "todos os 5"). */
  protected readonly allOf = computed(() => (this.n() === 2 ? (this.masc() ? 'os dois' : 'as duas') : this.masc() ? `todos os ${this.n()}` : `todas as ${this.n()}`));
  protected readonly allShort = computed(() => (this.n() === 2 ? (this.masc() ? 'os dois' : 'as duas') : this.masc() ? 'todos' : 'todas'));
  protected readonly title = computed(() => `Editar ${this.word()}`);
  protected readonly sub = computed(() => {
    if (!this.isNotes()) return 'Quem vê e a cartolina';
    const g = common(
      this.notes().map((r) => r.category ?? ''),
      lookKey,
    );
    if (!g.mixed) return g.value ? `Em ${g.value}` : 'Sem grupo';
    const n = new Set(this.notes().map((r) => lookKey(r.category ?? ''))).size;
    return `Em ${n} grupos`;
  });
  /** A cor da faixa: a cartolina delas, se é uma só. */
  protected readonly headStock = computed(() => common(this.notes().map((r) => r.stock ?? 'branco')).value ?? 'branco');

  // ===== o que a pessoa mudou (undefined: deixar como está) =====

  protected readonly category = signal<string | null | undefined>(undefined);
  protected readonly folder = signal<string | null | undefined>(undefined);
  /** As tags que vão em todas, e as que saem de todas. */
  protected readonly tagsAll = signal<string[] | undefined>(undefined);
  protected readonly tagsDrop = signal<readonly string[]>([]);
  protected readonly audience = signal<'publica' | 'privada' | undefined>(undefined);
  protected readonly stock = signal<Stock | undefined>(undefined);
  protected readonly pinned = signal<boolean | undefined>(undefined);
  protected readonly importance = signal<Importance | null | undefined>(undefined);
  protected readonly boardWall = signal<boolean | undefined>(undefined);
  protected readonly studyWall = signal<boolean | null | undefined>(undefined);
  /** A linha aberta (o seletor do grupo ou da pasta). */
  protected readonly open = signal<'grupo' | 'pasta' | null>(null);

  // ===== como estão =====

  protected readonly groupNow = computed(() =>
    common(
      this.notes().map((r) => r.category ?? ''),
      lookKey,
    ),
  );
  protected readonly groupNames = computed(() => {
    const seen = new Map<string, string>();
    for (const r of this.notes()) if (!seen.has(lookKey(r.category ?? ''))) seen.set(lookKey(r.category ?? ''), r.category ?? 'Sem grupo');
    return [...seen.values()];
  });
  /** O grupo de todas depois de Aplicar (null: estão em grupos diferentes). */
  protected readonly finalGroup = computed<string | null>(() => {
    const c = this.category();
    if (c !== undefined) return c ?? '';
    const g = this.groupNow();
    return g.mixed ? null : (g.value ?? '');
  });
  protected readonly groupLook = computed(() => {
    this.settings.categoryLooks();
    const g = this.finalGroup();
    return g ? this.settings.categoryLook(g) : {};
  });
  protected readonly groupColor = computed(() => categoryColorHex(this.groupLook().color));
  protected readonly categoryLib = computed(() => categoryLibrary(this.store.notes()));

  protected readonly folderNow = computed(() => common(this.notes().map((r) => this.folders.tree().of(r) ?? '')));
  /** A pasta que a linha mostra: a escolhida, ou a de todas (mudar de grupo tira da pasta). */
  protected readonly folderShown = computed<Shared<string>>(() => {
    const f = this.folder();
    if (f !== undefined) return { value: f ?? '', mixed: false };
    if (this.category() !== undefined && lookKey(this.category() ?? '') !== lookKey(this.groupNow().value ?? '\u0000')) return { value: '', mixed: false };
    return this.folderNow();
  });
  protected readonly folderName = computed(() => {
    const v = this.folderShown().value;
    return v ? (this.folders.nameOf(v) ?? 'Uma pasta') : null;
  });
  protected readonly folderCounts = computed(() => this.folders.countsIn(this.finalGroup()));

  /** Cada tag das marcadas e em quantas ela está. */
  private readonly tagCounts = computed(() => {
    const out = new Map<string, { label: string; n: number }>();
    for (const r of this.notes())
      for (const t of r.tags ?? []) {
        const k = lookKey(t);
        const e = out.get(k);
        if (e) e.n++;
        else out.set(k, { label: t, n: 1 });
      }
    return out;
  });
  /** As que todas têm (o TagPicker mostra e mexe nelas). */
  protected readonly tagsShown = computed(() => this.tagsAll() ?? [...this.tagCounts().values()].filter((t) => t.n === this.n()).map((t) => t.label));
  /** As que só algumas têm, menos as que já foram para todas ou saíram de todas. */
  protected readonly tagsPartial = computed(() => {
    const all = new Set(this.tagsShown().map(lookKey));
    const drop = new Set(this.tagsDrop().map(lookKey));
    return [...this.tagCounts().values()].filter((t) => t.n < this.n() && !all.has(lookKey(t.label)) && !drop.has(lookKey(t.label)));
  });
  protected readonly tagLib = computed(() => tagLibrary(this.store.notes(), this.settings.pinnedTags(), this.finalGroup() ?? undefined));
  protected readonly tagsTouched = computed(() => this.tagsAll() !== undefined || this.tagsDrop().length > 0);
  protected tagColor(t: string): string | null {
    return tagColorHex(this.settings.categoryLooks(), t, this.finalGroup() ?? '');
  }

  protected readonly audienceNow = computed(() => {
    const priv = this.notes().filter((r) => r.private).length;
    return {
      value: priv === this.n() ? 'privada' : priv === 0 ? 'publica' : null,
      privadas: priv,
      publicas: this.n() - priv,
    };
  });
  protected readonly stockNow = computed(() => common(this.notes().map((r) => r.stock ?? 'branco')));
  protected readonly stockKinds = computed(() => new Set(this.notes().map((r) => r.stock ?? 'branco')).size);
  protected readonly pinnedNow = computed(() => {
    const p = this.notes().filter(isPinnedNote).length;
    return {
      value: p === this.n() ? true : p === 0 ? false : null,
      fixadas: p,
    };
  });
  protected readonly doneCount = computed(() => this.notes().filter(isDone).length);

  /** As que estão no quadro (no Kanban), com a importância e o "no mural" de cada uma. */
  protected readonly onBoard = computed(() =>
    this.notes()
      .map((r) => ({ r, at: this.kanban.cardOf(r.id) }))
      .filter((x) => !!x.at)
      .map((x) => ({
        importance: x.at!.card.importance ?? null,
        wall: this.kanban.isOnWall(x.at!.card, x.r.category),
      })),
  );
  protected readonly importanceNow = computed(() =>
    common(
      this.onBoard().map((c) => c.importance ?? ''),
      String,
    ),
  );
  protected readonly boardWallNow = computed(() => common(this.onBoard().map((c) => c.wall)));
  /** As que são flashcards, e onde cada uma aparece (undefined: como o baralho). */
  protected readonly cards = computed(() => this.notes().flatMap((r) => (this.study.cardOf().has(r.id) ? [this.study.cardOf().get(r.id)!] : [])));
  protected readonly studyWallNow = computed(() => common(this.cards().map((c) => (c.wall === undefined ? 'baralho' : String(c.wall)))));
  /** O que a linha mostra colado: o escolhido, ou o de todos (`varios`: cada um num lugar). */
  protected readonly studyShown = computed<boolean | null | 'varios'>(() => {
    const w = this.studyWall();
    if (w !== undefined) return w;
    const v = this.studyWallNow().value;
    return v === null ? 'varios' : v === 'baralho' ? null : v === 'true';
  });

  // ===== as escolhas de cada linha =====

  protected readonly audiences = [
    { value: 'publica' as const, label: 'Público', icon: ICON.publica },
    { value: 'privada' as const, label: 'Privado', icon: ICON.privada },
  ];
  protected readonly pins = [
    { value: true, label: 'Fixadas no topo' },
    { value: false, label: 'Com as outras' },
  ];
  protected readonly boardWalls = [
    { value: true, label: 'Também no mural' },
    { value: false, label: 'Só no Kanban' },
  ];
  protected readonly studyWalls = [
    { value: false, label: 'Só como flashcard' },
    { value: true, label: 'No mural e como flashcard' },
    { value: null, label: 'Como o baralho' },
  ];

  /** Numa fileira de escolhas, só a colada (ou a primeira, sem nenhuma) entra pelo Tab; as setas andam. */
  protected tabFor<T>(chosen: T | null | 'varios', value: T, first: T): number {
    if (chosen === value) return 0;
    return chosen === null || chosen === 'varios' || chosen === undefined ? (value === first ? 0 : -1) : -1;
  }

  /** "Trabalho, Estudos e mais 2". */
  protected readonly groupList = computed(() => {
    const names = this.groupNames();
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
  });
  /** O grupo marcado no seletor: o escolhido, o de todas, ou nenhum (com grupos diferentes). */
  protected readonly pickerGroup = computed(() => {
    const c = this.category();
    if (c !== undefined) return c;
    const g = this.groupNow();
    return g.mixed ? MIXED : g.value || null;
  });
  protected readonly groupKey = computed(() => lookKey(this.finalGroup() ?? ''));
  protected readonly impShown = computed(() => {
    const i = this.importance();
    if (i !== undefined) return i ?? '';
    const now = this.importanceNow();
    return now.mixed ? 'varios' : (now.value ?? '');
  });
  /** As compartilhadas no meio (quem vê delas muda em Compartilhar). */
  protected readonly sharedCount = computed(() => {
    const shared = this.store.sharedIds();
    return this.notes().filter((r) => shared.has(r.id)).length;
  });
  protected readonly applyLabel = computed(() =>
    this.n() === 2 ? (this.masc() ? 'Aplicar aos dois' : 'Aplicar às duas') : this.masc() ? `Aplicar aos ${this.n()}` : `Aplicar às ${this.n()}`,
  );

  /** O que vai ao Aplicar. */
  protected readonly patch = computed<BulkPatch>(() => {
    const p: BulkPatch = {};
    if (this.category() !== undefined) p.category = this.category()!;
    if (this.folder() !== undefined) p.folder = this.folder()!;
    if (this.tagsTouched()) p.tags = { all: this.tagsShown(), drop: this.tagsDrop() };
    if (this.audience() !== undefined) p.audience = this.audience();
    if (this.stock() !== undefined) p.stock = this.stock();
    if (this.pinned() !== undefined) p.pinned = this.pinned();
    if (this.importance() !== undefined || this.boardWall() !== undefined) {
      p.board = {
        ...(this.importance() !== undefined ? { importance: this.importance()! } : {}),
        ...(this.boardWall() !== undefined ? { wall: this.boardWall()! } : {}),
      };
    }
    if (this.studyWall() !== undefined) p.study = { wall: this.studyWall()! };
    return p;
  });
  /** Quantas linhas mudam (o botão diz). */
  protected readonly touched = computed(() => Object.keys(this.patch()).length);

  constructor() {
    afterNextRender(() => {
      this.dialog.el = this.host.querySelector('dialog');
      this.dialog.el?.showModal();
    });
  }

  // ===== mexer =====

  protected toggle(which: 'grupo' | 'pasta'): void {
    this.open.update((o) => (o === which ? null : which));
  }

  protected pickGroup(c: string | null): void {
    this.category.set(c);
    // a pasta escolhida era do grupo de antes
    this.folder.set(undefined);
    this.open.set(null);
  }

  protected pickFolder(id: string | null): void {
    this.folder.set(id);
    this.open.set(null);
  }

  protected createFolder(e: { parent: string | null; name: string }): void {
    const made = this.folders.create(this.finalGroup(), e.parent, e.name);
    if (made) this.pickFolder(made.id);
  }

  /** O TagPicker mexeu nas que todas têm: a que saiu de lá sai de todas. */
  protected setTags(next: string[]): void {
    const before = this.tagsShown();
    const now = new Set(next.map(lookKey));
    const gone = before.filter((t) => !now.has(lookKey(t)));
    this.tagsAll.set(next);
    if (gone.length) this.tagsDrop.update((d) => [...d, ...gone]);
    // a que voltou não sai mais
    this.tagsDrop.update((d) => d.filter((t) => !now.has(lookKey(t))));
  }

  /** Uma tag de só algumas vai para todas. */
  protected tagToAll(t: string): void {
    this.tagsAll.set([...this.tagsShown(), t]);
  }

  /** Uma tag de só algumas sai de todas. */
  protected tagDrop(t: string): void {
    this.tagsDrop.update((d) => [...d, t]);
  }

  /** "Deixar como está": a linha volta ao que as marcadas têm. */
  protected reset(which: 'grupo' | 'pasta' | 'tags' | 'quem' | 'cor' | 'fixar' | 'imp' | 'kmural' | 'emural'): void {
    switch (which) {
      case 'grupo':
        this.category.set(undefined);
        this.folder.set(undefined);
        break;
      case 'pasta':
        this.folder.set(undefined);
        break;
      case 'tags':
        this.tagsAll.set(undefined);
        this.tagsDrop.set([]);
        break;
      case 'quem':
        this.audience.set(undefined);
        break;
      case 'cor':
        this.stock.set(undefined);
        break;
      case 'fixar':
        this.pinned.set(undefined);
        break;
      case 'imp':
        this.importance.set(undefined);
        break;
      case 'kmural':
        this.boardWall.set(undefined);
        break;
      case 'emural':
        this.studyWall.set(undefined);
        break;
    }
  }

  /** O valor que a linha mostra: o escolhido agora, ou o de todas (null: "Vários"). */
  protected shown<T>(picked: T | undefined, now: T | null): T | null {
    return picked !== undefined ? picked : now;
  }

  protected applyNow(): void {
    if (!this.touched()) return;
    this.apply.emit(this.patch());
    this.close();
  }

  protected doAct(a: BulkAct): void {
    this.act.emit(a);
    this.close();
  }

  close(): void {
    const el = this.dialog.el;
    if (el?.open) el.close();
  }

  protected readonly NO_FOLDERS = NO_FOLDERS;
}
