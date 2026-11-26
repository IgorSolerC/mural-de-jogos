import { seededRandom } from '../fsrs';
import { readJson, writeJson } from '../storage';
import { fold } from '../text';
import { MarkLookup, Word } from './dictionary';
import { foldJa, hasKanji, looseRomaji, romajiToKana, toHiragana } from './kana';

/**
 * O Treino do Dicionário Japonês (PLANO-TREINO-DICIONARIO.md): a montagem (com quais palavras, os filtros da escrita,
 * os jeitos e as dicas), o sorteio das palavras e a conferência do que se digitou. Puro: quem chama passa as palavras,
 * as marcas, a semente e se há voz japonesa. Nada daqui é guardado, menos a montagem (`readSetup`, `writeSetup`).
 */

/** Os jeitos de treinar: escrever à mão, português → japonês e japonês → português. */
export const DRILL_WAYS = ['escrever', 'pt-jp', 'jp-pt'] as const;
export type DrillWay = (typeof DRILL_WAYS)[number];

/** O selo, o nome e o que faz cada jeito (na folha de montar, na mesa e no fim). */
export const WAY_INFO: Record<DrillWay, { seal: string; label: string; desc: string }> = {
  escrever: { seal: '書', label: 'Escrever à mão', desc: 'A dica aparece e você escreve com o pincel, cada caractere no seu quadrado.' },
  'pt-jp': { seal: '訳', label: 'Português → japonês', desc: 'Lê em português e digita em japonês (kana, kanji ou romaji).' },
  'jp-pt': { seal: '読', label: 'Japonês → português', desc: 'Lê ou ouve em japonês e digita em português.' },
};

/** As dicas do Escrever à mão. */
export const WRITE_HINTS = ['som', 'romaji', 'traducao'] as const;
export type WriteHint = (typeof WRITE_HINTS)[number];

/** Como o Japonês → português mostra a palavra. */
export const JP_SHOWS = ['escrito', 'falado'] as const;
export type JpShow = (typeof JP_SHOWS)[number];

/** De onde vêm as palavras. */
export const DRILL_SOURCES = ['aprendidas', 'favoritas', 'todas'] as const;
export type DrillSource = (typeof DRILL_SOURCES)[number];

/** Um filtro de escrita: a palavra precisa ter, tanto faz, ou não pode ter. */
export const NEEDS = ['precisa', 'tanto', 'sem'] as const;
export type Need = (typeof NEEDS)[number];

/** As três escritas que se filtram. */
export const SCRIPTS = ['kanji', 'hiragana', 'katakana'] as const;
export type Script = (typeof SCRIPTS)[number];

/** Quantas palavras por treino (0: todas). */
export const DRILL_SIZES = [10, 20, 50, 0] as const;
export type DrillSize = (typeof DRILL_SIZES)[number];

export interface DrillSetup {
  ways: DrillWay[];
  source: DrillSource;
  /** Todas as do De onde, ou só as escolhidas à mão. */
  pick: 'todas' | 'escolher';
  /** As escolhidas à mão (ids do CSV), de qualquer De onde: valem as que servem ao de agora. */
  chosen: string[];
  needs: Record<Script, Need>;
  hints: WriteHint[];
  show: JpShow[];
  size: DrillSize;
}

export const DEFAULT_SETUP: DrillSetup = {
  ways: ['escrever'],
  source: 'aprendidas',
  pick: 'todas',
  chosen: [],
  needs: { kanji: 'tanto', hiragana: 'tanto', katakana: 'tanto' },
  hints: ['som', 'romaji', 'traducao'],
  show: ['escrito', 'falado'],
  size: 20,
};

/** Um teto de leitura das escolhidas, só contra lixo (o dicionário tem por volta de 1.500 palavras). */
const MAX_CHOSEN = 5000;
const ID_RE = /^[\w-]{1,64}$/;

function listOf<T extends string>(raw: unknown, all: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return fallback;
  const out = all.filter((v) => raw.includes(v));
  return out.length ? out : fallback;
}

function oneOf<T extends string | number>(raw: unknown, all: readonly T[], fallback: T): T {
  return all.includes(raw as T) ? (raw as T) : fallback;
}

/** A montagem lida do que estava guardado (o que não serve volta ao padrão). */
export function sanitizeSetup(raw: unknown): DrillSetup {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETUP, needs: { ...DEFAULT_SETUP.needs } };
  const r = raw as Record<string, unknown>;
  const needsRaw = r['needs'] && typeof r['needs'] === 'object' ? (r['needs'] as Record<string, unknown>) : {};
  const chosen = Array.isArray(r['chosen']) ? r['chosen'].filter((id): id is string => typeof id === 'string' && ID_RE.test(id)).slice(0, MAX_CHOSEN) : [];
  return {
    ways: listOf(r['ways'], DRILL_WAYS, [...DEFAULT_SETUP.ways]),
    source: oneOf(r['source'], DRILL_SOURCES, DEFAULT_SETUP.source),
    pick: r['pick'] === 'escolher' ? 'escolher' : 'todas',
    chosen: [...new Set(chosen)],
    needs: {
      kanji: oneOf(needsRaw['kanji'], NEEDS, 'tanto'),
      hiragana: oneOf(needsRaw['hiragana'], NEEDS, 'tanto'),
      katakana: oneOf(needsRaw['katakana'], NEEDS, 'tanto'),
    },
    hints: listOf(r['hints'], WRITE_HINTS, [...DEFAULT_SETUP.hints]),
    show: listOf(r['show'], JP_SHOWS, [...DEFAULT_SETUP.show]),
    size: oneOf(r['size'], DRILL_SIZES, DEFAULT_SETUP.size),
  };
}

