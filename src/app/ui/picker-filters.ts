import { ChangeDetectionStrategy, Component, ElementRef, Injector, Signal, afterNextRender, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { NoteFolders } from '../core/note-folders';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { Kind, NOTES, cap, profileOf } from '../core/kinds';
import { Review, fold, isDone, isNote, isPinnedNote, isPrivate } from '../core/review';
import { Settings } from '../core/settings';
import { activeOrder } from '../core/mural-config';
import { NO_CATEGORY_TAB, noteTabKey, noteTabsOf } from '../core/note-tabs';
import { categoryColorHex, lookKey, tagColorHex } from '../core/category-looks';
import { tasksOf } from '../core/rich-text';
import { subjectValuesOf } from '../core/wall-filter';
import { plural } from '../core/text';
import { categoryIcon } from './category-label';
import { FilterChip, FilterTags } from './filter-sheet';
import { KIND_ICON } from './kind-switcher';
import { TagChip, TagChips } from './tag-chips';

/** O "Sem pasta" no filtro (como no mural e no Kanban). */
const NO_FOLDER = 'sem';
const DAY = 86_400_000;

/** Aberta ou finalizada (só a anotação se finaliza). */
export type PickerState = 'todas' | 'abertas' | 'finalizadas';
/** O que a anotação tem: fixada no mural, privada, com tarefa por fazer (vale cada uma ligada). */
export type PickerMark = 'fixadas' | 'privadas' | 'tarefas';
/** Quando foi mexida pela última vez. */
export type PickerWhen = 'hoje' | 'semana' | 'mes' | 'antes';
/** A ordem da lista. */
export type PickerOrder = 'mexidas' | 'criadas' | 'az';

/** Os filtros, para contar cada um com os outros ligados ("quantas ele deixaria"). */
type Facet = 'query' | 'kind' | 'group' | 'folder' | 'tags' | 'state' | 'marks' | 'when';

/** O que se lê de cada ficha uma vez só (a busca, a pasta, as tags e as tarefas não mudam enquanto se filtra). */
interface Facts {
  note: boolean;
  name: string;
  group: string;
  folders: readonly string[];
  tags: readonly string[];
  tasks: boolean;
}

/**
 * Uma linha do "Onde": o mural, o grupo ou a pasta (a árvore, recuada por nível), ou "Todas". `path`: a
 * linha está no caminho da escolhida (o grupo da pasta escolhida); `kids`: tem pastas dentro, que
 * aparecem ao escolher.
 */
export interface PlaceRow {
  id: string;
  /** `vazias`: a linha que mostra as pastas sem nenhuma com os filtros de agora (recolhidas). */
  type: 'todas' | 'mural' | 'grupo' | 'pasta' | 'vazias';
  value: string | null;
  label: string;
  depth: number;
  n: number;
  on: boolean;
  path: boolean;
  kids: boolean;
  icon: LucideIconData | null;
  color: string | null;
}

/** Uma escolha de uma linha (o estado, a marca, o quando): o valor, o nome, quantas deixaria e se está ligada. */
export interface OptionRow<T extends string> {
  value: T;
  label: string;
  n: number;
  on: boolean;
}

/** As duas escolhas do estado; nenhuma ligada, as duas aparecem. */
const STATES: readonly { value: PickerState; label: string }[] = [
  { value: 'abertas', label: 'Abertas' },
  { value: 'finalizadas', label: 'Finalizadas' },
];
const MARKS: readonly { value: PickerMark; label: string; chip: string; notesOnly: boolean }[] = [
  { value: 'fixadas', label: 'Fixadas no mural', chip: 'Fixadas', notesOnly: true },
  { value: 'tarefas', label: 'Com tarefa por fazer', chip: 'Com tarefa por fazer', notesOnly: true },
  { value: 'privadas', label: 'Privadas', chip: 'Privadas', notesOnly: false },
];
const WHENS: readonly { value: PickerWhen; label: string; chip: string }[] = [
  { value: 'hoje', label: 'Hoje', chip: 'Mexidas hoje' },
  { value: 'semana', label: 'Nos últimos 7 dias', chip: 'Últimos 7 dias' },
  { value: 'mes', label: 'Nos últimos 30 dias', chip: 'Últimos 30 dias' },
  { value: 'antes', label: 'Há mais de 30 dias', chip: 'Há mais de 30 dias' },
];
export const PICKER_ORDERS: readonly { value: PickerOrder; label: string }[] = [
  { value: 'mexidas', label: 'Mexidas há pouco' },
  { value: 'criadas', label: 'Criadas há pouco' },
  { value: 'az', label: 'Nome, de A a Z' },
];

/**
 * O que filtra a lista de um seletor de fichas (o "Escolher a nota" e o "Escolher fichas" do perfil),
 * além da busca: o lugar (o mural, o grupo e a pasta, numa árvore só), as tags, o estado (aberta ou
 * finalizada), as marcas (fixada, privada, com tarefa por fazer) e quando foi mexida; e a ordem.
 *
 * O grupo, a pasta, as tags, o estado, a fixada e a tarefa são das anotações: valem com a lista nas
 * anotações. A privada e o quando valem em qualquer mural. Cada filtro conta quantas deixaria com os
 * outros ligados, e as linhas não somem enquanto se filtra (a que não deixaria nenhuma desbota): elas
 * existem pelo que há no mural escolhido, e só as contas mudam.
 */
export class CardFilters {
  readonly group = signal<string | null>(null);
  /** A pasta (o id, ou "sem"): uma só, como no mural; filtrar por ela pega as de dentro. */
  readonly folder = signal<string | null>(null);
  readonly tags = signal<readonly string[]>([]);
  /** As tags escondidas: "todas, menos estas" (o clique direito, como no mural). */
  readonly outs = signal<readonly string[]>([]);
  readonly state = signal<PickerState>('todas');
  readonly marks = signal<readonly PickerMark[]>([]);
  readonly when = signal<PickerWhen | null>(null);
  readonly order = signal<PickerOrder>('mexidas');
  /** As pastas que não deixariam nenhuma, à mostra mesmo filtrando (o "+N pastas vazias"). */
  readonly emptyFolders = signal(false);
  /** A hora em que a folha abriu: o "hoje" e os "7 dias" não andam enquanto ela está aberta. */
  private readonly now = signal(Date.now());

  private readonly settings = inject(Settings);
  private readonly folders = inject(NoteFolders);

  constructor(
    /** As fichas que podem ser escolhidas, de todos os murais da lista. */
    private readonly cards: Signal<readonly Review[]>,
    /** O mural da lista (null: todos). */
    readonly kind: Signal<Kind | null>,
    /** A busca pelo nome. */
    private readonly query: Signal<string>,
    /** O grupo fixo (o "Buscar nota" do quadro de um grupo): sem os grupos no "Onde", com as pastas dele. */
    private readonly fixedGroup: Signal<string | null> = signal(null),
    /** Os murais do "Onde", na ordem (null: a lista é de um mural só). */
    private readonly kinds: Signal<readonly Kind[] | null> = signal(null),
  ) {}

  /** A lista está nas anotações: o grupo, a pasta, as tags, o estado, a fixada e a tarefa valem. */
  readonly notesScope = computed(() => this.kind() === NOTES);

  private readonly facts = computed(() => {
    const tree = this.folders.tree();
    const out = new Map<Review, Facts>();
    for (const r of this.cards()) {
      const note = isNote(r);
      out.set(r, {
        note,
        name: fold(r.game.name),
        group: noteTabKey(r),
        folders: note ? subjectValuesOf(r, tree) : [],
        tags: (r.tags ?? []).map(fold),
        tasks: note && [...tasksOf(r.text).values()].some((done) => !done),
      });
    }
    return out;
  });

  private readonly needle = computed(() => fold(this.query().trim()));

  private hasMark(r: Review, f: Facts, m: PickerMark): boolean {
    if (m === 'privadas') return isPrivate(r);
    if (m === 'fixadas') return f.note && isPinnedNote(r);
    return f.tasks;
  }

  private inWhen(r: Review, w: PickerWhen): boolean {
    const now = this.now();
    const at = Date.parse(r.updatedAt);
    if (w === 'hoje') return new Date(at).toDateString() === new Date(now).toDateString();
    const age = now - at;
    return w === 'semana' ? age <= 7 * DAY : w === 'mes' ? age <= 30 * DAY : age > 30 * DAY;
  }

  /**
   * A ficha passa por todos os filtros, menos os de `skip`. Os das anotações só valem com a lista nelas,
   * e só para a anotação (no "Todos os murais", o jogo não tem grupo nem tag).
   */
  private passes(r: Review, skip: readonly Facet[] = [], extra: PickerMark | null = null): boolean {
    const f = this.facts().get(r);
    if (!f) return false;
    const q = this.needle();
    if (q && !skip.includes('query') && !f.name.includes(q)) return false;
    const kind = this.kind();
    if (kind && !skip.includes('kind') && r.kind !== kind) return false;
    const notes = this.notesScope() && f.note;
    if (notes) {
      const g = this.group();
      if (g && !skip.includes('group') && f.group !== g) return false;
      const folder = this.folder();
      if (folder && !skip.includes('folder') && !f.folders.includes(folder)) return false;
      if (!skip.includes('tags')) {
        const on = this.tags();
        const out = this.outs();
        if (on.length && !f.tags.some((k) => on.includes(k))) return false;
        if (out.length && f.tags.some((k) => out.includes(k))) return false;
      }
      const s = this.state();
      if (s !== 'todas' && !skip.includes('state') && isDone(r) !== (s === 'finalizadas')) return false;
    }
    if (!skip.includes('marks')) {
      for (const m of this.marks()) if (!this.hasMark(r, f, m)) return false;
    }
    if (extra && !this.hasMark(r, f, extra)) return false;
    const w = this.when();
    if (w && !skip.includes('when') && !this.inWhen(r, w)) return false;
    return true;
  }

  private count(skip: readonly Facet[], also: (r: Review) => boolean = () => true, extra: PickerMark | null = null): number {
    let n = 0;
    for (const r of this.cards()) if (also(r) && this.passes(r, skip, extra)) n++;
    return n;
  }

  /** As anotações do mural da lista (e do grupo fixo): de onde saem os grupos, as pastas e as tags. */
  private readonly notes = computed(() => (this.notesScope() ? this.cards().filter(isNote) : []));

  /**
   * Os grupos, na ordem das abas do mural, com o nome de cada chave (a grafia mais usada). Com um grupo só
   * o mural não tem abas, mas o "Onde" mostra o grupo mesmo assim: é por ele que se chega às pastas.
   */
  private readonly groupTabs = computed(() => {
    const notes = this.notes();
    if (this.fixedGroup() || !notes.length) return [];
    const { tabs } = noteTabsOf(notes, undefined, 'Sem grupo', activeOrder(this.settings.notesConfig()));
    if (tabs.length) return tabs;
    const key = noteTabKey(notes[0]);
    return [{ key, label: key === NO_CATEGORY_TAB ? 'Sem grupo' : notes[0].category!, n: notes.length, total: notes.length }];
  });

  /** As pastas do grupo escolhido (ou do fixo), as de cima de A a Z e as de dentro do caminho escolhido, com "Sem pasta" no fim. */
  private folderRows(depth: number): PlaceRow[] {
    const g = this.group();
    if (!this.fixedGroup() && (!g || g === NO_CATEGORY_TAB)) return [];
    const tree = this.folders.tree();
    const facts = this.facts();
    const seen = new Set<string>();
    for (const r of this.notes()) {
      const f = facts.get(r)!;
      if (g && f.group !== g) continue;
      for (const k of f.folders) seen.add(k);
    }
    if (![...seen].some((k) => k !== NO_FOLDER)) return [];
    const chosen = this.folder();
    const open = new Set(chosen && chosen !== NO_FOLDER ? tree.path(chosen).map((x) => x.id) : []);
    const nameOf = (id: string) => tree.index.get(id)?.name ?? id;
    const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b), 'pt-BR', { sensitivity: 'base' });
    const kidsOf = (id: string | null) => [...seen].filter((k) => k !== NO_FOLDER && (id === null ? !seen.has(tree.parentOf(k) ?? '') : tree.parentOf(k) === id)).sort(byName);
    // filtrando por outra coisa, as pastas que não deixariam nenhuma ficam recolhidas numa linha só
    const fold = this.filtering() && !this.emptyFolders();
    // quantas cada pasta deixaria (contadas uma vez: a linha e a setinha da de cima usam)
    const nOf = new Map([...seen].map((k) => [k, this.count(['folder'], (r) => facts.get(r)!.folders.includes(k))]));
    // a setinha de "tem pastas dentro" só quando alguma de dentro vai aparecer
    const showsKids = (k: string) => kidsOf(k).some((c) => !fold || nOf.get(c)! > 0);
    let hidden = 0;
    const rows: PlaceRow[] = [];
    const add = (row: PlaceRow) => {
      if (fold && !row.n && !row.on && !row.path) hidden++;
      else rows.push(row);
    };
    const walk = (id: string | null, d: number) => {
      for (const k of kidsOf(id)) {
        add(this.placeRow('pasta', k, nameOf(k), d, chosen === k, open.has(k) && chosen !== k, showsKids(k), open.has(k) ? ICON.pasta : ICON.pastaDeNotas, null, nOf.get(k)));
        if (open.has(k)) walk(k, d + 1);
      }
    };
    walk(null, depth);
    if (seen.has(NO_FOLDER)) add(this.placeRow('pasta', NO_FOLDER, 'Sem pasta', depth, chosen === NO_FOLDER, false, false, null, null, nOf.get(NO_FOLDER)));
    if (hidden) {
      const label = hidden === 1 ? '+1 pasta vazia' : `+${hidden} pastas vazias`;
      rows.push({ id: 'vazias', type: 'vazias', value: null, label, depth, n: 0, on: false, path: false, kids: false, icon: null, color: null });
    }
    return rows;
  }

  private placeRow(
    type: PlaceRow['type'],
    value: string | null,
    label: string,
    depth: number,
    on: boolean,
    path: boolean,
    kids: boolean,
    icon: LucideIconData | null,
    color: string | null,
    counted?: number,
  ): PlaceRow {
    const n =
      counted !== undefined
        ? counted
        : type === 'pasta'
        ? this.count(['folder'], (r) => this.facts().get(r)!.folders.includes(value!))
        : type === 'grupo'
          ? this.count(['group', 'folder'], (r) => isNote(r) && this.facts().get(r)!.group === value)
          : type === 'mural'
            ? this.count(['kind', 'group', 'folder'], (r) => r.kind === value)
            : this.count(this.kinds() ? ['kind', 'group', 'folder'] : ['group', 'folder']);
    return { id: `${type}:${value ?? ''}`, type, value, label, depth, n, on, path, kids, icon, color };
  }

  private groupRows(depth: number): PlaceRow[] {
    const looks = this.settings.categoryLooks();
    const on = this.group();
    const folder = this.folder();
    // os grupos que têm pasta: a setinha diz que abrem ao escolher
    const facts = this.facts();
    const withFolders = new Set(this.notes().filter((r) => facts.get(r)!.folders.some((k) => k !== NO_FOLDER)).map((r) => facts.get(r)!.group));
    return this.groupTabs().flatMap((t) => {
      const look = t.key === NO_CATEGORY_TAB ? {} : (looks[lookKey(t.label)] ?? {});
      const icon = t.key === NO_CATEGORY_TAB ? null : categoryIcon(t.label, look);
      const row = this.placeRow('grupo', t.key, t.label, depth, t.key === on && !folder, t.key === on && !!folder, withFolders.has(t.key), icon, categoryColorHex(look.color));
      return t.key === on ? [row, ...this.folderRows(depth + 1)] : [row];
    });
  }

  /**
   * O "Onde": "Todas" (ou "Todos os murais"), os murais que têm alguma ficha, os grupos das anotações e,
   * dentro do grupo escolhido, a árvore das pastas (abrindo o caminho da escolhida). Num mural só, a
   * árvore começa nos grupos; com o grupo fixo, nas pastas dele.
   */
  readonly placeRows = computed<PlaceRow[]>(() => {
    const kinds = this.kinds();
    const kind = this.kind();
    const some = !this.group() && !this.folder();
    if (kinds) {
      const has = new Set(this.cards().map((r) => r.kind));
      const rows = [this.placeRow('todas', null, 'Todos os murais', 0, kind === null, false, false, ICON.parede, null)];
      for (const k of kinds) {
        if (!has.has(k)) continue;
        rows.push(this.placeRow('mural', k, cap(profileOf(k).plural), 0, kind === k && some, kind === k && !some, k === NOTES, KIND_ICON[k], null));
        if (k === NOTES && kind === NOTES) rows.push(...this.groupRows(1));
      }
      return rows;
    }
    const fixed = !!this.fixedGroup();
    // com o grupo fixo, "Todas de Trabalho" (o nome como está escrito nas anotações dele)
    const fixedLabel = fixed ? this.notes().find((r) => r.category)?.category : null;
    const all = this.placeRow('todas', null, fixedLabel ? `Todas de ${fixedLabel}` : 'Todas', 0, some, false, false, ICON.anotacoes, null);
    const below = this.notesScope() ? (fixed ? this.folderRows(0) : this.groupRows(0)) : [];
    return below.length ? [all, ...below] : [];
  });

  /** Algum filtro além do lugar (ou a busca): as pastas vazias se recolhem. */
  private readonly filtering = computed(
    () => !!this.needle() || this.tags().length > 0 || this.outs().length > 0 || this.state() !== 'todas' || this.marks().length > 0 || !!this.when(),
  );

  /** Um toque numa linha do "Onde": ela fica escolhida; tocar de novo na escolhida sobe um nível. */
  choosePlace(p: PlaceRow, setKind: (k: Kind | null) => void): void {
    if (p.type === 'vazias') {
      this.emptyFolders.set(true);
      return;
    }
    // em outro lugar, as pastas vazias se recolhem de novo (são de cada grupo)
    if (p.type !== 'pasta') this.emptyFolders.set(false);
    if (p.type === 'todas') {
      this.group.set(null);
      this.folder.set(null);
      if (this.kinds()) this.chooseKind(null, setKind);
    } else if (p.type === 'mural') {
      const k = p.value as Kind;
      if (p.on) this.chooseKind(null, setKind);
      else if (this.kind() === k) {
        this.group.set(null);
        this.folder.set(null);
      } else this.chooseKind(k, setKind);
    } else if (p.type === 'grupo') {
      if (p.on) this.group.set(null);
      else this.group.set(p.value);
      this.folder.set(null);
    } else {
      this.folder.set(p.on ? (this.folders.tree().parentOf(p.value!) ?? null) : p.value);
    }
  }

  /** Trocar de mural: o que é das anotações (o grupo, a pasta, as tags, o estado, a fixada e a tarefa) fica para trás. */
  private chooseKind(k: Kind | null, setKind: (k: Kind | null) => void): void {
    setKind(k);
    if (k !== NOTES) {
      this.group.set(null);
      this.folder.set(null);
      this.tags.set([]);
      this.outs.set([]);
      this.state.set('todas');
      this.marks.update((m) => m.filter((x) => x === 'privadas'));
    }
  }

  /** O estado (só nas anotações, e só quando há alguma finalizada ou ele está ligado): abertas ou finalizadas, um toque liga, outro tira. */
  readonly stateRows = computed<OptionRow<PickerState>[]>(() => {
    if (!this.notesScope()) return [];
    const on = this.state();
    const notes = this.notes();
    if (on === 'todas' && !notes.some(isDone)) return [];
    return STATES.map((s) => ({
      ...s,
      on: s.value === on,
      n: this.count(['state'], (r) => isNote(r) && isDone(r) === (s.value === 'finalizadas')),
    }));
  });

  /** As marcas que alguma ficha da lista tem (ou que estão ligadas), cada uma com quantas deixaria. */
  readonly markRows = computed<OptionRow<PickerMark>[]>(() => {
    const on = this.marks();
    const kind = this.kind();
    const facts = this.facts();
    const scope = this.cards().filter((r) => !kind || r.kind === kind);
    return MARKS.filter((m) => on.includes(m.value) || ((!m.notesOnly || this.notesScope()) && scope.some((r) => this.hasMark(r, facts.get(r)!, m.value)))).map((m) => ({
      value: m.value,
      label: m.label,
      on: on.includes(m.value),
      n: this.count(['marks'], (r) => on.every((x) => x === m.value || this.hasMark(r, facts.get(r)!, x)), m.value),
    }));
  });

  /** Quando foi mexida: cada faixa com quantas deixaria (só com mais de uma ficha na lista). */
  readonly whenRows = computed<OptionRow<PickerWhen>[]>(() => {
    const on = this.when();
    if (!on && this.cards().length < 2) return [];
    return WHENS.map((w) => ({ value: w.value, label: w.label, on: w.value === on, n: this.count(['when'], (r) => this.inWhen(r, w.value)) }));
  });

  /**
   * As tags das anotações do lugar escolhido, as mais usadas primeiro, na cor de cada uma (a do grupo
   * da primeira anotação com ela, como no mural); cada uma com quantas deixaria com os outros filtros
   * (a escondida, quantas ela tira).
   */
  readonly tagChips = computed<TagChip[]>(() => {
    if (!this.notesScope()) return [];
    const on = new Set(this.tags());
    const out = new Set(this.outs());
    const looks = this.settings.categoryLooks();
    const facts = this.facts();
    const seen = new Map<string, { spell: Map<string, number>; uses: number; n: number; hides: number; group: string }>();
    for (const r of this.notes()) {
      if (!this.passes(r, ['query', 'tags', 'state', 'marks', 'when'])) continue;
      const found = this.passes(r, ['tags']);
      const keys = facts.get(r)!.tags;
      const shown = found && (!on.size || keys.some((k) => on.has(k))) && !keys.some((k) => out.has(k));
      for (const k of new Set(keys)) {
        const e = seen.get(k) ?? { spell: new Map<string, number>(), uses: 0, n: 0, hides: 0, group: r.category ?? '' };
        e.uses++;
        if (shown) e.n++;
        if (found) e.hides++;
        seen.set(k, e);
      }
      for (const t of r.tags ?? []) {
        const m = seen.get(fold(t))!.spell;
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    for (const k of [...on, ...out]) if (!seen.has(k)) seen.set(k, { spell: new Map(), uses: 0, n: 0, hides: 0, group: '' });
    return [...seen]
      .map(([value, e]) => {
        const label = e.spell.size ? [...e.spell].reduce((a, x) => (x[1] > a[1] ? x : a))[0] : value;
        const color = tagColorHex(looks, label, e.group);
        const chip: TagChip & { uses: number } = out.has(value)
          ? { value, label, n: e.hides, on: false, out: true, color, uses: e.uses }
          : { value, label, n: e.n, on: on.has(value), color, uses: e.uses };
        return chip;
      })
      .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }))
      .map(({ uses: _u, ...chip }) => chip);
  });

  /** Os filtros ligados, como os adesivos com X do mural (no celular, embaixo da busca). */
  readonly chips = computed<FilterChip[]>(() => {
    const out: FilterChip[] = [];
    const place = this.placeLabel();
    if (place) out.push({ key: 'place', value: '', label: place });
    for (const t of this.tagChips()) {
      if (t.out) out.push({ key: 'out', value: t.value, label: `Sem #${t.label}` });
      else if (t.on) out.push({ key: 'tag', value: t.value, label: `#${t.label}` });
    }
    const s = this.state();
    if (s !== 'todas' && this.notesScope()) out.push({ key: 'state', value: s, label: s === 'abertas' ? 'Abertas' : 'Finalizadas' });
    for (const m of this.marks()) out.push({ key: 'mark', value: m, label: MARKS.find((x) => x.value === m)!.chip });
    const w = this.when();
    if (w) out.push({ key: 'when', value: w, label: WHENS.find((x) => x.value === w)!.chip });
    return out;
  });

  /** O grupo e a pasta escolhidos, numa linha ("Trabalho › Backend"), ou null. */
  private readonly placeLabel = computed(() => {
    if (!this.notesScope()) return null;
    const g = this.group();
    const folder = this.folder();
    const group = g ? (this.groupTabs().find((t) => t.key === g)?.label ?? null) : null;
    const tree = this.folders.tree();
    const where = folder === NO_FOLDER ? 'Sem pasta' : folder ? tree.path(folder).map((f) => f.name).join(' › ') : null;
    return [group, where].filter(Boolean).join(' › ') || null;
  });

  /** Tirar um adesivo: o mesmo que desligar o filtro dele. */
  removeChip(c: FilterChip): void {
    if (c.key === 'place') {
      this.group.set(null);
      this.folder.set(null);
    } else if (c.key === 'tag' || c.key === 'out') this.toggleTag(c.value);
    else if (c.key === 'state') this.state.set('todas');
    else if (c.key === 'mark') this.toggleMark(c.value as PickerMark);
    else if (c.key === 'when') this.when.set(null);
  }

  /** Algum filtro ligado (fora a busca e o mural). */
  readonly active = computed(() => this.chips().length > 0);

  /** Quantas a lista teria só com o mural e a busca (o "de N" do "Mostrando"). */
  readonly before = computed(() => this.count(['group', 'folder', 'tags', 'state', 'marks', 'when']));

  /** A lista com tudo, ainda sem ordem. */
  readonly matching = computed(() => this.cards().filter((r) => this.passes(r)));

  /** Na ordem escolhida (desempate pelo nome). */
  compare(a: Review, b: Review): number {
    const o = this.order();
    const byName = a.game.name.localeCompare(b.game.name, 'pt-BR');
    if (o === 'az') return byName;
    const key = o === 'criadas' ? 'createdAt' : 'updatedAt';
    return b[key].localeCompare(a[key]) || byName;
  }

  /** Só o estado "Abertas" ligado (o costume do Kanban): a lista vazia diz que só há finalizadas. */
  readonly onlyOpenOn = computed(() => this.state() === 'abertas' && this.chips().length === 1);

  toggleState(s: PickerState): void {
    this.state.update((on) => (on === s ? 'todas' : s));
  }

  toggleMark(m: PickerMark): void {
    this.marks.update((on) => (on.includes(m) ? on.filter((x) => x !== m) : [...on, m]));
  }

  toggleWhen(w: PickerWhen): void {
    this.when.update((on) => (on === w ? null : w));
  }

  /** O clique numa tag: liga ou desliga; na escondida, mostra de novo. */
  toggleTag(value: string): void {
    if (this.outs().includes(value)) {
      this.outs.update((o) => o.filter((t) => t !== value));
      return;
    }
    this.tags.update((on) => (on.includes(value) ? on.filter((t) => t !== value) : [...on, value]));
  }

  /** O clique direito numa tag: esconde as anotações dela (sai das ligadas); na escondida, mostra de novo. */
  excludeTag(value: string): void {
    if (this.outs().includes(value)) {
      this.toggleTag(value);
      return;
    }
    this.tags.update((on) => on.filter((t) => t !== value));
    this.outs.update((o) => [...o, value]);
  }

  /** Limpar: nenhum filtro ligado (a busca, o mural e a ordem ficam como estão). */
  clear(): void {
    this.group.set(null);
    this.folder.set(null);
    this.tags.set([]);
    this.outs.set([]);
    this.state.set('todas');
    this.marks.set([]);
    this.when.set(null);
    this.emptyFolders.set(false);
  }

  /** Ao abrir o seletor: tudo desligado, as finalizadas fora onde é o costume (o Kanban) e a ordem de quem usa. */
  reset(opts: { onlyOpen?: boolean; order?: PickerOrder } = {}): void {
    this.clear();
    this.state.set(opts.onlyOpen ? 'abertas' : 'todas');
    this.order.set(opts.order ?? 'mexidas');
    this.now.set(Date.now());
  }
}

