import { Injectable, computed, inject, signal } from '@angular/core';
import { BUILD } from './build';
import { canonicalJson } from './canonical-json';
import { sanitizeCategoryLooks } from './category-looks';
import { DAY_MS } from './dates';
import { DeviceTag, sanitizeDevice, thisDevice } from './device';
import { FICHA_PART_LABEL, FichaPart, mergeFicha } from './ficha-merge';
import { IMPORTANCE_LABEL, KanbanBoard, sanitizeBoard } from './kanban';
import { KanbanStore } from './kanban-store';
import { sameContent } from './kept-versions';
import { DataKey, LocalData } from './local-data';
import { mergeJson } from './merge-json';
import { sanitizeNotesConfig } from './mural-config';
import { MAX_PINNED_TAGS, sanitizeTags } from './note-labels';
import { sanitizeProfile } from './profile';
import { ProfileStore } from './profile-store';
import { Review, STOCK_LABEL, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { BlockKind, BLOCK_KINDS } from './sync-base';
import { stampAfter } from './sync-merge';
import { SYNC_STORAGE } from './sync-storage';

/**
 * Os conflitos da sincronização da própria conta: a mesma coisa mudada em dois aparelhos, ao mesmo
 * tempo, de jeitos diferentes (o mesmo trecho do texto, o mesmo título, a mesma coluna do Kanban), ou
 * apagada num e mudada no outro. O resto das mudanças dos dois já foi juntado sozinho (ver
 * core/sync-merge.ts); aqui fica só o que precisa da pessoa, com as duas versões inteiras, e a
 * pergunta é a mesma das anotações compartilhadas (ui/conflict-sheet.ts).
 *
 * Enquanto a pessoa não escolhe, vale no mural a versão `a` (a que já estava na nuvem, com o resto
 * juntado) e a `b` fica guardada aqui. A lista vai no mural privado da nuvem (`conflitos`), então
 * todos os aparelhos da conta veem a mesma pergunta, e a escolha feita num vale nos outros: o
 * conflito escolhido fica marcado (`resolvido`) por 30 dias, para nenhum aparelho perguntar de novo.
 */

export const CONFLICTS_KEY: DataKey = 'meu-mural:conflitos:v1';

/** Quanto tempo o conflito já escolhido fica marcado (e quantos ficam, no máximo). */
const KEEP_RESOLVED_DAYS = 30;
const MAX_CONFLICTS = 100;

export interface SyncConflict {
  /** Do que é: `ficha:<id>`, `kanban:<id do quadro>` ou `ajuste:<campo>` (ver `BlockKind`). */
  alvo: string;
  /** Quando foi achado (ISO). */
  em: string;
  /** A versão que estava na nuvem, com o resto juntado (null: apagada). É a que vale até a escolha. */
  a: unknown;
  /** A do aparelho que achou o conflito, com o resto juntado (null: apagada). */
  b: unknown;
  /** De que aparelho veio cada uma (a `a`, do último que enviou o mural antes; pode faltar). */
  deA: DeviceTag | null;
  deB: DeviceTag | null;
  /** O que mudou dos dois lados (só das fichas). */
  partes: FichaPart[];
  /** Quando a pessoa escolheu (ISO). */
  resolvido?: string;
}

export const conflictKey = (c: Pick<SyncConflict, 'alvo' | 'em'>): string => `${c.alvo}@${c.em}`;

export const BLOCK_LABEL: Record<BlockKind, string> = {
  chaves: 'As chaves de busca',
  tagsFixas: 'As tags fixas',
  categorias: 'O ícone e a cor dos grupos',
  muralAnotacoes: 'As configurações do mural de anotações',
  perfil: 'O seu perfil',
};

const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
const PARTS = Object.keys(FICHA_PART_LABEL) as FichaPart[];

/** Uma versão de um conflito, conferida pelo que ela é (`undefined`: não serve). */
function sanitizeSide(alvo: string, raw: unknown, from: number): unknown {
  if (raw === null) return null;
  const [tipo, id] = splitTarget(alvo);
  if (tipo === 'ficha') {
    const r = sanitizeReview(raw, from);
    return r && r.id === id ? r : undefined;
  }
  if (tipo === 'kanban') {
    const b = sanitizeBoard(raw);
    return b && b.id === id ? b : undefined;
  }
  return sanitizeBlock(id as BlockKind, raw) ?? undefined;
}

/** Os dados de um ajuste, conferidos (null: não serve). */
export function sanitizeBlock(kind: BlockKind, raw: unknown): unknown {
  switch (kind) {
    case 'chaves': {
      const r = raw as Record<string, unknown> | null;
      if (!r || typeof r !== 'object') return null;
      return { rawg: typeof r['rawg'] === 'string' ? r['rawg'].trim().slice(0, 200) : '', tmdb: typeof r['tmdb'] === 'string' ? r['tmdb'].trim().slice(0, 600) : '' };
    }
    case 'tagsFixas':
      return sanitizeTags(raw, MAX_PINNED_TAGS);
    case 'categorias':
      return sanitizeCategoryLooks(raw);
    case 'muralAnotacoes':
      return sanitizeNotesConfig(raw);
    case 'perfil':
      return sanitizeProfile(raw);
  }
}

/**
 * O ajuste de quem nunca mexeu nele (a base de quando a nuvem ainda não o tinha). O perfil fica de fora:
 * o de sempre sorteia o id da seção, e duas seções sorteadas viraram duas.
 */
export function blockDefault(kind: BlockKind): unknown {
  switch (kind) {
    case 'chaves':
      return { rawg: '', tmdb: '' };
    case 'tagsFixas':
      return [];
    case 'categorias':
      return {};
    case 'muralAnotacoes':
      return sanitizeNotesConfig(null);
    case 'perfil':
      return undefined;
  }
}

/** `ficha:r123` → ['ficha', 'r123']. */
export function splitTarget(alvo: string): [string, string] {
  const i = alvo.indexOf(':');
  return [alvo.slice(0, i), alvo.slice(i + 1)];
}

function validTarget(alvo: unknown): alvo is string {
  if (typeof alvo !== 'string') return false;
  const [tipo, id] = splitTarget(alvo);
  if (tipo === 'ficha' || tipo === 'kanban') return /^[\w-]{1,80}$/.test(id);
  return tipo === 'ajuste' && (BLOCK_KINDS as readonly string[]).includes(id);
}

/** Os conflitos lidos de onde vieram (o armazenamento, a nuvem); `from` é a build que gravou. */
export function sanitizeConflicts(raw: unknown, from = BUILD): SyncConflict[] {
  if (!Array.isArray(raw)) return [];
  const out: SyncConflict[] = [];
  for (const item of raw.slice(0, MAX_CONFLICTS * 2)) {
    const r = item as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || !validTarget(r['alvo'])) continue;
    const em = iso(r['em']);
    const a = sanitizeSide(r['alvo'], r['a'] ?? null, from);
    const b = sanitizeSide(r['alvo'], r['b'] ?? null, from);
    if (!em || a === undefined || b === undefined || (a === null && b === null)) continue;
    const partes = Array.isArray(r['partes']) ? PARTS.filter((p) => (r['partes'] as unknown[]).includes(p)) : [];
    const resolvido = iso(r['resolvido']);
    out.push({ alvo: r['alvo'], em, a, b, deA: sanitizeDevice(r['deA']), deB: sanitizeDevice(r['deB']), partes, ...(resolvido ? { resolvido } : {}) });
  }
  return out;
}

