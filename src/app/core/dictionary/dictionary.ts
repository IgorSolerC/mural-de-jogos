import { FacetGroup } from '../facets';
import { fold, nameCollator as nameColl } from '../text';
import { foldJa, hasKanji, kanaRow, looseRomaji, romajiToKana } from './kana';

/**
 * O Dicionário Japonês de Outros (PLANO-DICIONARIO.md): as palavras do CSV, a busca, os filtros, as ordens e as
 * seções. Puro e só de leitura: ninguém escreve no dicionário, nada vai para o armazenamento nem para a nuvem.
 */

/** Uma palavra do dicionário, uma linha do CSV. */
export interface Word {
  /** A ordem sugerida de estudo (1 = primeiro). */
  order: number;
  /** O identificador fixo (`JP0037`). */
  id: string;
  /** Como se escreve (`来る`, `〜ます`). */
  text: string;
  /** A leitura em kana. */
  reading: string;
  romaji: string;
  /** O(s) significado(s) em português. */
  meaning: string;
  /** 0 a 10: quanto vale aprender agora. */
  importance: number;
  /** 1 a 5: quanto aparece no japonês de verdade (o `uso` diz em palavras). */
  frequency: number;
  use: string;
  /** N5 a N1, ou `-` (gíria, sem lista). */
  jlpt: string;
  /** Onde a palavra aparece: neutro, casual, anime/mangá… (uma ou várias). */
  registers: string[];
  wordClass: string;
  theme: string;
  /** kanji, kana, katakana, kanji+kana ou ambos. */
  script: string;
  /** godan, ichidan ou irregular; só nos verbos. */
  verbGroup: string | null;
  /** A posição na lista de frequência da internet (menor, mais comum); `null` quando não está nela. */
  rank: number | null;
  composition: string;
  notes: string;
  /** O dia (AAAA-MM-DD) em que o dono aprendeu a palavra, pelo CSV; `null` para as que ainda não aprendeu. */
  learnedOn: string | null;
}

/** O CSV lido em linhas e campos (aspas com vírgula dentro, aspas dobradas, quebra de linha dentro das aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const num = (s: string, fallback: number) => {
  const n = Number(s.trim());
  return s.trim() && Number.isFinite(n) ? n : fallback;
};

/** Um dia que existe (AAAA-MM-DD), ou null: 2026-11-31 não passa. */
function dayOf(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : null;
}

/** As palavras do CSV, pelos nomes das colunas (a ordem delas no arquivo pode mudar). */
export function readWords(csv: string): Word[] {
  const [head, ...rows] = parseCsv(csv);
  if (!head) return [];
  const col = new Map(head.map((h, i) => [h.trim(), i]));
  const get = (r: string[], name: string) => (r[col.get(name) ?? -1] ?? '').trim();
  return rows
    .map((r, i) => {
      const group = get(r, 'grupo_verbo');
      const rank = get(r, 'rank_corpus_internet');
      return {
        order: num(get(r, 'prioridade'), i + 1),
        id: get(r, 'id') || `linha-${i + 1}`,
        text: get(r, 'japones'),
        reading: get(r, 'leitura'),
        romaji: get(r, 'romaji'),
        meaning: get(r, 'portugues'),
        importance: num(get(r, 'importancia'), 0),
        frequency: num(get(r, 'frequencia'), 0),
        use: get(r, 'uso'),
        jlpt: get(r, 'jlpt') || '-',
        registers: get(r, 'registro')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean),
        wordClass: get(r, 'classe'),
        theme: get(r, 'tema'),
        script: get(r, 'escrita'),
        verbGroup: group && group !== '-' ? group : null,
        rank: rank ? num(rank, 0) || null : null,
        composition: get(r, 'composicao'),
        notes: get(r, 'notas'),
        learnedOn: dayOf(get(r, 'aprendida')),
      } satisfies Word;
    })
    .filter((w) => w.text || w.reading);
}

/* ===================== A busca ===================== */

/** O que a busca guarda de cada palavra, já dobrado (uma vez só, quando o dicionário abre). */
export interface WordKeys {
  /** A palavra e a leitura, em hiragana e sem acento. */
  ja: string[];
  romaji: string;
  romajiLoose: string;
  /** O português inteiro e os sentidos separados ("vir", "tornar-se"). */
  meaning: string;
  senses: string[];
  /** A composição, as notas, a classe e o tema: acha, mas vale pouco. */
  extra: string;
}