let nextId = 0;

/**
 * A folha de escolher fichas, sem o cabeçalho e o pé de quem usa: a busca (a de quem usa, projetada
 * como `.busca`) em cima; embaixo, o índice dos filtros à esquerda e a lista (projetada) à direita, cada
 * um com a sua rolagem, de modo que a lista nunca some atrás dos filtros. Em cima da lista, quantas
 * mostra (com o Limpar) e a ordem, no campo impresso "Ordenar:" da pasta do mural.
 *
 * O índice: "Onde" (o mural, o grupo e as pastas numa árvore só), "Estado", "Só as" (os interruptores
 * das Configurações), "Mexidas" e as tags do mural. No celular ele vira uma gaveta por cima da lista,
 * aberta pelo "Filtros" ao lado da busca, e os filtros ligados ficam como os adesivos com X do mural.
 */
@Component({
  selector: 'app-picker-filters',
  imports: [IconModule, TagChips, FilterTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // com a gaveta aberta (no celular), quem usa esconde o pé da folha: o "Ver N" é a única saída
  // o Esc com a gaveta aberta a fecha, venha de onde vier (da busca também), e a folha continua
  host: { '[class.com-gaveta]': 'drawer()', '(keydown.escape)': 'onEscape($event)' },
  template: `
    @let f = filters();
    @let chips = f.chips();
    <div class="ferramentas">
      <ng-content select=".busca" />
      @if (showIndex()) {
        <button
          #abre
          type="button"
          class="abre-filtros"
          [attr.aria-expanded]="drawer()"
          [attr.aria-controls]="id + '-indice'"
          (click)="toggleDrawer()"
        >
          <lucide-icon [img]="FilterIcon" [size]="17" aria-hidden="true" />
          Filtros
          @if (chips.length) {
            <span class="tinta-n"><span class="sr-only">, </span>{{ chips.length }}<span class="sr-only"> ligados</span></span>
          }
        </button>
      }
    </div>

    <div class="corpo" [class.gaveta]="drawer()" [class.sem-indice]="!showIndex()">
      @if (showIndex()) {
        <aside class="indice" [id]="id + '-indice'" aria-label="Filtros">
          @if (f.placeRows(); as rows) {
            @if (rows.length) {
              <section class="secao" [attr.aria-labelledby]="id + '-onde'">
                <h3 class="secao-titulo" [id]="id + '-onde'">Onde</h3>
                <ul class="opcoes">
                  @for (p of rows; track p.id) {
                    <li>
                      <button
                        type="button"
                        class="idx lugar"
                        [class.vazias]="p.type === 'vazias'"
                        [class.caminho]="p.path"
                        [class.zero]="!p.n && !p.on && p.type !== 'vazias'"
                        [class.cor]="!!p.color"
                        [style.--nivel]="p.depth"
                        [style.--cat-cor]="p.color"
                        [attr.aria-pressed]="p.type === 'vazias' ? null : p.on"
                        [title]="p.type === 'vazias' ? 'Mostrar as pastas que não têm nenhuma com os filtros de agora' : p.on && p.type !== 'todas' ? p.label + ' (tocar de novo volta um nível)' : p.label"
                        (click)="f.choosePlace(p, setKind)"
                      >
                        @if (p.icon) {
                          <lucide-icon class="idx-ico" [img]="p.icon" [size]="16" aria-hidden="true" />
                        } @else {
                          <span class="idx-ico" aria-hidden="true"></span>
                        }
                        <span class="idx-nome">{{ p.label }}</span>
                        @if (p.kids && !p.on && !p.path) {
                          <lucide-icon class="idx-mais" [img]="MoreIcon" [size]="14" aria-hidden="true" />
                        }
                        @if (p.type !== 'vazias') {
                          <span class="idx-n"><span class="sr-only">, </span>{{ p.n }}</span>
                        }
                      </button>
                    </li>
                  }
                </ul>
              </section>
            }
          }

          @if (f.stateRows(); as rows) {
            @if (rows.length) {
              <section class="secao" [attr.aria-labelledby]="id + '-estado'">
                <h3 class="secao-titulo" [id]="id + '-estado'">Estado</h3>
                <ul class="opcoes">
                  @for (s of rows; track s.value) {
                    <li>
                      <button type="button" class="idx" [class.zero]="!s.n && !s.on" [attr.aria-pressed]="s.on" (click)="f.toggleState(s.value)">
                        <lucide-icon class="idx-ico" [img]="stateIcon(s.value)" [size]="16" aria-hidden="true" />
                        <span class="idx-nome">{{ s.label }}</span>
                        <span class="idx-n"><span class="sr-only">, </span>{{ s.n }}</span>
                      </button>
                    </li>
                  }
                </ul>
              </section>
            }
          }

          @if (f.markRows(); as rows) {
            @if (rows.length) {
              <section class="secao" [attr.aria-labelledby]="id + '-so'">
                <h3 class="secao-titulo" [id]="id + '-so'">Mostrar só</h3>
                <ul class="opcoes chaves">
                  @for (m of rows; track m.value) {
                    <li class="chave" [class.zero]="!m.n && !m.on">
                      <button type="button" role="switch" class="interruptor" [id]="id + '-' + m.value" [attr.aria-checked]="m.on" (click)="f.toggleMark(m.value)">
                        <span class="bolinha"></span>
                      </button>
                      <label class="chave-nome" [for]="id + '-' + m.value">{{ m.label }}</label>
                      <span class="idx-n"><span class="sr-only">, </span>{{ m.n }}</span>
                    </li>
                  }
                </ul>
              </section>
            }
          }

          @if (f.whenRows(); as rows) {
            @if (rows.length) {
              <section class="secao" [attr.aria-labelledby]="id + '-quando'">
                <h3 class="secao-titulo" [id]="id + '-quando'">Mexidas</h3>
                <ul class="opcoes">
                  @for (w of rows; track w.value) {
                    <li>
                      <button
                        type="button"
                        class="idx"
                        [class.zero]="!w.n && !w.on"
                        [attr.aria-pressed]="w.on"
                        [title]="w.on ? 'Tocar de novo tira' : w.label"
                        (click)="f.toggleWhen(w.value)"
                      >
                        <span class="idx-ico" aria-hidden="true"></span>
                        <span class="idx-nome">{{ w.label }}</span>
                        <span class="idx-n"><span class="sr-only">, </span>{{ w.n }}</span>
                      </button>
                    </li>
                  }
                </ul>
              </section>
            }
          }

          @if (f.tagChips(); as tags) {
            @if (tags.length) {
              <section class="secao" [attr.aria-labelledby]="id + '-tags'">
                <h3 class="secao-titulo" [id]="id + '-tags'">Tags</h3>
                <app-tag-chips class="quebra" [tags]="tags" (toggled)="f.toggleTag($event)" (excluded)="f.excludeTag($event)" />
              </section>
            }
          }

          <div class="indice-pe">
            <button type="button" class="btn-ink" (click)="closeDrawer()">Ver {{ seeLabel() }}</button>
          </div>
        </aside>
      }

      <div class="lado-lista">
        <div class="lista-topo">
          <p class="achados" aria-live="polite">
            @if (f.active()) {
              <span>Mostrando {{ f.matching().length }} de {{ f.before() }}</span>
              <button type="button" class="tinta-link" (click)="f.clear()">Limpar</button>
            } @else {
              <span>{{ countLabel() }}</span>
            }
          </p>
          <label class="ordem">
            <span class="ordem-pre">Ordenar:</span>
            <span class="ordem-val">{{ orderLabel() }}</span>
            <lucide-icon class="ordem-chev" [img]="ChevronIcon" [size]="15" aria-hidden="true" />
            <select aria-label="Ordenar a lista" (change)="f.order.set($any($event.target).value)">
              @for (o of orders; track o.value) {
                <option [value]="o.value" [selected]="o.value === f.order()">{{ o.label }}</option>
              }
            </select>
          </label>
        </div>
        @if (chips.length) {
          <div class="ligados">
            <app-filter-tags [tags]="chips" (remove)="f.removeChip($event)" />
          </div>
        }
        <ng-content />
      </div>
    </div>
  `,
  styleUrl: './picker-filters.scss',
})
export class PickerFilters {
  readonly filters = input.required<CardFilters>();
  readonly kind = model<Kind | null>(null);

  protected readonly id = `escolher-${nextId++}`;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly MoreIcon = ICON.proximo;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly orders = PICKER_ORDERS;
  /** No celular, o índice aberto por cima da lista. */
  protected readonly drawer = signal(false);
  private readonly opener = viewChild<ElementRef<HTMLElement>>('abre');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly setKind = (k: Kind | null) => this.kind.set(k);

  /** O índice só aparece quando há o que filtrar (alguma linha em alguma parte). */
  protected readonly showIndex = computed(() => {
    const f = this.filters();
    return f.placeRows().length > 0 || f.stateRows().length > 0 || f.markRows().length > 0 || f.whenRows().length > 0 || f.tagChips().length > 0;
  });

  private readonly noun = computed(() => (this.filters().notesScope() ? ['anotação', 'anotações'] : ['ficha', 'fichas']));

  protected readonly countLabel = computed(() => {
    const [one, many] = this.noun();
    return plural(this.filters().before(), one, many);
  });

  /** O "Ver 12 anotações" do pé da gaveta. */
  protected readonly seeLabel = computed(() => {
    const [one, many] = this.noun();
    return plural(this.filters().matching().length, one, many);
  });

  protected readonly orderLabel = computed(() => PICKER_ORDERS.find((o) => o.value === this.filters().order())!.label);

  protected stateIcon(s: PickerState): LucideIconData {
    return s === 'abertas' ? ICON.emAndamento : ICON.concluido;
  }

  protected toggleDrawer(): void {
    if (this.drawer()) {
      this.closeDrawer();
      return;
    }
    this.drawer.set(true);
    // o foco entra no índice (na escolhida, ou na primeira linha)
    afterNextRender(
      () => {
        const at = this.host.nativeElement;
        (at.querySelector<HTMLElement>('.indice [aria-pressed="true"]') ?? at.querySelector<HTMLElement>('.indice button'))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected closeDrawer(): void {
    if (!this.drawer()) return;
    this.drawer.set(false);
    this.opener()?.nativeElement.focus();
  }

  /** O Esc com a gaveta aberta fecha só ela (a folha continua). */
  protected onEscape(e: Event): void {
    if (!this.drawer()) return;
    e.preventDefault();
    e.stopPropagation();
    this.closeDrawer();
  }
}
