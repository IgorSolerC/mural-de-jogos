import { LucideIconData } from 'lucide-angular';
import { sampleNote } from '../core/card-look';
import { canonicalJson } from '../core/canonical-json';
import { CATEGORY_COLORS, CategoryLook, CategoryLooks, categoryColorHex, lookKey, tagColorHex } from '../core/category-looks';
import { CODE_THEME_NAMES, CodeTheme } from '../core/code-langs';
import { LOOK_KEYS } from '../core/ficha-merge';
import { FolderTree, NoteFolder, folderTree } from '../core/folders';
import { IMPORTANCE_LABEL, KanbanBoard, KanbanCard, KanbanColumn } from '../core/kanban';
import { sortSentence } from '../core/kanban-sort';
import { KINDS, Kind, profileOf } from '../core/kinds';
import { AutoTab, CategoryPrefs, NotesConfig } from '../core/mural-config';
import { NoteTemplate, TEMPLATE_FOLDER_GROUP } from '../core/note-templates';
import { PAGE_BACKGROUNDS, PROFILE_FRAMES, PROFILE_MATERIALS, Profile, ProfileBackground, ProfileSection, SECTION_DENSITIES, WALLS_LOOKS } from '../core/profile';
import { DIFFICULTY_LABEL, Review, SCORE_LABEL, STOCK_LABEL, Stock, VERDICT_LABEL, formatScore, isNote } from '../core/review';
import { BlockKind } from '../core/sync-base';
import { labelKey } from '../core/text';
import { ICON, ICON_CHOICE, ICON_CHOICE_LABEL } from './icons';
import { AUDIENCES, AUTO_ROWS, SHOWS, SORTS, VIEWS } from './mural-config-words';

/**
 * As diferenças entre as duas versões de um conflito (ver ui/conflict-sheet.ts), uma linha por coisa
 * que difere, já nas palavras e nos desenhos da tela: a etiqueta da tag, a amostra da cor, o desenho do
 * ícone, o interruptor, a ficha como fica no mural. Só o que difere entra (o resto já está junto nas
 * duas), e nada sai como o dado guardado: quem lê nunca vê chave, id nem chaves `{}`.
 *
 * Serve às fichas (da conta e das compartilhadas), aos ajustes que sincronizam (as chaves de busca, as
 * tags sempre à mão, o ícone e a cor dos grupos e das tags, as configurações do mural de anotações, o
 * perfil) e aos quadros Kanban. O texto da ficha fica de fora: a folha o mostra formatado, inteiro.
 */

/** Uma etiqueta numa lista; `only`: só esta versão tem (leva a marca-texto). */
export interface Chip {
  label: string;
  /** A cor da etiqueta (hex), ou null: a de sempre. */
  color?: string | null;
  only: boolean;
}

/** O valor de um lado, do jeito que a folha desenha. */
export type Cell =
  /** Palavras; `hand`, o que a pessoa escreveu (na letra de mão). */
  | { kind: 'text'; text: string; hand?: boolean }
  /** A falta de algo ("Nenhuma", "Fora das pastas"), a lápis. */
  | { kind: 'empty'; text: string }
  | { kind: 'icon'; icon: LucideIconData; text: string }
  /** O interruptor desenhado, ligado ou desligado, com o que isso quer dizer. */
  | { kind: 'switch'; on: boolean; text: string }
  /** A amostra da cor (uma cor do CSS) e o nome dela. */
  | { kind: 'swatch'; color: string; text: string }
  /** As tags, nas etiquetas de papel pardo do site. */
  | { kind: 'tags'; items: Chip[] }
  /** Palavras soltas (a ordem dos grupos, as abas): `ordered`, numeradas. */
  | { kind: 'list'; items: Chip[]; ordered?: boolean }
  /** A etiqueta de um grupo, com o desenho dele, e a amostra e o nome da cor (null: sem cor). */
  | { kind: 'group'; label: string; look: CategoryLook; color: { hex: string; name: string } | null }
  | { kind: 'cover'; url: string }
  /** A ficha como fica no mural (a cartolina, o papel, a estampa…). */
  | { kind: 'card'; review: Review }
  /** Um texto com formatação (o "Sobre" do perfil, um template), formatado. */
  | { kind: 'rich'; text: string }
  /** Uma chave de busca, só o fim. */
  | { kind: 'secret'; end: string }
  /** A versão que apaga a ficha: o carimbo vermelho. */
  | { kind: 'gone'; text: string };

export interface ConflictRow {
  /** Estável entre as duas versões (para o `track` e os testes). */
  id: string;
  /** O que difere, nas palavras da tela: "Tags", "Pasta “Compras”", "Grupo “Casa” · Abre como". */
  label: string;
  icon: LucideIconData;
  a: Cell;
  b: Cell;
}

/** Os nomes que só o site sabe (o grupo pela chave, a anotação pelo id), para as linhas falarem deles. */
export interface RowNames {
  /** O nome de um grupo pela chave (`lookKey`); sem ele, a chave mesmo. */
  group(key: string): string | null;
  /** O título de uma anotação ou ficha pelo id. */
  note(id: string): string | null;
  /** O nome de uma pasta pelo id (das duas versões e das do site). */
  folder(id: string): string | null;
  /** As cores das tags e dos grupos de agora (para a etiqueta sair com a cor de sempre). */
  looks: CategoryLooks;
}

export const NO_NAMES: RowNames = { group: () => null, note: () => null, folder: () => null, looks: {} };

const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);
const text = (t: string, hand = false): Cell => ({ kind: 'text', text: t, ...(hand ? { hand } : {}) });
const empty = (t: string): Cell => ({ kind: 'empty', text: t });
const sw = (on: boolean, yes: string, no: string): Cell => ({ kind: 'switch', on, text: on ? yes : no });
const stockCell = (s: Stock): Cell => ({ kind: 'swatch', color: `var(--stock-${s})`, text: STOCK_LABEL[s] ?? s });
const quoted = (s: string) => `“${s}”`;
const handOr = (s: string | undefined | null, none: string): Cell => (s?.trim() ? text(s, true) : empty(none));