/**
 * Os conflitos dos dois lados juntos: um de cada, o escolhido vale (o primeiro a escolher), os
 * escolhidos só no prazo, os mais novos primeiro. Dois aparelhos que juntam as listas um do outro
 * chegam à mesma.
 */
export function mergeConflicts(x: readonly SyncConflict[], y: readonly SyncConflict[], now = Date.now()): SyncConflict[] {
  const byKey = new Map<string, SyncConflict>();
  for (const c of [...x, ...y]) {
    if (c.resolvido && now - Date.parse(c.resolvido) > KEEP_RESOLVED_DAYS * DAY_MS) continue;
    const k = conflictKey(c);
    const had = byKey.get(k);
    if (!had) byKey.set(k, c);
    else if (c.resolvido && (!had.resolvido || c.resolvido < had.resolvido)) byKey.set(k, c);
    else if (!c.resolvido && !had.resolvido && canonicalJson(c) < canonicalJson(had)) byKey.set(k, c);
  }
  return [...byKey.values()].sort((p, q) => (p.em !== q.em ? (p.em < q.em ? 1 : -1) : conflictKey(p) < conflictKey(q) ? -1 : 1)).slice(0, MAX_CONFLICTS);
}

/** Como a lista vai para o armazenamento e para a nuvem, na mesma ordem venha de onde vier. */
export function storedConflicts(list: readonly SyncConflict[]): unknown[] {
  return list.map((c) => ({ ...c }));
}

