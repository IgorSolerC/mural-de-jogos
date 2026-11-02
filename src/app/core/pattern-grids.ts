/**
 * As estampas de papelaria que não são desenho (2026-11-02): a pauta do caderno, o quadriculado, o
 * pontilhado do bullet journal, o milimetrado, o vichy e o meio-tom. São linhas, faixas e pontos, não
 * motivos: o ladrilho sai de uma vez, numa grade que se repete sem emenda, na mesma tinta tom sobre
 * tom das outras (preto multiplicado na cartolina clara, branco em screen na escura, ver
 * `lightPattern`). Os ajustes da estampa valem aqui também: o Espaço é o vão da grade, o Tamanho a
 * escala dela (o traço engrossa menos que o vão) e o Alinhamento o capricho de quem riscou: alinhado é
 * a gráfica; daí para a frente as linhas saem fora do lugar, de grossuras diferentes e, riscadas de
 * vez à mão, ondulando de leve. Nada aqui lê o que a pessoa escreve: só números.
 */
import { clamp, f1 } from './paper';

export const GRID_PATTERNS = ['pautado', 'quadriculado', 'pontilhado', 'milimetrado', 'vichy', 'meiotom'] as const;

export type GridPattern = (typeof GRID_PATTERNS)[number];

/** O vão da grade em cada degrau do Espaço, vezes o de sempre (o Normal, o 4). */
const PITCH = [0.5, 0.65, 0.8, 0.9, 1, 1.3, 1.7];

/**
 * A força de cada uma, vezes a tinta das estampas: uma linha fina ou um ponto pequeno somem onde um
 * gatinho cheio aparece, então a pauta e o pontilhado vêm um tanto mais carregados; o vichy, que é
 * faixa cheia, fica na tinta de sempre.
 */
export const GRID_TINT: Record<GridPattern, number> = {
  pautado: 1.35,
  quadriculado: 1.15,
  pontilhado: 1.6,
  milimetrado: 1.2,
  vichy: 1,
  meiotom: 1.1,
};

export const isGridPattern = (p: string): p is GridPattern => Object.hasOwn(GRID_TINT, p);

/** As tintas do ladrilho: o traço (`a`), o ponto de ponta redonda (`p`) e a faixa cheia (`b`). */
export const GRID_STYLE = `.a{fill:none;stroke:#000}.p{fill:none;stroke:#000;stroke-linecap:round}.b{fill:#000}`;

/** O ladrilho pronto: o lado (px da ficha) e o que vai dentro do SVG, sem a tinta. */
export interface GridTile {
  side: number;
  body: string;
}

/**
 * A grade de `n` vãos de perto de `pitch` px (no mínimo `min`, para os menores não virarem uma lavagem
 * cinza), com `n` perto de `target / pitch`, entre `lo` e `hi`. O lado do ladrilho sai em px inteiro (o
 * navegador encaixa o ladrilho repetido no pixel, e um lado quebrado faz a grade pular na emenda); o vão
 * se acerta a ele.
 */
function grid(pitch: number, min: number, target: number, lo: number, hi: number): { n: number; side: number; pitch: number } {
  const want = Math.max(min, pitch);
  const n = clamp(Math.round(target / want), lo, hi);
  const side = Math.max(1, Math.round(n * want));
  return { n, side, pitch: side / n };
}

/** Um sorteio entre -1 e 1. */
const pm = (r: () => number) => (r() - 0.5) * 2;

/** A onda mais alta de uma linha riscada à mão, em px: abaixo de meio pixel ninguém vê, e a linha sai reta. */
const waveOf = (mess: number, pitch: number) => {
  const amp = mess * 0.07 * pitch;
  return amp >= 0.5 ? amp : 0;
};

/**
 * Uma linha da grade, de uma beirada à outra do ladrilho, em `at` (y numa linha deitada, x numa em pé).
 * Riscada à mão (`amp` > 0), ela ondula de leve, num número inteiro de ondas, para emendar com a do
 * ladrilho vizinho. A decisão de ondular é do ladrilho inteiro: nunca umas retas e outras tortas.
 */