/** As palavras de um lado e do outro, cada uma marcada se só aquele lado tem (sem contar a grafia). */
function chips(xs: readonly string[], ys: readonly string[], color: (s: string) => string | null = () => null): [Chip[], Chip[]] {
  const kx = new Set(xs.map(labelKey));
  const ky = new Set(ys.map(labelKey));
  return [xs.map((s) => ({ label: s, color: color(s), only: !ky.has(labelKey(s)) })), ys.map((s) => ({ label: s, color: color(s), only: !kx.has(labelKey(s)) }))];
}

function tagsCells(xs: readonly string[], ys: readonly string[], none: string, color?: (s: string) => string | null): [Cell, Cell] {
  const [cx, cy] = chips(xs, ys, color);
  return [cx.length ? { kind: 'tags', items: cx } : empty(none), cy.length ? { kind: 'tags', items: cy } : empty(none)];
}

function listCells(xs: readonly string[], ys: readonly string[], none: string, ordered = false): [Cell, Cell] {
  const [cx, cy] = chips(xs, ys);
  return [cx.length ? { kind: 'list', items: cx, ordered } : empty(none), cy.length ? { kind: 'list', items: cy, ordered } : empty(none)];
}

// ================================================================== as fichas

/** Quem vê a ficha, como a escolha "Privacidade da anotação nova". */
function audienceOf(r: Review): Cell {
  const v = r.private ? 'privada' : r.quiet ? 'visivel' : 'publicar';
  const o = AUDIENCES.find((x) => x.value === v)!;
  return { kind: 'icon', icon: o.icon, text: v === 'publicar' ? 'Publicada' : o.label };
}

