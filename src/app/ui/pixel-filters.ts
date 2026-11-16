import { Signal, computed, inject, signal } from '@angular/core';
import { PIXEL_LOOKS, PixelLook } from '../core/pixel-art';
import { PIXEL_FOLDER_GROUP, PIXEL_TAG_SPACE, PixelPiece, pieceTitle, pixelArtOf } from '../core/pixel-gallery';
import { PixelFolders } from '../core/pixel-folders';
import { fold } from '../core/review';
import { Settings } from '../core/settings';
import { wishTagHex } from '../core/wishlist-view';
import { FilterChip } from './filter-sheet';
import { ICON } from './icons';
import { OptionRow, PICKER_ORDERS, PICKER_WHENS, PickerFacets, PickerOrder, PickerWhen, PlaceRow } from './picker-filters';
import { TagChip } from './tag-chips';

const DAY = 86_400_000;
/** A obra solta na raiz da galeria, no "Onde". */
const NO_FOLDER = 'sem';


type Facet = 'query' | 'folder' | 'look' | 'tags' | 'when';

/** O que se lê de cada obra uma vez só. */
interface Facts {
  name: string;
  tags: readonly string[];
  look: PixelLook;
  /** A pasta e as de cima dela (filtrar por uma pega as de dentro), ou "sem". */
  folders: readonly string[];
}

/**
 * Os filtros do seletor de pixel arts (ui/pixel-picker.ts), na mesma folha do seletor de fichas (`PickerFilters`):
 * o "Onde" com as pastas da galeria (a árvore, abrindo o caminho da escolhida), o Jeito (um por vez), quando foi
 * mexida, as tags nas cores da galeria e a ordem. Cada linha conta quantas deixaria com os outros ligados, e as
 * linhas não somem enquanto se filtra (a que não deixaria nenhuma desbota), como nas fichas.
 */
export class PixelFilters implements PickerFacets {
  readonly folder = signal<string | null>(null);
  readonly look = signal<PixelLook | null>(null);
  readonly tags = signal<readonly string[]>([]);
  readonly outs = signal<readonly string[]>([]);
  readonly when = signal<PickerWhen | null>(null);
  readonly order = signal<PickerOrder>('mexidas');
  readonly noun = signal<readonly [string, string]>(['pixel art', 'pixel arts']);
  readonly stateTitle = 'Jeito';
  readonly orders = PICKER_ORDERS;
  readonly markRows = signal<readonly OptionRow<string>[]>([]);
  /** A hora em que a folha abriu: o "hoje" e os "7 dias" não andam enquanto ela está aberta. */
  private readonly now = signal(Date.now());

  private readonly folders = inject(PixelFolders);
  private readonly settings = inject(Settings);

  constructor(
    /** As obras que podem ser escolhidas. */
    private readonly pieces: Signal<readonly PixelPiece[]>,
    /** A busca pelo nome (e pelas tags). */
    private readonly query: Signal<string>,
  ) {}

  private readonly facts = computed(() => {
    const tree = this.folders.tree();
    const where = this.folders.folderOf();
    const out = new Map<PixelPiece, Facts>();
    for (const p of this.pieces()) {
      const at = where.get(p.id) ?? null;
      out.set(p, {
        name: fold(pieceTitle(p)),
        tags: (p.tags ?? []).map(fold),
        look: pixelArtOf(p).look,
        folders: at ? tree.path(at).map((f) => f.id) : [NO_FOLDER],
      });
    }
    return out;
  });

  private readonly needle = computed(() => fold(this.query().trim()));

  private inWhen(p: PixelPiece, w: PickerWhen): boolean {
    const now = this.now();
    const at = Date.parse(p.at);
    if (w === 'hoje') return new Date(at).toDateString() === new Date(now).toDateString();
    const age = now - at;
    return w === 'semana' ? age <= 7 * DAY : w === 'mes' ? age <= 30 * DAY : age > 30 * DAY;
  }

  /** A obra passa por todos os filtros, menos os de `skip`. A busca acha no nome e nas tags. */
  private passes(p: PixelPiece, skip: readonly Facet[] = []): boolean {
    const f = this.facts().get(p);
    if (!f) return false;
    const q = this.needle();
    if (q && !skip.includes('query') && !f.name.includes(q) && !f.tags.some((t) => t.includes(q))) return false;
    const folder = this.folder();
    if (folder && !skip.includes('folder') && !f.folders.includes(folder)) return false;
    const look = this.look();
    if (look && !skip.includes('look') && f.look !== look) return false;
    if (!skip.includes('tags')) {
      const on = this.tags();
      const out = this.outs();
      if (on.length && !f.tags.some((k) => on.includes(k))) return false;
      if (out.length && f.tags.some((k) => out.includes(k))) return false;
    }
    const w = this.when();
    if (w && !skip.includes('when') && !this.inWhen(p, w)) return false;
    return true;
  }