/**
 * O que a voz diz de uma palavra (o Ouvir, PLANO-DICIONARIO.md 5.2): a leitura em kana, que a voz não erra (o kanji
 * sozinho ela pode ler de outro jeito: 〜中 vira なか); sem o 〜 dos sufixos; as leituras alternativas ("しょ / じょ")
 * com uma pausa entre elas; e as partículas は e へ como se falam (わ, え).
 */
export function spokenOf(w: Word): string {
  if (w.wordClass === 'partícula' && (w.text === 'は' || w.text === 'へ')) return w.text === 'は' ? 'わ' : 'え';
  return (w.reading || w.text)
    .replace(/[〜～]/g, '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('、');
}

/** Os kanji de um texto, cada um uma vez, na ordem em que aparecem. */
export function kanjiIn(text: string): string[] {
  return [...new Set([...text].filter((c) => hasKanji(c)))];
}

/** As outras palavras do dicionário escritas com o kanji, na ordem de estudo (PLANO-DICIONARIO.md, 5.4). */
export function wordsWithKanji(words: readonly Word[], kanji: string, exceptId?: string): Word[] {
  return words.filter((w) => w.id !== exceptId && w.text.includes(kanji)).sort((a, b) => a.order - b.order);
}

/** Cada escrita do dicionário e a palavra dela (das homógrafas, a primeira na ordem de estudo). */
export function wordsByText(words: readonly Word[]): Map<string, Word> {
  const out = new Map<string, Word>();
  for (const w of [...words].sort((a, b) => a.order - b.order)) if (!out.has(w.text)) out.set(w.text, w);
  return out;
}

/** Um pedaço da composição: o texto e, quando ele é uma palavra do dicionário, ela (o link). */
export interface CompositionPart {
  text: string;
  word?: Word;
}

/**
 * A composição de um verbete em pedaços (PLANO-DICIONARIO.md, 5.4): cada trecho em japonês que é, inteiro, outra
 * palavra do dicionário vira link para ela ("先週, 先月, 先生"); o resto (a vírgula, o português entre parênteses, a
 * frase que não é uma palavra só) fica texto.
 */
export function compositionParts(text: string, byText: ReadonlyMap<string, Word>, selfId?: string): CompositionPart[] {
  const out: CompositionPart[] = [];
  const push = (t: string, word?: Word) => {
    if (!t) return;
    const last = out.at(-1);
    if (!word && last && !last.word) last.text += t;
    else out.push(word ? { text: t, word } : { text: t });
  };
  let at = 0;
  for (const m of text.matchAll(/[぀-ヿ㐀-鿿豈-﫿々〜～]+/g)) {
    push(text.slice(at, m.index));
    // um kana sozinho (と, の) pode ser outra coisa ali: só vira link o trecho com kanji ou de dois caracteres ou mais
    const word = hasKanji(m[0]) || [...m[0]].length > 1 ? byText.get(m[0]) : undefined;
    push(m[0], word && word.id !== selfId ? word : undefined);
    at = m.index! + m[0].length;
  }
  push(text.slice(at));
  return out;
}

export function keysOf(w: Word): WordKeys {
  const meaning = fold(w.meaning);
  return {
    ja: [foldJa(w.text.replace(/〜/g, '')), foldJa(w.reading)].filter(Boolean),
    romaji: fold(w.romaji),
    romajiLoose: looseRomaji(w.romaji),
    meaning,
    senses: meaning
      .split(/[\/,;()]+/)
      .map((s) => s.replace(/\.\.\.|…/g, '').trim())
      .filter(Boolean),
    extra: foldJa([w.composition, w.notes, w.wordClass, w.theme].join(' ')),
  };
}

/** Uma busca lida: cada pedaço separado por espaço, dobrado, e o romaji como kana quando é romaji. */
interface Term {
  plain: string;
  ja: string;
  kana: string | null;
  loose: string;
}

function termsOf(query: string): Term[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const kana = romajiToKana(t);
      return { plain: fold(t), ja: foldJa(t.replace(/〜/g, '')), kana: kana ? foldJa(kana) : null, loose: looseRomaji(t) };
    })
    .filter((t) => t.plain || t.ja);
}