/** Uma linha do que difere num ajuste, para a pergunta mostrar as duas versões lado a lado. */
const KEY_LABEL: Record<string, string> = {
  rawg: 'Chave do RAWG',
  tmdb: 'Chave do TMDB',
  audience: 'Toda anotação nova nasce',
  orderBy: 'Ordem dos grupos',
  order: 'Ordem à mão',
  categories: 'Grupo',
  hiddenTags: 'Tags escondidas no filtro',
  icon: 'ícone',
  color: 'cor',
  none: 'sem cor',
  hidden: 'só no Mais',
};

/** Os valores das configurações nas palavras da tela. */
const VALUE_LABEL: Record<string, string> = {
  privada: 'privada',
  visivel: 'visível',
  publicar: 'publicada',
  sorteada: 'sorteada',
  mae: 'a da anotação mãe',
  quantidade: 'pela quantidade',
  minha: 'à mão',
};

function fmt(v: unknown, secret: boolean): string {
  if (v === null || v === undefined || v === '') return 'nada';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'string') return secret ? `••••${v.slice(-4)}` : (VALUE_LABEL[v] ?? v);
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

function flatten(v: unknown, label: string, out: string[], secret: boolean): void {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : 1));
    if (!entries.length) out.push(`${label || 'Tudo'}: nada`);
    for (const [k, x] of entries) flatten(x, label ? `${label} › ${KEY_LABEL[k] ?? k}` : (KEY_LABEL[k] ?? k), out, secret);
  } else if (Array.isArray(v)) {
    out.push(`${label}: ${v.length ? v.map((x) => fmt(x, secret)).join(', ') : 'nenhuma'}`);
  } else out.push(`${label}: ${fmt(v, secret)}`);
}

/** O quadro Kanban em linhas: as colunas e onde está cada anotação (`title` dá o nome da anotação). */
export function boardLines(b: KanbanBoard, title: (id: string) => string | null): string[] {
  const out: string[] = [];
  for (const col of b.columns) {
    const extra = [`cartolina ${STOCK_LABEL[col.color].toLowerCase()}`, col.finishes ? 'finaliza a anotação' : '', col.sort?.length ? 'em ordem' : '', col.dresses ? 'com card padrão' : '', col.skip ? 'a seta pula' : ''].filter(Boolean);
    out.push(`Coluna “${col.name}”: ${extra.join(', ')}`);
  }
  for (const col of b.columns) {
    for (const card of b.cards.filter((c) => c.column === col.id)) {
      const name = title(card.note);
      if (name === null) continue;
      out.push(`“${name}” em ${col.name}${card.importance ? ` · ${IMPORTANCE_LABEL[card.importance]}` : ''}${card.status ? ` · ${card.status}` : ''}`);
    }
  }
  return out;
}

/** Um ajuste em linhas (`secret`: as chaves aparecem só pelo fim). */
export function blockLines(kind: BlockKind, v: unknown): string[] {
  const out: string[] = [];
  if (kind === 'tagsFixas') out.push(`Tags fixas: ${Array.isArray(v) && v.length ? v.join(', ') : 'nenhuma'}`);
  else flatten(v, '', out, kind === 'chaves');
  return out;
}

@Injectable({ providedIn: 'root' })
export class SyncConflicts {
  private readonly data = inject(LocalData);
  private readonly store = inject(ReviewStore);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  private readonly profiles = inject(ProfileStore);
  /** Este aparelho (de onde veio a versão `b` dos conflitos achados aqui). */
  readonly device: DeviceTag = thisDevice(inject(SYNC_STORAGE));

  /** Todos, os escolhidos também (ainda marcados): é o que vai para a nuvem. */
  readonly list = signal<SyncConflict[]>(this.read());
  /** Os que esperam a pessoa, os mais novos primeiro. */
  readonly pending = computed(() => this.list().filter((c) => !c.resolvido));
  /** O conflito de cada ficha que espera a pessoa (o mais novo). */
  private readonly byFicha = computed(() => {
    const out = new Map<string, SyncConflict>();
    for (const c of this.pending()) {
      const [tipo, id] = splitTarget(c.alvo);
      if (tipo === 'ficha' && !out.has(id)) out.set(id, c);
    }
    return out;
  });
  /** Um conflito novo chegou (achado aqui ou vindo de outro aparelho): o bilhete do app avisa. */
  readonly notice = signal<{ chave: string; alvo: string; titulo: string; at: number } | null>(null);