  private count(skip: readonly Facet[], also: (p: PixelPiece) => boolean = () => true): number {
    let n = 0;
    for (const p of this.pieces()) if (also(p) && this.passes(p, skip)) n++;
    return n;
  }

  /**
   * O "Onde": "Todas" e a árvore das pastas da galeria que têm alguma obra (as de cima de A a Z, abrindo o caminho
   * da escolhida), com "Sem pasta" no fim. Sem pasta nenhuma com obra, nada (o índice não mostra o "Onde").
   */
  readonly placeRows = computed<PlaceRow[]>(() => {
    const tree = this.folders.tree();
    const facts = this.facts();
    const seen = new Set<string>();
    for (const f of facts.values()) for (const k of f.folders) seen.add(k);
    if (![...seen].some((k) => k !== NO_FOLDER)) return [];
    const chosen = this.folder();
    const open = new Set(chosen && chosen !== NO_FOLDER ? tree.path(chosen).map((x) => x.id) : []);
    const nOf = (k: string) => this.count(['folder'], (p) => facts.get(p)!.folders.includes(k));
    const kidsOf = (id: string | null) => tree.kids(PIXEL_FOLDER_GROUP, id).filter((x) => seen.has(x.id));
    const row = (type: PlaceRow['type'], value: string | null, label: string, depth: number, on: boolean, path: boolean, kids: boolean, icon: PlaceRow['icon'], n: number): PlaceRow => ({
      id: `${type}:${value ?? ''}`,
      type,
      value,
      label,
      depth,
      n,
      on,
      path,
      kids,
      icon,
      color: null,
    });
    const rows = [row('todas', null, 'Todas', 0, !chosen, false, false, ICON.pixelArt, this.count(['folder']))];
    const walk = (id: string | null, depth: number) => {
      for (const f of [...kidsOf(id)].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))) {
        const isOpen = open.has(f.id);
        rows.push(row('pasta', f.id, f.name, depth, chosen === f.id, isOpen && chosen !== f.id, kidsOf(f.id).length > 0, isOpen ? ICON.pasta : ICON.pastaDeNotas, nOf(f.id)));
        if (isOpen) walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    if (seen.has(NO_FOLDER)) rows.push(row('pasta', NO_FOLDER, 'Sem pasta', 1, chosen === NO_FOLDER, false, false, null, nOf(NO_FOLDER)));
    return rows;
  });

  /** Um toque numa linha do "Onde": ela fica escolhida; tocar de novo na escolhida sobe um nível. */
  choosePlace(p: PlaceRow): void {
    if (p.type === 'todas') this.folder.set(null);
    else if (p.type === 'pasta') this.folder.set(p.on ? (p.value === NO_FOLDER ? null : this.folders.tree().parentOf(p.value!)) : p.value);
  }

  /** O Jeito: os que alguma obra tem (com mais de um, ou com um ligado), um por vez. */
  readonly stateRows = computed<OptionRow<string>[]>(() => {
    const on = this.look();
    const facts = this.facts();
    const has = new Set([...facts.values()].map((f) => f.look));
    if (!on && has.size < 2) return [];
    return PIXEL_LOOKS.filter((l) => has.has(l.value) || l.value === on).map((l) => ({
      value: l.value,
      label: l.label,
      on: l.value === on,
      n: this.count(['look'], (p) => facts.get(p)!.look === l.value),
    }));
  });

  stateIcon(): null {
    return null;
  }

  toggleState(value: string): void {
    this.look.update((on) => (on === value ? null : (value as PixelLook)));
  }

  toggleMark(): void {
    // as pixel arts não têm marcas (fixada, privada, tarefa)
  }

  readonly whenRows = computed<OptionRow<PickerWhen>[]>(() => {
    const on = this.when();
    if (!on && this.pieces().length < 2) return [];
    return PICKER_WHENS.map((w) => ({ value: w.value, label: w.label, on: w.value === on, n: this.count(['when'], (p) => this.inWhen(p, w.value)) }));
  });

  toggleWhen(w: PickerWhen): void {
    this.when.update((on) => (on === w ? null : w));
  }