/** Igual, começa com, contém: quanto vale cada jeito de achar, em cada campo. */
function tier(hay: string, needle: string, [exact, prefix, inside]: [number, number, number]): number {
  if (!needle || !hay) return 0;
  if (hay === needle) return exact;
  if (hay.startsWith(needle)) return prefix;
  // no meio, só a partir de duas letras ou com kanji (来 sozinho acha 来る e 未来; "b" sozinho acharia meio dicionário)
  return (needle.length >= 2 || hasKanji(needle)) && hay.includes(needle) ? inside : 0;
}

/** Quanto um pedaço da busca vale numa palavra; 0 quando ele não está nela. */
function termScore(k: WordKeys, t: Term): number {
  let best = 0;
  for (const ja of k.ja) {
    best = Math.max(best, tier(ja, t.ja, [100, 80, 55]));
    if (t.kana) best = Math.max(best, tier(ja, t.kana, [96, 76, 50]));
  }
  best = Math.max(best, tier(k.romaji, t.plain, [98, 78, 45]));
  if (t.loose.length >= 2) best = Math.max(best, tier(k.romajiLoose, t.loose, [94, 72, 40]));
  for (const s of k.senses) best = Math.max(best, tier(s, t.plain, [90, 68, 0]));
  // dentro do português, só a partir do começo de uma palavra ("comer" acha "comer algo", não "começo")
  if (!best && t.plain.length >= 2 && new RegExp(`(^|[^a-z0-9])${escapeRe(t.plain)}`).test(k.meaning)) best = 42;
  // na composição, nas notas, na classe e no tema, só a partir de duas letras (uma letra está em quase tudo)
  if (!best && (t.ja.length >= 2 || hasKanji(t.ja)) && (k.extra.includes(t.ja) || (t.kana && k.extra.includes(t.kana)))) best = 10;
  return best;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quanto a palavra combina com a busca (maior, melhor); 0 quando não combina. Cada pedaço separado por espaço
 * precisa achar alguma coisa; busca vazia combina com tudo (1).
 */
export function matchScore(k: WordKeys, query: string): number {
  const terms = termsOf(query);
  if (!terms.length) return 1;
  let total = 0;
  for (const t of terms) {
    const s = termScore(k, t);
    if (!s) return 0;
    total += s;
  }
  return total;
}

/**
 * As palavras que um trecho selecionado É (PLANO-DICIONARIO.md, 4.3): o trecho inteiro igual à palavra escrita, à
 * leitura (katakana = hiragana), ao romaji ou a um dos sentidos em português ("comer", "café da manhã"). Não acha
 * pedaço: "comer algo" não é "comer". Na ordem de estudo.
 */
export function lookupWords(words: readonly Word[], keys: ReadonlyMap<string, WordKeys>, text: string): Word[] {
  const t = text.trim();
  if (!t || t.length > 40) return [];
  const ja = foldJa(t.replace(/〜/g, ''));
  const plain = fold(t).replace(/\s+/g, ' ');
  return words.filter((w) => {
    const k = keys.get(w.id);
    return !!k && (k.ja.includes(ja) || k.romaji === plain || k.senses.includes(plain));
  });
}

/* ===================== Os filtros ===================== */

export type FacetKey = 'learned' | 'favorite' | 'jlpt' | 'use' | 'importance' | 'wordClass' | 'theme' | 'script' | 'register' | 'verbGroup';
export type DictFilter = Partial<Record<FacetKey, string[]>>;

/** A ordem das linhas na folha dos filtros, e como cada uma aparece. */
export const FACETS: readonly { key: FacetKey; title: string; desc: string; param: string }[] = [
  { key: 'learned', title: 'Aprendidas', desc: 'As que você já aprendeu, ou as que faltam.', param: 'aprendida' },
  { key: 'favorite', title: 'Favoritas', desc: 'Só as que você marcou com a estrela.', param: 'favorita' },
  { key: 'jlpt', title: 'JLPT', desc: 'O nível da prova de proficiência: N5 é o começo.', param: 'jlpt' },
  { key: 'use', title: 'Uso', desc: 'Quanto a palavra aparece no japonês de verdade.', param: 'uso' },
  { key: 'importance', title: 'Importância', desc: 'Quanto vale aprender agora: 10 primeiro.', param: 'imp' },
  { key: 'wordClass', title: 'Classe', desc: 'Verbo, substantivo, partícula…', param: 'classe' },
  { key: 'theme', title: 'Tema', desc: 'O assunto da palavra.', param: 'tema' },
  { key: 'script', title: 'Escrita', desc: 'Como ela costuma ser escrita.', param: 'escrita' },
  { key: 'register', title: 'Registro', desc: 'Onde ela aparece; uma palavra pode estar em vários.', param: 'registro' },
  { key: 'verbGroup', title: 'Grupo do verbo', desc: 'Define como o verbo conjuga.', param: 'verbo' },
];

/** As marcas do dono (aprendida, favorita), como os filtros as perguntam (ver core/dictionary/marks-store.ts). */
export interface MarkLookup {
  learned(w: Word): boolean;
  favorite(id: string): boolean;
}

/** Sem marcas: nenhuma aprendida e nenhuma favorita (o CSV só marca para quem estuda por ele, ver core/dictionary/marks.ts). */
export const NO_MARK_LOOKUP: MarkLookup = { learned: () => false, favorite: () => false };

/** Os valores fixos das linhas das marcas: elas aparecem mesmo sem nenhuma palavra marcada ainda. */
const MARK_VALUES: Partial<Record<FacetKey, string[]>> = { learned: ['sim', 'nao'], favorite: ['sim'] };

/** Os valores de uma palavra numa linha dos filtros (o registro pode ter vários). */
export function facetValues(w: Word, key: FacetKey, marks: MarkLookup = NO_MARK_LOOKUP): string[] {
  switch (key) {
    case 'learned':
      return [marks.learned(w) ? 'sim' : 'nao'];
    case 'favorite':
      return marks.favorite(w.id) ? ['sim'] : [];
    case 'jlpt':
      return [w.jlpt];
    case 'use':
      return [w.use];
    case 'importance':
      return [String(w.importance)];
    case 'wordClass':
      return [w.wordClass];
    case 'theme':
      return [w.theme];
    case 'script':
      return [w.script];
    case 'register':
      return w.registers;
    case 'verbGroup':
      return w.verbGroup ? [w.verbGroup] : [];
  }
}

const JLPT_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1', '-'];
const SCRIPT_ORDER = ['kanji', 'kanji+kana', 'ambos', 'kana', 'katakana'];
const GROUP_ORDER = ['godan', 'ichidan', 'irregular'];

/** Como cada valor aparece nos recortes e nos adesivos. */
export function facetLabel(key: FacetKey, value: string): string {
  if (key === 'learned') return value === 'sim' ? 'Aprendidas' : 'Para aprender';
  if (key === 'favorite') return 'Favoritas';
  if (key === 'jlpt') return value === '-' ? 'Sem nível' : value;
  if (key === 'script') return ({ kanji: 'Kanji', 'kanji+kana': 'Kanji + kana', ambos: 'Kanji ou kana', kana: 'Kana', katakana: 'Katakana' } as Record<string, string>)[value] ?? value;
  if (key === 'verbGroup') return ({ godan: 'Godan (grupo 1)', ichidan: 'Ichidan (grupo 2)', irregular: 'Irregular' } as Record<string, string>)[value] ?? value;
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

/** O adesivo do filtro ligado, embaixo da pasta, que diz de que linha ele é quando o valor sozinho não diz. */
export function chipLabel(key: FacetKey, value: string): string {
  if (key === 'importance') return `Importância ${value}`;
  if (key === 'use') return `Uso ${value.toLocaleLowerCase('pt-BR')}`;
  if (key === 'jlpt') return value === '-' ? 'Sem nível JLPT' : `JLPT ${value}`;
  return facetLabel(key, value);
}

/** Os valores de uma linha na ordem em que aparecem: a do nível, a do uso, a da nota, ou a dos nomes. */
function orderValues(key: FacetKey, values: string[], words: readonly Word[]): string[] {
  const at = (list: string[]) => (v: string) => (list.includes(v) ? list.indexOf(v) : list.length);
  switch (key) {
    case 'jlpt':
      return values.sort((a, b) => at(JLPT_ORDER)(a) - at(JLPT_ORDER)(b) || a.localeCompare(b));
    case 'script':
      return values.sort((a, b) => at(SCRIPT_ORDER)(a) - at(SCRIPT_ORDER)(b) || a.localeCompare(b));
    case 'verbGroup':
      return values.sort((a, b) => at(GROUP_ORDER)(a) - at(GROUP_ORDER)(b) || a.localeCompare(b));
    case 'importance':
      return values.sort((a, b) => Number(b) - Number(a));
    case 'use': {
      // do mais usado para o menos, pela frequência que o CSV dá a cada rótulo
      const freq = new Map(words.map((w) => [w.use, w.frequency]));
      return values.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));
    }
    default:
      return values.sort(nameColl.compare);
  }
}