/** A montagem deste navegador (sai na limpeza do logout pelo prefixo; não sincroniza: é preferência do aparelho). */
export const DRILL_SETUP_KEY = 'meu-mural:dicionario:treino:v1';

/** A montagem guardada neste navegador (sem nada guardado: o padrão). Lida na hora de abrir, nunca no módulo. */
export function readSetup(): DrillSetup {
  return sanitizeSetup(readJson(DRILL_SETUP_KEY));
}

export function writeSetup(setup: DrillSetup): void {
  writeJson(DRILL_SETUP_KEY, setup);
}

/* ===================== As palavras que se treinam ===================== */

/**
 * O que se escreve no treino: o texto sem o ？ do fim (本当？ → 本当). As que não se treinam (`trainable`) não chegam
 * aqui.
 */
export function drillText(w: Word): string {
  return w.text.replace(/[？?]/g, '').trim();
}

/**
 * A palavra se treina: as de verdade, sem os pedaços de gramática com 〜, sem alternativas (`な / なあ`) e sem
 * explicação no texto (`〜そうだ (ouvi dizer)`).
 */
export function trainable(w: Word): boolean {
  const t = drillText(w);
  return !!t && !/[〜～/()（）\s]/.test(t) && !w.reading.includes('/');
}

/** As escritas que a palavra usa. */
export function scriptsOf(text: string): Record<Script, boolean> {
  return { kanji: hasKanji(text), hiragana: /[ぁ-ゖ]/.test(text), katakana: /[ァ-ヺ]/.test(text) };
}

function fitsNeeds(w: Word, needs: Record<Script, Need>): boolean {
  const has = scriptsOf(drillText(w));
  return SCRIPTS.every((s) => needs[s] === 'tanto' || (needs[s] === 'precisa') === has[s]);
}

function fromSource(w: Word, source: DrillSource, marks: MarkLookup): boolean {
  if (source === 'aprendidas') return marks.learned(w);
  if (source === 'favoritas') return marks.favorite(w.id);
  return true;
}

/** As palavras do De onde que passam nos filtros de escrita (a lista do Escolher…), na ordem do dicionário. */
export function sourceWords(words: readonly Word[], setup: Pick<DrillSetup, 'source' | 'needs'>, marks: MarkLookup): Word[] {
  return words.filter((w) => trainable(w) && fromSource(w, setup.source, marks) && fitsNeeds(w, setup.needs));
}

/** As palavras que o treino sorteia: as do De onde nos filtros e, com o Escolher, só as escolhidas. */
export function drillPool(words: readonly Word[], setup: DrillSetup, marks: MarkLookup): Word[] {
  const list = sourceWords(words, setup, marks);
  if (setup.pick === 'todas') return list;
  const chosen = new Set(setup.chosen);
  return list.filter((w) => chosen.has(w.id));
}

/** Quantas palavras cada De onde traria (com os filtros e o Quais de agora). */
export function sourceCounts(words: readonly Word[], setup: DrillSetup, marks: MarkLookup): Record<DrillSource, number> {
  const out = {} as Record<DrillSource, number>;
  for (const s of DRILL_SOURCES) out[s] = drillPool(words, { ...setup, source: s }, marks).length;
  return out;
}

/** Quantas palavras cada recorte de uma escrita traria (o resto da montagem como está). */
export function needCounts(words: readonly Word[], setup: DrillSetup, marks: MarkLookup, script: Script): Record<Need, number> {
  const out = {} as Record<Need, number>;
  for (const n of NEEDS) out[n] = drillPool(words, { ...setup, needs: { ...setup.needs, [script]: n } }, marks).length;
  return out;
}

/* ===================== O sorteio ===================== */

/** Uma palavra do treino: o jeito sorteado e a dica (no Escrever) ou o jeito de mostrar (no Japonês → português). */
export interface DrillItem {
  word: Word;
  way: DrillWay;
  hint?: WriteHint;
  show?: JpShow;
}

/** As dicas e os jeitos de mostrar que valem agora: o som e o falado só com voz japonesa no aparelho. */
export function usableHints(setup: DrillSetup, voice: boolean): { hints: WriteHint[]; show: JpShow[] } {
  const hints = setup.hints.filter((h) => voice || h !== 'som');
  const show = setup.show.filter((s) => voice || s !== 'falado');
  return { hints: hints.length ? hints : ['romaji', 'traducao'], show: show.length ? show : ['escrito'] };
}