function dateWords(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** As notas da ficha numa linha: "Média 8,5 · Diversão 9 · História 8", e o veredito. */
function scoreWords(r: Review): string {
  const keys = ['final', ...profileOf(r.kind).categories.map((c) => c.key)] as const;
  const parts = keys.map((k) => {
    const v = k === 'final' ? (r.finalOverride ?? r.scores?.final) : r.scores?.[k];
    return `${SCORE_LABEL[k]} ${formatScore(v ?? null)}`;
  });
  if (r.verdict) parts.push(VERDICT_LABEL[r.verdict]);
  return parts.join(' · ');
}

/** Os campos da ficha que a folha mostra cada um na sua linha (o resto cai em "Outros detalhes"). */
const FICHA_SHOWN = new Set([
  'id', 'kind', 'text', 'createdAt', 'updatedAt', 'game', 'doneAt', 'category', 'subject', 'folder', 'tags', 'private', 'quiet',
  'noteRank', 'completedAt', 'scores', 'weights', 'bonuses', 'finalOverride', 'verdict', 'sharedBy',
  // a aparência: os mesmos campos que a junção conta como "o papel da ficha"
  ...LOOK_KEYS,
]);

/** As palavras de campos de ficha menos comuns (os das resenhas). */
const FICHA_FIELD_LABEL: Record<string, string> = {
  status: 'Até onde foi',
  difficulty: 'Dificuldade',
  publishedAt: 'Publicada no Feed em',
  revisitOf: 'Releitura de',
  artFrom: 'Arte',
  sampleUrl: 'Amostra',
  sampleTitle: 'Amostra',
  album: 'Álbum',
  form: 'Álbum ou música',
};

/**
 * As linhas do que difere entre duas versões da mesma ficha (sem o texto, que a folha mostra
 * formatado). A ordem é a da leitura: o título, o estado, onde ela fica, as tags, quem vê, e a cara.
 */
export function fichaRows(a: Review, b: Review, names: RowNames = NO_NAMES): ConflictRow[] {
  const out: ConflictRow[] = [];
  const row = (id: string, label: string, icon: LucideIconData, ca: Cell, cb: Cell) => out.push({ id, label, icon, a: ca, b: cb });
  const what = isNote(a) ? 'anotação' : 'ficha';

  if (a.game.name !== b.game.name) row('titulo', 'Título', ICON.letra, text(a.game.name, true), text(b.game.name, true));
  if (!!a.doneAt !== !!b.doneAt) {
    const st = (r: Review): Cell => (r.doneAt ? { kind: 'icon', icon: ICON.concluido, text: 'Finalizada: sai do mural' } : { kind: 'icon', icon: ICON.emAndamento, text: 'Aberta: fica no mural' });
    row('finalizada', 'Finalizada', ICON.concluido, st(a), st(b));
  }
  if ((a.category ?? '') !== (b.category ?? '')) {
    const g = (r: Review): Cell => (r.category ? groupCell(r.category, names.looks[lookKey(r.category)] ?? {}) : empty('Sem grupo'));
    row('grupo', 'Grupo', ICON.etiquetas, g(a), g(b));
  }
  if ((a.folder ?? '') !== (b.folder ?? '')) {
    const f = (r: Review): Cell => (r.folder ? { kind: 'icon', icon: ICON.pastaDeNotas, text: names.folder(r.folder) ?? 'Uma pasta do grupo' } : empty('Fora das pastas'));
    row('pasta', 'Pasta', ICON.pastaDeNotas, f(a), f(b));
  }
  if ((a.subject ?? '') !== (b.subject ?? '')) row('assunto', 'Assunto', ICON.pastaDeNotas, handOr(a.subject, 'Sem assunto'), handOr(b.subject, 'Sem assunto'));
  if (!sameTags(a.tags, b.tags)) {
    // cada lado com as cores das tags no grupo dele
    const [ca, cb] = chips(a.tags ?? [], b.tags ?? []);
    const paint = (items: Chip[], r: Review): Cell => (items.length ? { kind: 'tags', items: items.map((i) => ({ ...i, color: tagColorHex(names.looks, i.label, r.category ?? '') })) } : empty('Nenhuma tag'));
    row('tags', 'Tags', ICON.etiqueta, paint(ca, a), paint(cb, b));
  }
  if (!!a.private !== !!b.private || !!a.quiet !== !!b.quiet) row('publico', 'Quem vê', ICON.publica, audienceOf(a), audienceOf(b));
  if ((a.noteRank ?? null) !== (b.noteRank ?? null)) {
    const p = (r: Review) => sw(r.noteRank === 'fixada', 'Fixada no topo do mural', 'No lugar de sempre');
    row('lugar', 'Fixada', ICON.fixar, p(a), p(b));
  }
  if ((a.completedAt ?? null) !== (b.completedAt ?? null)) {
    const d = (r: Review) => {
      const w = dateWords(r.completedAt);
      return w ? text(w) : empty('Sem data');
    };
    row('data', 'Data', ICON.calendario, d(a), d(b));
  }
  if (!same(a.scores, b.scores) || !same(a.weights, b.weights) || !same(a.bonuses, b.bonuses) || (a.finalOverride ?? null) !== (b.finalOverride ?? null) || (a.verdict ?? null) !== (b.verdict ?? null)) {
    row('nota', 'Notas', ICON.trofeu, text(scoreWords(a)), text(scoreWords(b)));
  }
  if ((a.game.coverUrl ?? null) !== (b.game.coverUrl ?? null)) {
    const c = (r: Review): Cell => (r.game.coverUrl ? { kind: 'cover', url: r.game.coverUrl } : empty('Sem capa'));
    row('capa', 'Capa', ICON.imagem, c(a), c(b));
  }
  if (LOOK_KEYS.some((k) => !same(field(a, k), field(b, k)))) {
    // a cara da ficha só se entende vendo: a ficha de cada versão, como fica no mural
    row('aparencia', `Como a ${what} fica no mural`, ICON.paleta, { kind: 'card', review: a }, { kind: 'card', review: b });
  }
  const game = (r: Review) => {
    const { name: _n, coverUrl: _c, ...rest } = r.game as unknown as Record<string, unknown>;
    return rest;
  };
  const restA = { ...omit(a, FICHA_SHOWN), ...prefixed('game', game(a)) };
  const restB = { ...omit(b, FICHA_SHOWN), ...prefixed('game', game(b)) };
  const profile = profileOf(a.kind);
  const shown = (k: string, v: unknown): Cell => {
    if (k === 'status' && typeof v === 'string') return text(profile.status[v as keyof typeof profile.status] ?? v);
    if (k === 'difficulty' && typeof v === 'string') return text(DIFFICULTY_LABEL[v as keyof typeof DIFFICULTY_LABEL] ?? v);
    if (k === 'publishedAt' && typeof v === 'string') return text(dateWords(v) ?? v);
    if (k === 'hoursPlayed' && typeof v === 'number') return text(profile.amount ? profile.amount.long(words(v)) : words(v));
    return wordsCell(v);
  };
  let catalog = false;
  for (const k of [...new Set([...Object.keys(restA), ...Object.keys(restB)])].sort()) {
    if (same(restA[k], restB[k])) continue;
    // o que veio do catálogo (o ano, de onde veio) vai numa linha só
    if (k.startsWith('game.')) {
      catalog = true;
      continue;
    }
    const label = k === 'hoursPlayed' ? (profile.amount?.label ?? 'Quantidade') : (FICHA_FIELD_LABEL[k] ?? 'Outro detalhe');
    row(`outro:${k}`, label, ICON.informacao, shown(k, restA[k]), shown(k, restB[k]));
  }
  if (catalog) row('catalogo', 'Dados do catálogo', ICON.informacao, text(words(game(a)) || 'Nenhum'), text(words(game(b)) || 'Nenhum'));
  return out;
}

/** O texto das duas difere? (a folha o mostra inteiro, formatado, com as diferenças marcadas) */
export function textDiffers(a: Pick<Review, 'text'>, b: Pick<Review, 'text'>): boolean {
  return a.text !== b.text;
}

/** As mesmas tags, sem contar a ordem nem a grafia ("bug" e "Bug"). */
export function sameTags(x: readonly string[] | undefined, y: readonly string[] | undefined): boolean {
  const set = (t: readonly string[] | undefined) => [...new Set((t ?? []).map(labelKey))].sort().join('\u0000');
  return set(x) === set(y);
}

const field = (r: unknown, k: string) => (r as Record<string, unknown>)[k];

function omit(r: unknown, keys: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([k, v]) => !keys.has(k) && v !== undefined));
}

function prefixed(p: string, o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [`${p}.${k}`, v]));
}

/** Qualquer valor em palavras (nunca o dado guardado com chaves e aspas). */
export function words(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR');
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(words).filter(Boolean).join(', ');
  return Object.entries(v as Record<string, unknown>)
    .map(([, x]) => words(x))
    .filter(Boolean)
    .join(' · ');
}

function wordsCell(v: unknown): Cell {
  const w = words(v);
  return w ? text(w) : empty('Nada');
}

// ================================================================== os ajustes

/** Onde cada ajuste mora no site, para a pessoa saber do que se trata (e onde mudar depois). */
export const BLOCK_WHERE: Record<BlockKind, string> = {
  chaves: 'Ajustes › Busca e capas',
  tagsFixas: 'na escolha das tags de uma anotação (as com a estrela)',
  categorias: 'Anotações › Configurações do mural › Grupos e Tags',
  muralAnotacoes: 'Anotações › Configurações do mural',
  perfil: 'Perfil › Editar o perfil',
};

/** As linhas do que difere entre duas versões de um ajuste. */
export function blockRows(kind: BlockKind, a: unknown, b: unknown, names: RowNames = NO_NAMES): ConflictRow[] {
  switch (kind) {
    case 'chaves':
      return keysRows(a as Keys, b as Keys);
    case 'tagsFixas': {
      const [ta, tb] = tagsCells((a as string[]) ?? [], (b as string[]) ?? [], 'Nenhuma tag', (t) => tagColorHex(names.looks, t, null));
      return sameTags(a as string[], b as string[]) && same(a, b) ? [] : [{ id: 'tags-fixas', label: 'Tags sempre à mão', icon: ICON.estrela, a: ta, b: tb }];
    }
    case 'categorias':
      return looksRows(a as CategoryLooks, b as CategoryLooks, names);
    case 'muralAnotacoes':
      return configRows(a as NotesConfig, b as NotesConfig, names);
    case 'perfil':
      return profileRows(a as Profile, b as Profile, names);
  }
}