function rule(at: number, side: number, along: 'x' | 'y', amp: number, draws: number[]): string {
  const pt = (s: number, t: number) => (along === 'x' ? `${f1(s)} ${f1(t)}` : `${f1(t)} ${f1(s)}`);
  if (!amp) return `M${pt(0, at)}${along === 'x' ? 'H' : 'V'}${side}`;
  const a = amp * (0.45 + 0.55 * draws[0]),
    waves = 1 + Math.floor(draws[1] * 2),
    phase = draws[2] * Math.PI * 2;
  const n = 14 * waves;
  let d = '';
  for (let i = 0; i <= n; i++) d += `${i ? 'L' : 'M'}${pt((side * i) / n, at + a * Math.sin((Math.PI * 2 * waves * i) / n + phase))}`;
  return d;
}

/**
 * Um feixe de linhas paralelas, `n` por ladrilho, a cada `pitch`: cada uma um tanto fora do lugar e de
 * outra grossura conforme o Alinhamento, e repetida do outro lado quando encosta na beirada (a emenda
 * não aparece). `weight(i)` dá a grossura de cada uma (a mais grossa do milimetrado a cada cinco) e
 * `faint(i)` diz se ela sai mais apagada (as finas do milimetrado).
 */
function rules(n: number, pitch: number, side: number, along: 'x' | 'y', offset: number, mess: number, r: () => number, weight: (i: number) => number, faint: (i: number) => boolean = () => false): string {
  const amp = waveOf(mess, pitch);
  // as linhas da mesma grossura vão num caminho só, para o ladrilho ficar leve
  const paths = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const shift = pm(r) * mess * 0.12 * pitch,
      thick = 1 + pm(r) * mess * 0.3;
    // a onda é sorteada uma vez para a linha e as cópias dela
    const draws = [r(), r(), r()];
    const w = Math.max(0.1, Math.round(weight(i) * thick * 20) / 20);
    const at = ((((i + 0.5) * pitch + offset + shift) % side) + side) % side;
    const margin = w + amp + 1;
    const key = `${faint(i) ? " stroke-opacity='.75'" : ''} stroke-width='${w}'`;
    for (const copy of [at, at - side, at + side]) {
      if (copy !== at && (copy < -margin || copy > side + margin)) continue;
      paths.set(key, (paths.get(key) ?? '') + rule(copy, side, along, amp, draws));
    }
  }
  return [...paths].map(([attrs, d]) => `<path class='a'${attrs} d='${d}'/>`).join('');
}

/** Pontos de ponta redonda, agrupados pela grossura (um caminho por grossura, para o ladrilho ficar leve). */
function dots(list: [number, number, number][]): string {
  const byWidth = new Map<string, string>();
  for (const [x, y, rr] of list) {
    if (rr < 0.3) continue;
    const w = (Math.round(rr * 2 * 5) / 5).toString();
    byWidth.set(w, (byWidth.get(w) ?? '') + `M${f1(x)} ${f1(y)}h0`);
  }
  return [...byWidth].map(([w, d]) => `<path class='p' stroke-width='${w}' d='${d}'/>`).join('');
}

/** Os pontos que encostam na beirada aparecem também do outro lado. */
function wrapDots(list: [number, number, number][], side: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [x, y, rr] of list)
    for (const ox of [-side, 0, side])
      for (const oy of [-side, 0, side]) {
        const px = x + ox,
          py = y + oy;
        if (px + rr < 0 || px - rr > side || py + rr < 0 || py - rr > side) continue;
        out.push([px, py, rr]);
      }
  return out;
}

const wrap = (v: number, side: number) => ((v % side) + side) % side;

