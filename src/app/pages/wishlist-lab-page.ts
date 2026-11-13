import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { collage, placeFor, shelfColumns } from '../core/clipping';
import type { NoteFolder } from '../core/folders';
import { RELEVANCES, RELEVANCE_RANK, Relevance, Review, fold, relevanceLabel, relevanceOf } from '../core/review';
import type { FolderInfo } from '../core/wall-view';
import { BackdropClose } from '../ui/backdrop-close';
import { ContextMenu, ContextMenuTrigger, MenuItem, MenuSections } from '../ui/context-menu';
import { DragHold } from '../ui/drag-hold';
import { FilterCard, SubjectOption, activeFilters } from '../ui/filter-card';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { FolderCard } from '../ui/folder-card';
import { FolderPath } from '../ui/folder-path';
import { ICON, IconModule } from '../ui/icons';
import { NoteTag } from '../ui/note-tag';
import { RelevanceSticker } from '../ui/relevance-sticker';
import { SearchStrip } from '../ui/search-strip';
import { TagChip, TagChips } from '../ui/tag-chips';
import { WishClip } from '../ui/wish-clip';
import { LAB_FOLDERS, LAB_TAGS, LabFolder, LabWish, labWishes } from './wishlist-lab-data';

type Vista = 'recortes' | 'grade';
type Ordem = 'recentes' | 'az' | 'ano';

interface Jeito {
  nome: string;
  /** O que vale para o jeito (sem: o texto comum dos cinco primeiros). */
  todos?: string;
  como: string;
  pastas: string;
  tags: string;
  grade: string;
}

const JEITOS: readonly Jeito[] = [
  {
    nome: 'Pastas na parede',
    como: 'Igual às Anotações: as pastas manilha ficam em cima da colagem, e dentro de uma o caminho aparece na pasta da barra. Filtrar abre a mesma folha das Anotações, com a Vontade e as Tags.',
    pastas: 'pastas manilha em cima, como nas Anotações',
    tags: 'etiquetas kraft embaixo do nome',
    grade: 'capas lado a lado, o nome embaixo',
  },
  {
    nome: 'Seções da vontade',
    como: 'A parede se divide em três: MUST PLAY no alto, os comuns no meio, LATER embaixo, cada uma com o título recortado da revista. Trocar a vontade leva o recorte de seção.',
    pastas: 'pastas manilha em cima, como nas Anotações',
    tags: 'a legenda impressa embaixo da foto',
    grade: 'a mesma grade simples, nas três seções',
  },
  {
    nome: 'Índice da revista',
    como: 'Uma coluna à esquerda é o índice da revista: as pastas, a vontade e as tags, cada uma com quantos tem. Tocar filtra na hora, sem abrir folha. A parede fica só com os recortes.',
    pastas: 'no índice, com as de dentro recuadas',
    tags: 'no índice; no recorte, as etiquetas kraft',
    grade: 'capas lado a lado, o nome embaixo',
  },
  {
    nome: 'Envelopes e etiquetas',
    como: 'Mais da cara da Wishlist: as pastas viram envelopes pardos com as capas de dentro espiando, e as tags, etiquetas de preço penduradas no recorte. A vontade tem atalho na barra (os adesivos).',
    pastas: 'envelopes pardos em cima da colagem',
    tags: 'etiquetas de preço penduradas no barbante',
    grade: 'a folha de contato da revista (o filme com os números)',
  },
  {
    nome: 'Catálogo com orelhas',
    como: 'As pastas viram as orelhas em cima da pasta da barra, como os grupos das Anotações. As tags ficam sempre à vista embaixo do picote: um toque filtra, o botão direito esconde.',
    pastas: 'orelhas de pasta manilha em cima da barra',
    tags: 'fileira de tags à vista na barra',
    grade: 'a página de cupons do catálogo, com o picote',
  },
  {
    nome: 'Mistura',
    como: 'As pastas e a ordem do jeito 1, com arrastar como nas Anotações: solte um recorte numa pasta (ou no caminho) para guardar, ou sobre outro recorte para criar uma pasta com os dois. As tags discretas do jeito 2; troque o jeito delas logo abaixo.',
    pastas: 'pastas manilha em cima; arrastar guarda, recorte sobre recorte cria pasta',
    tags: 'cinco jeitos para comparar (abaixo)',
    grade: 'a grade do jeito 1, do mesmo tamanho, com um pouco de revista: margem de papel, retícula e alguns rasgos',
    todos:
      'Tocar no recorte começa a resenha. Com o mouse em cima, dois botões: Editar e Vontade, que abre o menu para escolher. O lembrete não aparece na parede: com o mouse em cima de um recorte que tem um, ele surge ao lado numa folha arrancada do caderno (Silksong, Outer Wilds, It Takes Two, Baldur’s Gate 3, Death Stranding). O botão direito abre o menu do recorte.',
  },
];

