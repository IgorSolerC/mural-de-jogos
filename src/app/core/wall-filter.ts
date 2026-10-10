import { KindProfile, isNotes } from './kinds';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  Difficulty,
  Review,
  STATUSES,
  Status,
  VERDICTS,
  VERDICT_LABEL,
  Verdict,
  fold,
  shownFinal,
} from './review';

/** As faixas da Média, as mesmas das seções do mural ordenado por nota: 9 ou mais, a casa do 8… abaixo de 5. */
export type GradeBand = '9' | '8' | '7' | '6' | '5' | 'baixo';
export const GRADE_BANDS: readonly GradeBand[] = ['9', '8', '7', '6', '5', 'baixo'];

/** Ficha com o texto da resenha escrito ou em branco. */
export type TextFilter = 'com' | 'sem';

/** Ficha decorada ou lisa (a cor e o papel da cartolina não contam: toda ficha tem os dois). */
export type LookFilter = 'com' | 'sem';

/**
 * Os filtros do mural. Dentro de um grupo vale qualquer um dos escolhidos (Masterpiece ou
 * Recomendo); entre grupos, todos ao mesmo tempo (Masterpiece e Platinado). Grupo vazio não filtra.
 */
export interface WallFilter {
  verdict: readonly (Verdict | 'sem')[];
  status: readonly Status[];
  grade: readonly GradeBand[];
  difficulty: readonly Difficulty[];
  /** 'AAAA' do dia de conclusão, ou 'sem' para a data não definida. */
  year: readonly string[];
  text: readonly TextFilter[];
  /** Ficha com alguma decoração (estampa, rabisco, mancha, estrago ou enfeite por cima) ou lisa. */
  look: readonly LookFilter[];
  /** Só nas anotações: o nome de uma categoria, ou 'sem' para as sem categoria. */
  category: readonly string[];
  /** Só nas anotações: uma tag (qualquer uma das escolhidas), ou 'sem' para as sem tag. */
  tag: readonly string[];
}

export type FacetKey = keyof WallFilter;

/** A ordem dos grupos na cartela e das etiquetas embaixo da régua. */
export const FACET_KEYS: readonly FacetKey[] = ['category', 'tag', 'verdict', 'status', 'text', 'look', 'grade', 'difficulty', 'year'];

/** Os grupos de cada mural: as anotações não têm nota, veredito, status nem dificuldade; as resenhas, categoria. */
// (o texto é obrigatório na anotação: o grupo Resenha, com e sem texto, não serve)
const NOTE_FACETS: readonly FacetKey[] = ['category', 'tag', 'look', 'year'];

export function facetKeysOf(profile: KindProfile): readonly FacetKey[] {
  if (isNotes(profile.kind)) return NOTE_FACETS;
  return FACET_KEYS.filter((k) => k !== 'category' && k !== 'tag' && (k !== 'difficulty' || profile.difficulty !== null));
}

export const NO_FILTER: WallFilter = { verdict: [], status: [], grade: [], difficulty: [], year: [], text: [], look: [], category: [], tag: [] };

/** A categoria de uma anotação, ou 'sem'. */
export function categoryValueOf(r: Review): string {
  return r.category ?? 'sem';
}

/** As tags de uma anotação, ou 'sem'. */
export function tagValuesOf(r: Review): string[] {
  return r.tags?.length ? [...r.tags] : ['sem'];
}

export function gradeBandOf(final: number): GradeBand {
  const b = Math.floor(final);
  return b >= 9 ? '9' : b < 5 ? 'baixo' : (String(b) as GradeBand);
}

export function yearOf(r: Review): string {
  return r.completedAt ? r.completedAt.slice(0, 4) : 'sem';
}

export function hasText(r: Review): boolean {
  return r.text.trim() !== '';
}

/** Tem estampa, rabisco, mancha, estrago ou decoração por cima? */
export function isDecorated(r: Review): boolean {
  return !!(r.pattern || r.scribble || r.stain || r.damage || r.decor);
}

/** Os valores da ficha num grupo: um só em todos, menos as tags (várias por anotação). */
function valuesOf(r: Review, k: FacetKey): string[] {
  return k === 'tag' ? tagValuesOf(r) : [valueOf(r, k)];
}

function valueOf(r: Review, k: Exclude<FacetKey, 'tag'>): string {
  switch (k) {
    case 'category':
      return categoryValueOf(r);
    case 'verdict':
      return r.verdict ?? 'sem';
    case 'status':
      return r.status;
    case 'grade':
      return gradeBandOf(shownFinal(r));
    case 'difficulty':
      return r.difficulty;
    case 'year':
      return yearOf(r);
    case 'text':
      return hasText(r) ? 'com' : 'sem';
    case 'look':
      return isDecorated(r) ? 'com' : 'sem';
  }
}

