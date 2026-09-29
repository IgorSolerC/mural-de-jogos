/**
 * As decorações da ficha: coisas de fora coladas, pregadas ou jogadas por cima dela (purpurina,
 * estrelinhas douradas, adesivos, um selo, um clipe, argolas, ilhoses). Ficam por cima de tudo,
 * até da foto, como quem enfeitou a ficha depois de pronta. As argolas e os ilhoses furam o papel.
 * Tudo sai em SVG, em px da ficha, a partir do id e do sorteio: a mesma ficha enfeita sempre igual.
 * Fica fora de `paperArt` de propósito: os desenhos de lá estão congelados.
 */
import { Decor, f1, hash, rng } from './paper';

type Pt = [number, number];

export interface DecorArt {
  /** Os furos no papel (as argolas, os ilhoses): entram na máscara, como os do estrago. */
  cut: string[];
  /** O desenho, por cima de tudo. */
  front: string;
}

export interface DecorInput {
  id: string;
  W: number;
  H: number;
  decor: Decor;
  /** O sorteio da decoração (Review.decorSeed); sem ele, sai só do id. */
  seed?: number;
  /** Um prefixo único para os ids do SVG. */
  uid: string;
}

export function decorArt(input: DecorInput): DecorArt {
  const out: DecorArt = { cut: [], front: '' };
  const { W, H, uid } = input;
  if (W < 20 || H < 20) return out;
  // o tamanho acompanha a ficha, como os estragos: a completa é a referência;
  // nas amostras miúdas do editor não encolhe tanto: um adesivo de 8 px ninguém vê
  const k = Math.max(0.42, Math.min(1.2, Math.sqrt((W * H) / (420 * 300))));
  const r = rng(hash(`${input.id}:enfeite:${input.decor}${input.seed ? `:${input.seed}` : ''}`));
  switch (input.decor) {
    case 'purpurina':
      glitter(W, H, k, r, out);
      break;
    case 'estrelinhas':
      goldStars(W, H, k, r, uid, out);
      break;
    case 'adesivos':
      puffyStickers(W, H, k, r, out);
      break;
    case 'selo':
      stamp(W, H, k, r, uid, out);
      break;
    case 'clipe':
      paperClip(W, H, k, r, uid, out);
      break;
    case 'argolas':
      binderRings(W, H, k, r, uid, out);
      break;
    case 'ilhoses':
      eyelets(W, H, k, r, out);
      break;
  }
  return out;
}

// ===================== Miudezas =====================

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Onde colar um adesivo: perto da beirada (o canto de cima à direita, a lateral direita ou embaixo),
 * longe da foto e do miolo da ficha, e longe dos que já foram colados.
 */
function spot(W: number, H: number, r: () => number, taken: { p: Pt; R: number }[], R: number, margin: number): Pt {
  let p: Pt = [0, 0];
  for (let t = 0; t < 16; t++) {
    const band = Math.floor(r() * 3);
    const along = r(),
      across = r();
    p =
      band === 0
        ? [W * (0.8 + along * 0.16), margin + across * H * 0.1]
        : band === 1
          ? [W - margin - across * W * 0.08, H * (0.15 + along * 0.7)]
          : [W * (0.05 + along * 0.9), H - margin - across * H * 0.1];
    p = [clamp(p[0], margin, W - margin), clamp(p[1], margin, H - margin)];
    if (taken.every((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) > (q.R + R) * 1.05)) break;
  }
  taken.push({ p, R });
  return p;
}

function star(cx: number, cy: number, R: number, ri: number, rot: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = ((rot - 90 + i * 36) * Math.PI) / 180,
      rr = i % 2 ? ri : R;
    d += `${i ? 'L' : 'M'}${f1(cx + rr * Math.cos(a))} ${f1(cy + rr * Math.sin(a))}`;
  }
  return d + 'Z';
}

// ===================== Purpurina =====================

const GLITTER: readonly (readonly string[])[] = [
  ['#f7d774', '#e8b93a', '#fff1b0', '#b8871f', '#ffe38a'],
  ['#f4f6f9', '#c9ced6', '#9aa1ab', '#ffffff', '#dfe3e8'],
  ['#ff9ad5', '#ff5fb4', '#ffd1ea', '#d63d8f', '#ffb8e1'],
  ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f45'],
];