export function isFiltered(f: DictFilter): boolean {
  return Object.values(f).some((v) => v?.length);
}

export function filterCount(f: DictFilter): number {
  return Object.values(f).reduce((n, v) => n + (v?.length ?? 0), 0);
}

export function toggleFacet(f: DictFilter, key: FacetKey, value: string): DictFilter {
  const now = f[key] ?? [];
  const next = now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
  const out: DictFilter = { ...f, [key]: next };
  if (!next.length) delete out[key];
  return out;
}

/** A palavra passa nos filtros: dentro de uma linha, qualquer um dos escolhidos; entre as linhas, todas. */
export function passes(w: Word, f: DictFilter, except?: FacetKey, marks: MarkLookup = NO_MARK_LOOKUP): boolean {
  for (const facet of FACETS) {
    if (facet.key === except) continue;
    const chosen = f[facet.key];
    if (!chosen?.length) continue;
    const mine = facetValues(w, facet.key, marks);
    if (!chosen.some((v) => mine.includes(v))) return false;
  }
  return true;
}

/**
 * As linhas da folha dos filtros: todos os valores do dicionário (a folha não muda de forma), cada um com quantas
 * palavras mostraria junto com a busca e as outras linhas. O Grupo do verbo só aparece quando há verbo à vista ou
 * um grupo escolhido.
 */