/**
 * O ladrilho de uma estampa de papelaria. `z` é o Tamanho (vezes o de sempre), `spacing` o degrau do
 * Espaço, `mess` o Alinhamento (0 a 1) e `seeded` diz se a ficha tem sorteio: com ele, a grade começa
 * em outro lugar da ficha (as linhas passam por outra altura do título).
 */
export function gridTile(p: GridPattern, z: number, spacing: number, mess: number, r: () => number, seeded: boolean): GridTile {
  const k = PITCH[spacing] ?? 1;
  // o capricho cresce devagar no começo: o De leve (o de sempre) ainda parece impresso, não riscado
  mess = Math.pow(mess, 1.6);
  // o traço engrossa menos que o vão: a grade gigante não vira faixa preta
  const sw = Math.pow(z, 0.7);
  switch (p) {
    case 'pautado': {
      const { n, side, pitch } = grid(22 * z * k, 8, 220, 2, 14);
      const off = seeded ? r() * pitch : 0;
      return { side, body: rules(n, pitch, side, 'x', off, mess, r, () => 1.25 * sw) };
    }
    case 'quadriculado': {
      const { n, side, pitch } = grid(18 * z * k, 8, 216, 2, 14);
      const ox = seeded ? r() * pitch : 0,
        oy = seeded ? r() * pitch : 0;
      return { side, body: rules(n, pitch, side, 'x', oy, mess, r, () => 0.95 * sw) + rules(n, pitch, side, 'y', ox, mess, r, () => 0.95 * sw) };
    }
    case 'milimetrado': {
      // o milímetro e, a cada cinco, a linha do meio centímetro mais grossa
      const big = grid(5 * 5.6 * z * k, 20, 168, 1, 6);
      const n = big.n * 5,
        side = big.side,
        pitch = side / n;
      const ox = seeded ? Math.floor(r() * 5) * pitch : 0,
        oy = seeded ? Math.floor(r() * 5) * pitch : 0;
      const major = (i: number) => i % 5 === 2;
      const weight = (i: number) => (major(i) ? 1.25 : 0.55) * sw;
      const minor = (i: number) => !major(i);
      return { side, body: rules(n, pitch, side, 'x', oy, mess, r, weight, minor) + rules(n, pitch, side, 'y', ox, mess, r, weight, minor) };
    }
    case 'pontilhado': {
      const { n, side, pitch } = grid(17 * z * k, 8, 204, 2, 16);
      const ox = seeded ? r() * pitch : 0,
        oy = seeded ? r() * pitch : 0;
      const base = Math.min(1.35 * Math.pow(z, 0.8), pitch * 0.3);
      const list: [number, number, number][] = [];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const dx = pm(r) * mess * 0.12 * pitch,
            dy = pm(r) * mess * 0.12 * pitch,
            dr = 1 + pm(r) * mess * 0.35;
          list.push([wrap((i + 0.5) * pitch + ox + dx, side), wrap((j + 0.5) * pitch + oy + dy, side), base * dr]);
        }
      return { side, body: dots(wrapDots(list, side)) };
    }
    case 'vichy': {
      // as faixas meio cheias, deitadas e em pé: onde se cruzam, a cor dobra. Fora do lugar, uma faixa
      // nunca encosta na vizinha (no máximo 62% do passo, deslocada até 6%), senão a cor dobraria ali
      const { n, side, pitch: period } = grid(18 * z * k, 8, 180, 2, 12);
      const ox = seeded ? r() * period : 0,
        oy = seeded ? r() * period : 0;
      let body = '';
      for (const along of ['x', 'y'] as const)
        for (let i = 0; i < n; i++) {
          const band = (period / 2) * (1 + pm(r) * mess * 0.24);
          const at = wrap(i * period + (along === 'x' ? oy : ox) + pm(r) * mess * 0.06 * period, side);
          for (const copy of [at, at - side]) {
            if (copy + band < 0) continue;
            body +=
              along === 'x'
                ? `<rect class='b' fill-opacity='.5' x='0' y='${f1(copy)}' width='${side}' height='${f1(band)}'/>`
                : `<rect class='b' fill-opacity='.5' x='${f1(copy)}' y='0' width='${f1(band)}' height='${side}'/>`;
          }
        }
      return { side, body };
    }
    case 'meiotom': {
      // a retícula de gráfica a 45°: os pontos crescem e minguam em ondas largas, como a sombra de um gibi
      const { n, side, pitch: cell } = grid(8.5 * z * k, 5, 136, 4, 16);
      const px = seeded ? r() * side : 0,
        py = seeded ? r() * side : 0;
      // o maior ponto nunca encosta no vizinho (a 45°, a 0,707 da casa): retícula, não mancha
      const big = 0.29 * cell;
      const list: [number, number, number][] = [];
      for (let j = 0; j < n * 2; j++)
        for (let i = 0; i < n * 2; i++) {
          if ((i + j) % 2) continue;
          const x = (i * cell) / 2,
            y = (j * cell) / 2;
          const wave = 0.5 + 0.5 * Math.cos((Math.PI * 2 * (x - px)) / side) * Math.cos((Math.PI * 2 * (y - py)) / side);
          // a onda achatada: o ponto mingua até a metade, nunca some nem se funde
          const f = clamp(0.45 + 0.55 * wave + pm(r) * mess * 0.15, 0.3, 1);
          list.push([x, y, big * f]);
        }
      return { side, body: dots(wrapDots(list, side)) };
    }
  }
}