/** Um punhado de purpurina: um montinho num canto e o resto espalhado, uns pontos acendendo. */
function glitter(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const kk = Math.max(0.45, k);
  const cols = GLITTER[Math.floor(r() * GLITTER.length)];
  const corner = Math.floor(r() * 3);
  const c: Pt = corner === 0 ? [W * (0.82 + r() * 0.1), H * (0.14 + r() * 0.12)] : corner === 1 ? [W * (0.8 + r() * 0.12), H * (0.8 + r() * 0.1)] : [W * (0.12 + r() * 0.15), H * (0.84 + r() * 0.08)];
  const heap = (52 + r() * 18) * k;
  let bits = '',
    shine = '';
  const bit = (x: number, y: number) => {
    const s = (1.4 + r() * 1.6) * kk;
    const col = cols[Math.floor(r() * cols.length)];
    // uma pecinha é um quadradinho ou um hexágono, em qualquer ângulo; umas pegam mais luz
    const lit = r();
    const op = lit > 0.9 ? 1 : 0.75 + lit * 0.25;
    // uma ou outra pecinha virada de lado fica escura: é o que faz o montinho brilhar por contraste
    if (lit < 0.14) {
      bits += `<rect x='${f1(x - s / 2)}' y='${f1(y - s / 2)}' width='${f1(s)}' height='${f1(s * 0.6)}' transform='rotate(${Math.round(r() * 90)} ${f1(x)} ${f1(y)})' fill='#000' fill-opacity='.35'/>`;
      return;
    }
    if (r() < 0.5) bits += `<rect x='${f1(x - s / 2)}' y='${f1(y - s / 2)}' width='${f1(s)}' height='${f1(s)}' transform='rotate(${Math.round(r() * 90)} ${f1(x)} ${f1(y)})' fill='${col}' fill-opacity='${op.toFixed(2)}'/>`;
    else {
      let d = '';
      const a0 = r() * Math.PI;
      for (let i = 0; i < 6; i++) d += `${i ? 'L' : 'M'}${f1(x + Math.cos(a0 + (i * Math.PI) / 3) * s * 0.62)} ${f1(y + Math.sin(a0 + (i * Math.PI) / 3) * s * 0.62)}`;
      bits += `<path d='${d}Z' fill='${col}' fill-opacity='${op.toFixed(2)}'/>`;
    }
    if (lit > 0.965) shine += `<path d='M${f1(x - s * 1.8)} ${f1(y)}H${f1(x + s * 1.8)}M${f1(x)} ${f1(y - s * 1.8)}V${f1(y + s * 1.8)}'/>`;
  };
  // o montinho: mais cheio no meio (dois sorteios somados)
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2,
      d = (r() + r()) * 0.5 * heap * (0.2 + r() * 0.8);
    bit(clamp(c[0] + Math.cos(a) * d * 1.25, 2, W - 2), clamp(c[1] + Math.sin(a) * d * 0.8, 2, H - 2));
  }
  // o que escorregou para longe, rareando
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2,
      d = heap * (1 + r() * r() * 5);
    bit(clamp(c[0] + Math.cos(a) * d * 1.4, 2, W - 2), clamp(c[1] + Math.sin(a) * d, 2, H - 2));
  }
  out.front += `<g>${bits}</g><g stroke='#fff' stroke-width='${f1(0.5 * kk)}' stroke-linecap='round' stroke-opacity='.9'>${shine}</g>`;
}

// ===================== Estrelinhas douradas =====================