interface Keys {
  rawg: string;
  tmdb: string;
}

function keysRows(a: Keys, b: Keys): ConflictRow[] {
  const out: ConflictRow[] = [];
  const cell = (v: string): Cell => (v ? { kind: 'secret', end: v.slice(-4) } : empty('Nenhuma'));
  if ((a?.rawg ?? '') !== (b?.rawg ?? '')) out.push({ id: 'rawg', label: 'Chave do RAWG (jogos)', icon: ICON.chave, a: cell(a?.rawg ?? ''), b: cell(b?.rawg ?? '') });
  if ((a?.tmdb ?? '') !== (b?.tmdb ?? '')) out.push({ id: 'tmdb', label: 'Chave do TMDB (filmes e séries)', icon: ICON.chave, a: cell(a?.tmdb ?? ''), b: cell(b?.tmdb ?? '') });
  return out;
}

/** "##casa#mercado" → a tag "mercado" do grupo "casa"; "#mercado" → a de todos os grupos. */
export function parseTagKey(key: string): { tag: string; group: string | null } | null {
  if (!key.startsWith('#')) return null;
  if (!key.startsWith('##')) return { tag: key.slice(1), group: null };
  let group = '';
  let i = 2;
  while (i < key.length) {
    if (key[i] === '#') {
      if (key[i + 1] === '#') {
        group += '#';
        i += 2;
        continue;
      }
      return { tag: key.slice(i + 1), group };
    }
    group += key[i++];
  }
  return null;
}

function groupName(key: string, names: RowNames): string {
  if (key === '') return 'Sem grupo';
  // as mini-pastas dos templates do texto moram na mesma lista, num grupo só delas
  if (key === TEMPLATE_FOLDER_GROUP) return 'Templates';
  return names.group(key) ?? key;
}

function looksRows(a: CategoryLooks, b: CategoryLooks, names: RowNames): ConflictRow[] {
  const out: ConflictRow[] = [];
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
  for (const key of keys) {
    const la = a?.[key];
    const lb = b?.[key];
    if (same(la, lb)) continue;
    const tag = parseTagKey(key);
    if (tag) {
      const cell = (l: CategoryLook | undefined): Cell => {
        if (l?.none) return empty('Sem cor');
        const hex = l ? categoryColorHex(l.color) : null;
        // sem cor própria: a etiqueta de papel pardo de sempre, como ela aparece
        return { kind: 'tags', items: [{ label: tag.tag, color: hex, only: false }] };
      };
      const where = tag.group === null ? 'em todos os grupos' : `no grupo ${quoted(groupName(tag.group, names))}`;
      out.push({ id: `tag:${key}`, label: `Cor da tag ${quoted(tag.tag)} ${where}`, icon: ICON.etiqueta, a: cell(la), b: cell(lb) });
    } else {
      const name = groupName(key, names);
      const cell = (l: CategoryLook | undefined): Cell => (l && (l.icon || l.color) ? groupCell(name, l) : empty('O jeito de sempre'));
      out.push({ id: `grupo:${key}`, label: `Desenho e cor do grupo ${quoted(name)}`, icon: ICON.paleta, a: cell(la), b: cell(lb) });
    }
  }
  return out;
}

function audienceCell(v: string | undefined, none: string): Cell {
  const o = AUDIENCES.find((x) => x.value === v);
  return o ? { kind: 'icon', icon: o.icon, text: o.label } : empty(none);
}

/** Cada campo de um grupo nas configurações, com o nome da linha na folha Configurações. */
const PREFS: readonly { key: keyof CategoryPrefs; label: string; icon: LucideIconData; cell: (p: CategoryPrefs) => Cell }[] = [
  { key: 'audience', label: 'Privacidade da anotação nova', icon: ICON.privada, cell: (p) => audienceCell(p.audience, 'A de todo o mural') },
  { key: 'askTag', label: 'Avisar quando faltar a tag', icon: ICON.etiqueta, cell: (p) => (p.askTag === undefined ? empty('Como o mural') : sw(p.askTag, 'Avisa', 'Não avisa')) },
  { key: 'hidden', label: 'Aba escondida no “Mais”', icon: ICON.esconder, cell: (p) => sw(!!p.hidden, 'Escondida no “Mais”', 'Em pé com os outros grupos') },
  { key: 'kanbanOnly', label: 'Anotações do quadro', icon: ICON.colunas, cell: (p) => sw(p.kanbanOnly !== false, 'Só no Kanban', 'No Kanban e no mural') },
  {
    key: 'view',
    label: 'Abre como',
    icon: ICON.completas,
    cell: (p) => {
      const o = VIEWS.find((x) => x.value === p.view);
      return o ? { kind: 'icon', icon: o.icon, text: o.label } : empty('Como da última vez');
    },
  },
  {
    key: 'sort',
    label: 'Abre na ordem',
    icon: ICON.ordenarDecrescente,
    cell: (p) => {
      const o = SORTS.find((x) => x.value === p.sort);
      return o ? { kind: 'icon', icon: o.icon, text: o.label } : empty('Como da última vez');
    },
  },
];

const AUTO_FIELD: Record<AutoTab, 'showAll' | 'showPinned' | 'showShared'> = { tudo: 'showAll', fixadas: 'showPinned', compartilhadas: 'showShared' };

