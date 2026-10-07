import { Kind, profileOf } from './kinds';
import { plainText } from './rich-text';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  Review,
  STOCK_LABEL,
  Stock,
  VERDICT_LABEL,
  formatAmount,
  formatScore,
  localDay,
  shownFinal,
} from './review';

/**
 * O Muraldle: o "Wordle" do mural, como o Loldle. Uma ficha secreta por dia (ou uma de treino), e a
 * cada chute (outra ficha do mesmo mural) aparece uma fileira de quadradinhos comparando os dois:
 *
 * - **certo** (verde): igual ao da secreta;
 * - **perto** (amarelo): quase (meio ponto de média, um ano, um nível de dificuldade, um bônus a
 *   mais ou a menos, a mesma cor de cartolina noutro tom);
 * - **errado** (vermelho): diferente; nos números, uma seta diz se o da secreta é maior ou menor;
 * - **desconhecido** (cinza): uma das duas fichas não tem o dado (sem data, sem horas).
 *
 * As colunas mudam com o mural: dificuldade só onde há caveiras, horas ou páginas só onde há quantidade.
 */

export type Mark = 'certo' | 'perto' | 'errado' | 'desconhecido';

export interface Column {
  key: 'media' | 'status' | 'veredito' | 'dificuldade' | 'ano' | 'quantidade' | 'positivos' | 'negativos' | 'cartolina';
  label: string;
}

export interface Cell {
  key: Column['key'];
  /** O valor do chute, como aparece no quadradinho. */
  text: string;
  mark: Mark;
  /** Nos números: o da secreta é maior (up) ou menor (down). */
  arrow: 'up' | 'down' | null;
  /** Na coluna da cartolina: a cor, para pintar a amostra. */
  stock?: Stock;
}

export function columnsFor(kind: Kind): Column[] {
  const p = profileOf(kind);
  const cols: Column[] = [
    { key: 'media', label: 'Média' },
    { key: 'status', label: 'Status' },
    { key: 'veredito', label: 'Veredito' },
  ];
  if (p.difficulty) cols.push({ key: 'dificuldade', label: 'Dificuldade' });
  cols.push({ key: 'ano', label: 'Ano' });
  if (p.amount) cols.push({ key: 'quantidade', label: p.amount.unit === 'horas' ? 'Horas' : 'Páginas' });
  cols.push({ key: 'positivos', label: 'Bônus positivos' }, { key: 'negativos', label: 'Bônus negativos' }, { key: 'cartolina', label: 'Cartolina' });
  return cols;
}

const arrowOf = (guess: number, secret: number): Cell['arrow'] => (secret === guess ? null : secret > guess ? 'up' : 'down');

/** Número contra número: igual, perto (dentro de `near`) ou errado, com a seta. */
function numeric(key: Column['key'], g: number | null, s: number | null, near: (g: number, s: number) => boolean, text: string): Cell {
  if (g === null || s === null) return { key, text, mark: g === null && s === null ? 'certo' : 'desconhecido', arrow: null };
  if (g === s) return { key, text, mark: 'certo', arrow: null };
  return { key, text, mark: near(g, s) ? 'perto' : 'errado', arrow: arrowOf(g, s) };
}

function yearOf(r: Review): number | null {
  return r.completedAt ? Number(r.completedAt.slice(0, 4)) : null;
}

/** A cor sem o tom: "azul-escuro" e "azul" são da mesma família; o preto é o escuro do branco. */
function hueOf(s: Stock | undefined): string | null {
  if (!s) return null;
  if (s === 'preto') return 'branco';
  return s.replace(/-escuro$/, '');
}

/** Quantos bônus a favor (positivos) ou contra (negativos) a ficha tem. */
function bonusCount(r: Review, kind: 'favor' | 'contra'): number {
  return r.bonuses.filter((b) => b.kind === kind).length;
}