const pickOne = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/**
 * As palavras do treino, embaralhadas pela semente, no tamanho pedido, cada uma com o jeito sorteado entre os marcados
 * e a dica (ou o jeito de mostrar) sorteada entre as marcadas.
 */
export function drawDrill(pool: readonly Word[], setup: DrillSetup, seed: string, voice: boolean): DrillItem[] {
  const { hints, show } = usableHints(setup, voice);
  const ways = setup.ways.length ? setup.ways : DEFAULT_SETUP.ways;
  const r = (w: Word, what: string) => seededRandom(`${seed}:${w.id}:${what}`);
  const shuffled = [...pool].sort((a, b) => r(a, 'ordem') - r(b, 'ordem') || a.order - b.order);
  const taken = setup.size ? shuffled.slice(0, setup.size) : shuffled;
  return taken.map((word) => {
    const way = pickOne(ways, r(word, 'jeito'));
    if (way === 'escrever') return { word, way, hint: pickOne(hints, r(word, 'dica')) };
    if (way === 'jp-pt') return { word, way, show: pickOne(show, r(word, 'mostrar')) };
    return { word, way };
  });
}

/** O mesmo treino com outras palavras: as erradas de antes, cada uma com um jeito novo sorteado (e dica nova). */
export function redrawDrill(words: readonly Word[], setup: DrillSetup, seed: string, voice: boolean): DrillItem[] {
  return drawDrill(words, { ...setup, size: 0 }, seed, voice);
}

/* ===================== A conferência do que se digitou ===================== */

/** Com o que o japonês digitado bateu: a escrita, a leitura ou o romaji; null, com nada. */
export type JaMatch = 'escrita' | 'leitura' | 'romaji' | null;

/** O japonês digitado (kana, kanji ou romaji) confere com a palavra? */
export function checkJa(w: Word, typed: string): JaMatch {
  const t = typed.replace(/[\s。、.,!！？?]/g, '');
  if (!t) return null;
  const text = drillText(w);
  // a escrita como está (テレビ em katakana); em hiragana, a mesma palavra bate com a leitura logo abaixo
  if (t.normalize('NFC') === text.normalize('NFC')) return 'escrita';
  const reading = toHiragana(w.reading.replace(/[？?]/g, ''));
  if (foldJa(t) === reading) return 'leitura';
  // o romaji: lido como kana (taberu → たべる), ou solto (com ou sem a vogal longa, toukyou = tokyo)
  const asKana = romajiToKana(t);
  if (asKana && (asKana === reading || asKana === reading.replace(/ー/g, ''))) return 'romaji';
  if (/^[a-zāâīîūûēêōô'-]+$/i.test(t) && looseRomaji(t) === looseRomaji(w.romaji)) return 'romaji';
  return null;
}

/** Um sentido sem o que está entre parênteses, sem aspas e sem pontuação, sem acento e minúsculo. */
function plainSense(s: string): string {
  return fold(s.replace(/\([^)]*\)/g, ' '))
    .replace(/[^a-z0-9ç\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Os sentidos da palavra (o português separado por " / "), prontos para comparar. */
export function sensesOf(w: Word): string[] {
  return w.meaning
    .split('/')
    .map((s) => plainSense(s))
    .filter(Boolean);
}

const ARTIGO = /^(o|a|os|as|um|uma|uns|umas) /;

/**
 * O português digitado confere com um dos sentidos? Devolve o sentido (como está escrito no dicionário) ou null.
 * Sem acento, sem caixa, sem o que está entre parênteses e sem o artigo do começo ("o trem" = "trem").
 */
export function checkPt(w: Word, typed: string): string | null {
  const t = plainSense(typed).replace(ARTIGO, '');
  if (!t) return null;
  const raw = w.meaning.split('/').map((s) => s.trim());
  for (const sense of raw) {
    const p = plainSense(sense);
    if (p === t || p.replace(ARTIGO, '') === t) return sense;
    // "esse(a)" vira "esse"; "tornar-se" bate com "tornar se"
    if (p.replace(/-/g, ' ') === t.replace(/-/g, ' ')) return sense;
  }
  return null;
}

/* ===================== As respostas ===================== */

/** Um traço do pincel: os pontos (no quadro de 109) com a grossura de cada um. */
export type BrushStroke = readonly { x: number; y: number; w: number }[];

export interface DrillAnswer {
  item: DrillItem;
  ok: boolean;
  /** O que a pessoa digitou (os dois jeitos digitados). */
  typed?: string;
  /** Os traços de cada quadrado (o Escrever à mão). */
  drawing?: BrushStroke[][];
}

/** As contas do fim: acertos no total e por jeito (só os jeitos que saíram). */
export function drillScore(answers: readonly DrillAnswer[]): { right: number; total: number; byWay: { way: DrillWay; right: number; total: number }[] } {
  const byWay = DRILL_WAYS.map((way) => {
    const mine = answers.filter((a) => a.item.way === way);
    return { way, right: mine.filter((a) => a.ok).length, total: mine.length };
  }).filter((x) => x.total > 0);
  return { right: answers.filter((a) => a.ok).length, total: answers.length, byWay };
}
