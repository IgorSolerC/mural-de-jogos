import { Stock } from '../../core/review';
import { CalloutPaper } from '../../core/callouts';

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