/** As estrelinhas de professora: três a cinco adesivos de papel laminado, uma ou outra prateada. */
function goldStars(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const n = 3 + Math.floor(r() * 3);
  const taken: { p: Pt; R: number }[] = [];
  let body = '';
  for (let i = 0; i < n; i++) {
    const R = (14 + r() * 6) * k;
    const [x, y] = spot(W, H, r, taken, R, R * 0.9);
    const rot = (r() - 0.5) * 50;
    const d = star(x, y, R, R * 0.46, rot);
    const fill = r() < 0.25 ? `${uid}-prata` : `${uid}-ouro`;
    body +=
      `<path d='${d}' transform='translate(${f1(0.7 * k)} ${f1(1.2 * k)})' fill='#000' fill-opacity='.28'/>` +
      `<path d='${d}' fill='url(#${fill})' stroke='rgb(120 84 20)' stroke-opacity='.45' stroke-width='${f1(0.6 * k)}' stroke-linejoin='round'/>` +
      // o vinco do meio de cada ponta, que o laminado pega luz de um lado só
      `<path d='${star(x, y, R * 0.55, R * 0.25, rot)}' fill='#fff' fill-opacity='.18'/>`;
  }
  out.front +=
    `<defs><linearGradient id='${uid}-ouro' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff4b8'/><stop offset='.35' stop-color='#f3c64a'/><stop offset='.6' stop-color='#c58b17'/><stop offset='.85' stop-color='#f6d56e'/><stop offset='1' stop-color='#a8740f'/></linearGradient>` +
    `<linearGradient id='${uid}-prata' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='.35' stop-color='#cfd5dc'/><stop offset='.6' stop-color='#8e97a2'/><stop offset='.85' stop-color='#e4e8ec'/><stop offset='1' stop-color='#7c8591'/></linearGradient></defs>` +
    body;
}

// ===================== Adesivos fofos =====================

/** Cada adesivo num quadro de 40×40: a silhueta (a borda branca do corte) e o desenho. */
const PUFFY: readonly { sil: string; art: string }[] = [
  {
    // coração
    sil: `<path d='M20 34C12 27.4 6 22.4 6 15.6C6 11 9.4 8 13 8C16 8 18.6 10 20 13C21.4 10 24 8 27 8C30.6 8 34 11 34 15.6C34 22.4 28 27.4 20 34Z'/>`,
    art: `<path d='M20 34C12 27.4 6 22.4 6 15.6C6 11 9.4 8 13 8C16 8 18.6 10 20 13C21.4 10 24 8 27 8C30.6 8 34 11 34 15.6C34 22.4 28 27.4 20 34Z' fill='#ff5c7a'/><path d='M20 31C13.5 25.6 9 21.6 9 16.2' fill='none' stroke='#d93a5a' stroke-width='1.2' stroke-linecap='round' opacity='.5'/>`,
  },
  {
    // carinha feliz
    sil: `<circle cx='20' cy='20' r='14'/>`,
    art: `<circle cx='20' cy='20' r='14' fill='#ffd23f'/><ellipse cx='15.2' cy='17' rx='1.6' ry='2.4' fill='#4a3410'/><ellipse cx='24.8' cy='17' rx='1.6' ry='2.4' fill='#4a3410'/><path d='M13.4 22.6Q20 29.6 26.6 22.6' fill='none' stroke='#4a3410' stroke-width='1.8' stroke-linecap='round'/><circle cx='11.6' cy='22.4' r='2.1' fill='#ff8a5c' fill-opacity='.55'/><circle cx='28.4' cy='22.4' r='2.1' fill='#ff8a5c' fill-opacity='.55'/>`,
  },
  {
    // arco-íris com nuvenzinhas nas pontas
    sil: `<path d='M5 29A15 15 0 0 1 35 29' fill='none' stroke-width='13'/><circle cx='7' cy='30' r='5.4'/><circle cx='33' cy='30' r='5.4'/>`,
    art: `<g fill='none' stroke-width='2.7'><path d='M5 29A15 15 0 0 1 35 29' stroke='#ff5d5d'/><path d='M7.6 29A12.4 12.4 0 0 1 32.4 29' stroke='#ffa53d'/><path d='M10.2 29A9.8 9.8 0 0 1 29.8 29' stroke='#ffd93d'/><path d='M12.8 29A7.2 7.2 0 0 1 27.2 29' stroke='#5ccf7a'/><path d='M15.4 29A4.6 4.6 0 0 1 24.6 29' stroke='#4d96ff'/></g><g fill='#fff'><circle cx='5' cy='31' r='3.4'/><circle cx='8.6' cy='29.4' r='3.8'/><circle cx='10.6' cy='32' r='2.8'/><circle cx='35' cy='31' r='3.4'/><circle cx='31.4' cy='29.4' r='3.8'/><circle cx='29.4' cy='32' r='2.8'/></g>`,
  },
  {
    // raio
    sil: `<path d='M23.5 3.5L10.5 22.4H19L14.6 36.5L29.5 15.8H21.2Z' stroke-linejoin='round'/>`,
    art: `<path d='M23.5 3.5L10.5 22.4H19L14.6 36.5L29.5 15.8H21.2Z' fill='#ffcf2e' stroke='#e79c00' stroke-width='1' stroke-linejoin='round'/>`,
  },
  {
    // nuvenzinha de bochecha
    sil: `<path d='M10.4 29C5.6 29 4 22.2 9.2 20.8C8.8 15 15.6 12.8 19 16.8C21.2 11.6 30.4 11.6 31.6 18.4C37.2 18.6 38.6 28 32.8 29Z'/>`,
    art: `<path d='M10.4 29C5.6 29 4 22.2 9.2 20.8C8.8 15 15.6 12.8 19 16.8C21.2 11.6 30.4 11.6 31.6 18.4C37.2 18.6 38.6 28 32.8 29Z' fill='#bfe3ff'/><circle cx='17' cy='23' r='1.2' fill='#3b4a66'/><circle cx='25' cy='23' r='1.2' fill='#3b4a66'/><path d='M19.4 25.2q1.6 1.4 3.2 0' fill='none' stroke='#3b4a66' stroke-width='1' stroke-linecap='round'/><circle cx='14.2' cy='25.6' r='1.6' fill='#ff8fb1' fill-opacity='.6'/><circle cx='27.8' cy='25.6' r='1.6' fill='#ff8fb1' fill-opacity='.6'/>`,
  },
  {
    // gatinho
    sil: `<path d='M8 13L9.5 4.5Q10 3 11.3 4L17 9Q20 8.3 23 9L28.7 4Q30 3 30.5 4.5L32 13Q35 18 34 24Q32 34 20 34.5Q8 34 6 24Q5 18 8 13Z'/>`,
    art: `<path d='M8 13L9.5 4.5Q10 3 11.3 4L17 9Q20 8.3 23 9L28.7 4Q30 3 30.5 4.5L32 13Q35 18 34 24Q32 34 20 34.5Q8 34 6 24Q5 18 8 13Z' fill='#ffb067'/><path d='M11 7.6L12.2 12.4L15.2 9.8ZM29 7.6L27.8 12.4L24.8 9.8Z' fill='#ff8a8a'/><path d='M13 20q2-2.2 4 0M23 20q2-2.2 4 0' fill='none' stroke='#4a2c14' stroke-width='1.5' stroke-linecap='round'/><path d='M18.6 23.4h2.8l-1.4 1.4z' fill='#4a2c14'/><path d='M20 24.8q-1.2 1.6-2.8.8M20 24.8q1.2 1.6 2.8.8' fill='none' stroke='#4a2c14' stroke-width='1' stroke-linecap='round'/>`,
  },
];

