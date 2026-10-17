import type { Importance, KanbanCard } from './kanban';
import { fold } from './review';
import { tasksOf } from './rich-text';

/**
 * A ordem de uma coluna do Kanban (os ajustes da coluna). Sem regra, a coluna fica na ordem em que
 * as anotações foram arrastadas (a ordem de `cards`). Com uma regra, a coluna se ordena sozinha; com
 * duas, a segunda desempata a primeira ("por importância e tag"). O que ainda empata fica na ordem
 * de `cards`: arrastar entre as empatadas continua valendo, e voltar para "À mão" devolve a ordem de
 * antes, porque ordenar nunca mexe em `cards`.
 *
 * Cada critério tem o seu sentido natural (o mais útil primeiro: crítico, mais nova, mexida há
 * pouco, A a Z, mais tarefas por fazer); `reverse` o vira. O que não tem o valor (sem importância,
 * sem tag, sem tarefa) vai sempre para o fim, nos dois sentidos.
 */

export type SortKey = 'importancia' | 'criacao' | 'alteracao' | 'titulo' | 'tag' | 'tarefas';
export const SORT_KEYS: readonly SortKey[] = ['importancia', 'criacao', 'alteracao', 'titulo', 'tag', 'tarefas'];

export interface SortRule {
  by: SortKey;
  /** O sentido de trás para a frente (ver `SORT_DIRS`); sem o campo, o natural. */
  reverse?: true;
}

/** Quantas regras uma coluna pode ter: a ordem e o desempate. */
export const MAX_SORT = 2;

/** O nome de cada critério, como aparece nos ajustes. */
export const SORT_LABEL: Record<SortKey, string> = {
  importancia: 'Importância',
  criacao: 'Criação',
  alteracao: 'Alteração',
  titulo: 'Título',
  tag: 'Tag',
  tarefas: 'Tarefas',
};

/** O nome no meio de uma frase ("por importância e tag"). */
export const SORT_NOUN: Record<SortKey, string> = {
  importancia: 'importância',
  criacao: 'data de criação',
  alteracao: 'última alteração',
  titulo: 'título',
  tag: 'tag',
  tarefas: 'tarefas por fazer',
};

/** Os dois sentidos de cada critério, em palavras: o natural e o de trás para a frente. */
export const SORT_DIRS: Record<SortKey, readonly [string, string]> = {
  importancia: ['Crítico primeiro', 'Baixíssimo primeiro'],
  criacao: ['Mais nova primeiro', 'Mais antiga primeiro'],
  alteracao: ['Mexida há pouco primeiro', 'Parada há mais tempo primeiro'],
  titulo: ['De A a Z', 'De Z a A'],
  tag: ['De A a Z', 'De Z a A'],
  tarefas: ['Mais por fazer primeiro', 'Menos por fazer primeiro'],
};

/** O que vai para o fim, quando o critério deixa alguma de fora. */
const LAST: Partial<Record<SortKey, string>> = {
  importancia: 'as sem importância no fim',
  tag: 'as sem tag no fim',
  tarefas: 'as sem tarefa no fim',
};

/** As regras guardadas: só critérios conhecidos, sem repetir, até `MAX_SORT`. */
export function sanitizeSort(raw: unknown): SortRule[] {
  const out: SortRule[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const by = (r as Record<string, unknown> | null)?.['by'];
    if (!(SORT_KEYS as readonly unknown[]).includes(by) || out.some((x) => x.by === by) || out.length >= MAX_SORT) continue;
    out.push((r as Record<string, unknown>)['reverse'] === true ? { by: by as SortKey, reverse: true } : { by: by as SortKey });
  }
  return out;
}

/** "Por importância e tag": o que a coluna diz no cabeçalho. Vazio na ordem à mão. */
export function sortShort(rules: readonly SortRule[]): string {
  if (!rules.length) return '';
  return `Por ${rules.map((r) => SORT_NOUN[r.by]).join(' e ')}`;
}

/**
 * A frase que explica a ordem inteira, nos ajustes da coluna: "Por importância, crítico primeiro
 * (as sem importância no fim). No empate, por tag, de A a Z. Se ainda empatar, vale a ordem em que
 * você arrastou."
 */
export function sortSentence(rules: readonly SortRule[]): string {
  if (!rules.length) return 'Na ordem em que você arrastar as anotações.';
  const part = (r: SortRule) => {
    const dir = SORT_DIRS[r.by][r.reverse ? 1 : 0];
    const last = LAST[r.by];
    return `por ${SORT_NOUN[r.by]}, ${dir.charAt(0).toLowerCase()}${dir.slice(1)}${last ? ` (${last})` : ''}`;
  };
  const [first, second] = rules;
  const head = part(first);
  return [`${head.charAt(0).toUpperCase()}${head.slice(1)}.`, second ? `No empate, ${part(second)}.` : '', 'Se ainda empatar, vale a ordem em que você arrastou.']
    .filter(Boolean)
    .join(' ');
}