type TagJeito = 'legenda' | 'legenda-cor' | 'caneta' | 'carimbo' | 'pontos';
const TAG_JEITOS: readonly { value: TagJeito; label: string }[] = [
  { value: 'legenda', label: 'Legenda' },
  { value: 'legenda-cor', label: 'Legenda com cor' },
  { value: 'caneta', label: 'À caneta' },
  { value: 'carimbo', label: 'Carimbo' },
  { value: 'pontos', label: 'Pontinhos' },
];

/** Um número que é sempre o mesmo para o mesmo id (o rasgo de cada capa na grade não muda). */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rngOf(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A beirada de baixo rasgada à mão: a linha sobe e desce uns pixels. */
function tornBottom(r: () => number): string {
  const pts = ['0 0', '100% 0'];
  const n = 12;
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(1)}% calc(100% - ${(r() * 7).toFixed(1)}px)`);
  return `polygon(${pts.join(', ')})`;
}
/** A quina de cima arrancada: uma diagonal torta. */
function tornCorner(r: () => number): string {
  const a = 66 + r() * 12;
  const b = 14 + r() * 10;
  const pts = ['0 0', `${a.toFixed(1)}% 0`];
  const n = 6;
  for (let i = 1; i < n; i++) {
    const x = a + ((100 - a) * i) / n + (r() - 0.5) * 3;
    const y = (b * i) / n + (r() - 0.5) * 3;
    pts.push(`${x.toFixed(1)}% ${Math.max(0, y).toFixed(1)}%`);
  }
  pts.push(`100% ${b.toFixed(1)}%`, '100% 100%', '0 100%');
  return `polygon(${pts.join(', ')})`;
}

export interface CelLook {
  kind: '' | 'rasgo' | 'canto' | 'picote' | 'dobra';
  tilt: number;
  velha: boolean;
  clip: string | null;
}

const ORDENS: readonly { value: Ordem; label: string }[] = [
  { value: 'recentes', label: 'Quando entrou' },
  { value: 'az', label: 'Nome' },
  { value: 'ano', label: 'Lançamento' },
];

/**
 * O laboratório da Wishlist (`/laboratorio/wishlist`): os cinco jeitos da tela nova, com dados de mentira, para
 * o dono escolher antes do plano. Escondida (nenhum link leva até aqui) e não grava nada: mexer na vontade, nas
 * tags ou na pasta muda só a memória da página. As peças são as de verdade (o recorte, a pasta, a folha dos
 * filtros, as tags); só o que é novo é desenhado aqui.
 */
@Component({
  selector: 'app-wishlist-lab-page',
  imports: [BackdropClose, ContextMenu, FilterCard, FilterTags, FolderCard, FolderPath, IconModule, NgTemplateOutlet, NoteTag, RelevanceSticker, SearchStrip, TagChips, WishClip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wishlist-lab-page.html',
  styleUrls: ['../ui/wish-adder.scss', './wishlist-lab-page.scss'],
})
export class WishlistLabPage {
  protected readonly jeitos = JEITOS;
  protected readonly ordens = ORDENS;
  protected readonly relevances = RELEVANCES;
  protected readonly relevanceLabel = relevanceLabel;
  protected readonly relOf = relevanceOf;
  protected readonly I = ICON;

  protected readonly jeito = signal(6);
  protected readonly tagJeitos = TAG_JEITOS;
  protected readonly tagJeito = signal<TagJeito>('legenda-cor');
  protected readonly vista = signal<Vista>('recortes');
  protected readonly wishes = signal<LabWish[]>(labWishes());
  protected readonly folders = signal<LabFolder[]>([...LAB_FOLDERS]);
  protected readonly query = signal('');
  protected readonly order = signal<Ordem>('recentes');
  protected readonly direction = signal<'desc' | 'asc'>('desc');
  protected readonly vontadeFirst = signal(true);
  protected readonly tagsOn = signal<ReadonlySet<string>>(new Set());
  protected readonly tagsOut = signal<ReadonlySet<string>>(new Set());
  protected readonly vontade = signal<Relevance | null>(null);
  protected readonly folder = signal<string | null>(null);
  protected readonly filterOpen = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected readonly sorteado = signal<string | null>(null);

  protected readonly orderLabel = computed(() => ORDENS.find((o) => o.value === this.order())!.label);
  protected readonly info = computed(() => this.jeitos[this.jeito() - 1]);
  /** Nos jeitos 1, 2 e 4 as pastas moram na parede e se entra nelas; no 3 e no 5, escolher uma pasta filtra. */
  protected readonly navigates = computed(() => [1, 2, 4, 6].includes(this.jeito()));

  private readonly byId = computed(() => new Map(this.folders().map((f) => [f.id, f])));
  protected readonly path = computed(() => {
    const out: LabFolder[] = [];
    for (let f = this.byId().get(this.folder() ?? ''); f; f = f.parent ? this.byId().get(f.parent) : undefined) out.unshift(f);
    return out;
  });
  protected readonly pathAsNote = computed(() => this.path().map((f) => ({ ...f, group: '' }) as unknown as NoteFolder));
  protected readonly childFolders = computed(() => this.folders().filter((f) => f.parent === this.folder()));
  protected readonly rootFolders = computed(() => this.folders().filter((f) => !f.parent));

  private subtree(id: string | null): Set<string | null> | null {
    if (id === null) return null;
    const out = new Set<string | null>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of this.folders()) if (f.parent && out.has(f.parent) && !out.has(f.id)) out.add(f.id), (grew = true);
    }
    return out;
  }
  private inside(w: LabWish, id: string | null): boolean {
    const set = this.subtree(id);
    return !set || set.has(w.folder ?? null);
  }

  protected readonly filtering = computed(() => !!this.query().trim() || this.tagsOn().size > 0 || this.tagsOut().size > 0 || !!this.vontade());
  /** Onde se procura: a pasta aberta (só as direto nela, nos jeitos que navegam; com filtro, ela e as de dentro). */
  protected readonly pool = computed(() => {
    const id = this.folder();
    if (this.navigates() && !this.filtering()) return this.wishes().filter((w) => (w.folder ?? null) === id);
    return this.wishes().filter((w) => this.inside(w, id));
  });
  protected readonly visible = computed(() => {
    const needle = fold(this.query().trim());
    const on = this.tagsOn();
    const out = this.tagsOut();
    const v = this.vontade();
    const list = this.pool().filter(
      (w) =>
        (!needle || fold(w.game.name).includes(needle) || fold(w.note ?? '').includes(needle)) &&
        [...on].every((t) => w.tags.includes(t)) &&
        !w.tags.some((t) => out.has(t)) &&
        (!v || relevanceOf(w) === v),
    );
    const dir = this.direction() === 'desc' ? 1 : -1;
    const by = this.order();
    const cmp = (a: LabWish, b: LabWish) =>
      by === 'az'
        ? -dir * a.game.name.localeCompare(b.game.name, 'pt-BR')
        : by === 'ano'
          ? dir * (Number(b.game.year ?? 0) - Number(a.game.year ?? 0))
          : dir * b.createdAt.localeCompare(a.createdAt);
    const rank = (w: LabWish) => (this.vontadeFirst() ? RELEVANCE_RANK[relevanceOf(w)] : 0);
    return [...list].sort((a, b) => rank(a) - rank(b) || cmp(a, b));
  });

  /** As tags, na cor de cada uma, contadas onde se procura. */
  protected readonly tagChips = computed<TagChip[]>(() => {
    const scope = this.wishes().filter((w) => this.inside(w, this.folder()));
    return LAB_TAGS.map((t) => ({
      value: t.name,
      label: t.name,
      n: scope.filter((w) => w.tags.includes(t.name)).length,
      on: this.tagsOn().has(t.name),
      out: this.tagsOut().has(t.name),
      color: t.color,
    })).sort((a, b) => b.n - a.n);
  });
  protected readonly vontadeOptions = computed<SubjectOption[]>(() => {
    const scope = this.wishes().filter((w) => this.inside(w, this.folder()));
    return RELEVANCES.map((r) => ({ value: r, label: relevanceLabel('jogos', r), n: scope.filter((w) => relevanceOf(w) === r).length, on: this.vontade() === r }));
  });
  protected readonly chips = computed(() => activeFilters(this.vontadeOptions(), this.tagChips()));
  protected readonly filterCount = computed(() => this.chips().length);
  protected readonly colorOf = (t: string) => LAB_TAGS.find((x) => x.name === t)?.color ?? null;

  // ===== A colagem =====
  private readonly wall = viewChild<ElementRef<HTMLElement>>('parede');
  protected readonly cols = signal(6);
  protected readonly columns = computed(() => collage(this.visible(), this.cols()));
  protected readonly sections = computed(() =>
    RELEVANCES.map((r) => {
      const list = this.visible().filter((w) => relevanceOf(w) === r);
      return { r, list, columns: collage(list, this.cols()) };
    }).filter((s) => s.list.length),
  );
  protected place(id: string) {
    return placeFor(id);
  }

  /** O que a pasta mostra: quantos recortes direto nela, quantas pastas, e três capas de dentro espiando. */
  protected folderInfo(f: LabFolder): FolderInfo {
    const sub = this.subtree(f.id)!;
    return {
      notes: this.wishes().filter((w) => w.folder === f.id).length,
      folders: this.folders().filter((x) => x.parent === f.id).length,
      peek: this.wishes()
        .filter((w) => sub.has(w.folder ?? null))
        .slice(0, 3) as unknown as Review[],
    };
  }
  protected asNote(f: LabFolder): NoteFolder {
    return { ...f, group: '' } as unknown as NoteFolder;
  }
  protected subtreeCount(f: LabFolder | null): number {
    return this.wishes().filter((w) => this.inside(w, f?.id ?? null)).length;
  }
  protected childrenOf(id: string): LabFolder[] {
    return this.folders().filter((f) => f.parent === id);
  }
  protected folderLabel(id: string | null): string {
    if (!id) return 'Sem pasta';
    const names: string[] = [];
    for (let f = this.byId().get(id); f; f = f.parent ? this.byId().get(f.parent) : undefined) names.unshift(f.name);
    return names.join(' › ');
  }

  // ===== O editar =====
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editing = computed(() => this.wishes().find((w) => w.id === this.editingId()) ?? null);
  protected readonly eRel = signal<Relevance>('comum');
  protected readonly eTags = signal<string[]>([]);
  protected readonly eFolder = signal<string | null>(null);
  protected readonly eNote = signal('');
  protected readonly eNovaTag = signal('');
  protected readonly ePreview = computed(() => {
    const w = this.editing();
    if (!w) return null;
    return { ...w, ...(this.eRel() === 'comum' ? { relevance: undefined } : { relevance: this.eRel() }) } as LabWish;
  });
  protected readonly eSugestoes = computed(() => LAB_TAGS.filter((t) => !this.eTags().includes(t.name)));
  protected readonly allFolders = computed(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (parent: string | null) => {
      for (const f of this.folders().filter((x) => x.parent === parent)) {
        out.push({ id: f.id, label: this.folderLabel(f.id) });
        walk(f.id);
      }
    };
    walk(null);
    return out;
  });

  // ===== Jeito 6: a grade com um pouco de revista =====
  private readonly looks = new Map<string, CelLook>();
  protected celLook(id: string): CelLook {
    let l = this.looks.get(id);
    if (!l) {
      const r = rngOf(hashOf(id));
      // a maioria lisa: alguns poucos rasgos
      const kinds: CelLook['kind'][] = ['', '', '', 'rasgo', '', 'canto', '', 'picote', '', 'dobra'];
      const kind = kinds[Math.floor(r() * kinds.length)];
      l = {
        kind,
        tilt: Math.round((r() * 1.6 - 0.8) * 10) / 10,
        velha: r() < 0.2,
        clip: kind === 'rasgo' ? tornBottom(r) : kind === 'canto' ? tornCorner(r) : null,
      };
      this.looks.set(id, l);
    }
    return l;
  }

  /** O lembrete abre do lado que tem espaço: à direita, ou à esquerda na beirada da tela. */
  protected side(e: Event): void {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    el.dataset['lado'] = r.right + 230 > window.innerWidth ? 'esq' : 'dir';
  }

  // ===== Os menus: a vontade (o botão) e o do recorte (o botão direito) =====
  private readonly menu = viewChild.required<ContextMenu>('menu');
  protected readonly menuCaption = signal('');
  protected readonly menuSections = signal<MenuSections>([]);
  private vontadeItems(w: LabWish): MenuItem[] {
    const hints: Record<Relevance, string> = { must: 'O adesivo vermelho; vem na frente', comum: 'Sem adesivo', later: 'O selo azul; vai para o fim' };
    return RELEVANCES.map((r) => ({
      id: r,
      label: r === 'comum' ? 'Comum' : relevanceLabel('jogos', r),
      icon: r === 'comum' ? ICON.semNada : ICON.adesivo,
      on: relevanceOf(w) === r,
      hint: hints[r],
      run: () => this.setRel(w, r),
    }));
  }
  protected vontadeMenu(w: LabWish, e: MouseEvent): void {
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    this.menuCaption.set('Quanta vontade?');
    this.menuSections.set([this.vontadeItems(w)]);
    this.menu().show({ key: 'v:' + w.id, x: r.left, y: r.bottom + 6, back: btn, by: e.detail === 0 ? 'teclado' : 'mouse' });
  }
  private cardSections(w: LabWish): MenuSections {
    return [
      [
        { id: 'resenha', label: 'Começar a resenha', icon: ICON.escrever, dialog: true, run: () => this.review(w) },
        { id: 'editar', label: 'Editar', icon: ICON.ajustar, dialog: true, run: () => this.edit(w) },
      ],
      this.vontadeItems(w),
      [{ id: 'tirar', label: 'Tirar da wishlist', icon: ICON.apagar, danger: true, run: () => this.removeById(w.id) }],
    ];
  }

  // ===== Arrastar (o gesto do Kanban e das Anotações, ui/drag-hold.ts) =====
  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  protected readonly dragHint = signal<{ text: string; x: number; y: number } | null>(null);
  protected readonly namingId = signal<string | null>(null);
  private ghost: HTMLElement | null = null;
  private source: HTMLElement | null = null;
  private dragged: LabWish | null = null;
  private grab = { x: 0, y: 0 };
  private target: { kind: 'pasta' | 'caminho' | 'ficha'; id: string | null; el: HTMLElement } | null = null;
  protected readonly drag = new DragHold<LabWish>({
    begin: (s) => {
      if (this.jeito() !== 6) return false;
      const r = s.el.getBoundingClientRect();
      this.grab = { x: s.x - r.left, y: s.y - r.top };
      const g = s.el.cloneNode(true) as HTMLElement;
      g.classList.add('arrasto-fantasma');
      g.removeAttribute('data-ficha');
      g.style.width = `${r.width}px`;
      g.style.transformOrigin = `${this.grab.x}px ${this.grab.y}px`;
      this.hostEl.appendChild(g);
      this.ghost = g;
      this.source = s.el;
      this.dragged = s.item;
      s.el.setAttribute('data-arrastada', '');
      return true;
    },
    move: (x, y) => {
      if (this.ghost) this.ghost.style.translate = `${x - this.grab.x}px ${y - this.grab.y}px`;
      const at = document.elementFromPoint(x, y);
      const pasta = at?.closest<HTMLElement>('app-folder-card[data-pasta]');
      const caminho = at?.closest<HTMLElement>('[data-caminho]');
      const ficha = at?.closest<HTMLElement>('[data-ficha]');
      const next = pasta
        ? { kind: 'pasta' as const, id: pasta.getAttribute('data-pasta'), el: pasta }
        : caminho
          ? { kind: 'caminho' as const, id: caminho.getAttribute('data-caminho') || null, el: caminho }
          : ficha && ficha !== this.source
            ? { kind: 'ficha' as const, id: ficha.getAttribute('data-ficha'), el: ficha }
            : null;
      if (next?.el !== this.target?.el) {
        this.target?.el.removeAttribute('data-alvo');
        next?.el.setAttribute('data-alvo', '');
        this.target = next;
      }
      const text = !next
        ? 'Solte numa pasta ou sobre outro recorte'
        : next.kind === 'ficha'
          ? 'Criar uma pasta com os dois'
          : `Guardar em ${next.id ? this.byId().get(next.id)?.name : 'Wishlist'}`;
      this.dragHint.set({ text, x: x + 16, y: y + 20 });
    },
    drop: () => {
      const t = this.target;
      const w = this.dragged;
      if (!t || !w) return;
      if (t.kind === 'ficha') {
        const other = this.wishes().find((x) => x.id === t.id);
        if (!other) return;
        const id = 'f-' + Math.random().toString(36).slice(2, 8);
        this.folders.update((l) => [...l, { id, name: 'Nova pasta', parent: this.folder() }]);
        this.moveTo([w.id, other.id], id);
        this.namingId.set(id);
      } else {
        this.moveTo([w.id], t.id);
        this.aviso.set(`“${w.game.name}” foi para ${t.id ? this.byId().get(t.id)?.name : 'a Wishlist'}.`);
      }
    },
    end: () => {
      this.ghost?.remove();
      this.ghost = null;
      this.source?.removeAttribute('data-arrastada');
      this.source = null;
      this.dragged = null;
      this.target?.el.removeAttribute('data-alvo');
      this.target = null;
      this.dragHint.set(null);
    },
    edge: (_x, y) => {
      if (y < 70) {
        window.scrollBy(0, -14);
        return true;
      }
      if (y > window.innerHeight - 70) {
        window.scrollBy(0, 14);
        return true;
      }
      return false;
    },
  });
  protected down(e: PointerEvent, w: LabWish): void {
    if ((e.target as HTMLElement).closest('.acoes')) return;
    this.drag.down(e, w, e.currentTarget as HTMLElement);
  }
  private moveTo(ids: string[], folder: string | null): void {
    this.wishes.update((l) => l.map((x) => (ids.includes(x.id) ? { ...x, folder: folder ?? undefined } : x)));
  }
  protected named(id: string, name: string | null): void {
    this.namingId.set(null);
    const clean = name?.trim();
    if (clean) this.folders.update((l) => l.map((f) => (f.id === id ? { ...f, name: clean } : f)));
  }
  private removeById(id: string): void {
    const w = this.wishes().find((x) => x.id === id);
    this.wishes.update((l) => l.filter((x) => x.id !== id));
    if (w) this.aviso.set(`“${w.game.name}” saiu da wishlist.`);
  }

  constructor() {
    const destroy = inject(DestroyRef);
    new ContextMenuTrigger({
      host: this.hostEl,
      targets: '[data-ficha]',
      keyOf: (box) => (this.jeito() === 6 ? box.getAttribute('data-ficha') : null),
      hold: true,
      isOpenFor: (id) => this.menu().isOpenFor(id),
      open: (id, box, x, y, by) => {
        const w = this.wishes().find((x) => x.id === id);
        if (!w) return;
        this.menuCaption.set(w.game.name);
        this.menuSections.set(this.cardSections(w));
        this.menu().show({ key: id, x, y, by, back: box.querySelector<HTMLElement>('.hit') });
      },
    });
    afterNextRender(() => {
      const ro = new ResizeObserver(() => this.measure());
      const el = this.wall()?.nativeElement;
      if (el) ro.observe(el);
      this.measure();
      destroy.onDestroy(() => ro.disconnect());
    });
    // o jeito novo pode ter outra largura de parede (o índice ocupa a esquerda)
    effect(() => {
      this.jeito();
      this.vista();
      requestAnimationFrame(() => this.measure());
    });
    effect(() => {
      const d = this.dialog()?.nativeElement;
      if (!d) return;
      if (this.editingId() && !d.open) d.showModal();
      if (!this.editingId() && d.open) d.close();
    });
  }

  private measure(): void {
    const el = this.wall()?.nativeElement;
    if (el) this.cols.set(shelfColumns(el.clientWidth, 172, 34));
  }

  protected setJeito(n: number): void {
    this.jeito.set(n);
    this.folder.set(null);
    this.filterOpen.set(false);
    this.aviso.set(null);
  }

  protected openFolder(id: string | null): void {
    this.folder.set(id);
    this.filterOpen.set(false);
  }

  protected toggleTag(t: string): void {
    const on = new Set(this.tagsOn());
    const out = new Set(this.tagsOut());
    if (out.has(t)) out.delete(t);
    else if (on.has(t)) on.delete(t);
    else on.add(t);
    this.tagsOn.set(on);
    this.tagsOut.set(out);
  }
  protected excludeTag(t: string): void {
    const on = new Set(this.tagsOn());
    const out = new Set(this.tagsOut());
    on.delete(t);
    if (out.has(t)) out.delete(t);
    else out.add(t);
    this.tagsOn.set(on);
    this.tagsOut.set(out);
  }
  protected chooseVontade(v: string | null): void {
    this.vontade.set(this.vontade() === v ? null : (v as Relevance | null));
  }
  protected removeChip(c: FilterChip): void {
    if (c.key === 'subject') this.vontade.set(null);
    else this.toggleTag(c.value);
  }
  protected clear(): void {
    this.query.set('');
    this.tagsOn.set(new Set());
    this.tagsOut.set(new Set());
    this.vontade.set(null);
  }

  protected setRel(w: LabWish, r: Relevance): void {
    this.wishes.update((list) => list.map((x) => (x.id === w.id ? ({ ...x, relevance: r === 'comum' ? undefined : r } as LabWish) : x)));
    this.aviso.set(`“${w.game.name}” agora é ${r === 'comum' ? 'Comum' : relevanceLabel('jogos', r)}`);
  }
  protected toggleRel(w: LabWish, r: Relevance): void {
    this.setRel(w, relevanceOf(w) === r ? 'comum' : r);
  }
  protected review(w: LabWish): void {
    this.aviso.set(`Aqui abriria o editor da resenha de “${w.game.name}” (no laboratório, nada muda).`);
  }
  protected draw(): void {
    const pool = this.visible().filter((w) => w.id !== this.sorteado());
    if (!pool.length) return;
    const w = pool[Math.floor(Math.random() * pool.length)];
    this.sorteado.set(w.id);
    this.aviso.set(`Que tal jogar “${w.game.name}”?`);
    requestAnimationFrame(() => document.querySelector(`[data-ficha="${w.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  protected edit(w: LabWish): void {
    this.eRel.set(relevanceOf(w));
    this.eTags.set([...w.tags]);
    this.eFolder.set(w.folder ?? null);
    this.eNote.set(w.note ?? '');
    this.eNovaTag.set('');
    this.editingId.set(w.id);
  }
  protected closeEdit(): void {
    this.editingId.set(null);
  }
  protected addTag(t: string): void {
    const name = t.trim().toLowerCase();
    if (name && !this.eTags().includes(name)) this.eTags.update((l) => [...l, name]);
    this.eNovaTag.set('');
  }
  protected dropTag(t: string): void {
    this.eTags.update((l) => l.filter((x) => x !== t));
  }
  protected save(e: Event): void {
    e.preventDefault();
    const id = this.editingId();
    this.wishes.update((list) =>
      list.map((x) =>
        x.id === id
          ? ({ ...x, relevance: this.eRel() === 'comum' ? undefined : this.eRel(), tags: this.eTags(), folder: this.eFolder() ?? undefined, note: this.eNote().trim() || undefined } as LabWish)
          : x,
      ),
    );
    this.aviso.set('Salvo (só nesta página).');
    this.closeEdit();
  }
  protected removeEditing(): void {
    const w = this.editing();
    if (!w) return;
    this.wishes.update((list) => list.filter((x) => x.id !== w.id));
    this.aviso.set(`“${w.game.name}” saiu da wishlist.`);
    this.closeEdit();
  }
  protected reviewEditing(): void {
    const w = this.editing();
    if (w) this.review(w);
    this.closeEdit();
  }
}
