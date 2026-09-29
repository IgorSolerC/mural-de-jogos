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
} satisfies Record<string, Motif>;

export type MorePattern = keyof typeof MORE_MOTIFS;