export function facetGroups(all: readonly Word[], found: readonly Word[], f: DictFilter, marks: MarkLookup = NO_MARK_LOOKUP): FacetGroup<FacetKey>[] {
  return FACETS.map((facet) => {
    const counts = new Map<string, number>();
    for (const w of found) if (passes(w, f, facet.key, marks)) for (const v of facetValues(w, facet.key, marks)) counts.set(v, (counts.get(v) ?? 0) + 1);
    const values = MARK_VALUES[facet.key] ?? orderValues(facet.key, [...new Set(all.flatMap((w) => facetValues(w, facet.key)))], all);
    const chosen = f[facet.key] ?? [];
    return {
      key: facet.key,
      title: facet.title,
      desc: facet.desc,
      options: values.map((v) => ({ value: v, label: facetLabel(facet.key, v), n: counts.get(v) ?? 0, on: chosen.includes(v) })),
    };
  }).filter((g) => g.key !== 'verbGroup' || g.options.some((o) => o.n || o.on));
}

/** Os filtros ligados, como adesivos com X embaixo da pasta, na ordem das linhas. */
export function facetChips(f: DictFilter, all: readonly Word[]): { key: FacetKey; value: string; label: string }[] {
  return FACETS.flatMap((facet) =>
    (MARK_VALUES[facet.key]?.filter((v) => f[facet.key]?.includes(v)) ?? orderValues(facet.key, [...(f[facet.key] ?? [])], all)).map((value) => ({ key: facet.key, value, label: chipLabel(facet.key, value) })),
  );
}

/* ===================== As ordens e as seções ===================== */

export type SortKey = 'priority' | 'relevance' | 'importance' | 'use' | 'rank' | 'jlpt' | 'reading' | 'meaning' | 'wordClass' | 'theme';
export type Direction = 'asc' | 'desc';

export interface SortOption {
  value: SortKey;
  label: string;
  /** O que a seta diz, no sentido natural e invertido. */
  natural: string;
  flipped: string;
  /** O pedaço do endereço. */
  param: string;
}