function configRows(a: NotesConfig, b: NotesConfig, names: RowNames): ConflictRow[] {
  const out: ConflictRow[] = [];
  const row = (id: string, label: string, icon: LucideIconData, ca: Cell, cb: Cell) => out.push({ id, label, icon, a: ca, b: cb });

  if (a.audience !== b.audience) row('audience', 'Privacidade da anotação nova', ICON.privada, audienceCell(a.audience, 'Privada'), audienceCell(b.audience, 'Privada'));
  if (a.orderBy !== b.orderBy) {
    const o = (c: NotesConfig) => text(c.orderBy === 'minha' ? 'Arrumada à mão' : 'Pela quantidade de anotações');
    row('orderBy', 'Ordem das abas', ICON.ordenarDecrescente, o(a), o(b));
  }
  if (!same(a.order, b.order)) {
    const [la, lb] = listCells(a.order.map((k) => groupName(k, names)), b.order.map((k) => groupName(k, names)), 'Nenhuma arrumada', true);
    row('order', 'A ordem arrumada à mão', ICON.arrastar, la, lb);
  }
  for (const auto of AUTO_ROWS) {
    const f = AUTO_FIELD[auto.key];
    if (a[f] !== b[f]) row(f, `Aba ${quoted(auto.label)}`, auto.icon, sw(a[f], 'Em pé, ao lado dos grupos', 'Só no “Mais”'), sw(b[f], 'Em pé, ao lado dos grupos', 'Só no “Mais”'));
    const ca = a.autoColors?.[auto.key];
    const cb = b.autoColors?.[auto.key];
    if (ca !== cb) {
      const c = (id: typeof ca): Cell => (id ? { kind: 'swatch', color: categoryColorHex(id) ?? 'transparent', text: colorName(id) } : empty('Sem cor'));
      row(`autoColor:${auto.key}`, `Cor da aba ${quoted(auto.label)}`, ICON.paleta, c(ca), c(cb));
    }
  }
  if (a.hideEmpty !== b.hideEmpty) row('hideEmpty', 'Esconder os grupos vazios', ICON.esconder, sw(a.hideEmpty, 'Escondidos no “Mais”', 'Sempre em pé'), sw(b.hideEmpty, 'Escondidos no “Mais”', 'Sempre em pé'));
  if (a.codeTheme !== b.codeTheme) {
    const t = (c: NotesConfig) => text(CODE_THEME_NAMES[c.codeTheme as CodeTheme] ?? c.codeTheme);
    row('codeTheme', 'Tema do código', ICON.codigo, t(a), t(b));
  }

  // por grupo
  const groups = [...new Set([...Object.keys(a.categories ?? {}), ...Object.keys(b.categories ?? {})])].sort();
  for (const g of groups) {
    const pa = a.categories?.[g] ?? {};
    const pb = b.categories?.[g] ?? {};
    if (same(pa, pb)) continue;
    const name = quoted(groupName(g, names));
    for (const p of PREFS) {
      if (same(pa[p.key], pb[p.key])) continue;
      row(`grupo:${g}:${p.key}`, `Grupo ${name} · ${p.label}`, p.icon, p.cell(pa), p.cell(pb));
    }
    if (!same(pa.shows, pb.shows)) {
      const label = (p: CategoryPrefs) => SHOWS.filter((s) => p.shows?.includes(s.value)).map((s) => s.label);
      const [la, lb] = listCells(label(pa), label(pb), 'Nada a mais');
      row(`grupo:${g}:shows`, `Grupo ${name} · Abre mostrando também`, ICON.ver, la, lb);
    }
  }

  // as tags escondidas no filtro (pela chave da tag no grupo)
  if (!same([...a.hiddenTags].sort(), [...b.hiddenTags].sort())) {
    const tagLabel = (k: string) => {
      const t = parseTagKey(k);
      if (!t) return k;
      return t.group === null ? t.tag : `${t.tag} (${groupName(t.group, names)})`;
    };
    const [ta, tb] = tagsCells(a.hiddenTags.map(tagLabel), b.hiddenTags.map(tagLabel), 'Nenhuma');
    row('hiddenTags', 'Tags que começam escondidas no filtro', ICON.filtrar, ta, tb);
  }

  // as cores das tags da Wishlist ("jogos|tag")
  const wish = [...new Set([...Object.keys(a.wishTagColors ?? {}), ...Object.keys(b.wishTagColors ?? {})])].sort();
  for (const k of wish) {
    const ca = a.wishTagColors?.[k];
    const cb = b.wishTagColors?.[k];
    if (ca === cb) continue;
    const [mural, tag] = k.split('|');
    const kindName = (KINDS as readonly string[]).includes(mural) ? profileOf(mural as Kind).plural : mural;
    const cell = (c: typeof ca): Cell => (c ? { kind: 'tags', items: [{ label: tag, color: categoryColorHex(c), only: false }] } : empty('A cor de sempre'));
    row(`wish:${k}`, `Cor da tag ${quoted(tag)} na Wishlist de ${kindName}`, ICON.etiqueta, cell(ca), cell(cb));
  }

  out.push(...folderRows(a.folders ?? [], b.folders ?? [], names));
  out.push(...templateRows(a.templates ?? [], b.templates ?? [], folderTree(a.folders ?? []), folderTree(b.folders ?? [])));
  return out;
}

function colorName(id: string): string {
  return CATEGORY_COLORS.find((c) => c.id === id)?.label ?? id;
}

/** A célula de um grupo: a etiqueta com o desenho, e a cor (que a etiqueta sozinha não mostra). */
function groupCell(label: string, look: CategoryLook): Cell {
  const hex = categoryColorHex(look.color);
  return { kind: 'group', label, look, color: hex && look.color ? { hex, name: colorName(look.color) } : null };
}