/** Dois ou três adesivos de vinil estufadinhos, com a borda branca do corte e um brilho. */
function puffyStickers(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const n = 2 + Math.floor(r() * 2);
  const taken: { p: Pt; R: number }[] = [];
  const used = new Set<number>();
  let body = '';
  for (let i = 0; i < n; i++) {
    let which = Math.floor(r() * PUFFY.length);
    while (used.has(which)) which = (which + 1) % PUFFY.length;
    used.add(which);
    const size = (50 + r() * 14) * k;
    const [x, y] = spot(W, H, r, taken, size * 0.5, size * 0.42);
    const sc = (size / 40).toFixed(3);
    const at = `translate(${f1(x)} ${f1(y)}) rotate(${f1((r() - 0.5) * 44)}) scale(${sc}) translate(-20 -20)`;
    const s = PUFFY[which];
    body +=
      // a sombra do adesivo, a borda branca do corte, o desenho e o brilho do vinil
      `<g transform='translate(${f1(0.8 * k)} ${f1(1.6 * k)})'><g transform='${at}' fill='#000' stroke='#000' stroke-width='5' stroke-linejoin='round' opacity='.22'>${s.sil}</g></g>` +
      `<g transform='${at}'><g fill='#fff' stroke='#fff' stroke-width='5' stroke-linejoin='round'>${s.sil}</g>${s.art}<ellipse cx='14' cy='12' rx='5' ry='2.6' transform='rotate(-30 14 12)' fill='#fff' fill-opacity='.45'/></g>`;
  }
  out.front += body;
}

// ===================== Selo =====================

const STAMP_INK = ['#2f6f9f', '#b8452f', '#3d7a4a', '#7a4a9a', '#c28a1a'];