export const SORTS: readonly SortOption[] = [
  { value: 'priority', label: 'Prioridade', natural: 'O que estudar primeiro, primeiro', flipped: 'O que estudar por último, primeiro', param: 'prioridade' },
  { value: 'relevance', label: 'Relevância', natural: 'O que mais combina com a busca primeiro', flipped: 'O que menos combina primeiro', param: 'relevancia' },
  { value: 'importance', label: 'Importância', natural: 'Mais importantes primeiro', flipped: 'Menos importantes primeiro', param: 'importancia' },
  { value: 'use', label: 'Uso no dia a dia', natural: 'Mais usadas primeiro', flipped: 'Menos usadas primeiro', param: 'uso' },
  { value: 'rank', label: 'Mais comuns na internet', natural: 'Mais comuns primeiro', flipped: 'Menos comuns primeiro', param: 'internet' },
  { value: 'jlpt', label: 'JLPT', natural: 'Do N5 ao N1', flipped: 'Do N1 ao N5', param: 'jlpt' },
  { value: 'reading', label: 'Leitura (あいうえお)', natural: 'De あ a ん', flipped: 'De ん a あ', param: 'leitura' },
  { value: 'meaning', label: 'Português', natural: 'De A a Z', flipped: 'De Z a A', param: 'portugues' },
  { value: 'wordClass', label: 'Classe', natural: 'Classes de A a Z', flipped: 'Classes de Z a A', param: 'classe' },
  { value: 'theme', label: 'Tema', natural: 'Temas de A a Z', flipped: 'Temas de Z a A', param: 'tema' },
];

const jaColl = new Intl.Collator('ja');
const jlptAt = (w: Word) => (JLPT_ORDER.includes(w.jlpt) ? JLPT_ORDER.indexOf(w.jlpt) : JLPT_ORDER.length);

/** Comparar no sentido natural de cada ordem; o desempate é sempre a prioridade. */
function compare(key: SortKey, score: (w: Word) => number): (a: Word, b: Word) => number {
  switch (key) {
    case 'relevance':
      return (a, b) => score(b) - score(a);
    case 'importance':
      return (a, b) => b.importance - a.importance;
    case 'use':
      return (a, b) => b.frequency - a.frequency || (a.rank ?? Infinity) - (b.rank ?? Infinity);
    case 'rank':
      return (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity);
    case 'jlpt':
      return (a, b) => jlptAt(a) - jlptAt(b);
    case 'reading':
      return (a, b) => jaColl.compare(a.reading.replace(/〜/g, ''), b.reading.replace(/〜/g, ''));
    case 'meaning':
      return (a, b) => nameColl.compare(a.meaning, b.meaning);
    case 'wordClass':
      return (a, b) => nameColl.compare(a.wordClass, b.wordClass);
    case 'theme':
      return (a, b) => nameColl.compare(a.theme, b.theme);
    default:
      return () => 0;
  }
}

/** Uma seção da lista: o nome, e a chave que ordena as seções (no sentido natural). */
export interface SectionKey {
  id: string;
  label: string;
  /** Um detalhe ao lado do nome ("a, ka…" nas linhas do silabário). */
  detail?: string;
}

const RANK_FAIXAS: readonly [number, string][] = [
  [100, 'As 100 mais comuns'],
  [500, 'Até a 500ª'],
  [1000, 'Até a 1.000ª'],
  [5000, 'Até a 5.000ª'],
  [Infinity, 'Depois da 5.000ª'],
];

