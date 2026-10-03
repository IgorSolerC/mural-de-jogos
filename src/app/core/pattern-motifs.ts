/**
 * Os motivos das estampas de papelaria, num quadro de 40×40 (as primeiras doze estão em
 * `paper-art.ts`; estas vieram depois). Um motivo temático pode ter vários desenhos (`more`): a
 * cozinha tem a frigideira, a espátula, o batedor e a colher, que se revezam no ladrilho.
 */
import { f1 } from './paper';

/**
 * Um desenho de estampa. `sil` é o corpo; `det` são os detalhes (olhos, nariz): na versão de contorno
 * saem em tinta, na versão cheia viram furos; `extra` sai sempre em traço (bigodes, pernas, o anel do
 * planeta).
 */
export interface MotifDrawing {
  sil: string;
  det?: string;
  extra?: string;
}

/** Um motivo: o desenho principal, os outros que se revezam com ele e o miudinho `c` (20×20) entre eles. */
export interface Motif extends MotifDrawing {
  c: string;
  more?: MotifDrawing[];
}

type Pt = [number, number];

const P = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('') + 'Z';

/** Uma estrela de `n` pontas: raio de fora `R`, de dentro `r`. */
function spikes(cx: number, cy: number, R: number, r: number, n: number, rot = -90): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180,
      rr = i % 2 ? r : R;
    out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return out;
}

/**
 * O contorno de vários círculos juntos (a nuvem, o trevo do paus): de um ponto de dentro, em cada
 * direção, o mais longe que algum círculo chega. Serve para formas que se enxergam inteiras do centro.
 */
function blobs(cx: number, cy: number, circles: [number, number, number][], n = 96): string {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      dx = Math.cos(a),
      dy = Math.sin(a);
    let t = 0;
    for (const [x, y, R] of circles) {
      const px = x - cx,
        py = y - cy;
      const b = dx * px + dy * py;
      const disc = b * b - (px * px + py * py - R * R);
      if (disc >= 0) t = Math.max(t, b + Math.sqrt(disc));
    }
    pts.push([cx + dx * t, cy + dy * t]);
  }
  return P(pts);
}

/**
 * Um desenho de pixels: cada `#` das linhas é um quadradinho de `cell`. Sai como contorno (as beiradas
 * entre um pixel cheio e um vazio, emendadas em voltas), para o traço não riscar a grade por dentro.
 */
function pixels(rows: string[], cell: number): string {
  const h = rows.length,
    w = Math.max(...rows.map((r) => r.length));
  const x0 = 20 - (w * cell) / 2,
    y0 = 20 - (h * cell) / 2;
  const on = (i: number, j: number) => j >= 0 && j < h && i >= 0 && rows[j][i] === '#';
  // cada beirada vai no sentido que deixa o pixel cheio à direita
  const next = new Map<string, string>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!on(i, j)) continue;
      if (!on(i, j - 1)) next.set(key(i, j), key(i + 1, j));
      if (!on(i + 1, j)) next.set(key(i + 1, j), key(i + 1, j + 1));
      if (!on(i, j + 1)) next.set(key(i + 1, j + 1), key(i, j + 1));
      if (!on(i - 1, j)) next.set(key(i, j + 1), key(i, j));
    }
  let d = '';
  const seen = new Set<string>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let k = start;
    while (!seen.has(k)) {
      seen.add(k);
      const [i, j] = k.split(',').map(Number);
      loop.push([x0 + i * cell, y0 + j * cell]);
      k = next.get(k)!;
    }
    // só os cantos: os pontos no meio de uma reta saem
    const corners = loop.filter((p, n) => {
      const a = loop[(n - 1 + loop.length) % loop.length],
        b = loop[(n + 1) % loop.length];
      return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
    });
    d += P(corners);
  }
  return d;
}

/** As emendas de dentro de um desenho de pixels (a mesma conta de `pixels`): os blocos aparecem um a um. */
function seams(rows: string[], cell: number): string {
  const h = rows.length,
    w = Math.max(...rows.map((r) => r.length));
  const x0 = 20 - (w * cell) / 2,
    y0 = 20 - (h * cell) / 2;
  const on = (i: number, j: number) => j >= 0 && j < h && i >= 0 && rows[j][i] === '#';
  let d = '';
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!on(i, j)) continue;
      if (on(i + 1, j)) d += `M${f1(x0 + (i + 1) * cell)} ${f1(y0 + j * cell)}V${f1(y0 + (j + 1) * cell)}`;
      if (on(i, j + 1)) d += `M${f1(x0 + i * cell)} ${f1(y0 + (j + 1) * cell)}H${f1(x0 + (i + 1) * cell)}`;
    }
  return d;
}

/** Um bloco de encaixar: o contorno de pixels e as emendas entre os quadradinhos. */
const block = (rows: string[], cell: number): MotifDrawing => ({ sil: `<path d='${pixels(rows, cell)}'/>`, det: `<path d='${seams(rows, cell)}'/>` });

/** Um anel: o de fora e o de dentro no mesmo caminho (a rosquinha, o timão). */
const ring = (cx: number, cy: number, R: number, r: number) =>
  `<path fill-rule='evenodd' d='M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0ZM${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z'/>`;

const HEART = 'M20 34C11.5 27 5 21.8 5 14.8C5 9.8 8.8 6.5 12.8 6.5C16 6.5 18.6 8.6 20 11.6C21.4 8.6 24 6.5 27.2 6.5C31.2 6.5 35 9.8 35 14.8C35 21.8 28.5 27 20 34Z';
const SPARKLE = `<path class='f' d='M10 3Q10.8 9.2 17 10Q10.8 10.8 10 17Q9.2 10.8 3 10Q9.2 9.2 10 3Z'/>`;
const DROP = `<path class='f' d='M10 2.5Q15 10 15 13A5 5 0 0 1 5 13Q5 10 10 2.5Z'/>`;

// ----- a estrela náutica: cada ponta com uma metade pintada -----
const NAUTICAL = (() => {
  const pts = spikes(20, 20.5, 17, 6.8, 5);
  let halves = '';
  for (let i = 0; i < 10; i += 2) {
    const tip = pts[i],
      inner = pts[(i + 1) % 10];
    halves += `<path class='f' d='${P([[20, 20.5], tip, inner])}'/>`;
  }
  // só as metades: um risco do meio até a ponta, na versão cheia, comeria a outra metade também
  // o contorno sai sempre em traço: na versão cheia, as metades claras não somem no papel
  return { sil: `<path d='${P(pts)}'/>`, det: halves, extra: `<path d='${P(pts)}'/>` };
})();

// ----- o timão: o anel, as oito manoplas e os raios -----
const WHEEL = (() => {
  let handles = '',
    spokes = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a);
    const w = 1.5;
    handles += `<path d='${P([
      [20 + c * 10.5 - s * w, 20 + s * 10.5 + c * w],
      [20 + c * 17 - s * w, 20 + s * 17 + c * w],
      [20 + c * 17 + s * w, 20 + s * 17 - c * w],
      [20 + c * 10.5 + s * w, 20 + s * 10.5 - c * w],
    ])}'/>`;
    spokes += `M${f1(20 + c * 3.4)} ${f1(20 + s * 3.4)}L${f1(20 + c * 8)} ${f1(20 + s * 8)}`;
  }
  return { sil: `${ring(20, 20, 11, 8)}${handles}<circle cx='20' cy='20' r='3.4'/>`, extra: `<path d='${spokes}'/>` };
})();

// ----- o d20: o hexágono de fora, o triângulo da face e as arestas -----
const D20 = (() => {
  const hex: Pt[] = [[20, 3], [35, 11.5], [35, 28.5], [20, 37], [5, 28.5], [5, 11.5]];
  const tri: Pt[] = [[20, 12], [29.6, 27], [10.4, 27]];
  const edges = `M20 3L20 12M35 11.5L29.6 27M35 28.5L29.6 27M20 37L29.6 27M20 37L10.4 27M5 28.5L10.4 27M5 11.5L10.4 27M5 11.5L20 12M35 11.5L20 12`;
  return { sil: `<path d='${P(hex)}'/>`, det: `<path d='${P(tri)}${edges}'/>` };
})();

/** Pontos de um arco de círculo, de `a0` a `a1` graus. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** O caminho aberto por uma lista de pontos. */
const line = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');

/** A direção (unitária) e a normal de um trecho de linha, no ponto `i`. */
function frame(pts: Pt[], i: number): { u: Pt; n: Pt } {
  const a = pts[Math.max(0, i - 1)],
    b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy) || 1;
  return { u: [dx / len, dy / len], n: [-dy / len, dx / len] };
}

/** Uma linha grossa como corpo (a bengala doce, o tronco do coqueiro): a linha `pts` com largura `w`. */
function tube(pts: Pt[], w: number, w1 = w): string {
  const left: Pt[] = [],
    right: Pt[] = [];
  pts.forEach((p, i) => {
    const { n } = frame(pts, i);
    const h = (w + ((w1 - w) * i) / (pts.length - 1)) / 2;
    left.push([p[0] + n[0] * h, p[1] + n[1] * h]);
    right.push([p[0] - n[0] * h, p[1] - n[1] * h]);
  });
  return P([...left, ...right.reverse()]);
}

/** Os riscos atravessados ao longo de um `tube` (as listras da bengala, os anéis do tronco), a cada `step`. */
function tubeMarks(pts: Pt[], w: number, step: number, slant: number, from = step / 2, w1 = w): string {
  // a linha refeita em pedacinhos iguais, para os riscos saírem espaçados por igual nas curvas
  const fine: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++)
    for (let k = 0; k < 20; k++) fine.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / 20, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / 20]);
  fine.push(pts[pts.length - 1]);
  let d = '',
    run = 0,
    next = from;
  for (let i = 1; i < fine.length; i++) {
    run += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
    if (run < next) continue;
    next += step;
    const { u, n } = frame(fine, i);
    const h = (w + ((w1 - w) * i) / (fine.length - 1)) / 2 - 0.3;
    const p = fine[i];
    d += `M${f1(p[0] + n[0] * h - u[0] * slant)} ${f1(p[1] + n[1] * h - u[1] * slant)}L${f1(p[0] - n[0] * h + u[0] * slant)} ${f1(p[1] - n[1] * h + u[1] * slant)}`;
  }
  return d;
}

/** Uma estrela de pontas arredondadas (a do pinheiro, a estrela-do-mar). */
function softStar(cx: number, cy: number, R: number, r: number, n: number, rot = -90, k = 0.24): string {
  const p = spikes(cx, cy, R, r, n, rot);
  let d = '';
  for (let i = 0; i < n; i++) {
    const T = p[2 * i],
      I0 = p[(2 * i - 1 + 2 * n) % (2 * n)],
      I1 = p[2 * i + 1];
    const a: Pt = [T[0] + (I0[0] - T[0]) * k, T[1] + (I0[1] - T[1]) * k],
      b: Pt = [T[0] + (I1[0] - T[0]) * k, T[1] + (I1[1] - T[1]) * k];
    d += `${i ? 'L' : 'M'}${f1(a[0])} ${f1(a[1])}Q${f1(T[0])} ${f1(T[1])} ${f1(b[0])} ${f1(b[1])}L${f1(I1[0])} ${f1(I1[1])}`;
  }
  return d + 'Z';
}

/** Um brilho de quatro pontas, pintado (o mesmo desenho do SPARKLE), em qualquer lugar e tamanho. */
function spark(cx: number, cy: number, r: number): string {
  const k = 0.12 * r;
  return `<path class='f' d='M${f1(cx)} ${f1(cy - r)}Q${f1(cx + k)} ${f1(cy - k)} ${f1(cx + r)} ${f1(cy)}Q${f1(cx + k)} ${f1(cy + k)} ${f1(cx)} ${f1(cy + r)}Q${f1(cx - k)} ${f1(cy + k)} ${f1(cx - r)} ${f1(cy)}Q${f1(cx - k)} ${f1(cy - k)} ${f1(cx)} ${f1(cy - r)}Z'/>`;
}

/** As ondinhas da cobertura escorrendo, de `a` até `b`, penduradas para baixo da linha. */
function scallops(a: Pt, b: Pt, n: number, depth: number): string {
  const s = Math.hypot(b[0] - a[0], b[1] - a[1]) / n,
    rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  let d = `M${f1(a[0])} ${f1(a[1])}`;
  for (let i = 1; i <= n; i++) d += `A${f1(s / 2)} ${f1(depth)} ${f1(rot)} 0 0 ${f1(a[0] + ((b[0] - a[0]) * i) / n)} ${f1(a[1] + ((b[1] - a[1]) * i) / n)}`;
  return d;
}

/**
 * Uma nuvem de base reta: o contorno dos círculos visto do centro, cortado no `bottom`. Volta também
 * quem está dentro dela, para o arco-íris sumir atrás.
 */