/** Compara o chute com a secreta, coluna a coluna. */
export function compare(guess: Review, secret: Review): Cell[] {
  const p = profileOf(secret.kind);
  return columnsFor(secret.kind).map<Cell>((col) => {
    switch (col.key) {
      case 'media': {
        const g = shownFinal(guess);
        return numeric('media', g, shownFinal(secret), (a, b) => Math.abs(a - b) <= 0.5, formatScore(g));
      }
      case 'status':
        return { key: 'status', text: p.status[guess.status], mark: guess.status === secret.status ? 'certo' : 'errado', arrow: null };
      case 'veredito': {
        const text = guess.verdict ? VERDICT_LABEL[guess.verdict] : 'Sem';
        return { key: 'veredito', text, mark: guess.verdict === secret.verdict ? 'certo' : 'errado', arrow: null };
      }
      case 'dificuldade': {
        const g = DIFFICULTIES.indexOf(guess.difficulty);
        const s = DIFFICULTIES.indexOf(secret.difficulty);
        return numeric('dificuldade', g, s, (a, b) => Math.abs(a - b) === 1, DIFFICULTY_LABEL[guess.difficulty]);
      }
      case 'ano': {
        const g = yearOf(guess);
        return numeric('ano', g, yearOf(secret), (a, b) => Math.abs(a - b) === 1, g === null ? 'Sem data' : String(g));
      }
      case 'quantidade': {
        const g = guess.hoursPlayed;
        const text = g === null ? 'Sem' : formatAmount(guess.kind, g);
        // perto: até 20% de diferença
        return numeric('quantidade', g, secret.hoursPlayed, (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.2, text);
      }
      case 'positivos':
      case 'negativos': {
        const kind = col.key === 'positivos' ? 'favor' : 'contra';
        const g = bonusCount(guess, kind);
        return numeric(col.key, g, bonusCount(secret, kind), (a, b) => Math.abs(a - b) === 1, String(g));
      }
      case 'cartolina': {
        const same = guess.stock === secret.stock;
        const near = !same && hueOf(guess.stock) !== null && hueOf(guess.stock) === hueOf(secret.stock);
        return {
          key: 'cartolina',
          text: guess.stock ? STOCK_LABEL[guess.stock] : '–',
          mark: same ? 'certo' : near ? 'perto' : 'errado',
          arrow: null,
          stock: guess.stock,
        };
      }
    }
  });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A ficha do dia: sorteada pela data, pelo mural e pelo dono, sempre a mesma no mesmo dia (enquanto o
 * mural não muda; a página guarda a escolhida, para uma ficha nova não trocar a do dia no meio).
 * Evita repetir as `avoid` (as dos dias anteriores), se sobrar alguma.
 */
export function dailySecret(pool: readonly Review[], day: string, salt: string, avoid: readonly string[] = []): Review | null {
  if (!pool.length) return null;
  const fresh = pool.filter((r) => !avoid.includes(r.id));
  const list = [...(fresh.length ? fresh : pool)].sort((a, b) => a.id.localeCompare(b.id));
  return list[hash(`${day}|${salt}`) % list.length];
}

/** O dia de hoje no fuso local, e o de ontem. */
export function dayKey(d: Date = new Date()): string {
  return localDay(d);
}

export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

const EMOJI: Record<Mark, string> = { certo: '🟩', perto: '🟨', errado: '🟥', desconhecido: '⬜' };

/** O texto para mandar no grupo: só os quadradinhos, sem nenhum nome (nada de spoiler). */
export function shareText(title: string, rows: readonly Cell[][], won: boolean): string {
  const tries = rows.length;
  const head = won ? `Acertei em ${tries} ${tries === 1 ? 'tentativa' : 'tentativas'}` : `Desisti depois de ${tries} ${tries === 1 ? 'tentativa' : 'tentativas'}`;
  // a fileira do primeiro chute embaixo, como apareceram
  const grid = [...rows].reverse().map((cells) => cells.map((c) => EMOJI[c.mark]).join(''));
  return [title, head, ...grid].join('\n');
}

/**
 * As dicas, uma a cada `HINT_EVERY` chutes errados, na ordem: a capa borrada em preto e branco, as
 * 3 primeiras palavras da resenha, mais 3 palavras, a cartolina da ficha (só o papel e a decoração),
 * a cor na capa (ainda borrada), o texto inteiro e a capa sem o borrão.
 */
export const HINT_EVERY = 3;
export const HINTS = [
  'A capa, borrada e em preto e branco',
  'As 3 primeiras palavras da resenha',
  'Mais 3 palavras da resenha',
  'A cartolina da ficha',
  'A cor da capa (ainda borrada)',
  'O texto inteiro da resenha',
  'A capa sem o borrão',
] as const;

/** Quantas dicas os chutes errados já liberaram. */
export function hintsUnlocked(misses: number): number {
  return Math.min(HINTS.length, Math.floor(misses / HINT_EVERY));
}

/** Quantas palavras da resenha cada dica aberta mostra (Infinity: o texto inteiro). */
export function wordsShown(opened: number): number {
  return opened >= 6 ? Infinity : opened >= 3 ? 6 : opened >= 2 ? 3 : 0;
}

/**
 * O texto da secreta com o nome dela tapado, cortado nas `count` primeiras palavras. Vazio quando a
 * ficha não tem texto.
 */
export function revealedWords(secret: Review, count: number): { text: string; cut: boolean } {
  // sem as marcas de formatação: a dica mostra palavras, não asteriscos e caixinhas
  let flat = plainText(secret.text).replace(/\s+/g, ' ').trim();
  if (!flat || count <= 0) return { text: '', cut: false };
  const name = secret.game.name.trim();
  if (name) flat = flat.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '▒▒▒▒');
  const words = flat.split(' ');
  if (count >= words.length) return { text: flat, cut: false };
  return { text: words.slice(0, count).join(' '), cut: true };
}