  /** As tags das obras, as mais usadas primeiro, nas cores das tags da galeria; cada uma com quantas deixaria. */
  readonly tagChips = computed<TagChip[]>(() => {
    const on = new Set(this.tags());
    const out = new Set(this.outs());
    const saved = this.settings.notesConfig().wishTagColors;
    const facts = this.facts();
    const seen = new Map<string, { label: string; uses: number; n: number; hides: number }>();
    for (const p of this.pieces()) {
      if (!this.passes(p, ['query', 'tags', 'look', 'when'])) continue;
      const found = this.passes(p, ['tags']);
      const keys = facts.get(p)!.tags;
      const shown = found && (!on.size || keys.some((k) => on.has(k))) && !keys.some((k) => out.has(k));
      (p.tags ?? []).forEach((t, i) => {
        const k = keys[i];
        const e = seen.get(k) ?? { label: t, uses: 0, n: 0, hides: 0 };
        e.uses++;
        if (shown) e.n++;
        if (found) e.hides++;
        seen.set(k, e);
      });
    }
    for (const k of [...on, ...out]) if (!seen.has(k)) seen.set(k, { label: k, uses: 0, n: 0, hides: 0 });
    return [...seen]
      .sort((a, b) => b[1].uses - a[1].uses || a[1].label.localeCompare(b[1].label, 'pt-BR', { sensitivity: 'base' }))
      .map(([value, e]) => {
        const color = wishTagHex(saved, PIXEL_TAG_SPACE, e.label);
        return out.has(value) ? { value, label: e.label, n: e.hides, on: false, out: true, color } : { value, label: e.label, n: e.n, on: on.has(value), color };
      });
  });

  toggleTag(value: string): void {
    if (this.outs().includes(value)) {
      this.outs.update((o) => o.filter((t) => t !== value));
      return;
    }
    this.tags.update((on) => (on.includes(value) ? on.filter((t) => t !== value) : [...on, value]));
  }

  excludeTag(value: string): void {
    if (this.outs().includes(value)) {
      this.toggleTag(value);
      return;
    }
    this.tags.update((on) => on.filter((t) => t !== value));
    this.outs.update((o) => [...o, value]);
  }

  /** Os filtros ligados, como os adesivos com X do mural. */
  readonly chips = computed<FilterChip[]>(() => {
    const out: FilterChip[] = [];
    const folder = this.folder();
    if (folder) out.push({ key: 'place', value: '', label: folder === NO_FOLDER ? 'Sem pasta' : this.folders.tree().path(folder).map((f) => f.name).join(' › ') });
    const look = this.look();
    if (look) out.push({ key: 'state', value: look, label: PIXEL_LOOKS.find((l) => l.value === look)?.label ?? look });
    for (const t of this.tagChips()) {
      if (t.out) out.push({ key: 'out', value: t.value, label: `Sem #${t.label}` });
      else if (t.on) out.push({ key: 'tag', value: t.value, label: `#${t.label}` });
    }
    const w = this.when();
    if (w) out.push({ key: 'when', value: w, label: PICKER_WHENS.find((x) => x.value === w)!.chip });
    return out;
  });

  removeChip(c: FilterChip): void {
    if (c.key === 'place') this.folder.set(null);
    else if (c.key === 'state') this.look.set(null);
    else if (c.key === 'tag' || c.key === 'out') this.toggleTag(c.value);
    else if (c.key === 'when') this.when.set(null);
  }

  readonly active = computed(() => this.chips().length > 0);
  /** Quantas a lista teria só com a busca (o "de N" do "Mostrando"). */
  readonly before = computed(() => this.count(['folder', 'look', 'tags', 'when']));
  readonly matching = computed(() => this.pieces().filter((p) => this.passes(p)));

  /** Na ordem escolhida (desempate pelo nome). */
  compare(a: PixelPiece, b: PixelPiece): number {
    const o = this.order();
    const byName = pieceTitle(a).localeCompare(pieceTitle(b), 'pt-BR');
    if (o === 'az') return byName;
    const key = o === 'criadas' ? 'createdAt' : 'at';
    return b[key].localeCompare(a[key]) || byName;
  }

  setOrder(value: string): void {
    if (PICKER_ORDERS.some((o) => o.value === value)) this.order.set(value as PickerOrder);
  }

  clear(): void {
    this.folder.set(null);
    this.look.set(null);
    this.tags.set([]);
    this.outs.set([]);
    this.when.set(null);
  }

  /** Ao abrir o seletor: tudo desligado, na ordem das mexidas há pouco. */
  reset(): void {
    this.clear();
    this.order.set('mexidas');
    this.now.set(Date.now());
  }
}