/** Um selo de carta colado num canto, com o picote em volta, um desenhinho e o carimbo do correio. */
function stamp(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const w = 56 * k,
    h = 68 * k;
  const corner = Math.floor(r() * 3);
  const x = corner === 2 ? W * 0.08 + w / 2 : W - w / 2 - (10 + r() * 8) * k;
  const y = corner === 0 ? h / 2 + (10 + r() * 8) * k : H - h / 2 - (10 + r() * 8) * k;
  const rot = (r() - 0.5) * 16;
  const ink = STAMP_INK[Math.floor(r() * STAMP_INK.length)];
  // o picote: bolinhas tiradas da beirada, por uma máscara
  const hole = 2.2 * k,
    pitch = 5.6 * k;
  let bites = '';
  for (let u = -w / 2; u <= w / 2 + 0.1; u += w / Math.round(w / pitch)) bites += `<circle cx='${f1(u)}' cy='${f1(-h / 2)}' r='${f1(hole)}'/><circle cx='${f1(u)}' cy='${f1(h / 2)}' r='${f1(hole)}'/>`;
  for (let v = -h / 2; v <= h / 2 + 0.1; v += h / Math.round(h / pitch)) bites += `<circle cx='${f1(-w / 2)}' cy='${f1(v)}' r='${f1(hole)}'/><circle cx='${f1(w / 2)}' cy='${f1(v)}' r='${f1(hole)}'/>`;
  const box = `x='${f1(-w / 2)}' y='${f1(-h / 2)}' width='${f1(w)}' height='${f1(h)}'`;
  const m = 5 * k;
  const iw = w - m * 2,
    ih = h - m * 2;
  // o desenho do selo: um morro com o sol, ou um coração, ou um avião de papel
  const pic = Math.floor(r() * 3);
  const s = iw / 40;
  const art =
    pic === 0
      ? `<circle cx='28' cy='14' r='5' fill='#fff' fill-opacity='.85'/><path d='M0 40L12 22L20 30L28 20L40 34V40Z' fill='#fff' fill-opacity='.9'/>`
      : pic === 1
        ? `<path d='M20 34C12 27.4 6 22.4 6 15.6C6 11 9.4 8 13 8C16 8 18.6 10 20 13C21.4 10 24 8 27 8C30.6 8 34 11 34 15.6C34 22.4 28 27.4 20 34Z' fill='#fff' fill-opacity='.9'/>`
        : `<path d='M4 22L36 8L24 34L19 25Z' fill='#fff' fill-opacity='.9'/><path d='M19 25L36 8' stroke='${ink}' stroke-width='1.2'/>`;
  const face =
    `<rect x='${f1(-iw / 2)}' y='${f1(-ih / 2)}' width='${f1(iw)}' height='${f1(ih)}' fill='${ink}'/>` +
    `<g transform='translate(${f1(-iw / 2)} ${f1(-ih / 2 + (ih - iw) * 0.25)}) scale(${s.toFixed(3)})'>${art}</g>` +
    `<text x='${f1(iw / 2 - 2 * k)}' y='${f1(ih / 2 - 2.5 * k)}' text-anchor='end' fill='#fff' style='font:800 ${f1(8 * k)}px var(--f-label, sans-serif)'>${1 + Math.floor(r() * 9)},${r() < 0.5 ? '00' : '50'}</text>`;
  // o carimbo do correio: um círculo e as ondinhas, passando para fora do selo
  const px = (r() < 0.5 ? -1 : 1) * w * 0.35,
    py = (r() - 0.5) * h * 0.3,
    pr = 13 * k;
  let waves = '';
  for (let j = 0; j < 4; j++) {
    const yy = py - 6 * k + j * 4 * k;
    waves += `<path d='M${f1(px + pr * 0.9)} ${f1(yy)}q${f1(4 * k)} ${f1(-2.4 * k)} ${f1(8 * k)} 0t${f1(8 * k)} 0t${f1(8 * k)} 0t${f1(8 * k)} 0'/>`;
  }
  const flip = px < 0 ? `scale(-1 1)` : '';
  const postmark = `<g fill='none' stroke='rgb(40 40 48)' stroke-opacity='.6' stroke-width='${f1(1.1 * k)}'><circle cx='${f1(px)}' cy='${f1(py)}' r='${f1(pr)}'/><circle cx='${f1(px)}' cy='${f1(py)}' r='${f1(pr - 2.6 * k)}' stroke-width='${f1(0.6 * k)}'/><g transform='${flip}'>${waves}</g></g>`;
  out.front +=
    `<defs><mask id='${uid}-picote' maskUnits='userSpaceOnUse' x='${f1(-w)}' y='${f1(-h)}' width='${f1(w * 2)}' height='${f1(h * 2)}'><rect ${box} fill='#fff'/><g fill='#000'>${bites}</g></mask></defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})'>` +
    `<g mask='url(#${uid}-picote)'><rect ${box} transform='translate(${f1(0.8 * k)} ${f1(1.4 * k)})' fill='#000' fill-opacity='.25'/><rect ${box} fill='#fbf7ee'/>${face}</g>` +
    postmark +
    `</g>`;
}