function folderRows(fa: readonly NoteFolder[], fb: readonly NoteFolder[], names: RowNames): ConflictRow[] {
  const out: ConflictRow[] = [];
  const byA = new Map(fa.map((f) => [f.id, f]));
  const byB = new Map(fb.map((f) => [f.id, f]));
  const nameOf = (id: string | null): string | null => (id ? (byA.get(id)?.name ?? byB.get(id)?.name ?? names.folder(id)) : null);
  const ids = [...new Set([...byA.keys(), ...byB.keys()])];
  for (const id of ids) {
    const x = byA.get(id);
    const y = byB.get(id);
    if (same(x, y)) continue;
    const title = quoted(x?.name ?? y?.name ?? 'sem nome');
    const live = (f: NoteFolder | undefined) => !!f && !f.gone;
    if (live(x) !== live(y)) {
      const c = (f: NoteFolder | undefined): Cell => (live(f) ? { kind: 'icon', icon: ICON.pastaDeNotas, text: `Existe, no grupo ${quoted(groupName(f!.group, names))}` } : empty(f?.gone ? 'Desfeita' : 'Não existe'));
      out.push({ id: `pasta:${id}`, label: `Pasta ${title}`, icon: ICON.pastaDeNotas, a: c(x), b: c(y) });
      continue;
    }
    if (!x || !y) continue;
    if (x.name !== y.name) out.push({ id: `pasta:${id}:nome`, label: `Nome da pasta do grupo ${quoted(groupName(x.group, names))}`, icon: ICON.pastaDeNotas, a: text(x.name, true), b: text(y.name, true) });
    if (x.parent !== y.parent || x.group !== y.group) {
      const c = (f: NoteFolder): Cell => {
        const up = nameOf(f.parent);
        return up ? { kind: 'icon', icon: ICON.pastaDeNotas, text: `Dentro de ${quoted(up)}` } : text(`Solta no grupo ${quoted(groupName(f.group, names))}`);
      };
      out.push({ id: `pasta:${id}:lugar`, label: `Onde fica a pasta ${title}`, icon: ICON.guardarNaPasta, a: c(x), b: c(y) });
    }
  }
  return out;
}

function templateRows(ta: readonly NoteTemplate[], tb: readonly NoteTemplate[], treeA: FolderTree, treeB: FolderTree): ConflictRow[] {
  const out: ConflictRow[] = [];
  // a pasta de verdade de cada lado, pelas pastas dele (a desfeita é "fora das pastas", como o seletor mostra)
  const folderOf = (t: NoteTemplate, tree: FolderTree) => tree.path(tree.resolve(t.folder, TEMPLATE_FOLDER_GROUP))[0] ?? null;
  const byA = new Map(ta.map((t) => [t.id, t]));
  const byB = new Map(tb.map((t) => [t.id, t]));
  for (const id of [...new Set([...byA.keys(), ...byB.keys()])]) {
    const x = byA.get(id);
    const y = byB.get(id);
    if (same(x, y)) continue;
    const title = quoted(x?.title ?? y?.title ?? '');
    if (!x || !y) {
      const c = (t: NoteTemplate | undefined): Cell => (t ? { kind: 'rich', text: t.text } : empty('Não existe'));
      out.push({ id: `template:${id}`, label: `Template ${title}`, icon: ICON.templates, a: c(x), b: c(y) });
      continue;
    }
    if (x.title !== y.title) out.push({ id: `template:${id}:nome`, label: 'Nome do template', icon: ICON.templates, a: text(x.title, true), b: text(y.title, true) });
    if (x.text !== y.text) out.push({ id: `template:${id}:texto`, label: `Texto do template ${quoted(y.title)}`, icon: ICON.templates, a: { kind: 'rich', text: x.text }, b: { kind: 'rich', text: y.text } });
    const fx = folderOf(x, treeA);
    const fy = folderOf(y, treeB);
    if (fx?.id !== fy?.id) {
      const c = (f: NoteFolder | null): Cell => (f ? { kind: 'icon', icon: ICON.pastaDeNotas, text: f.name } : empty('Fora das pastas'));
      out.push({ id: `template:${id}:pasta`, label: `Pasta do template ${quoted(y.title)}`, icon: ICON.guardarNaPasta, a: c(fx), b: c(fy) });
    }
  }
  return out;
}

// ================================================================== o perfil

function backgroundWords(bg: ProfileBackground | undefined): Cell {
  if (!bg) return empty('O de sempre');
  if (bg.kind === 'material') return text(PROFILE_MATERIALS.find((m) => m.id === bg.material)?.label ?? bg.material);
  if (bg.kind === 'cartolina') return stockCell(bg.stock);
  return { kind: 'cover', url: bg.url };
}

function profileRows(a: Profile, b: Profile, names: RowNames): ConflictRow[] {
  const out: ConflictRow[] = [];
  const row = (id: string, label: string, icon: LucideIconData, ca: Cell, cb: Cell) => out.push({ id, label, icon, a: ca, b: cb });
  if (a.emoji !== b.emoji) row('emoji', 'Foto (o emoji)', ICON.sorriso, text(a.emoji), text(b.emoji));
  if (a.photo !== b.photo) row('photo', 'Cartolina da foto', ICON.paleta, stockCell(a.photo), stockCell(b.photo));
  if (a.tagline !== b.tagline) row('tagline', 'Frase embaixo do nome', ICON.escrever, handOr(a.tagline, 'Nenhuma'), handOr(b.tagline, 'Nenhuma'));
  if (a.about !== b.about) row('about', 'Sobre você', ICON.escrever, a.about.trim() ? { kind: 'rich', text: a.about } : empty('Nada escrito'), b.about.trim() ? { kind: 'rich', text: b.about } : empty('Nada escrito'));
  if (!same(a.topics, b.topics)) {
    const [ta, tb] = tagsCells(a.topics, b.topics, 'Nenhum');
    row('topics', 'Assuntos', ICON.etiqueta, ta, tb);
  }
  if (!same(a.background, b.background)) row('background', 'Fundo do quadro de cima', ICON.moldura, backgroundWords(a.background), backgroundWords(b.background));
  if (a.frameStyle !== b.frameStyle) {
    const f = (p: Profile) => text(PROFILE_FRAMES.find((x) => x.id === p.frameStyle)?.label ?? p.frameStyle);
    row('frameStyle', 'Moldura do quadro de cima', ICON.moldura, f(a), f(b));
  }
  if (a.page !== b.page) {
    const p = (x: Profile): Cell => {
      const bg = PAGE_BACKGROUNDS.find((g) => g.id === x.page);
      return bg ? { kind: 'swatch', color: bg.base, text: bg.label } : text(x.page);
    };
    row('page', 'Parede do site e do perfil', ICON.parede, p(a), p(b));
  }
  if (a.wallsLook !== b.wallsLook) {
    const w = (p: Profile) => text(WALLS_LOOKS.find((x) => x.id === p.wallsLook)?.label ?? p.wallsLook);
    row('wallsLook', 'Como as pastas dos murais aparecem', ICON.pasta, w(a), w(b));
  }
  for (const kind of KINDS) {
    const wa = a.walls?.[kind] ?? {};
    const wb = b.walls?.[kind] ?? {};
    if (same(wa, wb)) continue;
    const name = profileOf(kind).plural;
    if (!!wa.hidden !== !!wb.hidden) row(`wall:${kind}:hidden`, `Pasta de ${name}`, ICON.ver, sw(!wa.hidden, 'À mostra no perfil', 'Escondida do perfil'), sw(!wb.hidden, 'À mostra no perfil', 'Escondida do perfil'));
    if ((wa.text ?? '') !== (wb.text ?? '')) row(`wall:${kind}:text`, `O que você diz da pasta de ${name}`, ICON.escrever, handOr(wa.text, 'Nada escrito'), handOr(wb.text, 'Nada escrito'));
  }
  out.push(...sectionRows(a.sections ?? [], b.sections ?? [], names));
  return out;
}