/** A seção de uma palavra na ordem escolhida; `null` quando a ordem não divide em seções. */
export function sectionOf(w: Word, key: SortKey): SectionKey | null {
  switch (key) {
    case 'priority':
    case 'importance':
      return { id: `imp-${w.importance}`, label: `Importância ${w.importance}` };
    case 'use':
      return { id: `uso-${w.frequency}`, label: w.use || 'Sem uso' };
    case 'rank': {
      if (w.rank === null) return { id: 'rank-sem', label: 'Fora da lista da internet' };
      const i = RANK_FAIXAS.findIndex(([max]) => w.rank! <= max);
      return { id: `rank-${i}`, label: RANK_FAIXAS[i][1] };
    }
    case 'jlpt':
      return { id: `jlpt-${w.jlpt}`, label: w.jlpt === '-' ? 'Sem nível' : w.jlpt };
    case 'reading': {
      const row = kanaRow(w.reading);
      return row ? { id: `kana-${row.index}`, label: `${row.kana}行`, detail: row.romaji } : { id: 'kana-outros', label: 'Outros' };
    }
    case 'meaning': {
      const letter = fold(w.meaning).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase() || '#';
      return { id: `letra-${letter}`, label: letter };
    }
    case 'wordClass':
      return { id: `classe-${w.wordClass}`, label: facetLabel('wordClass', w.wordClass) };
    case 'theme':
      return { id: `tema-${w.theme}`, label: facetLabel('theme', w.theme) };
    default:
      return null;
  }
}

/** As palavras na ordem e no sentido escolhidos (a seta inverte tudo, as seções também). */
export function sortWords(words: readonly Word[], key: SortKey, dir: Direction, score: (w: Word) => number = () => 0): Word[] {
  const cmp = compare(key, score);
  const sorted = [...words].sort((a, b) => cmp(a, b) || a.order - b.order);
  return dir === 'desc' ? sorted.reverse() : sorted;
}

export interface WordSection {
  key: SectionKey | null;
  words: Word[];
}

/** As palavras já ordenadas, em seções seguidas (uma seção só, sem nome, quando a ordem não divide). */
export function sectionsOf(sorted: readonly Word[], key: SortKey): WordSection[] {
  const out: WordSection[] = [];
  for (const w of sorted) {
    const s = sectionOf(w, key);
    const last = out.at(-1);
    if (last && last.key?.id === s?.id) last.words.push(w);
    else out.push({ key: s, words: [w] });
  }
  return out;
}

/* ===================== O endereço ===================== */

/** Tudo o que a página mostra, como mora no endereço. */
export interface DictState {
  query: string;
  filter: DictFilter;
  /** A ordem escolhida; `null` é a padrão (Prioridade, ou Relevância enquanto busca). */
  sort: SortKey | null;
  dir: Direction;
  view: 'verbetes' | 'tabela';
  /** A palavra aberta na lousa (o id), ou null. */
  word: string | null;
}

export const DEFAULT_STATE: DictState = { query: '', filter: {}, sort: null, dir: 'asc', view: 'verbetes', word: null };

/** A ordem que vale: a escolhida, ou a padrão (Relevância enquanto busca, Prioridade sem busca). */
export function effectiveSort(s: DictState): SortKey {
  const searching = !!s.query.trim();
  if (s.sort === 'relevance' && !searching) return 'priority';
  return s.sort ?? (searching ? 'relevance' : 'priority');
}

/** O estado lido do endereço (o que não se entende fica no padrão). */
export function stateFromParams(p: Record<string, string | undefined>): DictState {
  const filter: DictFilter = {};
  for (const facet of FACETS) {
    const raw = p[facet.param];
    if (raw) filter[facet.key] = [...new Set(raw.split(',').filter(Boolean))];
  }
  const sort = SORTS.find((s) => s.param === p['ordem'])?.value ?? null;
  return {
    query: p['q'] ?? '',
    filter,
    sort,
    dir: p['dir'] === 'desc' ? 'desc' : 'asc',
    view: p['vista'] === 'tabela' ? 'tabela' : 'verbetes',
    word: p['palavra'] && /^[\w-]{1,64}$/.test(p['palavra']) ? p['palavra'] : null,
  };
}

/** O estado como pedaços do endereço: só o que não é o padrão (o resto sai, com `null`). */
export function paramsOf(s: DictState): Record<string, string | null> {
  const out: Record<string, string | null> = {
    q: s.query || null,
    ordem: s.sort ? SORTS.find((o) => o.value === s.sort)!.param : null,
    dir: s.dir === 'desc' ? 'desc' : null,
    vista: s.view === 'tabela' ? 'tabela' : null,
    palavra: s.word,
  };
  for (const facet of FACETS) out[facet.param] = s.filter[facet.key]?.length ? s.filter[facet.key]!.join(',') : null;
  return out;
}