// ===================== Clipe =====================

/** Um clipe de metal prendendo a beirada de cima ou a da direita; a volta de trás só aparece fora do papel. */
function paperClip(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const top = r() < 0.6;
  const x = top ? W * (0.6 + r() * 0.28) : W;
  const y = top ? 0 : H * (0.3 + r() * 0.45);
  // de fora para dentro do papel: no de cima, para baixo; no da direita, para a esquerda
  const rot = (top ? 0 : 90) + (r() - 0.5) * 14;
  const s = (2 + r() * 0.3) * k;
  const colors = r() < 0.7 ? ['#8b939c', '#eef1f4'] : [['#e2566b', '#ffc2cc'], ['#3f8fd9', '#bfe0ff'], ['#f2b631', '#fff0b8']][Math.floor(r() * 3)];
  // o arame: a volta de dentro (de trás), a de fora (da frente) e a pontinha de trás
  const back = `M-1.8 18V2A2.9 2.9 0 0 1 4 2`;
  const front = `M4 2V30A4 4 0 0 1 -4 30V-6A3.4 3.4 0 0 1 2.8 -6`;
  const tail = `M2.8 -6V14`;
  const wire = (d: string, extra = '') =>
    `<path d='${d}' stroke='${colors[0]}' stroke-width='1.5'${extra}/><path d='${d}' transform='translate(-.35 -.35)' stroke='${colors[1]}' stroke-width='.55' stroke-opacity='.9'${extra}/>`;
  const outside = ` clip-path='url(#${uid}-fora)'`;
  out.front +=
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${s.toFixed(3)})' fill='none' stroke-linecap='round'>` +
    `<defs><clipPath id='${uid}-fora' clipPathUnits='userSpaceOnUse'><rect x='-20' y='-40' width='40' height='40'/></clipPath></defs>` +
    wire(back, outside) +
    wire(tail, outside) +
    `<path d='${front}' transform='translate(.8 1.2)' stroke='#000' stroke-opacity='.25' stroke-width='1.6'/>` +
    wire(front) +
    `</g>`;
}

// ===================== Argolas =====================