function sectionRows(sa: readonly ProfileSection[], sb: readonly ProfileSection[], names: RowNames): ConflictRow[] {
  const out: ConflictRow[] = [];
  const byA = new Map(sa.map((s) => [s.id, s]));
  const byB = new Map(sb.map((s) => [s.id, s]));
  const itemNames = (s: ProfileSection) => s.items.map((id) => names.note(id) ?? 'Uma ficha que não está mais aqui');
  for (const id of [...new Set([...byA.keys(), ...byB.keys()])]) {
    const x = byA.get(id);
    const y = byB.get(id);
    if (same(x, y)) continue;
    const title = quoted(x?.title || y?.title || 'sem título');
    if (!x || !y) {
      const c = (s: ProfileSection | undefined): Cell => (s ? text(`Existe, com ${s.items.length === 1 ? '1 ficha' : `${s.items.length} fichas`}`) : empty('Não existe'));
      out.push({ id: `secao:${id}`, label: `Seção ${title}`, icon: ICON.painel, a: c(x), b: c(y) });
      continue;
    }
    const r = (k: string, label: string, ca: Cell, cb: Cell) => out.push({ id: `secao:${id}:${k}`, label: `Seção ${title} · ${label}`, icon: ICON.painel, a: ca, b: cb });
    if (x.title !== y.title) r('titulo', 'Título', handOr(x.title, 'Sem título'), handOr(y.title, 'Sem título'));
    if (x.note !== y.note) r('nota', 'Linha embaixo do título', handOr(x.note, 'Nada escrito'), handOr(y.note, 'Nada escrito'));
    if (x.density !== y.density) {
      const d = (s: ProfileSection) => text(SECTION_DENSITIES.find((o) => o.id === s.density)?.label ?? s.density);
      r('densidade', 'Como as fichas aparecem', d(x), d(y));
    }
    if (x.frame !== y.frame) {
      const f = (s: ProfileSection) => text(s.frame === 'quadro' ? 'Num quadro com moldura' : 'Direto na parede');
      r('lugar', 'Onde fica', f(x), f(y));
    }
    if (!same(x.fill, y.fill)) r('fundo', 'Fundo do quadro', backgroundWords(x.fill), backgroundWords(y.fill));
    if (x.frameStyle !== y.frameStyle) {
      const f = (s: ProfileSection) => text(PROFILE_FRAMES.find((o) => o.id === s.frameStyle)?.label ?? s.frameStyle);
      r('moldura', 'Moldura', f(x), f(y));
    }
    if (!same(x.items, y.items)) {
      const [la, lb] = listCells(itemNames(x), itemNames(y), 'Nenhuma ficha', true);
      r('fichas', 'Fichas', la, lb);
    }
  }
  return out;
}

// ================================================================== o quadro Kanban

