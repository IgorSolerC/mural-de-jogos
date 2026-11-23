/**
 * As marcas do dono no Dicionário Japonês (PLANO-DICIONARIO.md, 4.2): cada palavra aprendida ou não, e favorita ou
 * não. A coluna `aprendida` do CSV é o padrão só para as contas que estudam por aquela lista (`CSV_LEARNERS`); para
 * todo o resto, nenhuma palavra começa aprendida. A marca de cada um vale por cima. Guardadas neste navegador e, com
 * conta, no mural privado da nuvem (`dicionario`), juntadas palavra a palavra: vale a mudada por último. Puro.
 */

/** A marca de uma palavra (o id é o do CSV, `JP0242`). */
export interface WordMark {
  id: string;
  /** Aprendida (true) ou não (false) pelo dono; sem, vale o CSV. */
  learned?: boolean;
  /** O dia (AAAA-MM-DD) em que o dono marcou como aprendida. */
  learnedOn?: string;
  favorite?: boolean;
  /** Quando a marca mudou por último (ISO): a junção fica com a mais nova. */
  at: string;
}

export interface DictMarksState {
  marks: WordMark[];
}

export const NO_MARKS: DictMarksState = { marks: [] };

/** Um teto de leitura, só contra lixo: o dicionário tem por volta de mil palavras. */
const MAX_MARKS = 20000;
const MARK_ID_RE = /^[\w-]{1,64}$/;
const MARK_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isMarkStamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));

function sanitizeMark(raw: unknown): WordMark | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || !MARK_ID_RE.test(r['id']) || !isMarkStamp(r['at'])) return null;
  const m: WordMark = { id: r['id'], at: r['at'] };
  if (typeof r['learned'] === 'boolean') m.learned = r['learned'];
  if (m.learned && typeof r['learnedOn'] === 'string' && MARK_DAY_RE.test(r['learnedOn'])) m.learnedOn = r['learnedOn'];
  if (r['favorite'] === true) m.favorite = true;
  return m;
}

/** A mais nova fica; no mesmo instante, a maior pelo texto (os dois aparelhos escolhem a mesma). */
function newerMark(a: WordMark | undefined, b: WordMark): boolean {
  if (!a) return true;
  if (b.at !== a.at) return b.at > a.at;
  return JSON.stringify(b) > JSON.stringify(a);
}

function orderedMarks(map: Map<string, WordMark>): DictMarksState {
  return { marks: [...map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
}

export function sanitizeDictMarks(raw: unknown): DictMarksState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NO_MARKS;
  const list = (raw as Record<string, unknown>)['marks'];
  const map = new Map<string, WordMark>();
  for (const item of Array.isArray(list) ? list.slice(0, MAX_MARKS) : []) {
    const m = sanitizeMark(item);
    if (m && newerMark(map.get(m.id), m)) map.set(m.id, m);
  }
  return orderedMarks(map);
}

/** As marcas de dois aparelhos juntas, palavra a palavra: vale a mudada por último. */
export function mergeDictMarks(here: DictMarksState, there: DictMarksState): DictMarksState {
  const map = new Map<string, WordMark>();
  for (const m of [...here.marks, ...there.marks]) if (newerMark(map.get(m.id), m)) map.set(m.id, m);
  return orderedMarks(map);
}

/**
 * A marca diz alguma coisa: aprendida ou não pelo dono, ou favorita. A que voltou ao que o CSV diz fica guardada (a
 * junção precisa dela para ganhar da de antes, de outro aparelho), mas não conta como palavra marcada.
 */
export function markSays(m: WordMark): boolean {
  return m.learned !== undefined || !!m.favorite;
}

/** O que vai para a nuvem: null sem nenhuma marca (o mural de antes do dicionário fica com a mesma impressão). */
export function dictMarksToSync(state: DictMarksState): DictMarksState | null {
  return state.marks.length ? state : null;
}

/**
 * As contas (o código do mural) que aprenderam as palavras marcadas no CSV: o dono do site e a namorada, que estudam
 * juntos (pedido do dono em 23/nov/2026: "Apenas eu e minha namorada sabemos essas palavras"). Para qualquer outra
 * conta, e para quem não entrou, a coluna `aprendida` não marca nada.
 */
export const CSV_LEARNERS: ReadonlySet<string> = new Set(['G11T-G00D', 'TMY1-BJMW']);

/** A palavra como as marcas a veem: o que o CSV diz e a marca do dono por cima. */
export interface MarkedWord {
  id: string;
  learnedOn: string | null;
}

/** O dia do CSV, só para quem estuda por ele (`csv`, ver `CSV_LEARNERS`). */
export function csvDay(w: MarkedWord, csv: boolean): string | null {
  return csv ? w.learnedOn : null;
}

/** A palavra está aprendida: pela marca e, sem marca, pelo CSV (só para quem estuda por ele). */
export function isLearned(w: MarkedWord, m: WordMark | undefined, csv: boolean): boolean {
  return m?.learned ?? !!csvDay(w, csv);
}

/** O dia em que a palavra foi aprendida (o da marca, ou o do CSV); null se não está aprendida ou não se sabe o dia. */
export function learnedDay(w: MarkedWord, m: WordMark | undefined, csv: boolean): string | null {
  if (!isLearned(w, m, csv)) return null;
  return m?.learned ? (m.learnedOn ?? null) : csvDay(w, csv);
}

/** A marca nova de uma palavra, mudando só o que vem em `patch`, mais nova que a de antes. */
export function withMark(prev: WordMark | undefined, id: string, patch: Pick<WordMark, 'learned' | 'learnedOn' | 'favorite'>, at: string): WordMark {
  const next: WordMark = { ...(prev ?? { id }), ...patch, id, at };
  if (!next.learned) delete next.learnedOn;
  if (!next.favorite) delete next.favorite;
  if (next.learned === undefined) delete next.learned;
  return next;
}