/** Duas ou três argolas de fichário passando por furos perto da beirada de cima, com ou sem o reforço. */
function binderRings(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const n = r() < 0.5 ? 2 : 3;
  const xs = n === 2 ? [0.22, 0.78] : [0.16, 0.36, 0.84];
  const hy = (10 + r() * 3) * k;
  const R = (15 + r() * 3) * k;
  const rx = R * 0.42;
  const reinforce = r() < 0.5;
  const metal = r() < 0.7 ? ['#7b828a', '#eef1f4', '#4b5159'] : ['#b08d57', '#f7e2b0', '#6f5427'];
  let body = '';
  for (const fx of xs) {
    const hx = W * fx + (r() - 0.5) * 6 * k;
    out.cut.push(`M${f1(hx - 3 * k)} ${f1(hy)}a${f1(3 * k)} ${f1(3 * k)} 0 1 0 ${f1(6 * k)} 0a${f1(3 * k)} ${f1(3 * k)} 0 1 0 ${f1(-6 * k)} 0Z`);
    if (reinforce)
      body += `<circle cx='${f1(hx)}' cy='${f1(hy)}' r='${f1(5.2 * k)}' fill='none' stroke='#fdfdf8' stroke-opacity='.92' stroke-width='${f1(4 * k)}'/><circle cx='${f1(hx)}' cy='${f1(hy)}' r='${f1(7.2 * k)}' fill='none' stroke='#000' stroke-opacity='.1' stroke-width='${f1(0.6 * k)}'/>`;
    // o anel de pé, visto um pouco de lado: a metade da frente inteira, a de trás só fora do papel
    const cy = hy - R;
    const half = (from: number, to: number) => {
      let d = '';
      for (let i = 0; i <= 24; i++) {
        const a = from + ((to - from) * i) / 24;
        d += `${i ? 'L' : 'M'}${f1(hx + Math.cos(a) * rx)} ${f1(cy + Math.sin(a) * R)}`;
      }
      return d;
    };
    const frontD = half(-Math.PI / 2, Math.PI / 2),
      backD = half(Math.PI / 2, (Math.PI * 3) / 2);
    body +=
      `<path d='${backD}' stroke='${metal[2]}' stroke-width='${f1(3.2 * k)}' clip-path='url(#${uid}-fora)'/>` +
      `<path d='${frontD}' transform='translate(${f1(1 * k)} ${f1(1.5 * k)})' stroke='#000' stroke-opacity='.28' stroke-width='${f1(2.6 * k)}'/>` +
      `<path d='${frontD}' stroke='${metal[0]}' stroke-width='${f1(3.4 * k)}'/>` +
      `<path d='${frontD}' transform='translate(${f1(-0.7 * k)} 0)' stroke='${metal[1]}' stroke-opacity='.85' stroke-width='${f1(1.1 * k)}'/>`;
  }
  out.front +=
    `<defs><clipPath id='${uid}-fora' clipPathUnits='userSpaceOnUse'><rect x='-20' y='${f1(-H)}' width='${f1(W + 40)}' height='${f1(H)}'/></clipPath></defs>` +
    `<g fill='none' stroke-linecap='round'>${body}</g>`;
}

// ===================== Ilhoses =====================

const EYELET: readonly (readonly string[])[] = [
  ['#b08d57', '#f7e2b0', '#6f5427'],
  ['#8b939c', '#f2f4f7', '#4b5159'],
  ['#b0643a', '#f6c29a', '#6b3419'],
  ['#2b2b2e', '#8a8a92', '#111'],
];

/** Os ilhoses de metal nos quatro cantos, cravados no papel, cada um com o seu furo. */
function eyelets(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const kk = Math.max(0.45, k);
  const m = 12 * kk;
  const [base, light, dark] = EYELET[Math.floor(r() * EYELET.length)];
  let body = '';
  for (const [x, y] of [
    [m, m],
    [W - m, m],
    [W - m, H - m],
    [m, H - m],
  ] as Pt[]) {
    const cx = x + (r() - 0.5) * 1.2 * kk,
      cy = y + (r() - 0.5) * 1.2 * kk;
    out.cut.push(`M${f1(cx - 3.2 * kk)} ${f1(cy)}a${f1(3.2 * kk)} ${f1(3.2 * kk)} 0 1 0 ${f1(6.4 * kk)} 0a${f1(3.2 * kk)} ${f1(3.2 * kk)} 0 1 0 ${f1(-6.4 * kk)} 0Z`);
    const ring = (dx: number, dy: number, stroke: string, width: number, op = 1, rr = 5.6) =>
      `<circle cx='${f1(cx + dx)}' cy='${f1(cy + dy)}' r='${f1(rr * kk)}' stroke='${stroke}' stroke-opacity='${op}' stroke-width='${f1(width * kk)}'/>`;
    body +=
      ring(0.7 * kk, 1.2 * kk, '#000', 4.6, 0.3) +
      ring(0, 0, base, 4.6) +
      // a luz de cima à esquerda na borda do metal, e o vinco escuro de dentro
      `<path d='M${f1(cx - 5.6 * kk)} ${f1(cy)}A${f1(5.6 * kk)} ${f1(5.6 * kk)} 0 0 1 ${f1(cx)} ${f1(cy - 5.6 * kk)}' stroke='${light}' stroke-opacity='.9' stroke-width='${f1(1.5 * kk)}'/>` +
      ring(0, 0, dark, 0.8, 0.8, 3.4) +
      ring(0, 0, dark, 0.6, 0.5, 7.9);
  }
  out.front += `<g fill='none' stroke-linecap='round'>${body}</g>`;
}