/**
 * A chave de comparação de um valor: as categorias e as tags valem sem acento nem caixa ("Diário" e
 * "diario" são a mesma), como nas abas e nas seções; o resto, como está.
 */
function keyOf(k: FacetKey, value: string): string {
  return k === 'category' || k === 'tag' ? fold(value) : value;
}

/** A ficha passa nos filtros? Com `skip`, ignora um grupo (para contar as opções dele). */
export function matchesFilter(r: Review, f: WallFilter, skip?: FacetKey): boolean {
  for (const k of FACET_KEYS) {
    if (k === skip) continue;
    const chosen = f[k] as readonly string[];
    if (!chosen.length) continue;
    const keys = new Set(chosen.map((c) => keyOf(k, c)));
    if (!valuesOf(r, k).some((v) => keys.has(keyOf(k, v)))) return false;
  }
  return true;
}

/**
 * A busca do mural: nome, texto e bônus (nas anotações, a categoria e as tags), sem ligar para
 * acento nem caixa. `needle` já vem dobrado; "#bug" procura só nas tags.
 */
export function matchesQuery(r: Review, needle: string): boolean {
  if (!needle) return true;
  if (needle.startsWith('#')) {
    const tag = needle.slice(1);
    return !!r.tags?.some((t) => fold(t).includes(tag));
  }
  return (
    fold(r.game.name).includes(needle) ||
    fold(r.text).includes(needle) ||
    r.bonuses.some((b) => fold(b.label).includes(needle)) ||
    (!!r.category && fold(r.category).includes(needle)) ||
    !!r.tags?.some((t) => fold(t).includes(needle))
  );
}

/** Quantas opções estão escolhidas, somando todos os grupos. */
export function filterSize(f: WallFilter): number {
  return FACET_KEYS.reduce((n, k) => n + f[k].length, 0);
}

/** Liga ou desliga uma opção de um grupo. */
export function toggleOption(f: WallFilter, k: FacetKey, value: string): WallFilter {
  const list = f[k] as readonly string[];
  const key = keyOf(k, value);
  const on = list.some((v) => keyOf(k, v) === key);
  return { ...f, [k]: on ? list.filter((v) => keyOf(k, v) !== key) : [...list, value] };
}

/**
 * Os valores de categoria ou de tag do mural, um por grafia sem acento nem caixa, escritos do jeito
 * mais usado (no empate, o que aparece primeiro), e os ligados que o mural não tem mais.
 */
function spellingsOf(values: readonly string[], chosen: readonly string[]): string[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const v of values) {
    const k = fold(v);
    const uses = byKey.get(k) ?? new Map<string, number>();
    uses.set(v, (uses.get(v) ?? 0) + 1);
    byKey.set(k, uses);
  }
  // o sort é estável: no empate, fica a grafia que apareceu primeiro
  const out = [...byKey.values()].map((uses) => [...uses].sort((a, b) => b[1] - a[1])[0][0]);
  for (const c of chosen) if (!byKey.has(fold(c))) out.push(c);
  return out;
}

export interface FacetOption {
  value: string;
  /** O nome inteiro: no leitor de tela, na dica e na etiqueta embaixo da régua. */
  label: string;
  /** Quantas fichas a opção mostraria, com os outros grupos como estão. */
  n: number;
  on: boolean;
}

export interface Facet {
  key: FacetKey;
  title: string;
  options: FacetOption[];
}

export const FACET_TITLE: Record<FacetKey, string> = {
  verdict: 'Veredito',
  status: 'Status',
  text: 'Resenha',
  look: 'Visual da ficha',
  grade: 'Média',
  difficulty: 'Dificuldade',
  year: 'Ano',
  category: 'Categoria',
  tag: 'Tags',
};

export const GRADE_LABEL: Record<GradeBand, string> = {
  '9': '9 ou mais',
  '8': 'Na casa do 8',
  '7': 'Na casa do 7',
  '6': 'Na casa do 6',
  '5': 'Na casa do 5',
  baixo: 'Abaixo de 5',
};

/** O que vai escrito no adesivo da faixa: curto, como a nota. */
export const GRADE_SHORT: Record<GradeBand, string> = { '9': '9+', '8': '8', '7': '7', '6': '6', '5': '5', baixo: '<5' };