function columnRows(ca: readonly KanbanColumn[], cb: readonly KanbanColumn[]): ConflictRow[] {
  const out: ConflictRow[] = [];
  const byA = new Map(ca.map((c) => [c.id, c]));
  const byB = new Map(cb.map((c) => [c.id, c]));
  for (const id of [...new Set([...byA.keys(), ...byB.keys()])]) {
    const x = byA.get(id);
    const y = byB.get(id);
    if (same(x, y)) continue;
    const title = quoted(x?.name ?? y?.name ?? '');
    if (!x || !y) {
      const c = (col: KanbanColumn | undefined): Cell => (col ? { kind: 'icon', icon: ICON_CHOICE[col.icon] ?? ICON.colunas, text: 'Existe no quadro' } : empty('Não existe'));
      out.push({ id: `coluna:${id}`, label: `Coluna ${title}`, icon: ICON.colunas, a: c(x), b: c(y) });
      continue;
    }
    const r = (k: string, label: string, va: Cell, vb: Cell) => out.push({ id: `coluna:${id}:${k}`, label: `Coluna ${title} · ${label}`, icon: ICON.colunas, a: va, b: vb });
    if (x.name !== y.name) out.push({ id: `coluna:${id}:nome`, label: 'Nome da coluna', icon: ICON.colunas, a: text(x.name, true), b: text(y.name, true) });
    if (x.color !== y.color) r('cor', 'Cor', stockCell(x.color), stockCell(y.color));
    if (x.icon !== y.icon) r('desenho', 'Desenho', { kind: 'icon', icon: ICON_CHOICE[x.icon], text: ICON_CHOICE_LABEL[x.icon] ?? '' }, { kind: 'icon', icon: ICON_CHOICE[y.icon], text: ICON_CHOICE_LABEL[y.icon] ?? '' });
    if (x.finishes !== y.finishes) r('finaliza', 'Finaliza a anotação que chega', sw(x.finishes, 'Finaliza', 'Não finaliza'), sw(y.finishes, 'Finaliza', 'Não finaliza'));
    if (!same(x.sort, y.sort)) {
      const s = (c: KanbanColumn) => (c.sort?.length ? text(sortSentence(c.sort)) : empty('Na ordem em que foram arrastadas'));
      r('ordem', 'Ordem das anotações', s(x), s(y));
    }
    if (!!x.dresses !== !!y.dresses) r('card', 'Card padrão', sw(!!x.dresses, 'Ligado', 'Desligado'), sw(!!y.dresses, 'Ligado', 'Desligado'));
    if (!same(x.look, y.look)) {
      // o card padrão só se entende vendo: a anotação de exemplo vestida com ele
      const c = (col: KanbanColumn): Cell => (col.look ? { kind: 'card', review: sampleNote(`modelo${col.id}`.slice(0, 40), 'Anotação de exemplo', col.look) } : empty('Nenhum montado'));
      r('card-jeito', 'Como é o card padrão', c(x), c(y));
    }
    if (!!x.skip !== !!y.skip) r('pula', 'A seta de avançar', sw(!!x.skip, 'Pula esta coluna', 'Para nesta coluna'), sw(!!y.skip, 'Pula esta coluna', 'Para nesta coluna'));
  }
  return out;
}

/** As linhas do que difere entre duas versões de um quadro Kanban. */
export function boardRows(a: KanbanBoard, b: KanbanBoard, names: RowNames = NO_NAMES): ConflictRow[] {
  const out = columnRows(a.columns, b.columns);
  const ids = (bd: KanbanBoard) => bd.columns.map((c) => c.id);
  // a ordem pelas colunas mesmo (renomear não é mudar de lugar), com as que os dois têm
  if (!same(ids(a), ids(b)) && same([...ids(a)].sort(), [...ids(b)].sort())) {
    const [la, lb] = listCells(a.columns.map((c) => c.name), b.columns.map((c) => c.name), 'Nenhuma', true);
    out.push({ id: 'colunas:ordem', label: 'Ordem das colunas', icon: ICON.colunas, a: la, b: lb });
  }
  const colName = (bd: KanbanBoard, id: string) => bd.columns.find((c) => c.id === id)?.name ?? 'uma coluna';
  const byA = new Map(a.cards.map((c) => [c.note, c]));
  const byB = new Map(b.cards.map((c) => [c.note, c]));
  const strip = (c: KanbanCard | undefined) => {
    if (!c) return null;
    const { at: _at, dress: _dress, ...rest } = c;
    return rest;
  };
  for (const id of [...new Set([...byA.keys(), ...byB.keys()])]) {
    const x = byA.get(id);
    const y = byB.get(id);
    if (same(strip(x), strip(y))) continue;
    const name = names.note(id);
    if (name === null) continue;
    const title = quoted(name);
    if (!x || !y) {
      const c = (card: KanbanCard | undefined, bd: KanbanBoard): Cell => (card ? { kind: 'icon', icon: ICON.colunas, text: `No quadro, em ${quoted(colName(bd, card.column))}` } : empty('Fora do quadro'));
      out.push({ id: `cartao:${id}`, label: title, icon: ICON.anotacoes, a: c(x, a), b: c(y, b) });
      continue;
    }
    const r = (k: string, label: string, va: Cell, vb: Cell) => out.push({ id: `cartao:${id}:${k}`, label: `${title} · ${label}`, icon: ICON.anotacoes, a: va, b: vb });
    // (a coluna só renomeada já tem a linha dela: as anotações nela não mudaram de lugar)
    if (x.column !== y.column) r('coluna', 'Coluna', text(colName(a, x.column)), text(colName(b, y.column)));
    if (x.importance !== y.importance) {
      const i = (c: KanbanCard) => (c.importance ? { kind: 'icon', icon: ICON.importancia, text: IMPORTANCE_LABEL[c.importance] } as Cell : empty('Sem importância'));
      r('importancia', 'Importância', i(x), i(y));
    }
    if ((x.status ?? '') !== (y.status ?? '')) r('status', 'Status', handOr(x.status, 'Sem status'), handOr(y.status, 'Sem status'));
    if (x.wall !== y.wall) {
      const w = (c: KanbanCard) => (c.wall === undefined ? empty('Como o grupo') : sw(c.wall, 'Também no mural', 'Só no Kanban'));
      r('mural', 'Onde aparece', w(x), w(y));
    }
    if (!same([...(x.deps ?? [])].sort(), [...(y.deps ?? [])].sort())) {
      const n = (c: KanbanCard) => (c.deps ?? []).map((d) => names.note(d) ?? 'Uma anotação que não está mais aqui');
      const [la, lb] = listCells(n(x), n(y), 'Nenhuma');
      r('deps', 'Depende de', la, lb);
    }
  }
  // a ordem dentro de uma coluna (as mesmas anotações, outra fila)
  for (const col of a.columns) {
    const ia = a.cards.filter((c) => c.column === col.id).map((c) => c.note);
    const ib = b.cards.filter((c) => c.column === col.id).map((c) => c.note);
    if (same(ia, ib) || !same([...ia].sort(), [...ib].sort()) || !b.columns.some((c) => c.id === col.id)) continue;
    const n = (ids: string[]) => ids.map((i) => names.note(i)).filter((s): s is string => s !== null);
    const [la, lb] = listCells(n(ia), n(ib), 'Nenhuma', true);
    out.push({ id: `coluna:${col.id}:fila`, label: `Ordem das anotações em ${quoted(col.name)}`, icon: ICON.colunas, a: la, b: lb });
  }
  return out;
}