/** A folha do desenho do estojo. */
const SHEET = `<path d='M7 4H33V36H7Z'/>`;

/**
 * O desenho de cada uma no estojo: a folha e a grade dela, em traço (40×40, como os das estampas).
 * Montado só quando o estojo pede, não na importação (o mural inteiro importa este módulo).
 */
export function gridIcon(p: GridPattern): string {
  switch (p) {
    case 'pautado':
      return `${SHEET}<path d='M7 11H33M7 17.5H33M7 24H33M7 30.5H33' style='stroke-width:1.5'/>`;
    case 'quadriculado':
      return `${SHEET}<path d='M7 12H33M7 20H33M7 28H33M13.5 4V36M20 4V36M26.5 4V36' style='stroke-width:1.3'/>`;
    case 'pontilhado':
      return (
        SHEET +
        [12.2, 17.4, 22.6, 27.8]
          .flatMap((x) => [9.6, 15.2, 20.8, 26.4, 32].map((y) => `<circle class='f' cx='${x}' cy='${y}' r='1.25'/>`))
          .join('')
      );
    case 'milimetrado':
      return (
        SHEET +
        `<path d='${[9.6, 12.2, 14.8, 17.4, 22.6, 25.2, 27.8, 30.4].map((x) => `M${x} 4V36`).join('')}${[6.6, 9.2, 11.8, 14.4, 17, 22.2, 24.8, 27.4, 30, 32.6].map((y) => `M7 ${y}H33`).join('')}' style='stroke-width:.7'/>` +
        `<path d='M20 4V36M7 19.6H33' style='stroke-width:1.6'/>`
      );
    case 'vichy':
      return (
        SHEET +
        [8.6, 17.6, 26.6].map((y) => `<path class='f' style='opacity:.45' d='M7 ${y}H33V${f1(y + 4.6)}H7Z'/>`).join('') +
        [11, 20, 29].map((x) => `<path class='f' style='opacity:.45' d='M${x} 4H${f1(Math.min(33, x + 4.6))}V36H${x}Z'/>`).join('')
      );
    case 'meiotom':
      return (
        SHEET +
        [0, 1, 2, 3]
          .flatMap((i) => [0, 1, 2, 3, 4].map((j) => `<circle class='f' cx='${f1(11 + i * 6)}' cy='${f1(8 + j * 6)}' r='${f1(Math.max(0.5, 2.5 - (i + j) * 0.3))}'/>`))
          .join('')
      );
  }
}