  constructor() {
    this.data.onExternalChange((key) => {
      if (key === CONFLICTS_KEY) this.list.set(this.read());
    });
  }

  /** O conflito que espera a pessoa nesta ficha, se houver. */
  forFicha(id: string): SyncConflict | null {
    return this.byFicha().get(id) ?? null;
  }

  get(key: string): SyncConflict | null {
    return this.list().find((c) => conflictKey(c) === key) ?? null;
  }

  /** Conflitos achados aqui ou vindos da nuvem: juntam-se aos daqui, e o primeiro que é novo avisa. */
  add(incoming: readonly SyncConflict[]): void {
    if (!incoming.length) return;
    const before = new Set(this.list().map(conflictKey));
    const next = mergeConflicts(this.list(), incoming);
    if (canonicalJson(next) === canonicalJson(this.list())) return;
    this.set(next);
    const fresh = next.find((c) => !c.resolvido && !before.has(conflictKey(c)));
    if (fresh) this.notice.set({ chave: conflictKey(fresh), alvo: fresh.alvo, titulo: this.titleOf(fresh), at: Date.now() });
  }

  /** Os que vieram no mural da nuvem. */
  merge(raw: unknown, from: number): void {
    this.add(sanitizeConflicts(raw, from));
  }

  /** O que vai para a nuvem: null sem nenhum (o mural de antes deles tem a mesma impressão). */
  toSync(): unknown[] | null {
    return this.list().length ? storedConflicts(this.list()) : null;
  }

  /** O nome do que está em conflito, para o bilhete e para a pergunta. */
  titleOf(c: SyncConflict): string {
    const [tipo, id] = splitTarget(c.alvo);
    if (tipo === 'ficha') return ((c.a ?? c.b) as Review).game.name;
    if (tipo === 'kanban') {
      const b = (c.a ?? c.b) as KanbanBoard;
      return `Quadro Kanban de “${this.kanban.labelOf(b) ?? b.category}”`;
    }
    return BLOCK_LABEL[id as BlockKind];
  }

  /** Um ajuste ou um quadro em linhas, para a pergunta (null nas fichas, que mostram o texto delas). */
  linesOf(c: SyncConflict, side: 'a' | 'b'): string[] | null {
    const v = side === 'a' ? c.a : c.b;
    const [tipo, id] = splitTarget(c.alvo);
    if (tipo === 'ficha' || v === null) return null;
    if (tipo === 'kanban') return boardLines(v as KanbanBoard, (note) => this.store.get(note)?.game.name ?? null);
    return blockLines(id as BlockKind, v);
  }

  /**
   * A pessoa escolheu uma das versões. A escolhida vira a de agora (juntada com o que mudou depois do
   * conflito, se mudou), a outra fica guardada em Ajustes › Backup (as fichas), e o conflito fica
   * marcado como escolhido, para os outros aparelhos não perguntarem de novo. Os conflitos mais velhos
   * da mesma coisa saem junto.
   */
  resolve(key: string, side: 'a' | 'b'): void {
    const c = this.list().find((x) => conflictKey(x) === key && !x.resolvido);
    if (!c) return;
    const now = new Date().toISOString();
    const [tipo, id] = splitTarget(c.alvo);
    if (tipo === 'ficha') this.resolveFicha(id, c, side, now);
    else if (tipo === 'kanban') this.resolveBoard(id, c, side, now);
    else this.resolveBlock(id as BlockKind, c, side, now);
    // os mais velhos da mesma coisa: a escolha de agora já partiu deles (o que ficou de fora vai para o Backup)
    const older = this.pending().filter((x) => x.alvo === c.alvo && conflictKey(x) !== key);
    if (tipo === 'ficha') {
      const current = this.store.get(id);
      const lost = older.flatMap((x) => [x.a, x.b]).filter((r): r is Review => !!r && !(current && sameContent(r as Review, current)));
      if (lost.length) this.store.keepVersions(lost, 'conflito', false);
    }
    const done = new Set([key, ...older.map(conflictKey)]);
    this.set(this.list().map((x) => (done.has(conflictKey(x)) ? { ...x, resolvido: now } : x)));
  }