/** O que a ordem precisa saber de uma anotação. */
export interface SortNote {
  game: { name: string };
  createdAt: string;
  updatedAt: string;
  tags?: readonly string[];
  text: string;
}

/** A importância da mais alta para a mais baixa (a ordem de `IMPORTANCES`, sem importar o kanban.ts, que importa daqui). */
const IMPORTANCE_RANK: Record<Importance, number> = { critico: 0, importante: 1, medio: 2, baixo: 3, baixissimo: 4 };

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** O valor de uma anotação num critério; null: não tem (vai para o fim). */
type Key = number | string | readonly string[] | null;

function keyOf(by: SortKey, card: KanbanCard, n: SortNote | undefined): Key {
  if (!n) return null;
  switch (by) {
    case 'importancia':
      return card.importance ? IMPORTANCE_RANK[card.importance] : null;
    case 'criacao':
      return Date.parse(n.createdAt) || 0;
    case 'alteracao':
      return Date.parse(n.updatedAt) || 0;
    case 'titulo':
      return n.game.name.trim();
    case 'tag': {
      const tags = [...new Set((n.tags ?? []).map((t) => fold(t.trim())).filter(Boolean))].sort(collator.compare);
      return tags.length ? tags : null;
    }
    case 'tarefas': {
      const tasks = [...tasksOf(n.text).values()];
      return tasks.length ? tasks.filter((done) => !done).length : null;
    }
  }
}

/** A comparação do sentido natural (o menor vem primeiro), sem os que não têm o valor. */
function compareKeys(by: SortKey, a: Exclude<Key, null>, b: Exclude<Key, null>): number {
  switch (by) {
    // o crítico (0) primeiro; a mais nova, a mexida há pouco e a com mais tarefas primeiro
    case 'importancia':
      return (a as number) - (b as number);
    case 'criacao':
    case 'alteracao':
    case 'tarefas':
      return (b as number) - (a as number);
    case 'titulo':
      return collator.compare(a as string, b as string);
    case 'tag': {
      const x = a as readonly string[];
      const y = b as readonly string[];
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const c = collator.compare(x[i], y[i]);
        if (c) return c;
      }
      return x.length - y.length;
    }
  }
}

/**
 * A comparação de duas anotações pelas regras da coluna (sem a ordem de `cards`): negativa quando
 * `a` vem antes; zero quando empatam em todas as regras.
 */
export function sortComparator(rules: readonly SortRule[], noteOf: (id: string) => SortNote | undefined): (a: KanbanCard, b: KanbanCard) => number {
  const cache = new Map<string, Key[]>();
  const keys = (c: KanbanCard) => {
    let k = cache.get(c.note);
    if (!k) cache.set(c.note, (k = rules.map((r) => keyOf(r.by, c, noteOf(c.note)))));
    return k;
  };
  return (a, b) => {
    const ka = keys(a);
    const kb = keys(b);
    for (let i = 0; i < rules.length; i++) {
      const x = ka[i];
      const y = kb[i];
      if (x === null || y === null) {
        // quem não tem o valor vai para o fim, nos dois sentidos
        if (x !== y) return x === null ? 1 : -1;
        continue;
      }
      const c = compareKeys(rules[i].by, x, y);
      if (c) return rules[i].reverse ? -c : c;
    }
    return 0;
  };
}

/** As anotações de uma coluna na ordem das regras; o empate fica na ordem em que vieram. Sem regra, como vieram. */
export function sortCards(cards: readonly KanbanCard[], rules: readonly SortRule[], noteOf: (id: string) => SortNote | undefined): KanbanCard[] {
  if (!rules.length) return [...cards];
  const cmp = sortComparator(rules, noteOf);
  return cards
    .map((card, i) => ({ card, i }))
    .sort((a, b) => cmp(a.card, b.card) || a.i - b.i)
    .map((x) => x.card);
}

/**
 * Onde `card` pode cair entre as anotações já ordenadas de uma coluna (sem ela): do lugar da primeira
 * empatada com ela até depois da última. Arrastar numa coluna ordenada só escolhe entre as empatadas.
 */
export function tieRange(sorted: readonly KanbanCard[], card: KanbanCard, rules: readonly SortRule[], noteOf: (id: string) => SortNote | undefined): [number, number] {
  if (!rules.length) return [0, sorted.length];
  const cmp = sortComparator(rules, noteOf);
  let lo = 0;
  let hi = 0;
  for (const c of sorted) {
    const v = cmp(c, card);
    if (v < 0) lo++;
    if (v <= 0) hi++;
  }
  return [lo, hi];
}

/** As duas regras empatam? (as mesmas, nos mesmos sentidos) */
export function sameSort(a: readonly SortRule[] | undefined, b: readonly SortRule[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((r, i) => r.by === y[i].by && !!r.reverse === !!y[i].reverse);
}