function cloud(cx: number, cy: number, circles: [number, number, number][], bottom: number, n = 72) {
  const reach = (dx: number, dy: number) => {
    let t = 0;
    for (const [x, y, R] of circles) {
      const px = x - cx,
        py = y - cy;
      const b = dx * px + dy * py;
      const disc = b * b - (px * px + py * py - R * R);
      if (disc >= 0) t = Math.max(t, b + Math.sqrt(disc));
    }
    return dy > 0 ? Math.min(t, (bottom - cy) / dy) : t;
  };
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const t = reach(Math.cos(a), Math.sin(a));
    pts.push([cx + Math.cos(a) * t, cy + Math.sin(a) * t]);
  }
  const inside = ([x, y]: Pt) => {
    const dx = x - cx,
      dy = y - cy,
      len = Math.hypot(dx, dy);
    return len < 0.01 || len < reach(dx / len, dy / len) + 0.6;
  };
  return { d: P(pts), inside };
}

/** Uma espiral de fora para dentro, achatada em `rx`×`ry` (o redemoinho do portal). */
function spiral(cx: number, cy: number, rx: number, ry: number, turns: number, rot = 0, n = 90): string {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      a = rot + t * turns * Math.PI * 2,
      k = 1 - t * 0.88;
    d += `${i ? 'L' : 'M'}${f1(cx + rx * k * Math.cos(a))} ${f1(cy + ry * k * Math.sin(a))}`;
  }
  return d;
}

/** Um coração do tamanho que se quer: `HEART` levado para o centro (`cx`, `cy`) e escalado. */
const heartAt = (cx: number, cy: number, k: number, cls = '') => `<path${cls ? ` class='${cls}'` : ''} d='${HEART}' transform='translate(${f1(cx - 20 * k)} ${f1(cy - 20 * k)}) scale(${k})'/>`;

// ----- o coração flechado: a flecha passa por trás, só aparecem o rabo com as penas e a ponta -----
const CUPID = (() => {
  // o contorno do HEART em pontinhos, para saber onde a flecha entra e sai dele
  const curves: [Pt, Pt, Pt, Pt][] = [
    [[20, 34], [11.5, 27], [5, 21.8], [5, 14.8]],
    [[5, 14.8], [5, 9.8], [8.8, 6.5], [12.8, 6.5]],
    [[12.8, 6.5], [16, 6.5], [18.6, 8.6], [20, 11.6]],
    [[20, 11.6], [21.4, 8.6], [24, 6.5], [27.2, 6.5]],
    [[27.2, 6.5], [31.2, 6.5], [35, 9.8], [35, 14.8]],
    [[35, 14.8], [35, 21.8], [28.5, 27], [20, 34]],
  ];
  const poly: Pt[] = [];
  for (const [a, b, c, d] of curves)
    for (let i = 0; i < 16; i++) {
      const t = i / 16,
        m = 1 - t;
      poly.push([m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0], m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1]]);
    }
  const inHeart = ([x, y]: Pt) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if (poly[i][1] > y !== poly[j][1] > y && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside;
    return inside;
  };
  const T: Pt = [5.4, 33.4],
    H: Pt = [37, 7.2];
  const len = Math.hypot(H[0] - T[0], H[1] - T[1]),
    u: Pt = [(H[0] - T[0]) / len, (H[1] - T[1]) / len],
    n: Pt = [-u[1], u[0]];
  const at = (t: number, s = 0): Pt => [T[0] + u[0] * t + n[0] * s, T[1] + u[1] * t + n[1] * s];
  // onde a flecha some e reaparece, com uma folga do traço do coração
  const near = (t: number) => [-2, 0, 2].some((s) => inHeart(at(t, s)));
  let enter = 0,
    leave = len;
  while (!near(enter + 0.2)) enter += 0.2;
  while (!near(leave - 0.2)) leave -= 0.2;
  const seg = (a: Pt, b: Pt) => `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
  // as penas: três riscos de cada lado, inclinados para trás
  let feathers = '';
  for (const t of [1, 3.4, 5.8]) feathers += seg(at(t), at(t - 2.2, 2.4)) + seg(at(t), at(t - 2.2, -2.4));
  const head = P([H, at(len - 5.6, 2.8), at(len - 4.4), at(len - 5.6, -2.8)]);
  return {
    sil: `<path d='${HEART}'/>`,
    det: `<path d='M10.5 14.5q.6-3.8 4.4-4.2'/>`,
    extra: `<path d='${seg(at(0), at(enter))}${seg(at(leave), at(len - 4.6))}${feathers}'/><path class='f' d='${head}'/>`,
  };
})();

// ----- a bola de futebol: o pentágono do meio e as costuras até a beirada -----
const SOCCER = (() => {
  const pent: Pt[] = [],
    lines: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    pent.push([20 + 5.4 * Math.cos(a), 20 + 5.4 * Math.sin(a)]);
    const mid: Pt = [20 + 10.5 * Math.cos(a), 20 + 10.5 * Math.sin(a)];
    lines.push(`M${f1(pent[i][0])} ${f1(pent[i][1])}L${f1(mid[0])} ${f1(mid[1])}`);
    for (const s of [-1, 1]) {
      const b = a + (s * 24 * Math.PI) / 180;
      lines.push(`M${f1(mid[0])} ${f1(mid[1])}L${f1(20 + 15 * Math.cos(b))} ${f1(20 + 15 * Math.sin(b))}`);
    }
  }
  return { sil: `<circle cx='20' cy='20' r='15'/>`, det: `<path class='f' d='${P(pent)}'/><path d='${lines.join('')}'/>` };
})();

// ----- o portal em anel: as marcas no aro e o redemoinho dentro -----
const RING_PORTAL = (() => {
  let marks = '';
  for (let i = 0; i < 9; i++) {
    const a = ((-90 + i * 40) * Math.PI) / 180;
    marks += `M${f1(20 + 12.6 * Math.cos(a))} ${f1(20 + 12.6 * Math.sin(a))}L${f1(20 + 15.4 * Math.cos(a))} ${f1(20 + 15.4 * Math.sin(a))}`;
  }
  return { sil: ring(20, 20, 17, 10.5), det: `<path d='${marks}'/>`, extra: `<path d='${spiral(20, 20, 7.6, 7.6, 2.2, 0.6)}'/>` };
})();

// ----- o portal de pedra: o arco vazado, as juntas das pedras e o redemoinho na passagem -----
const STONE_PORTAL = (() => {
  let joints = '';
  for (const deg of [210, 240, 270, 300, 330]) {
    const a = (deg * Math.PI) / 180;
    joints += `M${f1(20 + 8.5 * Math.cos(a))} ${f1(18 + 8.5 * Math.sin(a))}L${f1(20 + 15.5 * Math.cos(a))} ${f1(18 + 15.5 * Math.sin(a))}`;
  }
  return {
    sil: `<path fill-rule='evenodd' d='M4.5 37V18A15.5 15.5 0 0 1 35.5 18V37ZM11.5 37V18A8.5 8.5 0 0 1 28.5 18V37Z'/>`,
    det: `<path d='${joints}M4.5 25H11.5M28.5 25H35.5M4.5 31.2H11.5M28.5 31.2H35.5'/>`,
    extra: `<path d='${spiral(20, 26.6, 5, 7, 1.7, 0.4)}'/>`,
  };
})();

// ----- o arco-íris saindo das nuvens: três arcos que somem atrás delas -----
const RAINBOW = (() => {
  const left = cloud(8.4, 30.4, [[4.6, 31.4, 3.2], [8.6, 28.2, 4.4], [12.6, 30.8, 3.4]], 34);
  const right = cloud(31.6, 30.4, [[35.4, 31.4, 3.2], [31.4, 28.2, 4.4], [27.4, 30.8, 3.4]], 34);
  let arcs = '';
  for (const r of [16.2, 11.8, 7.4]) {
    const pts = arc(20, 30, r, 180, 360, 48).filter((p) => !left.inside(p) && !right.inside(p));
    arcs += line(pts);
  }
  return { sil: `<path d='${left.d}'/><path d='${right.d}'/>`, extra: `<path d='${arcs}' style='stroke-width:2.9'/>` };
})();

// ----- o sol de óculos escuros: o disco e os raios soltos -----
const SUN = (() => {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = ((i * 45 - 90) * Math.PI) / 180,
      w = 0.2;
    rays += `<path d='${P([
      [20 + 12.2 * Math.cos(a - w), 20 + 12.2 * Math.sin(a - w)],
      [20 + 17.6 * Math.cos(a), 20 + 17.6 * Math.sin(a)],
      [20 + 12.2 * Math.cos(a + w), 20 + 12.2 * Math.sin(a + w)],
    ])}'/>`;
  }
  return {
    sil: `<circle cx='20' cy='20' r='9.4'/>${rays}`,
    det: `<path class='f' d='M12.8 17.4H19V19.6Q19 22 16.3 22Q13.4 22 12.9 19.6ZM21 17.4H27.2L27.1 19.6Q26.6 22 23.7 22Q21 22 21 19.6Z'/><path d='M19 18.2H21M16.8 25Q20 27.2 23.2 25'/>`,
  };
})();

// ----- o coqueiro: o tronco curvo com os anéis, as folhas caindo e os cocos -----
const PALM = (() => {
  const trunk: Pt[] = [[18.8, 37.2], [17.8, 31], [18, 25], [19.4, 19.2], [21.6, 14]];
  const frond = `M0 0C4.6 -7 12.4 -7.8 17.8 -1.4C12.4 -3.6 5.8 -2.4 0 0Z`;
  const at = (t: string) => `<path transform='translate(21.4 12.8) ${t}' d='${frond}'/>`;
  return {
    sil: `<path d='${tube(trunk, 4.2, 3)}'/>${at('rotate(10)')}${at('rotate(-36) scale(.92)')}${at('scale(-1 1) rotate(10)')}${at('scale(-1 1) rotate(-36) scale(.92)')}${at('rotate(-84) scale(.62)')}`,
    det: `<path d='${tubeMarks(trunk, 4.2, 4.4, 0.6, 3.4, 3)}'/>`,
    extra: `<g class='f'><circle cx='19.4' cy='15.6' r='1.9'/><circle cx='23.4' cy='15.4' r='1.9'/></g><path d='M3.5 37.4Q20 32.6 36.5 37.4'/>`,
  };
})();

// ----- as batatas fritas, abertas em leque -----
const FRIES = (() => {
  let sticks = '';
  for (const [x, a, L] of [[12.6, -16, 11], [16.2, -8, 13.4], [20, 0, 14.6], [23.8, 8, 12.8], [27.4, 16, 10.6]] as const) {
    const r = (a * Math.PI) / 180,
      ux = Math.sin(r),
      uy = -Math.cos(r),
      w = 1.35;
    const b: Pt = [x, 17.8],
      t: Pt = [x + ux * L, 17.8 + uy * L];
    sticks += `<path d='${P([[b[0] - uy * w, b[1] + ux * w], [t[0] - uy * w, t[1] + ux * w], [t[0] + uy * w, t[1] - ux * w], [b[0] + uy * w, b[1] - ux * w]])}'/>`;
  }
  return {
    sil: `${sticks}<path d='M8.6 17H31.4L28.4 34.8Q28.2 36.4 26.6 36.4H13.4Q11.8 36.4 11.6 34.8Z'/>`,
    det: `<path d='M13 17.6Q20 25 27 17.6'/>`,
  };
})();