  private resolveFicha(id: string, c: SyncConflict, side: 'a' | 'b', now: string): void {
    const chosen = (side === 'a' ? c.a : c.b) as Review | null;
    const current = this.store.get(id);
    if (chosen === null) {
      // manter apagada: a que estava no mural fica guardada
      if (current) {
        this.store.keepVersions([current], 'conflito', false);
        this.store.remove(id);
      }
      return;
    }
    if (side === 'a' || c.a === null) {
      // a escolhida é a que já está no mural (talvez mexida depois): ela fica; a outra, guardada
      if (!current) this.store.restore(chosen);
      const other = (side === 'a' ? c.b : c.a) as Review | null;
      if (other && !(current && sameContent(other, current))) this.store.keepVersions([other], 'conflito', false);
      return;
    }
    // a outra versão: junta com o que mudou no mural depois do conflito (a escolha ganha onde brigar)
    if (!current) {
      this.store.restore(chosen);
      return;
    }
    const m = mergeFicha(c.a as Review, current, chosen);
    const result = { ...(m.other ?? m.merged), updatedAt: stampAfter(now, current.updatedAt) };
    if (!sameContent(current, result)) this.store.keepVersions([current], 'conflito', false);
    this.store.update(result);
  }

  private resolveBoard(id: string, c: SyncConflict, side: 'a' | 'b', now: string): void {
    if (side === 'a') return;
    const a = c.a as KanbanBoard;
    const chosen = c.b as KanbanBoard;
    const current = this.kanban.get(id) ?? a;
    const strip = (b: KanbanBoard) => {
      const { at: _at, ...rest } = b;
      return rest;
    };
    const m = mergeJson(strip(a), strip(current), strip(chosen));
    const board = sanitizeBoard({ ...(m.b as object), at: stampAfter(now, current.at) });
    if (board) this.kanban.update(id, () => board);
  }

  private resolveBlock(kind: BlockKind, c: SyncConflict, side: 'a' | 'b', now: string): void {
    if (side === 'a') return;
    const current = this.blockNow(kind);
    const m = mergeJson(c.a, current ?? c.a, c.b);
    this.applyBlock(kind, m.b, now);
  }

  /** Os dados de um ajuste agora, neste aparelho (null: nunca mudou aqui). */
  blockNow(kind: BlockKind): unknown {
    const s = this.settings;
    switch (kind) {
      case 'chaves':
        return s.keysAt() ? { rawg: s.rawgKey().trim(), tmdb: s.tmdbKey().trim() } : null;
      case 'tagsFixas':
        return s.pinnedTagsAt() ? [...s.pinnedTags()] : null;
      case 'categorias':
        return s.categoryLooksAt() ? s.categoryLooks() : null;
      case 'muralAnotacoes':
        return s.notesConfigAt() ? s.notesConfig() : null;
      case 'perfil':
        return this.profiles.changedAt() ? this.profiles.profile() : null;
    }
  }

  /** Põe os dados de um ajuste, mudados em `em` (conferidos antes). */
  applyBlock(kind: BlockKind, raw: unknown, em: string): void {
    const v = sanitizeBlock(kind, raw);
    if (v === null) return;
    switch (kind) {
      case 'chaves':
        return this.settings.applyKeys({ ...(v as { rawg: string; tmdb: string }), em });
      case 'tagsFixas':
        return this.settings.applyPinnedTags(v as string[], em);
      case 'categorias':
        return this.settings.applyCategoryLooks(v as ReturnType<typeof sanitizeCategoryLooks>, em);
      case 'muralAnotacoes':
        return this.settings.applyNotesConfig(v as ReturnType<typeof sanitizeNotesConfig>, em);
      case 'perfil':
        return this.profiles.apply(v as NonNullable<ReturnType<typeof sanitizeProfile>>, em);
    }
  }

  private read(): SyncConflict[] {
    try {
      const raw = JSON.parse(this.data.getItem(CONFLICTS_KEY) ?? 'null') as { build?: unknown; lista?: unknown } | null;
      return mergeConflicts([], sanitizeConflicts(raw?.lista, Number.isInteger(raw?.build) ? (raw!.build as number) : 0));
    } catch {
      return [];
    }
  }

  private set(list: SyncConflict[]): void {
    this.list.set(list);
    try {
      void Promise.resolve(this.data.setItem(CONFLICTS_KEY, JSON.stringify({ build: BUILD, lista: storedConflicts(list) }))).catch(() => undefined);
    } catch {
      /* sem espaço: fica na memória até a próxima gravação */
    }
  }
}
