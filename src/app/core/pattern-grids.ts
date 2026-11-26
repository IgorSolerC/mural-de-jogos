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

/** Na ordem do estojo: as de linha, as de faixa e as de ponto (25/nov/2026: caligrafia, escocês, listrado, zigue-zague, losangos e bolinhas). */
export const GRID_PATTERNS = ['pautado', 'quadriculado', 'pontilhado', 'milimetrado', 'caligrafia', 'vichy', 'escoces', 'listrado', 'ziguezague', 'losangos', 'bolinhas', 'meiotom'] as const;

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
  // 25/nov/2026: a caligrafia e o zigue-zague são traço, mais carregados; o resto é faixa ou ponto cheio
  caligrafia: 1.6,
  listrado: 1,
  escoces: 1,
  ziguezague: 1.3,
  bolinhas: 1.05,
  losangos: 1,
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
    case 'caligrafia': {
      // a pauta do caderno de caligrafia: de três em três linhas (a de cima, a do meio tracejada e a de
      // base, mais grossa), com um vão entre as fileiras
      const u = 7.5 * z * k;
      const { n, side, pitch: period } = grid(u * 4.2, 14, 224, 1, 8);
      const off = seeded ? r() * period : 0;
      const amp = waveOf(mess, period / 3);
      const solid = new Map<number, string>();
      let dashed = '';
      for (let i = 0; i < n; i++) {
        const top = i * period + off + pm(r) * mess * 0.08 * period;
        const lines: [number, number, boolean][] = [
          [top, 0.95, false],
          [top + period * 0.24, 0.8, true],
          [top + period * 0.48, 1.45, false],
        ];
        for (const [at0, weight, dash] of lines) {
          const draws = [r(), r(), r()];
          const w = Math.max(0.1, Math.round(weight * sw * (1 + pm(r) * mess * 0.3) * 20) / 20);
          const at = wrap(at0, side);
          for (const copy of [at, at - side, at + side]) {
            if (copy !== at && (copy < -w - amp - 1 || copy > side + w + amp + 1)) continue;
            if (dash) dashed += rule(copy, side, 'x', amp, draws);
            else solid.set(w, (solid.get(w) ?? '') + rule(copy, side, 'x', amp, draws));
          }
        }
      }
      // o tracejado em passos que fecham no lado do ladrilho (a emenda não aparece)
      const dashes = Math.max(4, Math.round(side / (6 * z)));
      const d = side / dashes;
      return {
        side,
        body:
          [...solid].map(([w, path]) => `<path class='a' stroke-width='${w}' d='${path}'/>`).join('') +
          (dashed ? `<path class='a' stroke-width='${f1(0.8 * sw)}' stroke-dasharray='${(d * 0.55).toFixed(3)} ${(d * 0.45).toFixed(3)}' d='${dashed}'/>` : ''),
      };
    }
    case 'listrado': {
      // as listras inclinadas do papel de presente: faixas cheias a 45°, metade do passo cada. O que cada
      // uma sai do lugar é sorteado uma vez por listra (a que sai do ladrilho de um lado é a mesma que
      // entra do outro, n listras adiante): a emenda não aparece
      const { n, side, pitch } = grid(15 * z * k, 7, 210, 3, 16);
      const off = seeded ? r() * pitch : 0;
      const jit = Array.from({ length: n }, () => [pm(r) * mess * 0.08 * pitch, (pitch / 2) * (1 + pm(r) * mess * 0.25)]);
      let body = '';
      for (let i = -1; i <= 2 * n; i++) {
        const [shift, w] = jit[((i % n) + n) % n];
        const c = i * pitch + off + shift;
        // a faixa entre x + y = c e x + y = c + w, de uma beirada à outra do ladrilho
        body += `<path class='b' fill-opacity='.5' d='M${f1(c)} 0L${f1(c + w)} 0L${f1(c + w - side)} ${side}L${f1(c - side)} ${side}Z'/>`;
      }
      return { side, body };
    }
    case 'escoces': {
      // o xadrez escocês: em cada passo, uma faixa larga, uma estreita e um fio, deitados e em pé; onde
      // se cruzam, a cor dobra (como o vichy, mas de larguras diferentes)
      const { n, side, pitch: period } = grid(34 * z * k, 16, 204, 1, 6);
      const ox = seeded ? r() * period : 0,
        oy = seeded ? r() * period : 0;
      let body = '';
      const sett: [number, number, number][] = [
        // onde começa (no passo), a largura (no passo) e a tinta
        [0, 0.34, 0.34],
        [0.5, 0.1, 0.5],
        [0.72, 0.025, 0.85],
        [0.8, 0.025, 0.85],
      ];
      for (const along of ['x', 'y'] as const)
        for (let i = 0; i < n; i++)
          for (const [at0, w0, op] of sett) {
            const band = Math.max(0.6, w0 * period * (1 + pm(r) * mess * 0.2));
            const at = wrap(i * period + at0 * period + (along === 'x' ? oy : ox) + pm(r) * mess * 0.04 * period, side);
            for (const copy of [at, at - side]) {
              if (copy + band < 0) continue;
              body +=
                along === 'x'
                  ? `<rect class='b' fill-opacity='${op}' x='0' y='${f1(copy)}' width='${side}' height='${f1(band)}'/>`
                  : `<rect class='b' fill-opacity='${op}' x='${f1(copy)}' y='0' width='${f1(band)}' height='${side}'/>`;
            }
          }
      return { side, body };
    }
    case 'ziguezague': {
      // o zigue-zague: linhas deitadas em dentes, com um número inteiro de dentes no ladrilho
      const { n, side, pitch } = grid(16 * z * k, 8, 208, 2, 14);
      const teeth = Math.max(2, Math.round(side / (pitch * 1.1)));
      const tw = side / teeth,
        h = pitch * 0.32;
      const off = seeded ? r() * pitch : 0;
      const paths = new Map<string, string>();
      for (let i = 0; i < n; i++) {
        const y = (i + 0.5) * pitch + off + pm(r) * mess * 0.1 * pitch;
        const w = Math.max(0.1, Math.round(1.2 * sw * (1 + pm(r) * mess * 0.3) * 20) / 20);
        const jag: number[] = [];
        for (let t = 0; t <= teeth * 2; t++) jag.push((t % 2 ? -h : h) / 2 + (t % (teeth * 2) ? pm(r) * mess * 0.18 * h : 0));
        jag[teeth * 2] = jag[0];
        for (const yy of [wrap(y, side), wrap(y, side) - side, wrap(y, side) + side]) {
          if (yy < -h - w || yy > side + h + w) continue;
          let d = '';
          for (let t = 0; t <= teeth * 2; t++) d += `${t ? 'L' : 'M'}${f1((t * tw) / 2)} ${f1(yy + jag[t])}`;
          paths.set(String(w), (paths.get(String(w)) ?? '') + d);
        }
      }
      return { side, body: [...paths].map(([w, d]) => `<path class='a' stroke-linejoin='round' stroke-width='${w}' d='${d}'/>`).join('') };
    }
    case 'bolinhas': {
      // o poá: bolinhas cheias, maiores que o pontilhado, desencontradas de uma fileira para a outra
      const { n: n0, side } = grid(22 * z * k, 10, 220, 2, 12);
      const n = n0 % 2 ? n0 + 1 : n0;
      const p = side / n;
      const ox = seeded ? r() * p : 0,
        oy = seeded ? r() * p : 0;
      const rad = p * 0.2;
      let body = '';
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = wrap((i + 0.5 + (j % 2) * 0.5) * p + ox + pm(r) * mess * 0.1 * p, side),
            y = wrap((j + 0.5) * p + oy + pm(r) * mess * 0.1 * p, side),
            rr = rad * (1 + pm(r) * mess * 0.25);
          for (const dx of [-side, 0, side])
            for (const dy of [-side, 0, side]) {
              const cx = x + dx,
                cy = y + dy;
              if (cx + rr < 0 || cx - rr > side || cy + rr < 0 || cy - rr > side) continue;
              body += `<circle class='b' cx='${f1(cx)}' cy='${f1(cy)}' r='${f1(rr)}'/>`;
            }
        }
      return { side, body };
    }
    case 'losangos': {
      // o argyle: losangos cheios encostando as pontas, um mais carregado e um mais leve, com os fios
      // tracejados cruzando por cima. O claro e o escuro só se repetem de quatro em quatro casas: o
      // ladrilho tem um múltiplo de quatro. O que cada losango sai do lugar é sorteado pela casa dele no
      // ladrilho (a cópia do outro lado da beirada sai igual)
      // o bloco das quatro casas tem teto: o ladrilho gigante não passa de uns 1200 px
      const g = grid(Math.min(4 * 26 * z * k, 1200), 48, 208, 1, 3);
      const n = g.n * 4,
        p = g.side / n,
        side = g.side;
      const off = seeded ? r() * 2 * p : 0;
      const jit = Array.from({ length: n * n }, () => [pm(r) * mess * 0.06 * p, pm(r) * mess * 0.06 * p]);
      let body = '';
      for (let j = -1; j <= n; j++)
        for (let i = -3; i <= n; i++) {
          if ((((i + j) % 2) + 2) % 2) continue;
          const [dx, dy] = jit[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
          const cx = (i + 0.5) * p + off + dx,
            cy = (j + 0.5) * p + dy;
          if (cx + p / 2 < 0 || cx - p / 2 > side) continue;
          const op = (((i + j) / 2) % 2 + 2) % 2 ? 0.28 : 0.5;
          body += `<path class='b' fill-opacity='${op}' d='M${f1(cx - p / 2)} ${f1(cy)}L${f1(cx)} ${f1(cy - p / 2)}L${f1(cx + p / 2)} ${f1(cy)}L${f1(cx)} ${f1(cy + p / 2)}Z'/>`;
        }
      // os fios: as diagonais pelo meio das casas vazias, tracejados
      let lines = '';
      for (let i = -n; i <= 2 * n; i++) {
        const c = i * p + off;
        lines += `M${f1(c)} 0L${f1(c + side)} ${side}M${f1(c)} 0L${f1(c - side)} ${side}`;
      }
      const dash = (p * Math.SQRT2) / 6;
      return { side, body: body + `<path class='a' stroke-width='${f1(0.7 * sw)}' stroke-dasharray='${(dash * 0.6).toFixed(3)} ${(dash * 0.4).toFixed(3)}' d='${lines}'/>` };
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
    case 'caligrafia':
      return (
        SHEET +
        [8, 22].map((y) => `<path d='M7 ${y}H33' style='stroke-width:1.1'/><path d='M7 ${y + 4}H33' style='stroke-width:1;stroke-dasharray:2 1.6'/><path d='M7 ${y + 8}H33' style='stroke-width:1.7'/>`).join('')
      );
    case 'listrado':
      return `<clipPath id='icone-listrado'><path d='M7 4H33V36H7Z'/></clipPath>${SHEET}<g clip-path='url(#icone-listrado)'>${[10, 19, 28, 37, 46, 55, 64]
        .map((x) => `<path class='f' style='opacity:.5' d='M${x} 4H${x + 4.5}L${x - 27.5} 36H${x - 32}Z'/>`)
        .join('')}</g>`;
    case 'escoces':
      return (
        SHEET +
        `<path class='f' style='opacity:.4' d='M7 9H33V16H7Z'/><path class='f' style='opacity:.4' d='M12 4H19V36H12Z'/>` +
        `<path class='f' style='opacity:.55' d='M7 22H33V24.5H7Z'/><path class='f' style='opacity:.55' d='M24 4H26.5V36H24Z'/>` +
        `<path d='M7 29H33M7 31H33M29.5 4V36' style='stroke-width:.7'/>`
      );
    case 'ziguezague':
      return SHEET + [10, 18, 26, 34].map((y) => `<path d='M7 ${y}L10.25 ${y - 3}L13.5 ${y}L16.75 ${y - 3}L20 ${y}L23.25 ${y - 3}L26.5 ${y}L29.75 ${y - 3}L33 ${y}' style='stroke-width:1.4'/>`).join('');
    case 'bolinhas':
      return (
        SHEET +
        [0, 1, 2, 3, 4]
          .flatMap((j) => [0, 1, 2].map((i) => `<circle class='f' cx='${f1(11.5 + i * 8.5 + (j % 2) * 4.25)}' cy='${f1(8.5 + j * 6.4)}' r='1.9'/>`))
          .filter((c) => !c.includes("cx='36"))
          .join('')
      );
    case 'losangos':
      return (
        SHEET +
        `<path class='f' style='opacity:.5' d='M20 6L27 14L20 22L13 14Z'/><path class='f' style='opacity:.3' d='M20 22L27 30L20 36L13 30Z'/>` +
        `<path d='M7 9L33 35M7 35L33 9' style='stroke-width:.8;stroke-dasharray:2 1.5'/>`
      );
  }
}
