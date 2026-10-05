import { Kind, profileOf } from './kinds';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  Review,
  STOCK_LABEL,
  Stock,
  VERDICT_LABEL,
  formatAmount,
  formatScore,
  leadSentence,
  localDay,
  shownFinal,
} from './review';

/**
 * O Muraldle: o "Wordle" do mural, como o Loldle. Uma ficha secreta por dia (ou uma de treino), e a
 * cada chute (outra ficha do mesmo mural) aparece uma fileira de quadradinhos comparando os dois:
 *
 * - **certo** (verde): igual ao da secreta;
 * - **perto** (amarelo): quase (meio ponto de média, um ano, um nível de dificuldade, um adesivo em
 *   comum, a mesma cor de cartolina noutro tom);
 * - **errado** (vermelho): diferente; nos números, uma seta diz se o da secreta é maior ou menor;
 * - **desconhecido** (cinza): uma das duas fichas não tem o dado (sem data, sem horas).
 *
 * As colunas mudam com o mural: dificuldade só onde há caveiras, horas ou páginas só onde há quantidade.
 */

export type Mark = 'certo' | 'perto' | 'errado' | 'desconhecido';

export interface Column {
  key: 'media' | 'status' | 'veredito' | 'dificuldade' | 'ano' | 'quantidade' | 'bonus' | 'cartolina';
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
  cols.push({ key: 'bonus', label: 'Adesivos' }, { key: 'cartolina', label: 'Cartolina' });
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

/** "+2 −1" (a favor e contra), ou "Nenhum". */
export function bonusTally(r: Review): string {
  const favor = r.bonuses.filter((b) => b.kind === 'favor').length;
  const contra = r.bonuses.length - favor;
  if (!favor && !contra) return 'Nenhum';
  return [favor ? `+${favor}` : '', contra ? `−${contra}` : ''].filter(Boolean).join(' ');
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
      case 'bonus': {
        const g = new Set(guess.bonuses.map((b) => b.id));
        const s = new Set(secret.bonuses.map((b) => b.id));
        const same = g.size === s.size && [...g].every((id) => s.has(id));
        const shared = [...g].some((id) => s.has(id));
        return { key: 'bonus', text: bonusTally(guess), mark: same ? 'certo' : shared ? 'perto' : 'errado', arrow: null };
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
 * A pista da frase: o começo da resenha da secreta, com o nome dela tapado. Vazio quando a ficha não
 * tem texto.
 */
export function sentenceHint(secret: Review): string {
  const lead = leadSentence(secret.text, 160);
  if (!lead) return '';
  const name = secret.game.name.trim();
  if (!name) return lead;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return lead.replace(new RegExp(escaped, 'gi'), '▒▒▒▒');
}

/** Quantos chutes errados até cada pista abrir. */
export const HINT_AFTER = { frase: 4, capa: 7 } as const;
