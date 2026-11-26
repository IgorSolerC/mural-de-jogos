import { Stock } from '../../core/review';
import { CalloutPaper } from '../../core/callouts';
import type { FbColor } from '../../core/free-board';

/**
 * As cores do quadro em ponto pequeno (PLANO-MINIATURA-CANVAS.md, D2), lidas do CSS: `styles.scss` é a verdade
 * (as cartolinas `--stock-*` e o papel e a tinta de cada jeito do card, `[data-jeito]`). O canvas 2D e o SVG da
 * miniatura não leem variáveis, então uma sonda lê cada uma uma vez por página e guarda a cor resolvida.
 *
 * Sem o CSS (uma página sem os estilos), o que vier vazio cai na cor de reserva.
 */

const memo = new Map<string, string>();

/** A cor de uma variável do `:root` (`--stock-azul`), ou `fallback`. */
export function rootColor(name: string, fallback: string): string {
  const key = `:root ${name}`;
  let c = memo.get(key);
  if (c === undefined) {
    c = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    memo.set(key, c);
  }
  return c || fallback;
}

/** A cartolina (as claras, as escuras e as pastéis). */
export function stockColor(stock: Stock): string {
  return rootColor(`--stock-${stock}`, '#c9c3bc');
}

/** O papel de ficha (a folha creme). */
export function cardPaper(): string {
  return rootColor('--papel-ficha', '#fbf9f2');
}

/** O papel manilha (a orelha da pasta). */
export function manilha(): string {
  return rootColor('--manilha', '#f3e5bb');
}

export interface JeitoInks {
  /** O papel do jeito: a faixa do título. */
  papel: string;
  /** A tinta do título. */
  tinta: string;
  /** A folha clara do texto: 22% do papel no creme (o `cartao-miolo-cor` de ui/_formatado.scss). */
  miolo: string;
}

/**
 * O papel, a tinta e a folha clara de um jeito do card do texto, lidos de um `[data-jeito]` de sonda (o da
 * cartolina, fora de uma ficha, é o cinza, como no quadro).
 */
export function jeitoInks(paper: CalloutPaper): JeitoInks {
  const key = `jeito ${paper}`;
  let papel = memo.get(`${key} papel`);
  let tinta = memo.get(`${key} tinta`);
  if (papel === undefined || tinta === undefined) {
    papel = '';
    tinta = '';
    if (typeof document !== 'undefined' && document.body) {
      const probe = document.createElement('div');
      probe.setAttribute('data-jeito', paper);
      probe.hidden = true;
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      papel = cs.getPropertyValue('--c-papel').trim();
      tinta = cs.getPropertyValue('--c-tinta').trim();
      probe.remove();
    }
    memo.set(`${key} papel`, papel);
    memo.set(`${key} tinta`, tinta);
  }
  const p = papel || '#ecdcb3';
  return { papel: p, tinta: tinta || '#6a4818', miolo: mix(p, '#fffdf8', 0.22) };
}

/** `a` misturado em `b`, `t` de `a` (as duas em `#rrggbb`; outra forma volta `b`). */
export function mix(a: string, b: string, t: number): string {
  const ra = rgb(a);
  const rb = rgb(b);
  if (!ra || !rb) return b;
  return '#' + ra.map((v, i) => Math.round(v * t + rb[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

/** A clareza de uma cor `#rrggbb` (0 preto, 1 branco), para escolher a tinta por cima. */
export function lightness(hex: string): number {
  const c = rgb(hex);
  if (!c) return 1;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Esquece as cores lidas (só os testes). */
export function resetFarPalette(): void {
  memo.clear();
}

/** As cartolinas (as mesmas variáveis `--stock-*` de styles.scss), para o canvas, que não lê CSS. */
export const STOCK_HEX: Readonly<Record<FbColor, string>> = {
  vermelho: '#ef7d73',
  laranja: '#ffa358',
  amarelo: '#ffda42',
  verde: '#7be986',
  azul: '#70cdff',
  lilas: '#c4a5fb',
  rosa: '#ff79a8',
  cinza: '#c9c3bc',
  branco: '#f6f1e7',
};

/**
 * O feltro da moldura: a cartolina escura do mesmo matiz (`--stock-*-escuro`); a branca, que não tem
 * escura, é um feltro cinza claro de parede.
 */
export const FELT_HEX: Readonly<Record<FbColor, string>> = {
  vermelho: '#511d19',
  laranja: '#4a2603',
  amarelo: '#3a2f03',
  verde: '#083b14',
  azul: '#0a334b',
  lilas: '#36264e',
  rosa: '#54162e',
  cinza: '#403c38',
  branco: '#57534c',
};

/** Os papéis do card do texto (os `[data-jeito]` de styles.scss), para o canvas; o da cartolina, fora dela, é o cinza. */
export const CALLOUT_HEX: Readonly<Record<CalloutPaper, string>> = {
  nota: '#ecdcb3',
  info: '#dce8f7',
  dica: '#d6efe6',
  feito: '#deefd3',
  pergunta: '#faeea4',
  aviso: '#fbdfc2',
  perigo: '#f7d9d4',
  exemplo: '#e6dcf5',
  citacao: '#e7e4de',
  rosa: '#fadce7',
  cartolina: '#e7e4de',
};

/** A cor de cada peça quando não se escolhe uma (a moldura cinza). */
export const DEFAULT_FRAME: FbColor = 'cinza';