export function optionLabel(k: FacetKey, value: string, profile: KindProfile): string {
  switch (k) {
    case 'verdict':
      return value === 'sem' ? 'Sem veredito' : VERDICT_LABEL[value as Verdict];
    case 'status':
      return profile.status[value as Status];
    case 'grade':
      return GRADE_LABEL[value as GradeBand];
    case 'difficulty':
      return DIFFICULTY_LABEL[value as Difficulty];
    case 'year':
      return value === 'sem' ? 'Sem data' : value;
    case 'text':
      return value === 'com' ? 'Com texto' : 'Sem texto';
    case 'look':
      return value === 'com' ? 'Com decoração' : 'Sem decoração';
    case 'category':
      return value === 'sem' ? 'Sem categoria' : value;
    case 'tag':
      return value === 'sem' ? 'Sem tag' : value;
  }
}

/** A etiqueta de um filtro ligado, embaixo da régua: precisa se explicar sozinha, fora da cartela. */
export function tagLabel(k: FacetKey, value: string, profile: KindProfile): string {
  switch (k) {
    case 'grade':
      return value === 'baixo' ? 'Média abaixo de 5' : value === '9' ? 'Média 9 ou mais' : `Média na casa do ${value}`;
    case 'difficulty':
      return value === 'nenhuma' ? 'Sem dificuldade' : `Dificuldade ${DIFFICULTY_LABEL[value as Difficulty].toLowerCase()}`;
    case 'year':
      return value === 'sem' ? 'Sem data' : `Em ${value}`;
    case 'tag':
      return value === 'sem' ? 'Sem tag' : `#${value}`;
    default:
      return optionLabel(k, value, profile);
  }
}

/**
 * Os grupos da cartela, cada opção com a contagem do que ela mostraria se fosse ligada, com os outros
 * grupos como estão. As opções não somem quando zeram (a cartela não muda de forma a cada clique):
 * só o "Sem veredito" e os anos dependem do que o mural tem.
 */
export function facetsOf(list: readonly Review[], f: WallFilter, profile: KindProfile): Facet[] {
  const years = [...new Set(list.map(yearOf))].sort((a, b) => (a === 'sem' ? 1 : b === 'sem' ? -1 : b.localeCompare(a)));
  for (const y of f.year) if (!years.includes(y)) years.push(y);
  const anyNoVerdict = list.some((r) => !r.verdict) || f.verdict.includes('sem');
  // as categorias e as tags que o mural tem, de A a Z, e "Sem categoria" / "Sem tag" no fim
  const bySem = (a: string, b: string) => (a === 'sem' ? 1 : b === 'sem' ? -1 : a.localeCompare(b, 'pt-BR'));
  const cats = spellingsOf(list.map(categoryValueOf), f.category).sort(bySem);
  const tags = spellingsOf(list.flatMap(tagValuesOf), f.tag).sort(bySem);

  const values: Record<FacetKey, readonly string[]> = {
    verdict: anyNoVerdict ? [...VERDICTS, 'sem'] : VERDICTS,
    status: STATUSES,
    text: ['com', 'sem'],
    look: ['com', 'sem'],
    grade: GRADE_BANDS,
    difficulty: DIFFICULTIES,
    year: years,
    category: cats,
    tag: tags,
  };

  return facetKeysOf(profile)
    // sem nenhuma tag no mural, o grupo de tags só diria "Sem tag": fica de fora
    .filter((k) => (k !== 'year' || years.length > 0) && (k !== 'category' || cats.length > 0) && (k !== 'tag' || tags.some((t) => t !== 'sem')))
    // nas anotações, o visual e o ano só aparecem quando separam alguma coisa (com uma opção só, não filtram nada)
    .filter((k) => !isNotes(profile.kind) || (k !== 'look' && k !== 'year') || f[k].length > 0 || new Set(list.map((r) => valuesOf(r, k)[0])).size > 1)
    .map((key) => {
      const counts = new Map<string, number>();
      for (const r of list) {
        if (!matchesFilter(r, f, key)) continue;
        // uma anotação com "Bug" e "bug" conta uma vez
        for (const v of new Set(valuesOf(r, key).map((x) => keyOf(key, x)))) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const chosen = new Set((f[key] as readonly string[]).map((c) => keyOf(key, c)));
      return {
        key,
        title: FACET_TITLE[key],
        options: values[key].map((value) => ({
          value,
          label: optionLabel(key, value, profile),
          n: counts.get(keyOf(key, value)) ?? 0,
          on: chosen.has(keyOf(key, value)),
        })),
      };
    });
}

export interface FilterTag {
  key: FacetKey;
  value: string;
  label: string;
}

/** Os filtros ligados, na ordem da cartela. */
export function tagsOf(f: WallFilter, profile: KindProfile): FilterTag[] {
  return FACET_KEYS.flatMap((key) =>
    (f[key] as readonly string[]).map((value) => ({ key, value, label: tagLabel(key, value, profile) })),
  );
}