export const MORE_MOTIFS = {
  // ===== Bichos =====
  cachorros: {
    sil: `<path d='M12 9Q20 6 28 9Q32 5 35.5 7.5Q38 11 35.5 19Q34 22 32 21.5Q33.5 27 30.5 31Q26.5 35.5 20 35.5Q13.5 35.5 9.5 31Q6.5 27 8 21.5Q6 22 4.5 19Q2 11 4.5 7.5Q8 5 12 9Z'/>`,
    det: `<circle class='f' cx='15' cy='19' r='1.9'/><circle class='f' cx='25' cy='19' r='1.9'/><path class='f' d='M17 24.5Q20 23 23 24.5Q22.5 27.5 20 27.8Q17.5 27.5 17 24.5Z'/><path d='M20 27.8V30M20 30Q17.5 32.5 15.5 30.5M20 30Q22.5 32.5 24.5 30.5'/>`,
    c: `<g class='f'><path d='M6.2 7.6L12.4 13.8L13.8 12.4L7.6 6.2Z'/><circle cx='5' cy='7.6' r='2.3'/><circle cx='7.6' cy='5' r='2.3'/><circle cx='12.4' cy='15' r='2.3'/><circle cx='15' cy='12.4' r='2.3'/></g>`,
  },
  borboletas: {
    sil: `<path d='M19 17Q14 3 6 4.5Q1.5 7 4 14Q7 19.5 19 19.5Z'/><path d='M21 17Q26 3 34 4.5Q38.5 7 36 14Q33 19.5 21 19.5Z'/><path d='M19 21Q9 21 7.5 27.5Q7.5 33.5 13 33Q17.5 31.5 19 23Z'/><path d='M21 21Q31 21 32.5 27.5Q32.5 33.5 27 33Q22.5 31.5 21 23Z'/><ellipse cx='20' cy='21' rx='1.9' ry='10'/>`,
    det: `<circle class='f' cx='10.5' cy='11' r='2.3'/><circle class='f' cx='29.5' cy='11' r='2.3'/><circle class='f' cx='13' cy='27' r='1.6'/><circle class='f' cx='27' cy='27' r='1.6'/>`,
    extra: `<path d='M19.3 11.5Q17 5 13.5 3.5M20.7 11.5Q23 5 26.5 3.5'/>`,
    c: `<g class='f'><circle cx='7' cy='9' r='2.4'/><circle cx='13.5' cy='12' r='1.6'/></g>`,
  },
  abelhas: {
    sil: `<ellipse cx='15' cy='11.5' rx='5' ry='7.5' transform='rotate(-28 15 11.5)'/><ellipse cx='24.5' cy='11.5' rx='5' ry='7.5' transform='rotate(28 24.5 11.5)'/><path d='M8 24Q8 16.5 20 16.5Q31 16.5 33.5 23.5L38 25L33.5 26.5Q31 32 20 32Q8 32 8 24Z'/><circle cx='7.5' cy='24' r='5'/>`,
    det: `<path d='M17 17Q14.8 24.2 17 31.6M23 17Q20.8 24.2 23 31.4M28.5 18.2Q26.8 24.2 28.5 30.2'/><circle class='f' cx='6' cy='22.6' r='1.3'/>`,
    extra: `<path d='M5 19.5Q3 15 1 14.5M8.5 19.2Q8 14.5 6.5 13'/>`,
    c: `<path d='M10 3L16 6.5V13.5L10 17L4 13.5V6.5Z'/>`,
  },
  peixes: {
    sil: `<path d='M3 20Q11 9 24 13L34 6Q31 20 34 34L24 27Q11 31 3 20Z'/>`,
    det: `<circle class='f' cx='10' cy='18.2' r='1.6'/><path d='M15.5 14.5Q18.5 20 15.5 25.5M20 21.5q2 1.6 4 0'/>`,
    more: [
      {
        sil: `<path d='M3 22Q3 10 17 10Q29 10 31.5 18.5L36.5 12.5Q38.5 18 36 22.5Q38.5 27 37 31.5L31.5 26Q27 33.5 16 33.5Q3 33.5 3 22Z'/>`,
        det: `<circle class='f' cx='10' cy='21' r='1.5'/><path d='M4.5 25.5Q15 29.5 26 26'/>`,
        extra: `<path d='M16 9.5Q16 5 13 3M16 9.5Q16 5 19 3M16 9.5V2.5'/>`,
      },
    ],
    c: `<circle cx='7' cy='11' r='3.4'/><circle cx='14.2' cy='5.6' r='2'/>`,
  },
  dinossauros: {
    sil: `<path d='M2.5 21Q9 16.5 15.5 16Q19 9.5 25 8.5H32.5Q37 8.5 37 12V14.3Q37 16.3 34.5 16.3H30.5V18.2H33.2V19.8Q30.5 21.5 28.5 21Q27.5 25.5 23.5 28L25 33.5H27.5V35.5H21.3L20.3 29.2Q17.3 30.2 14.3 29.2L15.3 33.5H17.8V35.5H11.7L10.4 27.3Q6.5 25 2.5 21Z'/><path d='M25.5 21.5L28 24.5L26.8 25.6L24 23Z'/>`,
    det: `<circle class='f' cx='30' cy='11.8' r='1.3'/><path d='M31 16.3v1.9M33.5 16.3v1.9'/>`,
    more: [
      {
        sil: `<path d='M3 30Q6 22 14 21Q20 16.5 24 17.5Q27 10 28.2 5.5Q29.2 3 31.8 3.4Q34.4 4 34.3 6.4Q32.4 7.3 31.3 9.2Q30.2 17 30.4 22.5Q32.2 27.5 31.2 34.5H28.6L27.6 29.2Q22.3 30.4 17.3 29.2L16.3 34.5H13.7L13.2 28.3Q8 28.3 3 30Z'/>`,
        det: `<circle class='f' cx='31.5' cy='5.8' r='1'/><path d='M16 23q3 2.5 7 0'/>`,
      },
    ],
    c: `<g class='f'><ellipse cx='10' cy='13' rx='3.6' ry='4.2'/><ellipse cx='4.6' cy='6.6' rx='1.6' ry='2.7' transform='rotate(-28 4.6 6.6)'/><ellipse cx='10' cy='4.2' rx='1.6' ry='2.7'/><ellipse cx='15.4' cy='6.6' rx='1.6' ry='2.7' transform='rotate(28 15.4 6.6)'/></g>`,
  },
  // ===== Terror =====
  morcegos: {
    sil: `<path d='M20 14.5Q21.6 12.8 22.8 14.3L24 11L25.2 15Q30.5 11.5 38 12.5Q34.6 15.6 35 20.2Q31.4 19 29 21.8Q26.2 20.2 24.2 23.5Q22 22.4 20 27Q18 22.4 15.8 23.5Q13.8 20.2 11 21.8Q8.6 19 5 20.2Q5.4 15.6 2 12.5Q9.5 11.5 14.8 15L16 11L17.2 14.3Q18.4 12.8 20 14.5Z'/>`,
    det: `<circle class='f' cx='18.4' cy='16.6' r='.9'/><circle class='f' cx='21.6' cy='16.6' r='.9'/>`,
    c: DROP,
  },
  aboboras: {
    sil: `<path d='M20 9.5Q27 7.5 32 11Q37 15 36.5 23Q36 32 29 34Q25 35.5 20 34.5Q15 35.5 11 34Q4 32 3.5 23Q3 15 8 11Q13 7.5 20 9.5Z'/>`,
    det: `<path class='f' d='M11.5 19L16.5 19L14 14.5ZM23.5 19L28.5 19L26 14.5ZM18.3 23.5H21.7L20 20.5Z'/><path class='f' d='M10 25.5Q20 31 30 25.5Q29 30.5 25.6 31L24 28.7L22 31.5L20 29L18 31.5L16 28.7L14.4 31Q11 30.5 10 25.5Z'/>`,
    extra: `<path d='M20 9.5Q19.5 5.5 22.5 3'/>`,
    c: `<path class='f' d='M6 10a4 4 0 1 0 8 0a4 4 0 1 0-8 0ZM6.5 10L2 6.5V13.5ZM13.5 10L18 6.5V13.5Z'/>`,
  },
  bruxaria: {
    sil: `<path d='M3.5 31Q20 25 36.5 31Q35.5 34.5 20 34.5Q4.5 34.5 3.5 31Z'/><path d='M11 29.5Q16 20.5 17 12.5Q18 5 25.5 3Q22.3 8.2 23.2 13.5Q25 22 29 29.5Q20 27.5 11 29.5Z'/>`,
    det: `<path d='M12.8 26.4Q20 24.4 27.4 26.4'/><path class='f' d='M18.6 24.2H22.2V28H18.6Z'/>`,
    more: [
      {
        sil: `<path d='M5.5 16H34.5Q36 16 35.2 18.2Q37.5 33.5 20 34Q2.5 33.5 4.8 18.2Q4 16 5.5 16Z'/><path d='M9 32L7 37H10L12 33ZM31 32L33 37H30L28 33Z'/>`,
        det: `<path d='M5 19.8H35'/>`,
        extra: `<circle cx='14' cy='10.5' r='2.6'/><circle cx='22' cy='6' r='3.4'/><circle cx='27.5' cy='11.5' r='1.8'/>`,
      },
    ],
    c: `<path class='f' d='M13 3C8 4 5 7.5 5 11.5C5 15.5 8.5 18 12.5 18C10 16.4 8.8 14 8.8 11C8.8 7.6 10.4 4.8 13 3Z'/>`,
  },
  olhos: {
    sil: `<path d='M2.5 20Q20 4 37.5 20Q20 36 2.5 20Z'/>`,
    det: `<circle cx='20' cy='20' r='7'/><circle class='f' cx='20' cy='20' r='3.2'/>`,
    extra: `<path d='M11.5 10L9.5 6M20 7.5V3M28.5 10L30.5 6'/>`,
    c: SPARKLE,
  },
  // ===== Comida =====
  cozinha: {
    sil: `<circle cx='14.5' cy='24.5' r='11'/><path d='M22.2 16.2L33.8 4.6Q35.8 2.8 37.4 4.4Q39 6 37.2 8L25.6 19.6Z'/>`,
    det: `<circle class='f' cx='35' cy='6.8' r='1.1'/><path d='M8 23q1.2-5.6 6.4-7'/>`,
    more: [
      {
        sil: `<path d='M13 5Q13 3.5 14.5 3.5H25.5Q27 3.5 27 5V16Q27 18 25 18H22V21L21.6 35.4Q20 37.6 18.4 35.4L18 21V18H15Q13 18 13 16Z'/>`,
        det: `<path d='M17 7.2v7.4M20 7.2v7.4M23 7.2v7.4'/><circle class='f' cx='20' cy='32.4' r='1'/>`,
      },
      {
        sil: `<path d='M20 26C10.5 21 10.5 3 20 3C29.5 3 29.5 21 20 26Z'/><path d='M18 26H22L22.6 36Q20 38.2 17.4 36Z'/>`,
        det: `<path d='M20 25.6C15 19.5 15 5.5 20 3.4M20 25.6C25 19.5 25 5.5 20 3.4M20 25.6V3.4'/>`,
      },
      {
        sil: `<ellipse cx='20' cy='10.5' rx='7' ry='8.5'/><path d='M18.4 18.6L17.7 35.4Q20 37.8 22.3 35.4L21.6 18.6Z'/>`,
        det: `<path d='M16.2 8.2q.8-3.6 3.6-4.2'/>`,
      },
    ],
    c: `<path d='M6.5 17c-3-3 3-5 0-8s3-5 0-7.5M13.5 17c-3-3 3-5 0-8s3-5 0-7.5'/>`,
  },
  frutas: {
    sil: `<path d='M20 11.5C15 7.5 6 9.5 6 19.5C6 28.5 12 35.5 16 35.5C18 35.5 19 34.5 20 34.5C21 34.5 22 35.5 24 35.5C28 35.5 34 28.5 34 19.5C34 9.5 25 7.5 20 11.5Z'/><path d='M21.5 8.5Q24.5 3.5 30.5 4Q28.5 9.5 21.5 8.5Z'/>`,
    det: `<path d='M10.5 18.5q.6-4 4-5.2'/>`,
    extra: `<path d='M20 11.5Q20 7 21.5 4'/>`,
    more: [
      {
        sil: `<circle cx='12.5' cy='28' r='6.5'/><circle cx='27.5' cy='27' r='6.5'/><path d='M22 5.5Q28 2 33 6Q28 9.5 22 5.5Z'/>`,
        det: `<path d='M9 26.5q.6-2.6 3-3.2M24 25.5q.6-2.6 3-3.2'/>`,
        extra: `<path d='M12.5 21.5Q14.5 12 22 5.5M27.5 20.5Q25.5 12 22 5.5'/>`,
      },
      {
        sil: `<path d='M3.5 13H36.5A16.5 16.5 0 0 1 3.5 13Z'/>`,
        det: `<path d='M7.2 16.2A13.4 13.4 0 0 0 32.8 16.2'/><g class='f'><ellipse cx='13.5' cy='19' rx='1' ry='1.6'/><ellipse cx='20' cy='21' rx='1' ry='1.6'/><ellipse cx='26.5' cy='19' rx='1' ry='1.6'/><ellipse cx='16.8' cy='24.5' rx='1' ry='1.6'/><ellipse cx='23.2' cy='24.5' rx='1' ry='1.6'/></g>`,
      },
    ],
    c: `<path class='f' d='M3 17Q4 5 17 3Q15 16 3 17Z'/>`,
  },
  doces: {
    sil: `<circle cx='20' cy='13' r='9.5'/><path d='M11.4 17.5L20 37.5L28.6 17.5Q20 21 11.4 17.5Z'/>`,
    det: `<path d='M14.2 22.8L22.8 31M25.8 22.8L17.2 31M13.2 20.2Q20 23 26.8 20.2'/><path d='M13 11q1-4 5-5'/>`,
    more: [
      {
        sil: `<circle cx='20' cy='14' r='11'/>`,
        det: `<path d='M20 14.5a1.5 1.5 0 1 1 1.5-1.5a3 3 0 1 1-3 3a4.5 4.5 0 1 1 4.5-4.5a6 6 0 1 1-6 6a7.5 7.5 0 1 1 7.5-7.5'/>`,
        extra: `<path d='M20 25V38'/>`,
      },
      {
        sil: ring(20, 20, 14, 4.8),
        det: `<path d='M8.5 17Q11 12 15.5 12.6Q18 9 21.5 10.2Q25.5 8.8 27.6 12.4Q31.5 13 31.8 17.6Q33 21.5 30 23.8Q29 28 24.6 27.6Q21.5 30.5 18 28.4Q13.5 29.5 11.8 26Q7.5 24.8 8.2 21Q6.8 19 8.5 17Z'/><path d='M13 15.5l2 1M24.5 13l-1 2M28.5 20l-2 .6M17.5 25.4l1.8-1.2M11.5 21.5l1.2 1.8'/>`,
      },
    ],
    c: `<path d='M5 6l3 2M12.5 4l-1 3.4M14 12.5l3.4 1M6 14.5l2.4-2'/>`,
  },
  pizza: {
    sil: `<path d='M20 37.5L4.5 8.5Q20 1 35.5 8.5Z'/>`,
    det: `<path d='M7 12.4Q20 6 33 12.4'/><g class='f'><circle cx='15' cy='17.5' r='2.8'/><circle cx='24.5' cy='16' r='2.5'/><circle cx='20' cy='26' r='2.6'/></g>`,
    c: `<circle cx='10' cy='10' r='5.6'/><g class='f'><circle cx='8' cy='8.6' r='1'/><circle cx='12' cy='9.6' r='1'/><circle cx='9.4' cy='12.4' r='1'/></g>`,
  },
  cafe: {
    sil: `<path d='M6.5 15H29.5V24.5Q29.5 33.5 18 33.5Q6.5 33.5 6.5 24.5Z'/>`,
    det: `<path d='M10 19q1 8 6 10.5'/>`,
    extra: `<path d='M29.5 18Q35.5 18 35.5 22Q35.5 26.8 29.5 26.8M3 36.2H33M14 11.5c-2.5-2.5 2.5-4 0-6.5M20 11.5c-2.5-2.5 2.5-4 0-6.5M26 11.5c-2.5-2.5 2.5-4 0-6.5'/>`,
    more: [
      {
        sil: `<ellipse cx='20' cy='20' rx='10.5' ry='15' transform='rotate(28 20 20)'/>`,
        det: `<path d='M13.2 7.8Q21.5 13 19.5 20Q17.5 27 26.8 32.2'/>`,
      },
    ],
    c: `<ellipse class='f' cx='10' cy='10' rx='4.4' ry='6.2' transform='rotate(28 10 10)'/>`,
  },
  // ===== Jogo =====
  dados: {
    sil: `<path d='M9 7H31Q34 7 34 10V30Q34 33 31 33H9Q6 33 6 30V10Q6 7 9 7Z' transform='rotate(-8 20 20)'/>`,
    det: `<g class='f' transform='rotate(-8 20 20)'><circle cx='12.6' cy='13.6' r='2.3'/><circle cx='27.4' cy='13.6' r='2.3'/><circle cx='20' cy='20' r='2.3'/><circle cx='12.6' cy='26.4' r='2.3'/><circle cx='27.4' cy='26.4' r='2.3'/></g>`,
    more: [D20],
    c: `<circle class='f' cx='10' cy='10' r='3'/>`,
  },
  cartas: {
    sil: `<path d='M20 4C14 13 6 16 6 23C6 28 10 30.5 13.5 30.5C16 30.5 18 29 19 27.5L17 36H23L21 27.5C22 29 24 30.5 26.5 30.5C30 30.5 34 28 34 23C34 16 26 13 20 4Z'/>`,
    more: [
      { sil: `<path d='${HEART}'/>` },
      { sil: `<path d='M20 3L32.5 20L20 37L7.5 20Z'/>` },
      { sil: `<path d='${blobs(20, 19, [[20, 11.5, 6.8], [12.2, 22.5, 6.8], [27.8, 22.5, 6.8], [20, 20, 5]])}'/><path d='M18.6 24L17 36H23L21.4 24Z'/>` },
    ],
    c: `<circle class='f' cx='10' cy='10' r='2'/>`,
  },
  xadrez: {
    sil: `<circle cx='20' cy='9.5' r='4.8'/><path d='M15.8 15H24.2L22.8 17.5Q25.5 25.5 27.5 30H12.5Q14.5 25.5 17.2 17.5Z'/><path d='M9.5 31H30.5V35.5H9.5Z'/>`,
    more: [
      {
        sil: `<path d='M10 4.5H14V8H18V4.5H22V8H26V4.5H30V12L27 15V29.5H13V15L10 12Z'/><path d='M8 30.5H32V35.5H8Z'/>`,
        det: `<path d='M13.2 18.5H26.8M13.2 24H26.8M20 18.5V24M16.5 24V29.5M23.5 24V29.5'/>`,
      },
      {
        sil: `<path d='M11.5 31Q12 23 17.5 18Q14.5 18.6 12.4 20Q9.5 21.6 8.6 18.8Q8 15 11.2 11.5Q14 8 17 7L18.2 3.2L20.4 6.6Q27 8.6 29.4 17Q31.5 24 31.5 31Z'/><path d='M9 31.5H33V35.5H9Z'/>`,
        det: `<circle class='f' cx='16.5' cy='11.4' r='1.2'/><path d='M20.5 8.5Q26 12 27.2 22'/>`,
      },
    ],
    c: `<path d='M3 3H17V17H3Z'/><path class='f' d='M3 3H10V10H3ZM10 10H17V17H10Z'/>`,
  },
  pixel: {
    sil: `<path d='${pixels(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], 4.6)}'/>`,
    det: `<path class='f' d='M8.5 11.8H13.1V16.4H8.5Z'/>`,
    more: [
      // sem pixels que só se tocam na quina: o contorno sai numa volta só
      { sil: `<path d='${pixels(['..#.....#..', '..##...##..', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '..##...##..'], 3.2)}'/>` },
      { sil: `<path d='${pixels(['...#...', '..###..', '..###..', '..###..', '..###..', '#######', '...#...', '..###..'], 4)}'/>`, det: `<path d='M20 9v13'/>` },
      { sil: `<path d='${pixels(['..####..', '.######.', '##.##.##', '########', '.######.', '..#..#..', '..####..'], 4)}'/>` },
    ],
    c: `<path class='f' d='M7 7H13V13H7Z'/>`,
  },
  // ===== Céu =====
  alienigenas: {
    sil: `<path d='M13 17Q13 8 20 8Q27 8 27 17Z'/><path d='M3 21.5Q3 16.5 20 16.5Q37 16.5 37 21.5Q37 26.5 20 26.5Q3 26.5 3 21.5Z'/>`,
    det: `<g class='f'><circle cx='10' cy='21.5' r='1.5'/><circle cx='16.6' cy='22.6' r='1.5'/><circle cx='23.4' cy='22.6' r='1.5'/><circle cx='30' cy='21.5' r='1.5'/></g><path d='M16.5 12.5q1-2.6 3.5-3'/>`,
    extra: `<path d='M14 29.5l-3 6.5M20 29.5v7.5M26 29.5l3 6.5'/>`,
    more: [
      {
        sil: `<path d='M20 3Q35 3 34 18Q33 28 20 37Q7 28 6 18Q5 3 20 3Z'/>`,
        det: `<path class='f' d='M9.5 17Q15 15 17.8 21.4Q12 23.2 9.5 17ZM30.5 17Q25 15 22.2 21.4Q28 23.2 30.5 17Z'/><path d='M18 29.5h4'/>`,
      },
    ],
    c: SPARKLE,
  },
  chuva: {
    sil: `<path d='${blobs(20, 20, [[12.5, 21, 6.5], [20, 14.5, 8.5], [28.5, 20, 6.5], [20, 22.5, 6]])}'/>`,
    extra: `<path d='M12 32l-2 5M20 32l-2 5M28 32l-2 5'/>`,
    more: [
      {
        sil: `<path d='M3 20Q3 6 20 6Q37 6 37 20Q34 17 31.3 20Q28.6 17 25.7 20Q22.8 17 20 20Q17.2 17 14.3 20Q11.4 17 8.7 20Q6 17 3 20Z'/>`,
        det: `<path d='M20 6Q14.8 10 14.3 19.6M20 6Q25.2 10 25.7 19.6'/>`,
        extra: `<path d='M20 20V33.5Q20 36.5 17 36.5Q14 36.5 14 33.5M20 6V2.5'/>`,
      },
    ],
    c: DROP,
  },
  // ===== Natureza =====
  folhas: {
    sil: `<path d='M20 3Q33 12 31 25Q29 33 20 35Q11 33 9 25Q7 12 20 3Z'/>`,
    det: `<path d='M20 7V35M20 15l-6-4M20 15l6-4M20 22l-7-4M20 22l7-4M20 29l-6-3M20 29l6-3'/>`,
    extra: `<path d='M20 35V38.5'/>`,
    more: [
      {
        sil: `<path d='M20 2L23 10L30 7L28 15L36 16L30 22L33 28L24 26.5L22 33.5H18L16 26.5L7 28L10 22L4 16L12 15L10 7L17 10Z'/>`,
        det: `<path d='M20 8V33M20 20L29 14M20 20L11 14M20 26L27 23M20 26L13 23'/>`,
        extra: `<path d='M20 33.5V38.5'/>`,
      },
    ],
    c: `<path class='f' d='M5 9.5Q5 4.5 10 4.5Q15 4.5 15 9.5Z'/><path d='M6.2 10.5Q6.5 17 10 18Q13.5 17 13.8 10.5M10 4.5V2'/>`,
  },
  cactos: {
    sil: `<path d='M17 32V24H12.5Q9.5 24 9.5 21V14Q9.5 12 11.5 12Q13.5 12 13.5 14V20.5H17V9Q17 5.5 20 5.5Q23 5.5 23 9V17H26.5V12Q26.5 10 28.5 10Q30.5 10 30.5 12V18Q30.5 21 27.5 21H23V32Z'/><path d='M11 31.5H29L27 38H13Z'/>`,
    det: `<path d='M20 9v19M11.5 15v4M28.5 13v4'/>`,
    c: `<g class='f'><circle cx='10' cy='6' r='2.3'/><circle cx='6' cy='10' r='2.3'/><circle cx='14' cy='10' r='2.3'/><circle cx='10' cy='14' r='2.3'/></g>`,
  },
  // ===== Aventura =====
  medieval: {
    sil: `<path d='M20 2L23 6V25H17V6Z'/><path d='M11 25H29Q30.5 25 30.5 26.5Q30.5 28 29 28H11Q9.5 28 9.5 26.5Q9.5 25 11 25Z'/><path d='M18.5 28H21.5V33.8H18.5Z'/><circle cx='20' cy='35.8' r='2.4'/>`,
    det: `<path d='M20 7V22'/>`,
    more: [
      {
        sil: `<path d='M18.5 3.5H21.5V37H18.5Z'/><path d='M21.5 8Q28 8 33 3Q37.5 13.5 33 24Q28 19 21.5 19Z'/>`,
        det: `<circle class='f' cx='24.2' cy='13.5' r='1.3'/><path d='M30.6 7.6Q33.6 13.5 30.6 19.6'/>`,
      },
      {
        sil: `<path d='${P(spikes(20, 12.5, 12, 7.6, 8, -90))}'/><path d='M18.6 20H21.4V37H18.6Z'/>`,
        det: `<circle class='f' cx='17' cy='10' r='1.6'/><path d='M18.6 31.5h2.8M18.6 34h2.8'/>`,
      },
      {
        sil: `<path d='M7 6Q20 2 33 6Q34 24 20 36.5Q6 24 7 6Z'/>`,
        det: `<path d='M20 5V33M8 15.5H32'/>`,
      },
    ],
    c: `<path class='f' d='M10 2L15 9.5L11 8.6V18H9V8.6L5 9.5Z'/>`,
  },
  piratas: {
    sil: `<path d='M18.6 9H21.4V33H18.6Z'/><path d='M12 12.2H28V14.8H12Z'/><path d='M4 21.5L9.5 25.2L8.2 25.4Q12 32.2 20 33.4Q28 32.2 31.8 25.4L30.5 25.2L36 21.5L36.4 28.6Q31 36.8 20 36.8Q9 36.8 3.6 28.6Z'/>`,
    extra: `<circle cx='20' cy='5.6' r='3.2'/>`,
    more: [WHEEL],
    c: `<circle cx='10' cy='10' r='6'/><path d='M10 6.8v6.4'/>`,
  },
  ninja: {
    sil: `<path d='M20 2L24 16L38 20L24 24L20 38L16 24L2 20L16 16Z'/>`,
    det: `<circle class='f' cx='20' cy='20' r='3'/>`,
    more: [
      {
        sil: `<path d='M20 2L24.5 16.5H21.6V27H18.4V16.5H15.5Z'/>`,
        det: `<path d='M18.4 20h3.2M18.4 23.4h3.2'/>`,
        extra: `<circle cx='20' cy='31.5' r='4.2'/>`,
      },
    ],
    c: `<path class='f' d='M10 3L11.8 8.2L17 10L11.8 11.8L10 17L8.2 11.8L3 10L8.2 8.2Z'/>`,
  },
  tatuagens: {
    // o S dos cadernos de escola e dos muros americanos (o "Cool S"): seis riscos e as diagonais,
    // um desenho só de traço, sem corpo para pintar
    sil: '',
    extra: `<path d='M12 10L20 3L28 10M12 10V17.5M20 10V17.5M28 10V17.5M12 22.5V30M20 22.5V30M28 22.5V30M12 17.5L20 22.5M20 17.5L28 22.5M28 17.5L24 20M12 22.5L16 20M12 30L20 37L28 30'/>`,
    more: [
      {
        // a bola 8: o círculo branco é um furo de verdade, e o 8 vai por cima
        sil: `<path fill-rule='evenodd' d='M5 20.5a15 15 0 1 0 30 0a15 15 0 1 0 -30 0ZM16 16.2a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0Z'/>`,
        det: `<path d='M9.2 23.5q1.2 5.6 6.6 8.2'/>`,
        extra: `<circle cx='22.5' cy='14.2' r='1.8'/><circle cx='22.5' cy='18.4' r='2.2'/>`,
      },
      {
        sil: `<path d='M6 31L4 11.5L13 19.5L20 7L27 19.5L36 11.5L34 31Z'/><path d='M5.5 32H34.5V36H5.5Z'/>`,
        det: `<circle class='f' cx='20' cy='24.5' r='2.2'/><circle class='f' cx='12' cy='26' r='1.5'/><circle class='f' cx='28' cy='26' r='1.5'/>`,
        extra: `<circle cx='4' cy='9.5' r='1.6'/><circle cx='20' cy='5' r='1.6'/><circle cx='36' cy='9.5' r='1.6'/>`,
      },
      {
        sil: `<path d='M20 38.5L16.6 18.5H23.4Z'/><path d='M9.5 14.5Q20 17.8 30.5 14.5L29.4 18Q20 20.6 10.6 18Z'/><path d='M18 5.5H22V15.4H18Z'/><circle cx='20' cy='4' r='2.4'/>`,
        det: `<path d='M20 20.5V34M18 8.8h4M18 12h4'/>`,
      },
      NAUTICAL,
    ],
    // os três pontinhos
    c: `<g class='f'><circle cx='10' cy='5.5' r='2.2'/><circle cx='5.5' cy='13.5' r='2.2'/><circle cx='14.5' cy='13.5' r='2.2'/></g>`,
  },
  mineracao: {
    sil: `<g transform='rotate(-32 20 20)'><path d='M3 13Q20 1 37 13Q33.5 12.8 29 11Q23.5 9 21.6 9.3V12H18.4V9.3Q16.5 9 11 11Q6.5 12.8 3 13Z'/><path d='M18.4 11.5H21.6L22.2 37Q20 38.8 17.8 37Z'/></g>`,
    det: `<g transform='rotate(-32 20 20)'><path d='M20 17V33'/></g>`,
    more: [
      {
        sil: `<rect x='8.5' y='14' width='7.4' height='22' rx='1.6'/><rect x='16.3' y='12' width='7.4' height='24' rx='1.6'/><rect x='24.1' y='14' width='7.4' height='22' rx='1.6'/>`,
        det: `<path d='M8.5 27.2H31.5M8.5 30.4H31.5'/>`,
        extra: `<path d='M20 12Q19 7 23 5.6Q26.4 4.4 27 2'/><path class='f' d='M27.5 -1.2L28.5 1L30.8 2L28.5 3L27.5 5.2L26.5 3L24.2 2L26.5 1Z'/>`,
      },
      {
        sil: `<path d='M11 6H29L36 14L20 35L4 14Z'/>`,
        det: `<path d='M4 14H36M11 6L15 14L20 35M29 6L25 14L20 35M15 14L20 6L25 14'/>`,
      },
      {
        sil: `<path d='M4 15H36L32.5 29H7.5Z'/><circle cx='12' cy='31.5' r='3.6'/><circle cx='28' cy='31.5' r='3.6'/>`,
        det: `<path d='M5.4 19.5H34.6'/><circle class='f' cx='12' cy='31.5' r='1.2'/><circle class='f' cx='28' cy='31.5' r='1.2'/>`,
        extra: `<path d='M8 15Q9 9.5 13.5 10.5Q16 6 20.5 8.5Q24.5 5.5 27.5 10Q31.5 9 32.5 15'/>`,
      },
    ],
    c: `<path class='f' d='M4 13L6 7L11 5L16 8L16 14L10 16Z'/>`,
  },
  carros: {
    sil: `<path d='M3 26V21.5Q3 19.5 5 19L10.5 17.5L15 11.5Q16 10 18 10H27Q29 10 30.5 11.5L34.5 17Q37 17.8 37 20.5V26Q37 27.5 35.5 27.5H4.5Q3 27.5 3 26Z'/><circle cx='11' cy='27.5' r='4.4'/><circle cx='29.5' cy='27.5' r='4.4'/>`,
    det: `<path class='f' d='M16.6 12.6H21.4V17.2H13.4ZM23.4 12.6H27.4Q28.4 12.6 29.1 13.4L31.9 17.2H23.4Z'/><circle class='f' cx='11' cy='27.5' r='1.6'/><circle class='f' cx='29.5' cy='27.5' r='1.6'/><path d='M22.4 19.5V24'/>`,
    more: [
      {
        sil: `<path d='M3.5 26.5Q3 19 9 16.5Q13 9 21 9Q29 9 32 15.5Q37 17.5 36.5 26.5Z'/><circle cx='11' cy='27' r='4.4'/><circle cx='29' cy='27' r='4.4'/>`,
        det: `<path class='f' d='M13.4 16Q15.6 11.8 20 11.6V16ZM22 11.6Q26.6 11.8 28.8 16H22Z'/><circle class='f' cx='11' cy='27' r='1.6'/><circle class='f' cx='29' cy='27' r='1.6'/>`,
      },
      {
        // o de corrida: baixinho, comprido, com a asa atrás
        sil: `<path d='M2.5 25.5Q2.5 22 6 21.5L17 20L20.5 16.5H25.5L27.5 20H33.5V16H38V25.5Z'/><circle cx='9.5' cy='26' r='4.3'/><circle cx='30.5' cy='26' r='4.3'/>`,
        det: `<circle class='f' cx='9.5' cy='26' r='1.5'/><circle class='f' cx='30.5' cy='26' r='1.5'/>`,
      },
    ],
    // a bandeira quadriculada da chegada
    c: `<path d='M4 2V18M4 3H16V12H4'/><path class='f' d='M4 3H8V6H4ZM8 6H12V9H8ZM12 3H16V6H12ZM4 9H8V12H4ZM12 9H16V12H12Z'/>`,
  },
  // ===== Coisas =====
  ferramentas: {
    sil: `<path d='M8 6H26.5Q28 6 28 7.5V14.5H8Q5 14.5 3.8 12Q7 10.8 8 6Z'/><path d='M17.6 14.5H21.4L22 36Q19.5 38.2 17 36Z'/>`,
    det: `<path d='M28 9.5H24'/>`,
    more: [
      {
        sil: `<path d='M24 3Q31 1 35 6L30 11L33 14L38 9Q40 15 36 18Q32 21 27 19L12 34Q9 37 6 34Q3 31 6 28L21 13Q19 8 24 3Z'/>`,
        det: `<circle class='f' cx='8.6' cy='31.4' r='1.4'/>`,
      },
      {
        sil: `<path d='M17 3H23Q24 3 24 4V17Q24 19 22 19H18Q16 19 16 17V4Q16 3 17 3Z'/><path d='M19 19H21V33L20 36.5L19 33Z'/>`,
        det: `<path d='M18.5 6v9.5M21.5 6v9.5'/>`,
      },
    ],
    c: `<path d='M10 3L16 6.5V13.5L10 17L4 13.5V6.5Z'/><circle cx='10' cy='10' r='2.6'/>`,
  },
  robos: {
    sil: `<path d='M9 12H31Q33 12 33 14V31Q33 33 31 33H9Q7 33 7 31V14Q7 12 9 12Z'/><path d='M4 19H7V27H4ZM33 19H36V27H33Z'/>`,
    det: `<circle class='f' cx='14.5' cy='20' r='3'/><circle class='f' cx='25.5' cy='20' r='3'/><path d='M12.5 27.5H27.5M16 25.5v4M20 25.5v4M24 25.5v4'/>`,
    extra: `<path d='M20 12V7.4'/><circle cx='20' cy='5.4' r='2'/>`,
    c: `<path d='M10 3L16 6.5V13.5L10 17L4 13.5V6.5Z'/><circle cx='10' cy='10' r='2.6'/>`,
  },
  musica: {
    sil: `<ellipse cx='11' cy='31' rx='5.2' ry='3.9' transform='rotate(-22 11 31)'/><ellipse cx='28.4' cy='27' rx='5.2' ry='3.9' transform='rotate(-22 28.4 27)'/><path d='M14.4 30V9.2L33 4.8V26H31V9.4L16.4 12.8V30Z'/>`,
    more: [
      {
        sil: `<path d='M5 9H35Q37 9 37 11V31Q37 33 35 33H5Q3 33 3 31V11Q3 9 5 9Z'/>`,
        det: `<circle cx='13' cy='19' r='3.4'/><circle cx='27' cy='19' r='3.4'/><path d='M16.4 19H23.6M10 33L12 28H28L30 33'/>`,
      },
    ],
    c: `<ellipse class='f' cx='7' cy='15' rx='3.6' ry='2.7' transform='rotate(-20 7 15)'/><path d='M10.2 14V3Q14 4 15.5 8'/>`,
  },
  // ===== Computador =====
  computadores: {
    // o monitor de tubo, com o prompt piscando na tela
    sil: `<path d='M6 5.5H34Q36 5.5 36 7.5V26.5Q36 28.5 34 28.5H6Q4 28.5 4 26.5V7.5Q4 5.5 6 5.5Z'/><path d='M15.5 28.5H24.5L26.5 33.5H13.5Z'/><path d='M9.5 33.5H30.5Q31.5 33.5 31.5 34.5V36H8.5V34.5Q8.5 33.5 9.5 33.5Z'/>`,
    det: `<path d='M9 9.5H31V24.5H9Z'/>`,
    extra: `<path d='M12.4 13.4L15.6 16L12.4 18.6M17.6 20H21.8' style='stroke-width:1.8'/>`,
    more: [
      {
        // o disquete
        sil: `<path d='M6 4.5H30.5L35.5 9.5V35.5H6Z'/>`,
        det: `<path d='M12.5 4.5V13.5H27.5V4.5'/><path class='f' d='M22.4 6.4H25.4V11.6H22.4Z'/><path d='M10 19.5H31.5V35.5H10Z'/>`,
        extra: `<path d='M13.5 24H28M13.5 28.4H24.6' style='stroke-width:1.6'/>`,
      },
      {
        // o mouse de bolinha, com o fio
        sil: `<path d='M20 12.5C13.6 12.5 11.5 17.4 11.5 23.4C11.5 31 15.2 35.5 20 35.5C24.8 35.5 28.5 31 28.5 23.4C28.5 17.4 26.4 12.5 20 12.5Z'/>`,
        det: `<path d='M11.8 21.6H28.2M20 12.5V21.6'/>`,
        extra: `<path d='M20 12.5C20 6.6 26.4 9.4 27.4 3.4'/>`,
      },
    ],
    c: `<path d='M3.6 6.4L8 10L3.6 13.6'/><path class='f' d='M10 13.2H16.4V15.6H10Z'/>`,
  },
  janelas: {
    // a janelinha de aviso: a barra de título com o X, as linhas do recado e o botão de OK
    sil: `<path d='M4 7.5H36V33.5H4Z'/>`,
    det: `<path d='M4 13.5H36'/><path d='M30.6 9L33.6 12M33.6 9L30.6 12' style='stroke-width:1.6'/><path d='M9 19H25M9 23.4H20'/><path d='M23.5 26.6H31.5V30.6H23.5Z'/>`,
    more: [
      {
        // o erro: o X num círculo
        sil: `<circle cx='20' cy='20' r='14.5'/>`,
        det: `<path d='M14.2 14.2L25.8 25.8M25.8 14.2L14.2 25.8' style='stroke-width:3.4'/>`,
      },
      {
        // o cuidado: a exclamação no triângulo
        sil: `<path d='M20 4.5Q21.2 4.5 21.9 5.7L36.2 31.4Q37 33.5 34.6 33.5H5.4Q3 33.5 3.8 31.4L18.1 5.7Q18.8 4.5 20 4.5Z'/>`,
        det: `<path d='M20 13.5V23.5' style='stroke-width:3.2'/><circle class='f' cx='20' cy='28.4' r='2.1'/>`,
      },
      {
        // a pasta
        sil: `<path d='M4 10.5Q4 9 5.5 9H14.5L17.5 12H34.5Q36 12 36 13.5V31Q36 32.5 34.5 32.5H5.5Q4 32.5 4 31Z'/>`,
        det: `<path d='M4 17H36'/>`,
      },
    ],
    c: `<path d='M3 5H17V15.5H3ZM3 8.4H17'/><path class='f' d='M13.4 5.8H15.8V7.6H13.4Z'/>`,
  },
  cursores: {
    // a setinha do mouse
    sil: `<path d='M11 3.5V31L17.4 25.2L21.8 35.4L26.4 33.4L22 23.6H30.4Z'/>`,
    det: `<path d='M14 11.5V22.4' style='stroke-width:1.6'/>`,
    more: [
      {
        // a mãozinha do link
        sil: `<path d='M15.5 5Q15.5 3 17.6 3Q19.7 3 19.7 5V16.5H20.4V14.6Q20.4 12.6 22.4 12.6Q24.4 12.6 24.4 14.6V17.4H25V16Q25 14 27 14Q29 14 29 16V18.8H29.6V18Q29.6 16.2 31.4 16.2Q33.2 16.2 33.2 18V27Q33.2 33.4 28 36.5H19Q15.8 34.6 12.4 28.6L8.8 22.4Q8 20.2 9.8 19.6Q11.4 19 12.8 20.8L15.5 24.2Z'/>`,
        det: `<path d='M20.4 17V23.4M25 17.6V23.4M29.6 19V23.4'/>`,
      },
      {
        // a ampulheta de espera
        sil: `<path d='M9.5 3.5H30.5V7H28.6Q28.6 15 22 20Q28.6 25 28.6 33H30.5V36.5H9.5V33H11.4Q11.4 25 18 20Q11.4 15 11.4 7H9.5Z'/>`,
        det: `<path d='M14.6 31.5Q16.4 27 20 26.4Q23.6 27 25.4 31.5Z'/><path d='M15.6 10.8H24.4Q23.4 14.6 20 16.6Q16.6 14.6 15.6 10.8Z'/>`,
      },
      {
        // o cursor de texto
        sil: `<path d='M18.7 7.5H21.3V32.5H18.7Z'/>`,
        extra: `<path d='M13.5 4.5Q17 4.5 20 7.6Q23 4.5 26.5 4.5M13.5 35.5Q17 35.5 20 32.4Q23 35.5 26.5 35.5'/>`,
      },
    ],
    c: `<path class='f' d='M5 2.5V15.5L8.2 12.6L10.4 17.6L12.6 16.6L10.4 11.8H14.6Z'/>`,
  },
  circuitos: {
    // o chip, com as perninhas dos dois lados e a bolinha do pino 1
    sil: `<path d='M10 9H30Q31 9 31 10V30Q31 31 30 31H10Q9 31 9 30V10Q9 9 10 9Z'/>`,
    det: `<circle class='f' cx='13.6' cy='13.6' r='1.8'/><path d='M14 26.5H26' style='stroke-width:1.5'/>`,
    extra: `<path d='M14 9V4M20 9V4M26 9V4M14 31V36M20 31V36M26 31V36M9 14H4M9 20H4M9 26H4M31 14H36M31 20H36M31 26H36'/>`,
    more: [
      {
        // a trilha de cobre entre duas ilhas de solda
        sil: `<circle cx='8' cy='8.5' r='4.4'/><circle cx='32' cy='31.5' r='4.4'/>`,
        det: `<circle class='f' cx='8' cy='8.5' r='1.6'/><circle class='f' cx='32' cy='31.5' r='1.6'/>`,
        extra: `<path d='M8 12.9V19.5L16.5 28H27.6' style='stroke-width:2.8'/><path d='M12.4 8.5H22L27 13.5V20' style='stroke-width:2.8'/><circle cx='27' cy='23' r='3'/>`,
      },
      {
        // o resistor, com as listras
        sil: `<path d='M12 14.5H28Q31 14.5 31 17.5V22.5Q31 25.5 28 25.5H12Q9 25.5 9 22.5V17.5Q9 14.5 12 14.5Z'/>`,
        det: `<path d='M14.4 14.5V25.5M18.4 14.5V25.5M23 14.5V25.5' style='stroke-width:2.2'/>`,
        extra: `<path d='M2 20H9M31 20H38'/>`,
      },
    ],
    c: `<circle cx='10' cy='10' r='4.4'/><circle class='f' cx='10' cy='10' r='1.6'/>`,
  },
  binario: {
    sil: `<path d='${pixels(['.#..###', '##..#.#', '.#..#.#', '.#..#.#', '.#..#.#', '###.###'], 4.4)}'/>`,
    more: [{ sil: `<path d='${pixels(['###..#.', '#.#.##.', '#.#..#.', '#.#..#.', '#.#..#.', '###.###'], 4.4)}'/>` }],
    c: `<path d='M7.6 5.6L10.4 3V17M7 17H13.6'/>`,
  },
  blocos: {
    ...block(['###', '.#.'], 8.4),
    more: [block(['#.', '#.', '##'], 8), block(['.##', '##.'], 8.4), block(['##', '##'], 9), block(['####'], 8.2)],
    c: `<path d='M4 4H16V16H4Z'/><path class='f' d='M7.4 7.4H12.6V12.6H7.4Z'/>`,
  },
  // ===== 2026-10-03, a terceira leva =====
  bolos: {
    // o bolo de dois andares, com a cobertura escorrendo e as velinhas acesas
    sil: `<path d='M6.5 24Q6.5 22.5 8 22.5H32Q33.5 22.5 33.5 24V35H6.5Z'/><path d='M10.5 15.5Q10.5 14 12 14H28Q29.5 14 29.5 15.5V22.5H10.5Z'/>`,
    det: `<path d='${scallops([6.5, 25.6], [33.5, 25.6], 4, 3)}${scallops([10.5, 17], [29.5, 17], 3, 2.6)}'/>`,
    extra: `<path d='M14.6 14V9.8M20 14V9.8M25.4 14V9.8M3.4 35.8H36.6'/><path class='f' d='M14.6 3.4Q17.2 6.2 16.3 7.5Q15.7 8.4 14.6 8.4Q13.5 8.4 12.9 7.5Q12 6.2 14.6 3.4ZM20 3.4Q22.6 6.2 21.7 7.5Q21.1 8.4 20 8.4Q18.9 8.4 18.3 7.5Q17.4 6.2 20 3.4ZM25.4 3.4Q28 6.2 27.1 7.5Q26.5 8.4 25.4 8.4Q24.3 8.4 23.7 7.5Q22.8 6.2 25.4 3.4Z'/>`,
    more: [
      {
        // o cupcake: a forminha pregueada, o chantili em três voltas e a cereja
        sil: `<path d='M10.2 23.2H29.8L27.6 35Q27.4 36.4 26 36.4H14Q12.6 36.4 12.4 35Z'/><path d='M9 22.2Q6.6 22.2 7.2 19.8Q8 16.8 11.2 16.6Q11.2 12.2 15.6 11.6Q16.6 8.2 20 8.2Q23.4 8.2 24.4 11.6Q28.8 12.2 28.8 16.6Q32 16.8 32.8 19.8Q33.4 22.2 31 22.2Z'/><circle cx='20' cy='4.6' r='2.6'/>`,
        det: `<path d='M15.2 23.8L16.1 35.6M20 23.8V35.6M24.8 23.8L23.9 35.6M11.2 16.6Q20 19 28.8 16.6M15.6 11.6Q20 13 24.4 11.6'/>`,
        extra: `<path d='M20 2Q20.6 .2 22.6 -.2'/>`,
      },
      {
        // a fatia: a cobertura escorrendo pela beirada, o recheio e a cereja em cima
        sil: `<path d='M3.5 23L29 11.6L36.5 16.6V30L3.5 35.5Z'/><circle cx='28' cy='9.8' r='2.8'/>`,
        det: `<path d='${scallops([3.5, 23], [36.5, 16.6], 5, 2.2)}M3.5 29.6L36.5 23.4'/>`,
        extra: `<path d='M28 7Q28.4 4.2 31.2 3.4'/>`,
      },
    ],
    // a chaminha da vela
    c: `<path class='f' d='M10 2.5Q15.5 9 14 13.5A4 4 0 0 1 6 13.5Q4.5 9 10 2.5Z'/>`,
  },
  festa: {
    // o balão, com o nó e o barbante
    sil: `<path d='M20 2.5C12.5 2.5 9 8.5 9 14C9 21 15 26.5 20 28C25 26.5 31 21 31 14C31 8.5 27.5 2.5 20 2.5Z'/><path d='M18.2 28.4H21.8L22.8 30.8H17.2Z'/>`,
    det: `<path d='M13.4 12q.8-4 4.6-5'/>`,
    extra: `<path d='M20 30.8Q16.6 33.4 20.4 35.6T19.4 39.4'/>`,
    more: [
      {
        // o chapéu de festa, listrado, com o pompom
        sil: `<path d='M20 7.2L31 33.4Q31.4 34.6 30 34.6H10Q8.6 34.6 9 33.4Z'/><circle cx='20' cy='4.4' r='3'/>`,
        det: `<path d='M14.6 19.8L23.6 15.6M11.8 26.8L26.8 21.2M9.6 33.2L29.4 27.4'/>`,
      },
      {
        // o presente, com o laço
        sil: `<path d='M7.6 15.6H32.4Q33.6 15.6 33.6 16.8V21.6H6.4V16.8Q6.4 15.6 7.6 15.6Z'/><path d='M8.4 22.6H31.6V34.8Q31.6 36 30.4 36H9.6Q8.4 36 8.4 34.8Z'/><path d='M20 15.2C17.6 8.6 10.6 7.8 10.4 11.4Q10.4 14.8 20 15.2ZM20 15.2C22.4 8.6 29.4 7.8 29.6 11.4Q29.6 14.8 20 15.2Z'/>`,
        det: `<path d='M17.8 15.6V36M22.2 15.6V36'/>`,
      },
    ],
    // o confete
    c: `<g class='f'><path d='M3 5.4L7.4 3.8L8.4 6.4L4 8Z'/><circle cx='14.4' cy='5.6' r='1.8'/><path d='M9.4 12.4L13 15L11.4 17.2L7.8 14.6Z'/><circle cx='4.6' cy='15' r='1.3'/></g>`,
  },
  natal: {
    // o pinheiro com a estrela e as bolinhas
    sil: `<path d='M20 9.6L25.8 16.2Q24.6 16.8 23.4 16.6L29.6 23.6Q28 24.4 26.4 24.2L33.4 31.6Q20 34 6.6 31.6L13.6 24.2Q12 24.4 10.4 23.6L16.6 16.6Q15.4 16.8 14.2 16.2Z'/><path d='M17.6 33.4H22.4V37.2H17.6Z'/><path d='${softStar(20, 5.4, 4.6, 2, 5)}'/>`,
    det: `<circle class='f' cx='20.6' cy='14.6' r='1.5'/><circle class='f' cx='16.6' cy='21.2' r='1.5'/><circle class='f' cx='24.2' cy='21.8' r='1.5'/><circle class='f' cx='13.2' cy='29.2' r='1.5'/><circle class='f' cx='20' cy='27.2' r='1.5'/><circle class='f' cx='26.8' cy='29.4' r='1.5'/>`,
    more: [
      (() => {
        // a bengala doce, listrada até a ponta da curva
        const cane: Pt[] = [[15, 37], [15, 14], ...arc(21.6, 14, 6.6, 180, 360, 14).slice(1), [28.2, 19.6]];
        return { sil: `<path d='${tube(cane, 5.6)}'/>`, det: `<path d='${tubeMarks(cane, 5.6, 5.4, 1.8, 3)}'/>` };
      })(),
      {
        // a bola de enfeite, com o zigue-zague e o ganchinho
        sil: `<circle cx='20' cy='23.6' r='12.4'/><path d='M17 8.2H23Q23.8 8.2 23.8 9V11.8H16.2V9Q16.2 8.2 17 8.2Z'/>`,
        det: `<path d='M7.8 22.2L11.2 25.6L14.6 22.2L18 25.6L21.4 22.2L24.8 25.6L28.2 22.2L32 25.6M12 18.4q1.4-4 5-5.2'/>`,
        extra: `<path d='M20 8.2Q19.4 4 22 4.2Q24.2 4.6 23.2 6.8'/>`,
      },
      {
        // o boneco de neve, de cartola e cachecol
        sil: `<circle cx='20' cy='28.4' r='8.4'/><circle cx='20' cy='14' r='6'/><path d='M13.8 6.4H26.2V8H13.8Z'/><path d='M16.6 1.4H23.4V6.4H16.6Z'/>`,
        det: `<circle class='f' cx='17.8' cy='13' r='1.1'/><circle class='f' cx='22.2' cy='13' r='1.1'/><path class='f' d='M19.8 14.8L24.2 15.8L19.8 16.8Z'/><circle class='f' cx='20' cy='26' r='1.3'/><circle class='f' cx='20' cy='30.6' r='1.3'/>`,
        extra: `<path d='M12.2 25L5.2 20M7.6 21.7L5.8 24.2M27.8 25L34.8 20M32.4 21.7L34.2 24.2M14.4 19.8Q20 22.2 25.6 19.8M23.2 21.2L24.4 25.6'/>`,
      },
    ],
    // o floco de neve
    c: `<path d='M10 2.5V17.5M3.5 6.3L16.5 13.7M3.5 13.7L16.5 6.3'/>`,
  },
  casal: {
    // o coração flechado
    ...CUPID,
    more: [
      {
        // as alianças entrelaçadas, uma com a pedra brilhando
        sil: `${ring(14.6, 25.4, 9.2, 6.6)}${ring(25.4, 22.4, 9.2, 6.6)}<path d='M21.8 9.4L23.6 6.6H27.2L29 9.4L25.4 13.2Z'/>`,
        det: `<path d='M21.8 9.4H29'/>`,
        extra: spark(33, 5.4, 2.8),
      },
      {
        // a cartinha de amor, fechada com um coração
        sil: `<path d='M6 10.5H34Q36 10.5 36 12.5V29.5Q36 31.5 34 31.5H6Q4 31.5 4 29.5V12.5Q4 10.5 6 10.5Z'/>`,
        det: `<path d='M4.8 11.4L20 23L35.2 11.4'/>${heartAt(20, 23, 0.34, 'f')}`,
      },
      {
        // o cadeado do amor, com o buraco da chave em coração
        sil: `<path d='M10.5 18H29.5Q31.5 18 31.5 20V33Q31.5 35.5 29 35.5H11Q8.5 35.5 8.5 33V20Q8.5 18 10.5 18Z'/>`,
        det: heartAt(20, 26.6, 0.36, 'f'),
        extra: `<path d='M13.6 18V12.6A6.4 6.4 0 0 1 26.4 12.6V18' style='stroke-width:3'/>`,
      },
    ],
    c: `<path class='f' d='${HEART}' transform='scale(.5)'/>`,
  },
  // ===== Magia =====
  magias: {
    // a varinha com a estrela, soltando brilhos
    sil: `<path d='${tube([[5.2, 35], [21.4, 18.8]], 3.4)}'/><path d='${softStar(26.6, 13, 10, 4.4, 5, -82, 0.2)}'/>`,
    det: `<path d='M9.4 29.2l2.4 2.4'/>`,
    extra: `${spark(8.4, 9.4, 4)}${spark(33.6, 29, 3.2)}<circle class='f' cx='14.6' cy='16.4' r='1.1'/>`,
    more: [
      {
        // o livro de feitiços, com a lua, a estrela e a fitinha
        sil: `<path d='M9 4.5H30Q32 4.5 32 6.5V31.5Q32 33.5 30 33.5H9Q7.6 33.5 7.6 32.1V5.9Q7.6 4.5 9 4.5Z'/>`,
        det: `<path d='M11.6 4.5V33.5'/><path class='f' transform='translate(9.6 7.2)' d='M13 3C8 4 5 7.5 5 11.5C5 15.5 8.5 18 12.5 18C10 16.4 8.8 14 8.8 11C8.8 7.6 10.4 4.8 13 3Z'/><path class='f' d='${softStar(25.8, 14.4, 3, 1.3, 5)}'/>`,
        extra: `<path d='M24.6 33.5V38.6L26.4 37L28.2 38.6V33.5'/>`,
      },
      {
        // a bola de cristal no pé, com um brilho dentro
        sil: `<circle cx='20' cy='17' r='12.2'/><path d='M11.8 26A12.2 12.2 0 0 0 28.2 26L31.4 34.4Q32 36.4 30 36.4H10Q8 36.4 8.6 34.4Z'/>`,
        det: `<path d='M12.4 14.2Q13.4 9.4 18 7.8M11.8 26A12.2 12.2 0 0 0 28.2 26M9.8 31.6H30.2'/><path class='f' d='M22.2 12.6Q22.8 16.4 26.4 17Q22.8 17.6 22.2 21.4Q21.6 17.6 18 17Q21.6 16.4 22.2 12.6Z'/>`,
      },
    ],
    c: SPARKLE,
  },
  pocoes: {
    // o frasco redondo, borbulhando
    sil: `<path d='M16.4 2.4H23.6Q24.4 2.4 24.4 3.2V5.8Q24.4 6.6 23.6 6.6H16.4Q15.6 6.6 15.6 5.8V3.2Q15.6 2.4 16.4 2.4Z'/><path d='M17.6 7.6H22.4V13.4Q31.6 16 31.6 25.2Q31.6 36.4 20 36.4Q8.4 36.4 8.4 25.2Q8.4 16 17.6 13.4Z'/>`,
    det: `<path d='M9.4 23.6Q14.7 26.6 20 23.6T30.6 23.6'/><circle class='f' cx='15.4' cy='30.2' r='1.6'/><circle class='f' cx='22.8' cy='28.6' r='1.1'/><circle class='f' cx='20' cy='32.8' r='.9'/>`,
    more: [
      {
        // o frasco de laboratório, de fundo largo
        sil: `<path d='M16.4 2.4H23.6Q24.4 2.4 24.4 3.2V5.8Q24.4 6.6 23.6 6.6H16.4Q15.6 6.6 15.6 5.8V3.2Q15.6 2.4 16.4 2.4Z'/><path d='M17.6 7.6H22.4V15.2L31.8 31.6Q33.4 35.8 29 35.8H11Q6.6 35.8 8.2 31.6L17.6 15.2Z'/>`,
        det: `<path d='M12.1 25Q16 27.6 20 25T27.9 25'/><circle class='f' cx='15.8' cy='30.6' r='1.5'/><circle class='f' cx='22.6' cy='29.4' r='1'/><circle class='f' cx='19.6' cy='32.8' r='.9'/>`,
        extra: `<circle cx='27.4' cy='10.6' r='1.6'/><circle cx='30.4' cy='5.8' r='1.1'/>`,
      },
      {
        // a poção do amor: o vidro em coração, com o gargalo saindo do meio
        sil: `<path d='M16.4 2.4H23.6Q24.4 2.4 24.4 3.2V5.8Q24.4 6.6 23.6 6.6H16.4Q15.6 6.6 15.6 5.8V3.2Q15.6 2.4 16.4 2.4Z'/><path d='M17.6 13.8C15.8 11.6 13.2 11 11 11.6C7.4 12.6 5.2 16 5.4 19.8C5.8 26.4 12.4 31.2 20 36.4C27.6 31.2 34.2 26.4 34.6 19.8C34.8 16 32.6 12.6 29 11.6C26.8 11 24.2 11.6 22.4 13.8V7.6H17.6Z'/>`,
        det: `<path d='M6.2 23.4Q13 26.6 20 23.4T33.8 23.4M9.4 18q.6-3.2 3.6-3.8'/><circle class='f' cx='15.6' cy='29' r='1.5'/><circle class='f' cx='22.6' cy='30.6' r='1'/>`,
      },
    ],
    c: `<circle cx='7.4' cy='12.4' r='3.4'/><circle cx='14' cy='5.6' r='2'/><circle class='f' cx='14.6' cy='15' r='1.3'/>`,
  },
  portais: {
    // o portal oval, com o redemoinho e os brilhos
    sil: `<ellipse cx='20' cy='20' rx='12.5' ry='17'/>`,
    det: `<path d='${spiral(20, 20, 9.4, 13.2, 2, 0.4)}'/>`,
    extra: `${spark(5, 8.6, 3.6)}${spark(35.2, 31.4, 3)}<circle class='f' cx='35.4' cy='8.4' r='1.1'/>`,
    more: [STONE_PORTAL, RING_PORTAL],
    c: `<path d='${spiral(10, 10, 7, 7, 1.8, 0)}'/>`,
  },
  // ===== Armas =====
  armas: {
    // a pistola, de lado: o ferrolho, a empunhadura e o guarda-mato
    sil: `<path d='M5.9 8H35Q36.4 8 36.4 9.4V15.4H4.5V9.4Q4.5 8 5.9 8Z'/><path d='M6 6.4H8.2V8H6ZM33.2 6.4H35V8H33.2Z'/><path d='M4.5 15.4H24V17.2Q24 18.2 23 18.2H14.6L12.4 34Q12.2 35.6 10.6 35.6H5Q3.2 35.6 3.6 33.8L6.4 18.2Q4.5 17.6 4.5 16Z'/>`,
    det: `<path d='M8.6 10.4V13M11.8 10.4V13M15 10.4V13'/><circle class='f' cx='9.2' cy='22.4' r='1.1'/>`,
    extra: `<path d='M14.2 21.2Q14.4 24.6 17.8 24.6H20.4Q23 24.6 23 21.8V18.2M18.8 18.2Q19.2 20.6 17.6 22'/>`,
    more: [
      {
        // as balas em pé
        sil: `<path d='M7.8 36V20.4Q7.8 13.4 11 9.4Q14.2 13.4 14.2 20.4V36Z'/><path d='M16.8 36V17.4Q16.8 10.4 20 6.4Q23.2 10.4 23.2 17.4V36Z'/><path d='M25.8 36V20.4Q25.8 13.4 29 9.4Q32.2 13.4 32.2 20.4V36Z'/>`,
        det: `<path d='M7.8 21.6H14.2M16.8 18.6H23.2M25.8 21.6H32.2M7.8 32.8H14.2M16.8 32.8H23.2M25.8 32.8H32.2'/>`,
      },
      {
        // a granada de abacaxi, com a alavanca e o pino
        sil: `<ellipse cx='18.6' cy='25' rx='10.6' ry='11.6'/><path d='M15.4 10.6H21.8Q22.6 10.6 22.6 11.4V13.8H14.6V11.4Q14.6 10.6 15.4 10.6Z'/>`,
        det: `<path d='M8.4 21.2H28.8M8.2 28H29M15 14.2Q13 25 15 36.4M22.2 14.2Q24.2 25 22.2 36.4'/>`,
        extra: `<circle cx='11.2' cy='9.4' r='3.2'/><path d='M22.6 12.2H24.4Q28.6 12.2 29.4 16.6L30.4 22.6' style='stroke-width:2.8'/>`,
      },
    ],
    // a mira
    c: `<circle cx='10' cy='10' r='5.4'/><path d='M10 1.6V6M10 14V18.4M1.6 10H6M14 10H18.4'/>`,
  },
  // ===== Céu =====
  foguetes: {
    // o foguete, com as aletas e o fogo saindo
    sil: `<path d='M20 2.4C26 7.4 28.2 14.4 28 22.4L27.6 29.4H12.4L12 22.4C11.8 14.4 14 7.4 20 2.4Z'/><path d='M12.1 19.6C7.8 21.6 5.6 25.4 5.6 31.4L12.4 28.4ZM27.9 19.6C32.2 21.6 34.4 25.4 34.4 31.4L27.6 28.4Z'/>`,
    det: `<circle cx='20' cy='15' r='3.6'/><path d='M12.6 23.4H27.4'/>`,
    extra: `<path d='M15.6 31.4Q16.4 35.8 20 38.6Q23.6 35.8 24.4 31.4M20 31.4V35'/>`,
    more: [
      {
        // o capacete de astronauta
        sil: `<circle cx='20' cy='18.6' r='14'/><path d='M11.4 29.4H28.6Q30 29.4 30 30.8V35.6H10V30.8Q10 29.4 11.4 29.4Z'/>`,
        det: `<path d='M9.6 17Q9.6 10.2 20 10.2Q30.4 10.2 30.4 17Q30.4 26.2 20 26.2Q9.6 26.2 9.6 17Z'/><path d='M13.6 16.6q.8-2.8 3.6-3.4M14 32.6h2.6'/>`,
      },
      {
        // o cometa
        sil: `<path d='${softStar(27.4, 12.6, 8.8, 3.8, 5, -76, 0.18)}'/>`,
        extra: `<path d='M20.4 19.2L4 35.6M24.4 21.6L13.4 32.6M18 15.4L8.4 25'/>`,
      },
    ],
    c: SPARKLE,
  },
  arcoiris: {
    ...RAINBOW,
    more: [SUN],
    c: `<path class='f' d='${cloud(10, 11, [[6, 12.4, 3.4], [10.4, 9.4, 4.2], [14.4, 12.6, 3.2]], 15.4).d}'/>`,
  },
  // ===== Natureza =====
  praia: {
    ...PALM,
    more: [
      {
        // a concha
        sil: `<path d='M20 31.6Q11 30.4 6.4 22.6Q3.4 16.4 6.8 11.4Q11 5.2 20 5Q29 5.2 33.2 11.4Q36.6 16.4 33.6 22.6Q29 30.4 20 31.6Z'/><path d='M15.4 30.6H24.6L23 36H17Z'/>`,
        det: `<path d='M20 30.6V8.4M20 30.6L13 9.4M20 30.6L27 9.4M20 30.6L8.2 14.6M20 30.6L31.8 14.6'/>`,
      },
      {
        // a estrela-do-mar, com as pintinhas
        sil: `<path d='${softStar(20, 21, 17, 7.6, 5, -88, 0.2)}'/>`,
        det: `<circle class='f' cx='20' cy='11.4' r='1.1'/><circle class='f' cx='28.4' cy='18.8' r='1.1'/><circle class='f' cx='25.6' cy='28.4' r='1.1'/><circle class='f' cx='14.4' cy='28.4' r='1.1'/><circle class='f' cx='11.6' cy='18.8' r='1.1'/><circle class='f' cx='20' cy='21' r='1.7'/>`,
      },
    ],
    // a ondinha
    c: `<path d='M2 12.4Q5 7.4 8 12.4T14 12.4T18.4 11.4'/>`,
  },
  // ===== Bichos =====
  corujas: {
    sil: `<path d='M9 8.6L12.6 12.8Q20 9.2 27.4 12.8L31 8.6Q34.2 16 33.2 23Q32 35.4 20 35.4Q8 35.4 6.8 23Q5.8 16 9 8.6Z'/>`,
    det: `<circle cx='14.6' cy='19.2' r='4.4'/><circle cx='25.4' cy='19.2' r='4.4'/><circle class='f' cx='15.2' cy='19.2' r='1.9'/><circle class='f' cx='24.8' cy='19.2' r='1.9'/><path class='f' d='M18.4 23H21.6L20 26.4Z'/><path d='M10.2 23.6Q10.2 30.4 14.4 33.2M29.8 23.6Q29.8 30.4 25.6 33.2'/>`,
    extra: `<path d='M3 36.2H37M16 35.4v1.6M24 35.4v1.6'/>`,
    // a peninha
    c: `<path d='M4 16Q5.6 5.6 16 4Q14.4 14.4 4 16Z'/><path d='M3 17L12.4 7.6'/>`,
  },
  // ===== Comida =====
  lanches: {
    // o hambúrguer em camadas, com gergelim
    sil: `<path d='M5 18.4Q5 6.4 20 6.4Q35 6.4 35 18.4Z'/><path d='M4 19.6H36L34.4 22.6Q32 20.8 29.6 22.6T24.8 22.6T20 22.6T15.2 22.6T10.4 22.6T5.6 22.6Z'/><path d='M4.4 23.8H35.6Q37.4 23.8 37.4 25.8Q37.4 27.8 35.6 27.8H4.4Q2.6 27.8 2.6 25.8Q2.6 23.8 4.4 23.8Z'/><path d='M5 29.2H35Q35 35 29.6 35H10.4Q5 35 5 29.2Z'/>`,
    det: `<ellipse class='f' cx='14' cy='12' rx='.75' ry='1.3' transform='rotate(-30 14 12)'/><ellipse class='f' cx='20' cy='10' rx='.75' ry='1.3'/><ellipse class='f' cx='26' cy='12' rx='.75' ry='1.3' transform='rotate(30 26 12)'/><ellipse class='f' cx='17.4' cy='15' rx='.75' ry='1.3' transform='rotate(-20 17.4 15)'/><ellipse class='f' cx='23' cy='15' rx='.75' ry='1.3' transform='rotate(20 23 15)'/>`,
    more: [
      FRIES,
      {
        // o copo de refri, com o canudo
        sil: `<path d='M9.4 8.8H30.6Q31.4 8.8 31.4 9.6V12.6H8.6V9.6Q8.6 8.8 9.4 8.8Z'/><path d='M10.4 13.6H29.6L27.6 35Q27.4 36.4 26 36.4H14Q12.6 36.4 12.4 35Z'/>`,
        det: `<path d='M11.2 22Q15.6 25.4 20 22T28.8 22'/>`,
        extra: `<path d='M21.6 8.8L24.6 2.4H29.4'/>`,
      },
      {
        // o cachorro-quente, com a mostarda
        sil: `<g transform='rotate(-16 20 21)'><path d='M5.4 17.6H34.6Q37.6 17.6 37.6 20.6Q37.6 23.6 34.6 23.6H5.4Q2.4 23.6 2.4 20.6Q2.4 17.6 5.4 17.6Z'/><path d='M7.4 24.6H32.6Q32 31.6 26 31.6H14Q8 31.6 7.4 24.6Z'/><path d='M8.4 16.6Q9.4 11.4 14.4 11.4H25.6Q30.6 11.4 31.6 16.6Z'/></g>`,
        det: `<g transform='rotate(-16 20 21)'><path d='M7.6 20.6Q9.4 18.8 11.2 20.6T14.8 20.6T18.4 20.6T22 20.6T25.6 20.6T29.2 20.6T32.4 20.6'/></g>`,
      },
    ],
    c: DROP,
  },
  japonesa: {
    // o oniguiri, com a alga
    sil: `<path d='M20 4.6Q23 4.6 25 8.2L34.6 25.8Q37.2 33 30 33H10Q2.8 33 5.4 25.8L15 8.2Q17 4.6 20 4.6Z'/>`,
    det: `<path class='f' d='M14 23.4H26V33H14Z'/><path d='M12.6 17q1.4-4 4.2-5.4'/>`,
    more: [
      {
        // o sushi: o peixe listrado em cima do arroz
        sil: `<path d='M4 18.6Q4 12.4 12 11.4Q24 10 33 12.8Q37 14.4 36.6 18Q36 20.8 32 20.8H7Q4 20.8 4 18.6Z'/><path d='M6.6 25.8Q6.6 22.2 10.2 22.2H29.8Q33.4 22.2 33.4 25.8V28Q33.4 32 29.4 32H10.6Q6.6 32 6.6 28Z'/>`,
        det: `<path d='M14 12.4Q16.2 16 15 20.4M21.6 11.8Q23.8 15.6 22.6 20.4M28.6 12.4Q30.8 16 29.6 20.4'/>`,
      },
      {
        // a tigela de lámen, com os hashis
        sil: `<path d='M3.4 19H36.6Q36 30 26 33L25 36.2H15L14 33Q4 30 3.4 19Z'/>`,
        det: `<path d='M7 25.4L10 23L13 25.4L16 23L19 25.4L22 23L25 25.4L28 23L31 25.4L33.4 23.4'/>`,
        extra: `<path d='M15.4 17.4L28.6 2.4M20.6 17.4L33.4 4.8M9.6 15c-2-2 2-3.6 0-6'/>`,
      },
    ],
    // o narutomaki
    c: `<circle cx='10' cy='10' r='6.6'/><path d='${spiral(10, 10, 4, 4, 1.5, 0, 40)}'/>`,
  },
  // ===== Terror =====
  cemiterio: {
    // a lápide com R.I.P. e uma rachadura
    sil: `<path d='M8 35V14Q8 4 20 4Q32 4 32 14V35Z'/>`,
    det: `<path d='M12.2 12.6V20.8M12.2 12.6H14.8Q16.8 12.6 16.8 14.7Q16.8 16.8 14.8 16.8H12.2M14.6 16.8L16.8 20.8M20 12.6V20.8M23.4 12.6V20.8M23.4 12.6H26Q28 12.6 28 14.7Q28 16.8 26 16.8H23.4M26.4 24.6l-2.2 2.8 2 1.8-1.8 3'/>`,
    extra: `<path d='M3 35.6H37M5.6 35.6l-1-3M8.6 35.6l1-2.6M31.4 35.6l-1-3M34.4 35.6l1-2.6'/>`,
    more: [
      {
        // a cruz no montinho de terra
        sil: `<path d='M17 4H23V11.6H30.6V17.6H23V33H17V17.6H9.4V11.6H17Z'/>`,
        extra: `<path d='M4.4 36Q20 28.6 35.6 36'/>`,
      },
      {
        // a mão de zumbi saindo da terra, com a cicatriz costurada
        sil: `<path d='M15.6 37V30L14.6 28L10 22.2Q8.8 20.6 10.2 19.6Q11.6 18.8 12.8 20.2L14.6 22.6V10.6A1.8 1.8 0 0 1 18.2 10.6V19V7.6A1.8 1.8 0 0 1 21.8 7.6V19V9.4A1.8 1.8 0 0 1 25.4 9.4V19.6V13.4A1.6 1.6 0 0 1 28.6 13.4V25.6Q28.6 29.6 26 31V37Z'/>`,
        det: `<path d='M18.2 19V11.6M21.8 19V9.6M25.4 19.6V11.6M16.8 27.8L26 24.4M19 25.6l1 2.6M22.6 24.4l1 2.6'/>`,
        extra: `<path d='M3 37.4Q20 31.8 37 37.4'/>`,
      },
    ],
    c: `<path class='f' d='M8.5 3H11.5V7H15V10H11.5V17H8.5V10H5V7H8.5Z'/>`,
  },
  // ===== Coisas =====
  esportes: {
    ...SOCCER,
    more: [
      {
        // a bola de basquete
        sil: `<circle cx='20' cy='20' r='15'/>`,
        det: `<path d='M5 20H35M20 5V35M9.4 9.4Q15.4 20 9.4 30.6M30.6 9.4Q24.6 20 30.6 30.6'/>`,
      },
      {
        // o troféu
        sil: `<path d='M11 4.6H29V11.6Q29 20.8 20 22.4Q11 20.8 11 11.6Z'/><path d='M18.4 22.4H21.6V28H18.4Z'/><path d='M13 28H27V31.2H13Z'/><path d='M10.6 31.8H29.4V35.8H10.6Z'/>`,
        det: `<path class='f' d='${softStar(20, 12.6, 4.6, 2, 5)}'/>`,
        extra: `<path d='M11 7.6H7.4Q5 7.6 5 10.4Q5 16 11.6 16.6M29 7.6H32.6Q35 7.6 35 10.4Q35 16 28.4 16.6'/>`,
      },
    ],
    // o apito
    c: `<circle cx='8' cy='12' r='4.6'/><path d='M8 7.4H17V11.6H12.2'/>`,
  },
  escola: {
    // o lápis apontado
    sil: `<g transform='rotate(-42 20 20)'><path d='M4 16H29.6L37.6 20L29.6 24H4Q2.4 24 2.4 22.4V17.6Q2.4 16 4 16Z'/></g>`,
    det: `<g transform='rotate(-42 20 20)'><path d='M7.4 16V24M10.6 16V24M29.6 16V24M10.6 20H29.6'/><path class='f' d='M34.2 18.3L37.6 20L34.2 21.7Z'/></g>`,
    more: [
      {
        // o caderno aberto
        sil: `<path d='M3 10Q12 6.4 20 10.4Q28 6.4 37 10V32Q28 28.4 20 32.4Q12 28.4 3 32Z'/>`,
        det: `<path d='M20 10.4V32.4M7 14.4Q11.4 13 16 14.6M7 19Q11.4 17.6 16 19.2M7 23.6Q11.4 22.2 16 23.8M24 14.6Q28.6 13 33 14.4M24 19.2Q28.6 17.6 33 19'/>`,
      },
      {
        // o aviãozinho de papel
        sil: `<path d='M3 18.4L37 4.4L28 34L19.6 25Z'/><path d='M19.6 25L24.4 29.6L19.6 34.6Z'/>`,
        det: `<path d='M37 4.4L19.6 25'/>`,
      },
      {
        // a régua
        sil: `<g transform='rotate(-36 20 20)'><path d='M1.6 14.6H38.4V25.4H1.6Z'/></g>`,
        det: `<g transform='rotate(-36 20 20)'><path d='M6 14.6v4.6M10 14.6v2.8M14 14.6v4.6M18 14.6v2.8M22 14.6v4.6M26 14.6v2.8M30 14.6v4.6M34 14.6v2.8'/></g>`,
      },
    ],
    // o clipe
    c: `<path d='M7 16V5.6Q7 3 9.6 3Q12.2 3 12.2 5.6V14Q12.2 15.8 10.6 15.8Q9 15.8 9 14V7.4'/>`,
  },
  carinhas: {
    // a feliz
    sil: `<circle cx='20' cy='20' r='15'/>`,
    det: `<ellipse class='f' cx='14.6' cy='16' rx='1.9' ry='2.7'/><ellipse class='f' cx='25.4' cy='16' rx='1.9' ry='2.7'/><path d='M12.4 23Q20 31.4 27.6 23'/>`,
    more: [
      {
        // a piscadinha, de língua de fora
        sil: `<circle cx='20' cy='20' r='15'/>`,
        det: `<ellipse class='f' cx='14.6' cy='16' rx='1.9' ry='2.7'/><path d='M22.6 16.6q2.8-2.4 5.6 0M12.6 23.4Q20 28.6 27.4 23.4M17.6 25.6Q17.8 31.4 20.6 31.4Q23.4 31.4 23.4 25.6'/>`,
      },
      {
        // a apaixonada
        sil: `<circle cx='20' cy='20' r='15'/>`,
        det: `${heartAt(14.4, 16, 0.24, 'f')}${heartAt(25.6, 16, 0.24, 'f')}<path d='M12.4 22.4H27.6Q27 30.4 20 30.4Q13 30.4 12.4 22.4Z'/>`,
      },
      {
        // a de olhinho em X
        sil: `<circle cx='20' cy='20' r='15'/>`,
        det: `<path d='M12.4 13.4l4.2 4.2M16.6 13.4l-4.2 4.2M23.4 13.4l4.2 4.2M27.6 13.4l-4.2 4.2M12.4 26.2q2.6-2.6 5.2 0t5.2 0t5.2 0'/>`,
      },
    ],
    c: SPARKLE,
  },
} satisfies Record<string, Motif>;

export type MorePattern = keyof typeof MORE_MOTIFS;
