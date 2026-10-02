/**
 * As decorações da ficha: coisas de fora coladas, pregadas ou jogadas por cima dela (purpurina,
 * adesivos, um selo, um clipe, argolas, moedas, neve…). Ficam por cima de tudo, até da foto, como quem
 * enfeitou a ficha depois de pronta; o que foi jogado nela antes (a purpurina, o confete) fica por baixo
 * da foto, da nota e dos adesivos de bônus. As argolas, os ilhoses e o alfinete furam o papel.
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
  /**
   * O que fica por cima do que está escrito mas por baixo da foto, da nota e dos adesivos de bônus
   * (a purpurina, o confete). Só existe quando tem algo.
   */
  under?: string;
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
    case 'confete':
      confetti(W, H, k, r, out);
      break;
    case 'neon':
      neon(W, H, k, r, uid, out);
      break;
    case 'gamer':
      puffyStickers(W, H, k, r, out, GAMER);
      break;
    case 'bottons':
      pinButtons(W, H, k, r, uid, out);
      break;
    case 'vidas':
      lifeHearts(W, H, k, r, out);
      break;
    case 'postit':
      postIt(W, H, k, r, uid, out);
      break;
    case 'ingresso':
      ticket(W, H, k, r, uid, out);
      break;
    case 'promocao':
      saleTag(W, H, k, r, uid, out);
      break;
    case 'carimbo':
      rubberStamp(W, H, k, r, uid, out);
      break;
    case 'medalha':
      rosette(W, H, k, r, uid, out);
      break;
    case 'lacre':
      waxSeal(W, H, k, r, uid, out);
      break;
    case 'grampos':
      staples(W, H, k, r, out);
      break;
    case 'alfinete':
      safetyPin(W, H, k, r, out);
      break;
    case 'curativo':
      bandage(W, H, k, r, uid, out);
      break;
    case 'cuidado':
      cautionTape(W, H, k, r, uid, out);
      break;
    case 'neve':
      snow(W, H, k, r, out);
      break;
    case 'petalas':
      petals(W, H, k, r, uid, out);
      break;
    case 'teia':
      spiderWeb(W, H, k, r, uid, out);
      break;
    case 'beijo':
      kiss(W, H, k, r, uid, out);
      break;
    case 'antena':
      tvAntenna(W, H, k, r, uid, out);
      break;
    case 'crt':
      crtFilter(W, H, k, r, uid, out);
      break;
    case 'barras':
      colorBars(W, H, k, r, uid, out);
      break;
    case 'disquete':
      floppyDisk(W, H, k, r, uid, out);
      break;
    case 'erro':
      errorWindow(W, H, k, r, uid, out);
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

/** A cor entre `a` e `b` (hex de seis dígitos), `t` de 0 a 1. */
function mix(a: string, b: string, t: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * clamp(t, 0, 1)).toString(16).padStart(2, '0')).join('')}`;
}

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
  ['#f7d774', '#e8b93a', '#fff1b0', '#b8871f', '#ffe38a', '#c9951c', '#a8740f'],
  ['#f4f6f9', '#c9ced6', '#9aa1ab', '#ffffff', '#dfe3e8'],
  ['#ff9ad5', '#ff5fb4', '#ffd1ea', '#d63d8f', '#ffb8e1'],
  ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f45'],
];

/**
 * Purpurina fina, de glitter: grãozinhos de todas as cores do pote, alguns virados de lado (escuros)
 * e umas faíscas acendendo, das quais algumas piscam. Ou num montinho num canto, com o resto
 * escorregando para longe, ou espalhada por igual pela ficha inteira.
 */
function glitter(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const kk = Math.max(0.45, k);
  const cols = GLITTER[Math.floor(r() * GLITTER.length)];
  const spread = r() < 0.45;
  let bits = '',
    shine = '';
  const bit = (x: number, y: number) => {
    const s = (0.55 + r() * 0.8) * kk;
    const col = cols[Math.floor(r() * cols.length)];
    const lit = r();
    // uma ou outra virada de lado fica escura: é o que faz o resto brilhar por contraste
    if (lit < 0.12) {
      bits += `<rect x='${f1(x - s / 2)}' y='${f1(y - s / 2)}' width='${f1(s)}' height='${f1(s * 0.6)}' fill='#000' fill-opacity='.35'/>`;
      return;
    }
    const op = lit > 0.85 ? 1 : 0.7 + lit * 0.3;
    bits += `<rect x='${f1(x - s / 2)}' y='${f1(y - s / 2)}' width='${f1(s)}' height='${f1(s)}' transform='rotate(${Math.round(r() * 90)} ${f1(x)} ${f1(y)})' fill='${col}' fill-opacity='${op.toFixed(2)}'/>`;
    // a faísca: uma estrelinha de quatro pontas com um halo; umas piscam (a camada anima a classe)
    if (lit > 0.95) {
      const L = (1.8 + r() * 2.6) * kk;
      const glint = `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(L * 0.55)}' fill-opacity='.35'/><path d='M${f1(x)} ${f1(y - L)}Q${f1(x)} ${f1(y)} ${f1(x + L)} ${f1(y)}Q${f1(x)} ${f1(y)} ${f1(x)} ${f1(y + L)}Q${f1(x)} ${f1(y)} ${f1(x - L)} ${f1(y)}Q${f1(x)} ${f1(y)} ${f1(x)} ${f1(y - L)}Z'/>`;
      shine += r() < 0.5 ? `<g class='pisca' style='animation-delay:-${(r() * 3).toFixed(2)}s'>${glint}</g>` : glint;
    }
  };
  if (spread) {
    // espalhada por igual, da beirada à beirada
    for (let i = 0; i < 1100; i++) bit(2 + r() * (W - 4), 2 + r() * (H - 4));
  } else {
    const corner = Math.floor(r() * 3);
    const c: Pt = corner === 0 ? [W * (0.82 + r() * 0.1), H * (0.14 + r() * 0.12)] : corner === 1 ? [W * (0.8 + r() * 0.12), H * (0.8 + r() * 0.1)] : [W * (0.12 + r() * 0.15), H * (0.84 + r() * 0.08)];
    const heap = (52 + r() * 18) * k;
    // o montinho: mais cheio no meio (dois sorteios somados)
    for (let i = 0; i < 760; i++) {
      const a = r() * Math.PI * 2,
        d = (r() + r()) * 0.5 * heap * (0.2 + r() * 0.8);
      bit(clamp(c[0] + Math.cos(a) * d * 1.25, 2, W - 2), clamp(c[1] + Math.sin(a) * d * 0.8, 2, H - 2));
    }
    // o que escorregou para longe, rareando
    for (let i = 0; i < 240; i++) {
      const a = r() * Math.PI * 2,
        d = heap * (1 + r() * r() * 5);
      bit(clamp(c[0] + Math.cos(a) * d * 1.4, 2, W - 2), clamp(c[1] + Math.sin(a) * d, 2, H - 2));
    }
  }
  out.under = (out.under ?? '') + `<g>${bits}</g><g fill='#fff'>${shine}</g>`;
}

// ===================== Estrelinhas douradas =====================

/** O laminado das estrelinhas: [claro, meio, escuro]. Quase sempre ouro; às vezes prata ou uma cor. */
const FOIL: readonly (readonly [string, string, string])[] = [
  ['#fff1a6', '#f2c230', '#9c6a08'],
  ['#ffffff', '#c9cfd6', '#747d88'],
  ['#ffb0b0', '#e8323f', '#8e1119'],
  ['#b3dcff', '#2f7de0', '#123f86'],
  ['#b5f3bd', '#2fae4e', '#115f27'],
];

/**
 * As estrelinhas de professora: três a cinco adesivos de papel laminado em relevo. Cada ponta tem
 * duas facetas, uma pegando a luz de cima à esquerda e a outra na sombra, como a estrela prensada de
 * verdade; as pontas são arredondadas e uma ou outra tem um brilho.
 */
function goldStars(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const n = 3 + Math.floor(r() * 3);
  const taken: { p: Pt; R: number }[] = [];
  const light = (-135 * Math.PI) / 180;
  let shadow = '',
    body = '';
  for (let i = 0; i < n; i++) {
    const R = (13 + r() * 8) * k;
    const [x, y] = spot(W, H, r, taken, R, R * 0.9);
    const rot = (r() - 0.5) * 50;
    const pick = r();
    const [hi, mid, lo] = FOIL[pick < 0.62 ? 0 : pick < 0.8 ? 1 : 2 + Math.floor(r() * 3)];
    const at = (deg: number, rr: number): Pt => [x + Math.cos((deg * Math.PI) / 180) * rr, y + Math.sin((deg * Math.PI) / 180) * rr];
    const ri = R * 0.46;
    const outline = star(x, y, R, ri, rot);
    let facets = '';
    for (let j = 0; j < 5; j++) {
      const tipA = rot - 90 + j * 72;
      const T = at(tipA, R),
        L = at(tipA - 36, ri),
        Rr = at(tipA + 36, ri);
      // quanto cada faceta encara a luz: a do lado de lá da ponta fica na sombra
      for (const [side, P] of [
        [-1, L],
        [1, Rr],
      ] as [number, Pt][]) {
        const face = ((tipA + side * 54) * Math.PI) / 180;
        const lit = (Math.cos(face - light) + 1) / 2;
        const col = lit > 0.5 ? mix(mid, hi, (lit - 0.5) * 2) : mix(lo, mid, lit * 2);
        facets += `<path d='M${f1(x)} ${f1(y)}L${f1(P[0])} ${f1(P[1])}L${f1(T[0])} ${f1(T[1])}Z' fill='${col}'/>`;
      }
    }
    shadow += `<path d='${outline}' transform='translate(${f1(0.9 * k)} ${f1(1.6 * k)})'/>`;
    body +=
      // o miolo com a mesma cor por baixo, arredondando as pontas
      `<path d='${outline}' fill='${mid}' stroke='${mid}' stroke-width='${f1(1.6 * k)}' stroke-linejoin='round'/>` +
      facets +
      `<path d='${outline}' fill='url(#${uid}-folha)' stroke='${lo}' stroke-opacity='.5' stroke-width='${f1(0.5 * k)}' stroke-linejoin='round'/>`;
    if (r() < 0.6) {
      const [gx, gy] = at(rot - 90 - 72, R * 0.62);
      const g = R * 0.28;
      body += `<path d='M${f1(gx)} ${f1(gy - g)}Q${f1(gx)} ${f1(gy)} ${f1(gx + g)} ${f1(gy)}Q${f1(gx)} ${f1(gy)} ${f1(gx)} ${f1(gy + g)}Q${f1(gx)} ${f1(gy)} ${f1(gx - g)} ${f1(gy)}Q${f1(gx)} ${f1(gy)} ${f1(gx)} ${f1(gy - g)}Z' fill='#fff' fill-opacity='.9'/>`;
    }
  }
  out.front +=
    `<defs><linearGradient id='${uid}-folha' x1='0' y1='0' x2='1' y2='1'><stop offset='.2' stop-color='#fff' stop-opacity='0'/><stop offset='.42' stop-color='#fff' stop-opacity='.28'/><stop offset='.55' stop-color='#fff' stop-opacity='0'/></linearGradient>` +
    `<filter id='${uid}-sombra-estrela' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='${f1(1 * k)}'/></filter></defs>` +
    `<g fill='#000' opacity='.35' filter='url(#${uid}-sombra-estrela)'>${shadow}</g>` +
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

/** Um, dois ou três adesivos de vinil estufadinhos, com a borda branca do corte e um brilho. */
function puffyStickers(W: number, H: number, k: number, r: () => number, out: DecorArt, set: readonly { sil: string; art: string }[] = PUFFY): void {
  // metade das vezes, um adesivo só (e maiorzinho)
  const n = r() < 0.5 ? 1 : 2 + Math.floor(r() * 2);
  const taken: { p: Pt; R: number }[] = [];
  const used = new Set<number>();
  let body = '';
  for (let i = 0; i < n; i++) {
    let which = Math.floor(r() * set.length);
    while (used.has(which)) which = (which + 1) % set.length;
    used.add(which);
    const size = (n === 1 ? 60 : 50) * k + r() * 14 * k;
    const [x, y] = spot(W, H, r, taken, size * 0.5, size * 0.42);
    const sc = (size / 40).toFixed(3);
    const at = `translate(${f1(x)} ${f1(y)}) rotate(${f1((r() - 0.5) * 44)}) scale(${sc}) translate(-20 -20)`;
    const s = set[which];
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

// ===================== A segunda leva (2026-09-29) =====================

/** Uma sombra macia debaixo do que foi colado: o mesmo desenho, preto, um pouco deslocado. */
function lift(body: string, k: number, dx = 0.8, dy = 1.4, op = 0.25): string {
  return `<g transform='translate(${f1(dx * k)} ${f1(dy * k)})' opacity='${op}'>${body}</g>`;
}

/** Um canto qualquer menos o da foto: 0 em cima à direita, 1 embaixo à direita, 2 embaixo à esquerda. */
function cornerAt(W: number, H: number, c: number, u: number, v: number): Pt {
  return c === 0 ? [W - u, v] : c === 1 ? [W - u, H - v] : [u, H - v];
}

/** A erosão da tinta de carimbo (e do batom): pontinhos que a tinta não pegou. */
function inkFilter(id: string, seed: number, freq: number): string {
  return `<filter id='${id}' x='-10%' y='-10%' width='120%' height='120%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' seed='${seed}' result='n'/><feColorMatrix in='n' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 4.4' result='m'/><feComposite in='SourceGraphic' in2='m' operator='in'/></filter>`;
}

// ----- Confete -----

const CONFETTI = ['#ff5d8f', '#ffd23f', '#4dc3ff', '#5ee07a', '#b07cff', '#ff9f45', '#ffffff'];

/** Confete de festa: papeizinhos e bolinhas de todas as cores, e duas ou três serpentinas enroladas. */
function confetti(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  let bits = '';
  const n = 80 + Math.floor(r() * 40);
  for (let i = 0; i < n; i++) {
    const x = 3 + r() * (W - 6),
      y = 3 + r() * (H - 6);
    const col = CONFETTI[Math.floor(r() * CONFETTI.length)];
    if (r() < 0.62) {
      const w = (3.8 + r() * 2.2) * k,
        h = (7 + r() * 4) * k;
      // o papelzinho meio virado: mais estreito, um lado mais escuro
      const tilt = 0.35 + r() * 0.65;
      bits += `<rect x='${f1(x - (w * tilt) / 2)}' y='${f1(y - h / 2)}' width='${f1(w * tilt)}' height='${f1(h)}' transform='rotate(${Math.round(r() * 180)} ${f1(x)} ${f1(y)})' fill='${col}'/>`;
    } else bits += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1((2.2 + r() * 1.6) * k)}' fill='${col}'/>`;
  }
  let curls = '';
  const m = 2 + Math.floor(r() * 2);
  for (let j = 0; j < m; j++) {
    const x0 = W * (0.3 + r() * 0.65),
      y0 = H * (0.1 + r() * 0.8);
    const a = r() * Math.PI * 2;
    const L = (60 + r() * 50) * k,
      A = (4 + r() * 3) * k,
      turns = 3 + r() * 3;
    const pts: Pt[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60,
        w = t * turns * Math.PI * 2;
      const along = t * L + Math.cos(w) * A * 0.8,
        side = Math.sin(w) * A;
      pts.push([x0 + Math.cos(a) * along - Math.sin(a) * side, y0 + Math.sin(a) * along + Math.cos(a) * side]);
    }
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');
    curls += `<path d='${d}' stroke='${CONFETTI[Math.floor(r() * 6)]}' stroke-width='${f1(2.2 * k)}'/>`;
  }
  const art = `<g>${bits}</g><g fill='none' stroke-linecap='round' stroke-linejoin='round'>${curls}</g>`;
  out.under = (out.under ?? '') + lift(art.replace(/fill='#[0-9a-f]+'/g, "fill='#000'").replace(/stroke='#[0-9a-f]+'/g, "stroke='#000'"), k, 0.6, 1, 0.22) + art;
}

// ----- Néon -----

const NEON: readonly (readonly [string, string])[] = [
  ['#ff3fd1', '#ffe0f7'],
  ['#34f5ff', '#e0feff'],
  ['#b6ff3a', '#f3ffd9'],
  ['#ff8a2a', '#ffe6cf'],
];

/** Um tubo de néon contornando a ficha, com um vão, e um letreirinho aceso num canto, na outra cor. */
function neon(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const i = Math.floor(r() * NEON.length);
  const [c1, core1] = NEON[i];
  const [c2, core2] = NEON[(i + 1 + Math.floor(r() * (NEON.length - 1))) % NEON.length];
  const m = (8 + r() * 3) * k,
    rx = 10 * k;
  const gap = 4 + r() * 5;
  const frame = `<rect x='${f1(m)}' y='${f1(m)}' width='${f1(W - m * 2)}' height='${f1(H - m * 2)}' rx='${f1(rx)}' pathLength='100' stroke-dasharray='${f1(100 - gap)} ${f1(gap)}' stroke-dashoffset='${f1(r() * 100)}'/>`;
  // `ws`: o letreiro vai dentro de um grupo escalado; o traço desfaz a escala para sair da mesma grossura
  const tube = (shape: string, col: string, core: string, ws = 1) =>
    `<g stroke='${col}' stroke-width='${f1(6 * k * ws)}' opacity='.4' filter='url(#${uid}-brilho)'>${shape}</g>` +
    `<g stroke='${col}' stroke-width='${f1(2.8 * k * ws)}' opacity='.9' filter='url(#${uid}-halo)'>${shape}</g>` +
    `<g stroke='${core}' stroke-width='${f1(1.2 * k * ws)}'>${shape}</g>`;
  // o letreiro: um coração, um raio ou uma estrela, num canto de baixo ou em cima à direita
  const which = Math.floor(r() * 3);
  const size = (34 + r() * 10) * k;
  const [sx, sy] = cornerAt(W, H, Math.floor(r() * 3), m + size * 0.75, m + size * 0.75);
  const sign =
    which === 0
      ? `<path d='M20 34C12 27.4 6 22.4 6 15.6C6 11 9.4 8 13 8C16 8 18.6 10 20 13C21.4 10 24 8 27 8C30.6 8 34 11 34 15.6C34 22.4 28 27.4 20 34Z'/>`
      : which === 1
        ? `<path d='M23.5 3.5L10.5 22.4H19L14.6 36.5L29.5 15.8H21.2Z'/>`
        : `<path d='${star(20, 21, 16, 7, 0)}'/>`;
  const f = (id: string, sd: number) =>
    `<filter id='${uid}-${id}' filterUnits='userSpaceOnUse' x='-20' y='-20' width='${f1(W + 40)}' height='${f1(H + 40)}'><feGaussianBlur stdDeviation='${f1(sd * k)}'/></filter>`;
  out.front +=
    `<defs>${f('brilho', 3.2)}${f('halo', 1.1)}</defs><g fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    tube(frame, c1, core1) +
    `<g transform='translate(${f1(sx)} ${f1(sy)}) rotate(${f1((r() - 0.5) * 20)}) scale(${(size / 40).toFixed(3)}) translate(-20 -20)'>${tube(sign, c2, core2, 40 / size)}</g>` +
    `</g>`;
}

// ----- Adesivos gamer -----

const GAMER: readonly { sil: string; art: string }[] = [
  {
    // controle
    sil: `<path d='M9 13H31C36 13 38.5 18 38.5 23.5C38.5 29 36 31.5 33 31.5C30.5 31.5 29 29.5 27.5 27.5H12.5C11 29.5 9.5 31.5 7 31.5C4 31.5 1.5 29 1.5 23.5C1.5 18 4 13 9 13Z'/>`,
    art: `<path d='M9 13H31C36 13 38.5 18 38.5 23.5C38.5 29 36 31.5 33 31.5C30.5 31.5 29 29.5 27.5 27.5H12.5C11 29.5 9.5 31.5 7 31.5C4 31.5 1.5 29 1.5 23.5C1.5 18 4 13 9 13Z' fill='#4a4f5c'/><path d='M8.2 17.6h3.6v2.6h2.6v3.6h-2.6v2.6H8.2v-2.6H5.6v-3.6h2.6Z' fill='#1f2229'/><circle cx='28.5' cy='18.6' r='1.8' fill='#ff5c5c'/><circle cx='32.4' cy='22' r='1.8' fill='#ffd23f'/><circle cx='28.5' cy='25.4' r='1.8' fill='#5ee07a'/><circle cx='24.6' cy='22' r='1.8' fill='#4dc3ff'/><path d='M17 20.6h2.4M21 20.6h2.4' stroke='#1f2229' stroke-width='1.2' stroke-linecap='round'/>`,
  },
  {
    // cogumelo de vida extra
    sil: `<path d='M5 22C5 12 12 6 20 6C28 6 35 12 35 22C33 23 30 23.4 28 23.4C28.4 27.4 27.8 31 26 34H14C12.2 31 11.6 27.4 12 23.4C10 23.4 7 23 5 22Z'/>`,
    art: `<path d='M12 22.5C11.5 27 12 31 14 34H26C28 31 28.5 27 28 22.5Z' fill='#fbe9c8'/><path d='M5 22C5 12 12 6 20 6C28 6 35 12 35 22C30 24 10 24 5 22Z' fill='#3ec45a'/><circle cx='20' cy='11.4' r='3.6' fill='#fff'/><circle cx='10.6' cy='17.2' r='2.6' fill='#fff'/><circle cx='29.4' cy='17.2' r='2.6' fill='#fff'/><ellipse cx='17' cy='27.6' rx='1.2' ry='2.2' fill='#2b2b2b'/><ellipse cx='23' cy='27.6' rx='1.2' ry='2.2' fill='#2b2b2b'/>`,
  },
  {
    // fantasminha de labirinto
    sil: `<path d='M8 34V18C8 11 13.5 6 20 6C26.5 6 32 11 32 18V34L28 30L24 34L20 30L16 34L12 30Z' stroke-linejoin='round'/>`,
    art: `<path d='M8 34V18C8 11 13.5 6 20 6C26.5 6 32 11 32 18V34L28 30L24 34L20 30L16 34L12 30Z' fill='#ff4d4d'/><ellipse cx='15.4' cy='18' rx='3' ry='3.6' fill='#fff'/><ellipse cx='24.6' cy='18' rx='3' ry='3.6' fill='#fff'/><circle cx='16.6' cy='19' r='1.6' fill='#2d58b8'/><circle cx='25.8' cy='19' r='1.6' fill='#2d58b8'/>`,
  },
  {
    // a estrela da invencibilidade
    sil: `<path d='${star(20, 21, 17, 8, 0)}' stroke-linejoin='round'/>`,
    art: `<path d='${star(20, 21, 17, 8, 0)}' fill='#ffd23f' stroke='#e8a600' stroke-width='1' stroke-linejoin='round'/><ellipse cx='17' cy='20' rx='1.3' ry='2.6' fill='#2b2b2b'/><ellipse cx='23' cy='20' rx='1.3' ry='2.6' fill='#2b2b2b'/>`,
  },
  {
    // o dado de vinte faces
    sil: `<path d='M20 3.5L34.5 11.8V28.2L20 36.5L5.5 28.2V11.8Z' stroke-linejoin='round'/>`,
    art: `<path d='M20 3.5L34.5 11.8V28.2L20 36.5L5.5 28.2V11.8Z' fill='#7a5cff'/><path d='M20 10.5L29 26H11Z' fill='#9d88ff'/><path d='M20 3.5V10.5M34.5 11.8L29 26M5.5 11.8L11 26M20 36.5L29 26M20 36.5L11 26M34.5 28.2L29 26M5.5 28.2L11 26M5.5 11.8L20 10.5L34.5 11.8' stroke='#5a3fd6' stroke-width='.9' fill='none'/><text x='20' y='23.4' text-anchor='middle' fill='#fff' style='font:800 7px var(--f-label, sans-serif)'>20</text>`,
  },
  {
    // cartucho
    sil: `<path d='M9 5H31V11H33V35H7V11H9Z' stroke-linejoin='round'/>`,
    art: `<path d='M9 5H31V11H33V35H7V11H9Z' fill='#9aa0a8'/><path d='M12 5.5V9.5M15 5.5V9.5M18 5.5V9.5M21 5.5V9.5M24 5.5V9.5M27 5.5V9.5' stroke='#747a83' stroke-width='1'/><rect x='10.5' y='14' width='19' height='15' rx='1.4' fill='#ff5c8a'/><path d='M20 26C16.8 23.4 14.4 21.4 14.4 19C14.4 17.4 15.6 16.4 16.8 16.4C18 16.4 19.2 17.2 20 18.4C20.8 17.2 22 16.4 23.2 16.4C24.4 16.4 25.6 17.4 25.6 19C25.6 21.4 23.2 23.4 20 26Z' fill='#fff'/>`,
  },
];

// ----- Bottons -----

const BUTTON_ART: readonly ((bg: string) => string)[] = [
  (bg) => `<rect width='40' height='40' fill='${bg}'/><path d='${star(20, 21, 13, 5.6, 0)}' fill='#fff'/>`,
  (bg) => `<rect width='40' height='40' fill='${bg}'/><path d='M20 31C13.6 25.8 9 22 9 16.8C9 13.2 11.6 11 14.4 11C16.8 11 18.8 12.4 20 14.6C21.2 12.4 23.2 11 25.6 11C28.4 11 31 13.2 31 16.8C31 22 26.4 25.8 20 31Z' fill='#fff'/>`,
  () => `<rect width='40' height='40' fill='#ffd23f'/><ellipse cx='15' cy='16.4' rx='1.8' ry='2.8' fill='#3a2a10'/><ellipse cx='25' cy='16.4' rx='1.8' ry='2.8' fill='#3a2a10'/><path d='M12 23Q20 31.4 28 23' fill='none' stroke='#3a2a10' stroke-width='2.2' stroke-linecap='round'/>`,
  (bg) => `<rect width='40' height='40' fill='${bg}'/><text x='20' y='27' text-anchor='middle' fill='#fff' style='font:800 17px var(--f-label, sans-serif)'>GG</text>`,
  () => `<rect width='40' height='40' fill='#ff5d5d'/><path d='M-5 45L45 -5' stroke='#ffa53d' stroke-width='7'/><path d='M-5 35L35 -5' stroke='#ffd93d' stroke-width='7'/><path d='M5 45L45 5' stroke='#5ccf7a' stroke-width='7'/><path d='M-5 25L25 -5' stroke='#fff' stroke-width='7'/><path d='M15 45L45 15' stroke='#4d96ff' stroke-width='7'/>`,
  () => `<rect width='40' height='40' fill='#22223a'/><path d='M14 14h4v2h4v-2h4v2h2v6h-2v2h-2v2h-2v2h-4v-2h-2v-2h-2v-2h-2v-6h2Z' fill='#ff4d6d'/><path d='M14 16h2v2h-2Z' fill='#fff'/>`,
  (bg) => `<rect width='40' height='40' fill='${bg}'/><path d='M23.5 7L12 22H19.5L16 33L28.5 17H21Z' fill='#ffd23f'/>`,
];
const BUTTON_BG = ['#2d6fd6', '#e8458b', '#1e9e6a', '#7a5cff', '#ff7a3d', '#1f2229'];

/** Bottons de mochila: um, dois ou três broches redondos de metal, com a estampa e o brilho da capa. */
function pinButtons(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const n = r() < 0.35 ? 1 : 2 + Math.floor(r() * 2);
  const taken: { p: Pt; R: number }[] = [];
  const used = new Set<number>();
  let body = '';
  for (let i = 0; i < n; i++) {
    let which = Math.floor(r() * BUTTON_ART.length);
    while (used.has(which)) which = (which + 1) % BUTTON_ART.length;
    used.add(which);
    const R = (n === 1 ? 17 : 14) * k + r() * 3 * k;
    const [x, y] = spot(W, H, r, taken, R, R * 0.9);
    const id = `${uid}-botton${i}`;
    const art = BUTTON_ART[which](BUTTON_BG[Math.floor(r() * BUTTON_BG.length)]);
    body +=
      `<clipPath id='${id}'><circle cx='20' cy='20' r='20'/></clipPath>` +
      `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1((r() - 0.5) * 50)}) scale(${(R / 20).toFixed(3)}) translate(-20 -20)'>` +
      `<circle cx='21' cy='22.4' r='20.4' fill='#000' opacity='.3'/>` +
      `<g clip-path='url(#${id})'>${art}</g>` +
      // a borda de metal virada e o brilho do plástico da capa
      `<circle cx='20' cy='20' r='19.4' fill='none' stroke='#000' stroke-opacity='.28' stroke-width='1.4'/>` +
      `<path d='M8 13A14 14 0 0 1 22 6' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='3' stroke-linecap='round'/>` +
      `</g>`;
  }
  out.front += body;
}

// ----- Corações de vida -----

const HEART_PIX = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

/** A barra de vida de videogame: três a cinco coraçõezinhos de pixel, uns cheios, um pela metade, uns vazios. */
function lifeHearts(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const n = 3 + Math.floor(r() * 3);
  const lost = Math.floor(r() * Math.min(3, n));
  const half = lost > 0 && r() < 0.6;
  const p = 2.8 * k;
  const hw = 7 * p,
    gap = 2 * p;
  const total = n * hw + (n - 1) * gap;
  const top = r() < 0.55;
  const m = 10 * k;
  const x0 = W - m - total,
    y0 = top ? m : H - m - 6 * p;
  const px = (x: number, y: number) => `M${f1(x)} ${f1(y)}h${f1(p)}v${f1(p)}h${f1(-p)}Z`;
  let outline = '',
    red = '',
    dark = '',
    light = '';
  const inHeart = (c: number, rr: number) => rr >= 0 && rr < 6 && c >= 0 && c < 7 && HEART_PIX[rr][c] === 'X';
  for (let i = 0; i < n; i++) {
    const hx = x0 + i * (hw + gap);
    // quantos ainda estão cheios: os da esquerda; o do meio do caminho pode estar pela metade
    const state = i < n - lost ? 'cheio' : i === n - lost && half ? 'meio' : 'vazio';
    for (let rr = -1; rr <= 6; rr++)
      for (let c = -1; c <= 7; c++) {
        const x = hx + c * p,
          y = y0 + rr * p;
        if (inHeart(c, rr)) {
          const filled = state === 'cheio' || (state === 'meio' && c <= 3);
          if (filled) red += px(x, y);
          else dark += px(x, y);
        } else if ([-1, 0, 1].some((dc) => [-1, 0, 1].some((dr) => inHeart(c + dc, rr + dr)))) outline += px(x, y);
      }
    if (state === 'cheio') light += px(hx + p, y0 + p);
  }
  out.front += `<path d='${outline}' fill='#1b1016'/><path d='${red}' fill='#ff2e4c'/><path d='${dark}' fill='#4a2530'/><path d='${light}' fill='#fff' fill-opacity='.85'/>`;
}

// ----- Post-it -----

const POSTIT = ['#fff27a', '#ff9ecb', '#9fe3ff', '#b5f59a', '#ffc27a'];

/** Um post-it colado num canto, com a pontinha levantando e uns rabiscos de anotação a caneta. */
function postIt(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const s = (78 + r() * 12) * k;
  // só nos cantos da direita: no de baixo à esquerda costumam ficar os adesivos de bônus
  const [x, y] = cornerAt(W, H, Math.floor(r() * 2), s * 0.55 + 6 * k, s * 0.55 + 6 * k);
  const col = POSTIT[Math.floor(r() * POSTIT.length)];
  const ink = r() < 0.6 ? '#2a4fa8' : '#2b2b2e';
  const rot = (r() - 0.5) * 18;
  // a letra: corcoviñas miúdas, com o vão das palavras, três ou quatro linhas, a última mais curta
  let lines = '';
  const nl = 3 + Math.floor(r() * 2);
  for (let l = 0; l < nl; l++) {
    const y0 = s * 0.3 + l * s * 0.17;
    const end = l === nl - 1 ? s * (0.4 + r() * 0.25) : s * (0.78 + r() * 0.1);
    let xx = s * 0.12;
    let d = '';
    while (xx < end) {
      const word = (5 + r() * 9) * k;
      d += `M${f1(xx)} ${f1(y0)}`;
      for (let w = 0; w < word; w += 2.2 * k) d += `q${f1(0.6 * k)} ${f1(-(1.4 + r() * 1.6) * k)} ${f1(1.1 * k)} 0t${f1(1.1 * k)} 0`;
      xx += word + (2 + r() * 2) * k;
    }
    lines += `<path d='${d}'/>`;
  }
  const doodle = r() < 0.5 ? `<path d='M${f1(s * 0.66)} ${f1(s * 0.86)}q${f1(3 * k)} ${f1(-4 * k)} ${f1(6 * k)} 0q${f1(3 * k)} ${f1(-4 * k)} ${f1(6 * k)} 0l${f1(-6 * k)} ${f1(6 * k)}z'/>` : `<path d='M${f1(s * 0.14)} ${f1(s * 0.88)}h${f1(s * 0.5)}'/>`;
  out.front +=
    `<defs><filter id='${uid}-sombra' x='-20%' y='-20%' width='140%' height='150%'><feGaussianBlur stdDeviation='${f1(1.6 * k)}'/></filter>` +
    `<linearGradient id='${uid}-dobra' x1='0' y1='0' x2='0' y2='1'><stop offset='.72' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.12'/></linearGradient></defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) translate(${f1(-s / 2)} ${f1(-s / 2)})'>` +
    `<path d='M${f1(1 * k)} ${f1(2 * k)}H${f1(s)}V${f1(s + 2.4 * k)}H${f1(1 * k)}Z' fill='#000' opacity='.3' filter='url(#${uid}-sombra)'/>` +
    `<rect width='${f1(s)}' height='${f1(s)}' fill='${col}'/>` +
    `<rect width='${f1(s)}' height='${f1(s * 0.18)}' fill='#000' fill-opacity='.05'/>` +
    `<rect width='${f1(s)}' height='${f1(s)}' fill='url(#${uid}-dobra)'/>` +
    `<g fill='none' stroke='${ink}' stroke-opacity='.8' stroke-width='${f1(0.8 * k)}' stroke-linecap='round' stroke-linejoin='round'>${lines}${doodle}</g>` +
    `</g>`;
}

// ----- Ingresso -----

const TICKET = ['#e8453c', '#f2a93b', '#2f9e8f', '#6c5ce7', '#d6336c'];

/** Um ingresso de cinema: os furinhos do picote, o número, e às vezes o canhoto já rasgado na porta. */
function ticket(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const w = 112 * k,
    h = 46 * k,
    n = 6.5 * k;
  const col = TICKET[Math.floor(r() * TICKET.length)];
  const torn = r() < 0.4;
  const cutX = w * 0.72;
  const taken: { p: Pt; R: number }[] = [];
  const [x, y] = spot(W, H, r, taken, w * 0.45, w * 0.42);
  const num = String(Math.floor(r() * 9000) + 1000);
  let d: string;
  if (torn) {
    // o canhoto foi embora: a beirada do picote rasgada em dentinhos
    let edge = '';
    for (let yy = 0; yy <= h; yy += 2.2 * k) edge += `L${f1(cutX + (r() - 0.3) * 1.8 * k)} ${f1(Math.min(h, yy))}`;
    d = `M0 0H${f1(cutX)}${edge}L${f1(cutX)} ${f1(h)}H0V${f1(h / 2 + n)}A${f1(n)} ${f1(n)} 0 0 0 0 ${f1(h / 2 - n)}Z`;
  } else d = `M0 0H${f1(w)}V${f1(h / 2 - n)}A${f1(n)} ${f1(n)} 0 0 0 ${f1(w)} ${f1(h / 2 + n)}V${f1(h)}H0V${f1(h / 2 + n)}A${f1(n)} ${f1(n)} 0 0 0 0 ${f1(h / 2 - n)}Z`;
  const main = torn ? cutX : w;
  out.front +=
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1((r() - 0.5) * 30)}) translate(${f1(-main / 2)} ${f1(-h / 2)})'>` +
    `<path d='${d}' transform='translate(${f1(0.8 * k)} ${f1(1.4 * k)})' fill='#000' opacity='.28'/>` +
    `<path d='${d}' fill='${col}'/>` +
    `<rect x='${f1(3 * k)}' y='${f1(3 * k)}' width='${f1(cutX - 6 * k)}' height='${f1(h - 6 * k)}' rx='${f1(1.5 * k)}' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='${f1(0.7 * k)}'/>` +
    `<text x='${f1(cutX / 2)}' y='${f1(h * 0.52)}' text-anchor='middle' fill='#fff' style='font:800 ${f1(14 * k)}px var(--f-label, sans-serif);letter-spacing:.08em'>INGRESSO</text>` +
    `<text x='${f1(cutX / 2)}' y='${f1(h * 0.8)}' text-anchor='middle' fill='#fff' fill-opacity='.8' style='font:700 ${f1(7.4 * k)}px var(--f-label, sans-serif);letter-spacing:.12em'>Nº ${num} · FILA ${'ABCDEFGH'[Math.floor(r() * 8)]}</text>` +
    (torn
      ? ''
      : `<path d='M${f1(cutX)} ${f1(2 * k)}V${f1(h - 2 * k)}' stroke='#fff' stroke-opacity='.6' stroke-width='${f1(0.9 * k)}' stroke-dasharray='${f1(1.4 * k)} ${f1(1.8 * k)}'/>` +
        `<path d='${star(cutX + (w - cutX) / 2, h / 2, 7.4 * k, 3.1 * k, 0)}' fill='#fff' fill-opacity='.85'/>`) +
    `</g>`;
}

// ----- Etiqueta de promoção -----

const TAG: readonly (readonly [string, string])[] = [
  ['#e8453c', '#fff'],
  ['#ffd23f', '#1f1f1f'],
  ['#fbf7ee', '#d6203a'],
  ['#1f2229', '#ffd23f'],
];
const TAG_TEXT = ['-75%', '-50%', '-90%', '-33%', 'R$ 9,99', 'GRÁTIS'];

/** A etiqueta de preço de promoção, pendurada num barbante que dá a volta na beirada de cima. */
function saleTag(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const w = 72 * k,
    h = 34 * k,
    tip = 13 * k;
  const [bg, fg] = TAG[Math.floor(r() * TAG.length)];
  const text = TAG_TEXT[Math.floor(r() * TAG_TEXT.length)];
  const ax = W * (0.62 + r() * 0.3);
  const hx = ax + (r() - 0.5) * 16 * k,
    hy = (30 + r() * 14) * k;
  const rot = 90 + (r() - 0.5) * 50;
  const body = `M0 ${f1(h / 2)}L${f1(tip)} 0H${f1(w)}V${f1(h)}H${f1(tip)}Z`;
  const hole = `M${f1(tip * 0.75 - 2.2 * k)} ${f1(h / 2)}a${f1(2.2 * k)} ${f1(2.2 * k)} 0 1 0 ${f1(4.4 * k)} 0a${f1(2.2 * k)} ${f1(2.2 * k)} 0 1 0 ${f1(-4.4 * k)} 0Z`;
  const fs = text.length > 5 ? 11.5 : 15;
  out.front +=
    // o barbante: da volta por cima da beirada até o furo
    `<path d='M${f1(ax - 4 * k)} ${f1(3 * k)}Q${f1(ax)} ${f1(-7 * k)} ${f1(ax + 4 * k)} ${f1(3 * k)}' fill='none' stroke='#e9dcc0' stroke-width='${f1(1 * k)}'/>` +
    `<path d='M${f1(ax + 3 * k)} ${f1(2 * k)}Q${f1((ax + hx) / 2 + 6 * k)} ${f1(hy * 0.55)} ${f1(hx)} ${f1(hy)}' fill='none' stroke='#000' stroke-opacity='.2' stroke-width='${f1(1.2 * k)}' transform='translate(${f1(0.6 * k)} ${f1(1 * k)})'/>` +
    `<path d='M${f1(ax + 3 * k)} ${f1(2 * k)}Q${f1((ax + hx) / 2 + 6 * k)} ${f1(hy * 0.55)} ${f1(hx)} ${f1(hy)}' fill='none' stroke='#e9dcc0' stroke-width='${f1(1 * k)}'/>` +
    `<g transform='translate(${f1(hx)} ${f1(hy)}) rotate(${f1(rot)}) translate(${f1(-tip * 0.75)} ${f1(-h / 2)})'>` +
    `<path d='${body} ${hole}' fill-rule='evenodd' transform='translate(${f1(0.9 * k)} ${f1(-1.2 * k)})' fill='#000' opacity='.28'/>` +
    `<path d='${body} ${hole}' fill-rule='evenodd' fill='${bg}' stroke='#000' stroke-opacity='.15' stroke-width='${f1(0.6 * k)}' stroke-linejoin='round'/>` +
    `<circle cx='${f1(tip * 0.75)}' cy='${f1(h / 2)}' r='${f1(3.6 * k)}' fill='none' stroke='#fff' stroke-opacity='.8' stroke-width='${f1(1.6 * k)}'/>` +
    // a etiqueta pendurada fica de pé: o texto gira junto para ler de baixo para cima, como na loja
    `<text x='${f1((tip + w) / 2 + 2 * k)}' y='${f1(h / 2)}' transform='rotate(180 ${f1((tip + w) / 2 + 2 * k)} ${f1(h / 2)})' text-anchor='middle' dominant-baseline='central' fill='${fg}' style='font:800 ${f1(fs * k)}px var(--f-label, sans-serif)'>${text}</text>` +
    `</g>`;
}

// ----- Carimbo -----

const STAMP_WORDS = ['ZERADO', 'GAME OVER', 'GG', '100%', 'APROVADO', 'CLÁSSICO'];
const RUBBER = ['#c8323a', '#2d58b8', '#2f8f4e', '#6a3fa0'];

/** O carimbo de borracha batido meio torto: a moldura dupla e a palavra, com a tinta falhando. */
function rubberStamp(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const word = STAMP_WORDS[Math.floor(r() * STAMP_WORDS.length)];
  const ink = RUBBER[Math.floor(r() * RUBBER.length)];
  const fs = (word.length <= 4 ? 34 : 21) * k;
  const w = word.length * fs * 0.62 + 16 * k,
    h = fs + 14 * k;
  const taken: { p: Pt; R: number }[] = [];
  const band = r();
  // no pé da ficha ou na lateral direita, como quem carimba no fim
  const [x, y] =
    band < 0.5 ? [clamp(W * (0.3 + r() * 0.5), w / 2 + 6 * k, W - w / 2 - 6 * k), H - h / 2 - (8 + r() * 14) * k] : spot(W, H, r, taken, w / 2, w * 0.5);
  out.front +=
    `<defs>${inkFilter(`${uid}-tinta`, 3 + Math.floor(r() * 90), 0.9)}</defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1((r() - 0.5) * 30)})' filter='url(#${uid}-tinta)' opacity='.9'>` +
    `<rect x='${f1(-w / 2)}' y='${f1(-h / 2)}' width='${f1(w)}' height='${f1(h)}' rx='${f1(3 * k)}' fill='none' stroke='${ink}' stroke-width='${f1(2.2 * k)}'/>` +
    `<rect x='${f1(-w / 2 + 3.4 * k)}' y='${f1(-h / 2 + 3.4 * k)}' width='${f1(w - 6.8 * k)}' height='${f1(h - 6.8 * k)}' rx='${f1(1.6 * k)}' fill='none' stroke='${ink}' stroke-width='${f1(0.9 * k)}'/>` +
    `<text x='0' y='0' text-anchor='middle' dominant-baseline='central' fill='${ink}' style='font:800 ${f1(fs)}px var(--f-label, sans-serif);letter-spacing:.06em'>${word}</text>` +
    `</g>`;
}

// ----- Medalha de campeão -----

/** As rosetas: [cetim, dobra, brilho]. */
const ROSETTE: readonly (readonly [string, string, string])[] = [
  ['#2d6fd6', '#15397a', '#8ab8ff'],
  ['#d6342d', '#7e1611', '#ff9a93'],
  ['#e7b416', '#8c6905', '#ffe79a'],
  ['#1e9e6a', '#0c5537', '#8ee6bf'],
  ['#7a5cff', '#3d2a9c', '#cbbcff'],
];
const ROSETTE_TEXT = ['1º', '★', 'GOTY', 'MVP'];

/**
 * A roseta de primeiro lugar, de fita de cetim: duas voltas de plissado (a de fora na cor, a de dentro
 * creme), cada prega com a sua luz e a sua dobra; no meio, o botão forrado do mesmo cetim com o
 * prêmio escrito em creme; embaixo, as duas fitas de cetim com o corte em V, de tamanhos diferentes.
 */
function rosette(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const R = (27 + r() * 5) * k;
  const [col, deep, shine] = ROSETTE[Math.floor(r() * ROSETTE.length)];
  const text = ROSETTE_TEXT[Math.floor(r() * ROSETTE_TEXT.length)];
  const taken: { p: Pt; R: number }[] = [];
  const [x, y] = spot(W, H, r, taken, R * 1.3, R * 1.1);
  const rot = (r() - 0.5) * 24;
  const at = (a: number, rr: number) => `${f1(Math.cos(a) * rr)} ${f1(Math.sin(a) * rr)}`;
  // uma volta de pregas entre `inner` e `outer`; as pontas de fora saem redondinhas
  const ring = (n: number, inner: number, outer: number, a: string, b: string, fold: string, turn: number) => {
    let d = '',
      folds = '';
    for (let i = 0; i < n; i++) {
      const a0 = turn + (i / n) * Math.PI * 2,
        a1 = turn + ((i + 1) / n) * Math.PI * 2,
        am = (a0 + a1) / 2;
      const wedge = `M${at(a0, inner)}L${at(a0, outer)}Q${at(am, outer * 1.09)} ${at(a1, outer)}L${at(a1, inner)}Z`;
      d += `<path d='${wedge}' fill='${i % 2 ? a : b}'/>`;
      folds += `M${at(a0, inner)}L${at(a0, outer)}`;
    }
    return `${d}<path d='${folds}' stroke='${fold}' stroke-opacity='.45' stroke-width='${f1(0.5 * k)}'/>`;
  };
  const tail = (angle: number, len: number) => {
    const tw = R * 0.52,
      L = R * len;
    const d = `M${f1(-tw / 2)} 0C${f1(-tw / 2)} ${f1(L * 0.4)} ${f1(-tw * 0.62)} ${f1(L * 0.7)} ${f1(-tw * 0.55)} ${f1(L)}L0 ${f1(L - tw * 0.5)}L${f1(tw * 0.55)} ${f1(L)}C${f1(tw * 0.62)} ${f1(L * 0.7)} ${f1(tw / 2)} ${f1(L * 0.4)} ${f1(tw / 2)} 0Z`;
    return { d, angle, g: `<g transform='rotate(${f1(angle)})'><path d='${d}' fill='url(#${uid}-cetim)'/><path d='M0 ${f1(R * 0.3)}V${f1(L - tw * 0.7)}' stroke='#000' stroke-opacity='.12' stroke-width='${f1(0.6 * k)}'/></g>` };
  };
  const t1 = tail(14 + r() * 12, 1.85 + r() * 0.3),
    t2 = tail(-14 - r() * 12, 1.6 + r() * 0.3);
  const Rm = R * 0.45;
  const fs = text.length > 2 ? Rm * 0.62 : Rm * 0.95;
  const label = (fill: string, dx: number, dy: number, op = 1) =>
    `<text x='${f1(dx)}' y='${f1(R * 0.03 + dy)}' text-anchor='middle' dominant-baseline='central' fill='${fill}' fill-opacity='${op}' style='font:800 ${f1(fs)}px var(--f-label, sans-serif)'>${text}</text>`;
  const shadowShapes = `<circle r='${f1(R * 1.04)}'/>` + [t1, t2].map((t) => `<path d='${t.d}' transform='rotate(${f1(t.angle)})'/>`).join('');
  out.front +=
    `<defs>` +
    `<linearGradient id='${uid}-cetim' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${deep}'/><stop offset='.28' stop-color='${col}'/><stop offset='.46' stop-color='${shine}'/><stop offset='.62' stop-color='${col}'/><stop offset='1' stop-color='${deep}'/></linearGradient>` +
    `<radialGradient id='${uid}-botao' cx='.36' cy='.3' r='.8'><stop offset='0' stop-color='${shine}'/><stop offset='.5' stop-color='${col}'/><stop offset='1' stop-color='${deep}'/></radialGradient>` +
    `<radialGradient id='${uid}-fundo-roseta' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='${f1(R * 1.08)}'><stop offset='.55' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.22'/></radialGradient>` +
    `<filter id='${uid}-sombra-roseta' x='-40%' y='-40%' width='180%' height='200%'><feGaussianBlur stdDeviation='${f1(1.8 * k)}'/></filter>` +
    `</defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})'>` +
    `<g transform='translate(${f1(1.2 * k)} ${f1(2.2 * k)})' fill='#000' opacity='.35' filter='url(#${uid}-sombra-roseta)'>${shadowShapes}</g>` +
    t2.g +
    t1.g +
    ring(34, R * 0.6, R, mix(col, shine, 0.35), col, deep, r()) +
    `<circle r='${f1(R * 1.08)}' fill='url(#${uid}-fundo-roseta)'/>` +
    ring(26, Rm * 0.98, R * 0.66, '#fbf7ee', '#e6dfcd', '#b9ad92', r()) +
    // o botão do meio, forrado do mesmo cetim, com o prêmio escrito em creme
    `<circle r='${f1(Rm)}' fill='url(#${uid}-botao)' stroke='${deep}' stroke-width='${f1(0.9 * k)}'/>` +
    `<circle r='${f1(Rm * 0.82)}' fill='none' stroke='#fbf7ee' stroke-opacity='.75' stroke-width='${f1(0.7 * k)}'/>` +
    label('#000', 0.5 * k, 0.7 * k, 0.25) +
    label('#fbf7ee', 0, 0) +
    `<path d='M${f1(-Rm * 0.7)} ${f1(-Rm * 0.45)}A${f1(Rm * 0.85)} ${f1(Rm * 0.85)} 0 0 1 ${f1(-Rm * 0.05)} ${f1(-Rm * 0.84)}' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='${f1(1.2 * k)}' stroke-linecap='round'/>` +
    `</g>`;
}

// ----- Lacre de cera -----

/** A cera: a cor, a luz (para os relevos) e a sombra. Cores fundas, como cera de verdade. */
const WAX: readonly (readonly [string, string, string])[] = [
  ['#8a1c20', '#c95a5d', '#420a0c'],
  ['#4b5639', '#8d9c72', '#232a17'],
  ['#233f6b', '#6486bb', '#0f1d36'],
  ['#5a2a6c', '#9a74ae', '#2c1237'],
  ['#9b7428', '#dcbd6c', '#4d3709'],
  ['#232126', '#6a6770', '#09080a'],
  ['#7a3b22', '#c07a58', '#3a190c'],
];
/** O que está escrito em volta, no anel do sinete (repetido até fechar a volta). */
const WAX_WORDS = ['LACRADO · CONFIDENCIAL · ', 'DO MURAL · COM CARINHO · ', 'ZERADO · APROVADO · ', 'SELADO · NÃO ABRA · ', 'GAME OVER · CONTINUE? · ', 'CARTA DE AVENTURA · '];
/** O monograma do meio, numa letra de cartório; a fonte gótica quando o computador tem, senão uma serifada. */
const WAX_LETTERS = 'ABCDEGHJKLMNPRSTVW';
// aspas duplas: o desenho vai dentro de atributos com aspas simples
const WAX_FONT = `"Old English Text MT", "UnifrakturMaguntia", "Goudy Text MT", "Palatino Linotype", "Book Antiqua", Georgia, serif`;

/** O desenho do sinete, num quadro de 40×40, preenchido: coroa, estrela, coração, flor-de-lis, caveira, chave. */
const WAX_EMBLEM = [
  `<path d='M9 28L7.4 13.4L14.2 19.4L20 9.6L25.8 19.4L32.6 13.4L31 28Z'/><rect x='9' y='29.6' width='22' height='3' rx='1'/><circle cx='7.4' cy='12.2' r='1.8'/><circle cx='20' cy='8.2' r='1.9'/><circle cx='32.6' cy='12.2' r='1.8'/>`,
  `<path d='${star(20, 21, 13.5, 5.6, 0)}'/>`,
  `<path d='M20 32C13.4 26.6 8.6 22.6 8.6 17.2C8.6 13.4 11.4 11 14.4 11C16.8 11 18.8 12.4 20 14.6C21.2 12.4 23.2 11 25.6 11C28.6 11 31.4 13.4 31.4 17.2C31.4 22.6 26.6 26.6 20 32Z'/>`,
  `<path d='M20 5.5C16.6 9 16 13.6 18.2 18.4C16.4 18.4 15.2 17 15.4 15C12 15.6 10.2 18.6 11.4 22C12.2 24.2 14.6 25 16.6 24L17.6 26.6H22.4L23.4 24C25.4 25 27.8 24.2 28.6 22C29.8 18.6 28 15.6 24.6 15C24.8 17 23.6 18.4 21.8 18.4C24 13.6 23.4 9 20 5.5Z'/><rect x='13.6' y='26.6' width='12.8' height='2.6' rx='1'/><path d='M18.6 29.2H21.4L20 34.4Z'/>`,
  `<path fill-rule='evenodd' d='M20 7C13.4 7 9.4 11.8 9.4 17.6C9.4 21.4 11.2 24 13.6 25.4V30.4H26.4V25.4C28.8 24 30.6 21.4 30.6 17.6C30.6 11.8 26.6 7 20 7ZM15.8 16.2A2.8 3.2 0 1 0 15.8 22.6A2.8 3.2 0 1 0 15.8 16.2ZM24.2 16.2A2.8 3.2 0 1 0 24.2 22.6A2.8 3.2 0 1 0 24.2 16.2ZM20 21.6L18.4 24.6H21.6Z'/><path d='M15.8 30.4V33.4M20 30.4V33.4M24.2 30.4V33.4' stroke-width='1.6' fill='none'/>`,
  `<path fill-rule='evenodd' d='M20 5.4A6.2 6.2 0 1 0 20 17.8A6.2 6.2 0 1 0 20 5.4ZM20 8.8A2.8 2.8 0 1 1 20 14.4A2.8 2.8 0 1 1 20 8.8Z'/><path d='M18.6 17.4H21.4V34.4H18.6ZM21.4 26H25.4V28.4H21.4ZM21.4 30.6H24.2V33H21.4Z'/>`,
];

/** Uma linha fechada e macia passando pelos pontos (Catmull-Rom virando Bézier). */
function smoothLoop(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + 'Z';
}

/** Um arco de círculo de raio `R`, de `a0` a `a1` graus (0 é à direita, cresce no sentido do relógio). */
function arc(R: number, a0: number, a1: number): string {
  const p = (a: number) => `${f1(Math.cos((a * Math.PI) / 180) * R)} ${f1(Math.sin((a * Math.PI) / 180) * R)}`;
  return `M${p(a0)}A${f1(R)} ${f1(R)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
}

/**
 * O lacre de cera de carta, como os de sinete de verdade: um disco quase redondo, com a borda grossa e
 * abaulada que a cera fez ao ser espremida; um degrau fundo até o miolo chato, onde o sinete deixou,
 * em relevo, um anel com palavras (ou continhas) e um monograma ou um desenho no meio. A cera é
 * lustrosa: reflexos brancos, finos e fortes na crista da borda e na beirada do degrau; o fundo, mais escuro.
 * A luz vem de cima, à esquerda.
 */
function waxSeal(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const R = (28 + r() * 5) * k;
  const [base, light, dark] = WAX[Math.floor(r() * WAX.length)];
  const taken: { p: Pt; R: number }[] = [];
  const [x, y] = spot(W, H, r, taken, R * 1.2, R * 1.1);
  const turn = (r() - 0.5) * 30;

  // o contorno: quase um círculo, com três a cinco barrigas largas e rasas onde a cera espalhou mais
  const bulges = Array.from({ length: 3 + Math.floor(r() * 3) }, () => ({ a: r() * Math.PI * 2, amp: 0.025 + r() * 0.05, w: 0.45 + r() * 0.35 }));
  const ph = [r() * 6, r() * 6];
  const rim: Pt[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    let rr = 1 + 0.012 * Math.sin(a * 5 + ph[0]) + 0.01 * Math.sin(a * 8 + ph[1]);
    for (const b of bulges) rr += b.amp * Math.exp(-Math.pow(Math.atan2(Math.sin(a - b.a), Math.cos(a - b.a)) / b.w, 2));
    rim.push([Math.cos(a) * R * rr, Math.sin(a) * R * rr * 0.97]);
  }
  const puddle = smoothLoop(rim);

  const rs = R * 0.76; // a beirada do degrau: dali para dentro é o miolo chato
  const ring = R * 0.52; // o anel em relevo que separa as palavras do monograma
  const face = mix(base, dark, 0.3);
  const d = Math.max(0.35, 0.028 * R); // o tamanho do relevo
  // um relevo: a sombra embaixo à direita, a luz em cima à esquerda, a peça por cima
  const relief = (body: string, lift = 1) =>
    `<g transform='translate(${f1(d * lift)} ${f1(d * lift * 1.1)})' fill='${dark}' stroke='${dark}' opacity='.85'>${body}</g>` +
    `<g transform='translate(${f1(-d * 0.7 * lift)} ${f1(-d * 0.7 * lift)})' fill='#fff' stroke='#fff' opacity='.55'>${body}</g>` +
    `<g fill='${mix(base, light, 0.08)}' stroke='${mix(base, light, 0.08)}'>${body}</g>`;

  // o anel de palavras (ou de continhas) entre a beirada do degrau e o anel em relevo
  let band = '';
  const rt = (rs + ring) / 2;
  if (r() < 0.65) {
    const words = WAX_WORDS[Math.floor(r() * WAX_WORDS.length)];
    const fs = (rs - ring) * 0.62;
    const circ = Math.PI * 2 * rt;
    const text = words.repeat(Math.max(1, Math.round(circ / (words.length * fs * 0.62))));
    band =
      `<defs><path id='${uid}-cera-volta' d='M0 ${f1(-rt)}A${f1(rt)} ${f1(rt)} 0 1 1 0 ${f1(rt)}A${f1(rt)} ${f1(rt)} 0 1 1 0 ${f1(-rt)}'/></defs>` +
      relief(
        `<text stroke='none' style='font:700 ${f1(fs)}px Georgia, serif' dominant-baseline='central' textLength='${f1(circ * 0.985)}' lengthAdjust='spacingAndGlyphs'><textPath href='#${uid}-cera-volta'>${text}</textPath></text>`,
        0.55,
      );
  } else {
    let beads = '';
    const nb = Math.round((Math.PI * 2 * rt) / (R * 0.075));
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      beads += `<circle cx='${f1(Math.cos(a) * rt)}' cy='${f1(Math.sin(a) * rt)}' r='${f1(R * 0.022)}' stroke='none'/>`;
    }
    band = relief(beads, 0.55);
  }

  // o meio: um monograma numa letra de cartório, ou um dos desenhos do sinete
  let center: string;
  if (r() < 0.55) {
    const letter = WAX_LETTERS[Math.floor(r() * WAX_LETTERS.length)];
    center = relief(`<text x='0' y='${f1(ring * 0.05)}' text-anchor='middle' dominant-baseline='central' stroke='none' style='font:700 ${f1(ring * 1.75)}px ${WAX_FONT}'>${letter}</text>`);
  } else {
    const es = (ring * 1.55) / 40;
    center = relief(`<g transform='scale(${es.toFixed(3)}) translate(-20 -20.5)' stroke-width='0'>${WAX_EMBLEM[Math.floor(r() * WAX_EMBLEM.length)]}</g>`);
  }

  const glint = (rad: number, a0: number, a1: number, w: number, op: number, blur = true) =>
    `<path d='${arc(rad, a0, a1)}' fill='none' stroke='#fff' stroke-opacity='${op}' stroke-width='${f1(w)}' stroke-linecap='round'${blur ? ` filter='url(#${uid}-cera-brilho)'` : ''}/>`;

  out.front +=
    `<defs>` +
    // a cera da borda: mais clara em cima à esquerda, funda embaixo à direita, como uma bolota abaulada
    `<radialGradient id='${uid}-cera' cx='.4' cy='.36' r='.72'><stop offset='0' stop-color='${mix(base, light, 0.18)}'/><stop offset='.7' stop-color='${base}'/><stop offset='1' stop-color='${mix(base, dark, 0.45)}'/></radialGradient>` +
    `<radialGradient id='${uid}-cera-miolo' cx='.5' cy='.5' r='.55'><stop offset='0' stop-color='${face}'/><stop offset='1' stop-color='${mix(face, dark, 0.35)}'/></radialGradient>` +
    `<clipPath id='${uid}-cera-degrau'><circle r='${f1(rs)}'/></clipPath>` +
    `<clipPath id='${uid}-cera-borda'><path d='${puddle}'/></clipPath>` +
    `<filter id='${uid}-cera-sombra' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='${f1(1.3 * k)}'/></filter>` +
    `<filter id='${uid}-cera-brilho' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='${f1(0.35 * k)}'/></filter>` +
    `<filter id='${uid}-cera-macio' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='${f1(R * 0.06)}'/></filter>` +
    `</defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(turn)})'>` +
    // a sombra no papel
    `<path d='${puddle}' transform='translate(${f1(1 * k)} ${f1(1.8 * k)})' fill='#000' opacity='.38' filter='url(#${uid}-cera-sombra)'/>` +
    // a borda abaulada: o disco, com a volta de baixo à direita escurecendo para dentro e a de cima clareando
    `<path d='${puddle}' fill='url(#${uid}-cera)'/>` +
    `<g clip-path='url(#${uid}-cera-borda)' fill='none' filter='url(#${uid}-cera-macio)'>` +
    `<path d='${puddle}' stroke='${dark}' stroke-opacity='.55' stroke-width='${f1(R * 0.16)}' transform='translate(${f1(-R * 0.05)} ${f1(-R * 0.05)})'/>` +
    `<circle r='${f1(rs * 1.04)}' stroke='${mix(base, light, 0.5)}' stroke-opacity='.45' stroke-width='${f1(R * 0.08)}' transform='translate(${f1(-R * 0.03)} ${f1(-R * 0.03)})'/>` +
    `</g>` +
    // o degrau: o miolo chato, com a parede de cima à esquerda na sombra da borda
    `<circle r='${f1(rs)}' fill='url(#${uid}-cera-miolo)'/>` +
    `<g clip-path='url(#${uid}-cera-degrau)' fill='none'>` +
    `<circle r='${f1(rs)}' cx='${f1(rs * 0.08)}' cy='${f1(rs * 0.09)}' stroke='${dark}' stroke-opacity='.9' stroke-width='${f1(rs * 0.16)}' filter='url(#${uid}-cera-brilho)'/>` +
    `</g>` +
    // a beirada do degrau pegando luz embaixo à direita: um fio claro e firme
    glint(rs - d * 0.6, 10, 105, d * 0.9, 0.5) +
    glint(rs + d * 0.3, 200, 260, d * 0.9, 0.35) +
    band +
    // o anel em relevo
    relief(`<circle r='${f1(ring)}' fill='none' stroke-width='${f1(R * 0.035)}'/>`, 0.6).replace(/fill='(#[0-9a-f]{6})' stroke=/g, "fill='none' stroke=") +
    center +
    // os reflexos da cera lustrosa: um brilho largo e fraco na borda de cima, um fio longo e forte na crista, e uns menores
    glint(R * 0.87, 185, 275, R * 0.16, 0.16) +
    glint(R * 0.88, 196, 258, R * 0.055, 0.9) +
    glint(R * 0.88, 200, 232, R * 0.025, 1, false) +
    glint(R * 0.9, 290, 312, R * 0.035, 0.55) +
    glint(R * 0.87, 112, 138, R * 0.04, 0.45) +
    glint(R * 0.9, 22, 40, R * 0.03, 0.3) +
    `<ellipse cx='${f1(-R * 0.62)}' cy='${f1(-R * 0.5)}' rx='${f1(R * 0.07)}' ry='${f1(R * 0.035)}' transform='rotate(-40 ${f1(-R * 0.62)} ${f1(-R * 0.5)})' fill='#fff' fill-opacity='.9' filter='url(#${uid}-cera-brilho)'/>` +
    `</g>`;
}

// ----- Grampos -----

/** Grampos de grampeador: um atravessado no canto da foto, ou dois na beirada de cima ou na da esquerda. */
function staples(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const L = (24 + r() * 4) * k;
  const mode = Math.floor(r() * 3);
  const at: { p: Pt; a: number }[] =
    mode === 0
      ? [{ p: [(16 + r() * 4) * k, (16 + r() * 4) * k], a: -45 + (r() - 0.5) * 16 }]
      : mode === 1
        ? [0.3, 0.7].map((u) => ({ p: [W * u + (r() - 0.5) * 10 * k, (7 + r() * 2) * k] as Pt, a: (r() - 0.5) * 10 }))
        : [0.3, 0.7].map((u) => ({ p: [(7 + r() * 2) * k, H * u + (r() - 0.5) * 10 * k] as Pt, a: 90 + (r() - 0.5) * 10 }));
  let body = '';
  for (const { p, a } of at) {
    const line = `M${f1(-L / 2)} 0H${f1(L / 2)}`;
    body +=
      `<g transform='translate(${f1(p[0])} ${f1(p[1])}) rotate(${f1(a)})'>` +
      `<path d='${line}' transform='translate(${f1(0.8 * k)} ${f1(1.4 * k)})' stroke='#000' stroke-opacity='.35' stroke-width='${f1(2.4 * k)}'/>` +
      `<path d='M${f1(-L / 2)} ${f1(-0.4 * k)}v${f1(1.8 * k)}M${f1(L / 2)} ${f1(-0.4 * k)}v${f1(1.8 * k)}' stroke='#4b5159' stroke-width='${f1(2 * k)}'/>` +
      `<path d='${line}' stroke='#8d949c' stroke-width='${f1(2.4 * k)}'/>` +
      `<path d='${line}' transform='translate(0 ${f1(-0.5 * k)})' stroke='#f2f4f6' stroke-width='${f1(0.8 * k)}'/>` +
      `</g>`;
  }
  out.front += `<g fill='none' stroke-linecap='round'>${body}</g>`;
}

// ----- Alfinete -----

/** Um alfinete de fralda espetado na beirada: uma haste por cima, a outra entra e sai do papel. */
function safetyPin(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const L = (86 + r() * 14) * k;
  const top = r() < 0.5;
  const x = top ? W * (0.55 + r() * 0.3) : W - (12 + r() * 6) * k;
  const y = top ? (12 + r() * 6) * k : H * (0.35 + r() * 0.35);
  const a = (top ? 0 : 90) + (r() - 0.5) * 24;
  const gold = r() < 0.25;
  const [metal, shine, deep] = gold ? ['#c9a13a', '#fff0b8', '#8a6a16'] : ['#9aa1ab', '#f4f6f8', '#5b6068'];
  const w = 3.8 * k;
  // os furinhos por onde a haste de baixo passa: entra num, sai no outro
  const inA = L * (0.3 + r() * 0.1),
    inB = L * (0.62 + r() * 0.1);
  const ca = Math.cos((a * Math.PI) / 180),
    sa = Math.sin((a * Math.PI) / 180);
  const world = (u: number, v: number): Pt => [x + (u - L / 2) * ca - v * sa, y + (u - L / 2) * sa + v * ca];
  for (const u of [inA, inB]) {
    const [hx, hy] = world(u, w);
    out.cut.push(`M${f1(hx - 0.8 * k)} ${f1(hy)}a${f1(0.8 * k)} ${f1(0.8 * k)} 0 1 0 ${f1(1.6 * k)} 0a${f1(0.8 * k)} ${f1(0.8 * k)} 0 1 0 ${f1(-1.6 * k)} 0Z`);
  }
  const wire = (d: string, width = 1.8) =>
    `<path d='${d}' stroke='${metal}' stroke-width='${f1(width * k)}'/><path d='${d}' transform='translate(0 ${f1(-0.35 * k)})' stroke='${shine}' stroke-opacity='.85' stroke-width='${f1(0.45 * k)}'/>`;
  const upper = `M${f1(3 * k)} ${f1(-w)}L${f1(L - 6 * k)} ${f1(-w * 0.9)}`;
  const lowerA = `M${f1(3 * k)} ${f1(w)}L${f1(inA)} ${f1(w)}`,
    lowerB = `M${f1(inB)} ${f1(w)}L${f1(L - 4 * k)} ${f1(w * 0.3)}`;
  const shadow = (d: string) => `<path d='${d}' transform='translate(${f1(0.7 * k)} ${f1(1.2 * k)})' stroke='#000' stroke-opacity='.28' stroke-width='${f1(1.5 * k)}'/>`;
  out.front +=
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)}) translate(${f1(-L / 2)} 0)' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    shadow(upper) +
    shadow(lowerA) +
    shadow(lowerB) +
    // a mola enrolada na ponta
    `<circle cx='${f1(2.4 * k)}' cy='0' r='${f1(w * 1.15)}' stroke='${metal}' stroke-width='${f1(1.3 * k)}'/><circle cx='${f1(2.4 * k)}' cy='0' r='${f1(w * 0.55)}' stroke='${deep}' stroke-width='${f1(0.8 * k)}'/>` +
    wire(upper) +
    wire(lowerA) +
    wire(lowerB) +
    // a capinha que prende a ponta
    `<path d='M${f1(L - 8 * k)} ${f1(-w * 1.5)}H${f1(L - 1.5 * k)}Q${f1(L + 1 * k)} ${f1(-w * 1.5)} ${f1(L + 1 * k)} 0Q${f1(L + 1 * k)} ${f1(w * 1.2)} ${f1(L - 2 * k)} ${f1(w * 1.2)}H${f1(L - 8 * k)}Z' fill='${metal}' stroke='${deep}' stroke-width='${f1(0.5 * k)}'/>` +
    `<path d='M${f1(L - 7 * k)} ${f1(-w * 1.1)}H${f1(L - 2 * k)}' stroke='${shine}' stroke-opacity='.8' stroke-width='${f1(0.6 * k)}'/>` +
    `</g>`;
}

// ----- Curativo -----

const BANDAGE: readonly (readonly [string, string])[] = [
  ['#e8b48a', '#f6e1cc'],
  ['#f0c9a0', '#fbeee0'],
  ['#d99a6c', '#f1d6bd'],
  ['#7fd3ff', '#e6f7ff'],
  ['#ff9ecb', '#ffe6f2'],
];

/** Um curativo colado atravessando um canto (a ficha se machucou), ou dois cruzados em X. */
function bandage(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const w = (86 + r() * 12) * k,
    h = 25 * k;
  const [skin, pad] = BANDAGE[Math.floor(r() * BANDAGE.length)];
  const cross = r() < 0.35;
  const one = (x: number, y: number, a: number) => {
    let holes = '';
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++) holes += `<circle cx='${f1(side * (w * 0.24 + i * 3.4 * k))}' cy='${f1((j - 0.5) * 5 * k)}' r='${f1(0.55 * k)}'/>`;
    let dots = '';
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) dots += `<circle cx='${f1(i * 3.4 * k)}' cy='${f1(j * 3.2 * k)}' r='${f1(0.5 * k)}'/>`;
    const shape = `<rect x='${f1(-w / 2)}' y='${f1(-h / 2)}' width='${f1(w)}' height='${f1(h)}' rx='${f1(h / 2)}'/>`;
    return (
      `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})'>` +
      lift(shape.replace('/>', " fill='#000'/>"), k, 0.6, 1.2, 0.25) +
      shape.replace('/>', ` fill='${skin}'/>`) +
      `<g fill='#000' fill-opacity='.18'>${holes}</g>` +
      `<rect x='${f1(-w * 0.17)}' y='${f1(-h * 0.36)}' width='${f1(w * 0.34)}' height='${f1(h * 0.72)}' rx='${f1(1.2 * k)}' fill='${pad}'/>` +
      `<g fill='#000' fill-opacity='.1'>${dots}</g>` +
      `<path d='M${f1(-w / 2 + h / 2)} ${f1(-h / 2 + 1.2 * k)}H${f1(w / 2 - h / 2)}' stroke='#fff' stroke-opacity='.35' stroke-width='${f1(1 * k)}' stroke-linecap='round'/>` +
      `</g>`
    );
  };
  let body: string;
  if (cross) {
    const taken: { p: Pt; R: number }[] = [];
    const [x, y] = spot(W, H, r, taken, w * 0.4, w * 0.36);
    const a = (r() - 0.5) * 20;
    body = one(x, y, a + 45) + one(x, y, a - 45);
  } else {
    // atravessado num canto, dobrando pela beirada (o que passa da ficha some atrás dela)
    const c = Math.floor(r() * 3);
    const [x, y] = cornerAt(W, H, c, w * 0.22, w * 0.22);
    const a = (c === 1 ? -45 : 45) + (r() - 0.5) * 14;
    body = one(x, y, a);
  }
  out.front += `<defs><clipPath id='${uid}-ficha'><rect width='${f1(W)}' height='${f1(H)}'/></clipPath></defs><g clip-path='url(#${uid}-ficha)'>${body}</g>`;
}

// ----- Fita de cuidado -----

/**
 * A fita zebrada de CUIDADO atravessando um canto, às vezes duas; sempre de uma beirada à outra (o que
 * passa some atrás da ficha), nunca acabando no meio do papel.
 */
function cautionTape(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const bw = 17 * k;
  const c = Math.floor(r() * 3);
  const two = r() < 0.4;
  const tape = (reach: number, a: number) => {
    const [x, y] = cornerAt(W, H, c, reach, reach);
    // comprida de sobra: a ficha corta nas duas beiradas
    const L = reach * 5;
    let marks = '';
    // a palavra se repete, entre os blocos zebrados
    const step = 64 * k;
    for (let u = -L / 2; u < L / 2; u += step) {
      marks += `<text x='${f1(u + step / 2)}' y='0' text-anchor='middle' dominant-baseline='central' fill='#111' style='font:800 ${f1(9.5 * k)}px var(--f-label, sans-serif);letter-spacing:.1em'>CUIDADO</text>`;
      for (let j = 0; j < 3; j++) marks += `<path d='M${f1(u + j * 4 * k)} ${f1(bw / 2)}l${f1(bw * 0.6)} ${f1(-bw)}h${f1(2 * k)}l${f1(-bw * 0.6)} ${f1(bw)}Z' fill='#111'/>`;
    }
    return (
      `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})'>` +
      `<rect x='${f1(-L / 2)}' y='${f1(-bw / 2 + 1.4 * k)}' width='${f1(L)}' height='${f1(bw)}' fill='#000' opacity='.28'/>` +
      `<rect x='${f1(-L / 2)}' y='${f1(-bw / 2)}' width='${f1(L)}' height='${f1(bw)}' fill='#ffd21f'/>` +
      marks +
      `<rect x='${f1(-L / 2)}' y='${f1(-bw / 2)}' width='${f1(L)}' height='${f1(bw * 0.35)}' fill='#fff' fill-opacity='.18'/>` +
      `</g>`
    );
  };
  // de través no canto: no de cima à direita e no de baixo à esquerda desce para a direita; no outro, sobe
  const a = c === 1 ? -45 : 45;
  // o canto cortado cabe na ficha: a fita encosta nas duas beiradas que fazem o canto
  const reach = Math.min((46 + r() * 22) * k, Math.min(W, H) * 0.33);
  const body = two ? tape(reach * 1.25, a + 8 + (r() - 0.5) * 6) + tape(reach * 0.85, a - 10 + (r() - 0.5) * 6) : tape(reach, a + (r() - 0.5) * 14);
  out.front += `<defs><clipPath id='${uid}-ficha'><rect width='${f1(W)}' height='${f1(H)}'/></clipPath></defs><g clip-path='url(#${uid}-ficha)'>${body}</g>`;
}

// ----- Neve -----

/** Neve acumulada na beirada de cima (às vezes com pingentes de gelo) e flocos caindo pela ficha. */
function snow(W: number, H: number, k: number, r: () => number, out: DecorArt): void {
  const ph = [r() * 6, r() * 6, r() * 6];
  const base = (5 + r() * 3) * k;
  const lowAt = (x: number) => base + Math.sin(x / (38 * k) + ph[0]) * 2.2 * k + Math.sin(x / (13 * k) + ph[1]) * 1.2 * k + Math.max(0, Math.sin(x / (70 * k) + ph[2])) * 5 * k;
  const highAt = (x: number) => -(2.5 * k + Math.max(0, Math.sin(x / (24 * k) + ph[1])) * 3 * k + Math.max(0, Math.sin(x / (61 * k) + ph[0])) * 3.5 * k);
  // Nas pontas o monte afina e fecha numa ponta redonda, caindo um tiquinho pela quina (nada de corte reto)
  const x0 = -0.6 * k,
    x1 = W + 0.6 * k,
    cap = Math.min(W * 0.18, 22 * k);
  const taper = (x: number) => {
    const t = clamp(Math.min(x - x0, x1 - x) / cap, 0, 1);
    return Math.sin((t * Math.PI) / 2);
  };
  // o que escorre pela quina: a barriga de baixo desce um pouco rente a cada ponta
  const droop = (x: number) => 1.8 * k * Math.exp(-Math.pow(Math.min(x - x0, x1 - x) / (5 * k), 2));
  const top = (x: number) => highAt(x) * (0.15 + 0.85 * taper(x));
  const bottom = (x: number) => {
    const lo = lowAt(x),
      t = taper(x);
    return 1.2 * k + (lo - 1.2 * k) * (0.18 + 0.82 * t) + droop(x);
  };
  const xs: number[] = [];
  for (let x = x0; x < x1; x += 4 * k) xs.push(x);
  xs.push(x1);
  // a volta inteira: por cima da esquerda para a direita, a ponta redonda, por baixo de volta, a outra ponta
  const loop: Pt[] = xs.map((x) => [x, top(x)]);
  const end = (x: number, dir: 1 | -1, from: number, to: number) => {
    const mid = (from + to) / 2,
      rad = Math.abs(to - from) / 2;
    const pts: Pt[] = [];
    for (let i = 1; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI;
      pts.push([x + dir * Math.cos(a) * rad * 0.55, mid + Math.sin(a) * rad * dir]);
    }
    return pts;
  };
  loop.push(...end(x1, 1, top(x1), bottom(x1)));
  for (let i = xs.length - 1; i >= 0; i--) loop.push([xs[i], bottom(xs[i])]);
  loop.push(...end(x0, -1, bottom(x0), top(x0)));
  const mound = smoothLoop(loop);
  // o brilho de cima e a sombrinha de baixo não vão até a ponta: somem antes da curva
  const inner = xs.filter((x) => x > x0 + cap * 0.35 && x < x1 - cap * 0.35);
  const upper = inner.map((x, i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(top(x) + 0.6 * k)}`).join('');
  const shade = inner.map((x, i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(bottom(x) - 1 * k)}`).join('');
  let icicles = '';
  if (r() < 0.55) {
    const n = 3 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const x = W * (0.08 + r() * 0.84),
        y = bottom(x) - 0.5 * k,
        w = (1.6 + r() * 1.4) * k,
        l = (5 + r() * 9) * k;
      icicles += `<path d='M${f1(x - w)} ${f1(y)}Q${f1(x - w * 0.3)} ${f1(y + l * 0.6)} ${f1(x)} ${f1(y + l)}Q${f1(x + w * 0.3)} ${f1(y + l * 0.6)} ${f1(x + w)} ${f1(y)}Z'/>`;
    }
  }
  let flakes = '',
    stars = '';
  const nf = 26 + Math.floor(r() * 18);
  for (let i = 0; i < nf; i++) flakes += `<circle cx='${f1(r() * W)}' cy='${f1(H * 0.08 + r() * H * 0.92)}' r='${f1((0.7 + r() * r() * 1.8) * k)}'/>`;
  const ns = 3 + Math.floor(r() * 4);
  for (let i = 0; i < ns; i++) {
    const x = W * (0.05 + r() * 0.9),
      y = H * (0.15 + r() * 0.8),
      R = (3 + r() * 2.5) * k,
      a0 = r() * 60;
    let d = '';
    for (let j = 0; j < 3; j++) {
      const a = ((a0 + j * 60) * Math.PI) / 180;
      d += `M${f1(x - Math.cos(a) * R)} ${f1(y - Math.sin(a) * R)}L${f1(x + Math.cos(a) * R)} ${f1(y + Math.sin(a) * R)}`;
    }
    stars += `<path d='${d}'/>`;
  }
  out.front +=
    // a sombra azulada dos flocos (para aparecerem na cartolina clara) e eles por cima
    `<g fill='#6b86a3' fill-opacity='.35' transform='translate(${f1(0.5 * k)} ${f1(0.7 * k)})'>${flakes}</g><g fill='#fff'>${flakes}</g>` +
    `<g fill='none' stroke-linecap='round'><g stroke='#6b86a3' stroke-opacity='.4' stroke-width='${f1(0.9 * k)}' transform='translate(${f1(0.5 * k)} ${f1(0.7 * k)})'>${stars}</g><g stroke='#fff' stroke-width='${f1(0.8 * k)}'>${stars}</g></g>` +
    `<path d='${mound}' transform='translate(0 ${f1(1.4 * k)})' fill='#3c536b' opacity='.25'/>` +
    `<path d='${mound}' fill='#eef4fa'/>` +
    `<path d='${upper}' fill='none' stroke='#fff' stroke-width='${f1(2.4 * k)}' stroke-linejoin='round' stroke-linecap='round'/>` +
    `<path d='${shade}' fill='none' stroke='#b7c9db' stroke-width='${f1(1.2 * k)}' stroke-linejoin='round' stroke-linecap='round'/>` +
    (icicles ? `<g fill='#dcebf7' stroke='#a9c3da' stroke-width='${f1(0.5 * k)}'>${icicles}</g>` : '');
}

// ----- Pétalas de cerejeira -----

/**
 * Pétalas de cerejeira trazidas pelo vento. Um punhadinho só num canto; ou uma faixa rente a uma das
 * beiradas (deitada em cima ou embaixo, em pé nos lados); ou a faixa torta atravessando a ficha. Às
 * vezes uma flor inteira no meio delas.
 */
function petals(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const petal = (L: number) => {
    const w = L * 0.62;
    return `M0 0C${f1(L * 0.25)} ${f1(-w * 0.55)} ${f1(L * 0.8)} ${f1(-w * 0.6)} ${f1(L * 0.98)} ${f1(-w * 0.12)}L${f1(L * 0.88)} 0L${f1(L * 0.98)} ${f1(w * 0.12)}C${f1(L * 0.8)} ${f1(w * 0.6)} ${f1(L * 0.25)} ${f1(w * 0.55)} 0 0Z`;
  };
  const places: Pt[] = [];
  let flowerAt: Pt | null = null;
  const mode = r();
  if (mode < 0.4) {
    // um punhadinho no canto, mais cheio perto da quina
    const c = Math.floor(r() * 4);
    const cx = c === 0 || c === 1 ? W : 0,
      cy = c === 1 || c === 2 ? H : 0;
    const sx = cx ? -1 : 1,
      sy = cy ? -1 : 1;
    const spread = (42 + r() * 30) * k;
    const n = 4 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) places.push([cx + sx * (4 * k + Math.pow(r(), 1.5) * spread), cy + sy * (4 * k + Math.pow(r(), 1.5) * spread)]);
    if (r() < 0.3) flowerAt = [cx + sx * spread * 0.35, cy + sy * spread * 0.35];
  } else if (mode < 0.75) {
    // rente a uma beirada: deitada em cima ou embaixo, em pé à esquerda ou à direita
    const side = Math.floor(r() * 4);
    const depth = (16 + r() * 14) * k;
    const from = r() * 0.4,
      span = 0.5 + r() * 0.5;
    const n = 8 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const t = clamp(from + r() * span, 0.03, 0.97),
        d = 3 * k + Math.pow(r(), 1.5) * depth;
      places.push(side === 0 ? [W * t, d] : side === 1 ? [W - d, H * t] : side === 2 ? [W * t, H - d] : [d, H * t]);
    }
    if (r() < 0.4) {
      const t = from + span * (0.3 + r() * 0.4);
      flowerAt = side === 0 ? [W * t, depth * 0.6] : side === 1 ? [W - depth * 0.6, H * t] : side === 2 ? [W * t, H - depth * 0.6] : [depth * 0.6, H * t];
    }
  } else {
    // a faixa torta atravessando a ficha, de um canto de cima para o de baixo do outro lado
    const fromLeft = r() < 0.5;
    const n = 10 + Math.floor(r() * 7);
    for (let i = 0; i < n; i++) {
      const t = r();
      places.push([fromLeft ? W * (0.05 + t * 0.9) : W * (0.95 - t * 0.9), H * (0.1 + t * 0.75) + (r() - 0.5) * H * 0.35]);
    }
    if (r() < 0.45) flowerAt = [W * (fromLeft ? 0.8 + r() * 0.12 : 0.08 + r() * 0.12), H * (0.7 + r() * 0.2)];
  }
  let body = '',
    shadow = '';
  for (const [x, y] of places) {
    const L = (14 + r() * 7) * k;
    const at = `translate(${f1(x)} ${f1(y)}) rotate(${Math.round(r() * 360)}) scale(1 ${(0.55 + r() * 0.45).toFixed(2)})`;
    const d = petal(L);
    shadow += `<path d='${d}' transform='translate(${f1(0.5 * k)} ${f1(0.9 * k)}) ${at}'/>`;
    body += `<path d='${d}' transform='${at}' fill='url(#${uid}-petala)'/><path d='M${f1(L * 0.08)} 0L${f1(L * 0.5)} 0' transform='${at}' stroke='#ff8fb1' stroke-opacity='.5' stroke-width='${f1(0.5 * k)}'/>`;
  }
  if (flowerAt) {
    const [x, y] = flowerAt;
    const L = 16 * k,
      turn = r() * 72;
    for (let i = 0; i < 5; i++) {
      const at = `translate(${f1(x)} ${f1(y)}) rotate(${f1(turn + i * 72)})`;
      shadow += `<path d='${petal(L)}' transform='translate(${f1(0.5 * k)} ${f1(0.9 * k)}) ${at}'/>`;
      body += `<path d='${petal(L)}' transform='${at}' fill='url(#${uid}-petala)'/>`;
    }
    let stamen = '';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      stamen += `M${f1(x)} ${f1(y)}L${f1(x + Math.cos(a) * 5.6 * k)} ${f1(y + Math.sin(a) * 5.6 * k)}`;
    }
    body += `<circle cx='${f1(x)}' cy='${f1(y)}' r='${f1(3 * k)}' fill='#ff6f9c'/><path d='${stamen}' stroke='#e0457a' stroke-width='${f1(0.5 * k)}'/>`;
  }
  out.front +=
    `<defs><linearGradient id='${uid}-petala' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ff9fbd'/><stop offset='.45' stop-color='#ffc9da'/><stop offset='1' stop-color='#ffe6ee'/></linearGradient>` +
    `<clipPath id='${uid}-ficha'><rect width='${f1(W)}' height='${f1(H)}'/></clipPath></defs>` +
    // pousadas no papel: o que passaria da beirada fica de fora
    `<g clip-path='url(#${uid}-ficha)'><g fill='#000' opacity='.16'>${shadow}</g>${body}</g>`;
}

// ----- Teia de aranha -----

/** Uma teia num canto, os fios da raiz e a espiral cedendo entre eles; às vezes a dona pendurada. */
function spiderWeb(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  // o canto: qualquer um, até o da foto (é teia de casa abandonada), mas menos
  const c = r() < 0.15 ? 3 : Math.floor(r() * 3);
  const o: Pt = c === 3 ? [0, 0] : cornerAt(W, H, c, 0, 0);
  const sx = o[0] === 0 ? 1 : -1,
    sy = o[1] === 0 ? 1 : -1;
  const R = (95 + r() * 40) * k;
  const threads = 6 + Math.floor(r() * 3);
  const angles = Array.from({ length: threads }, (_, i) => (i / (threads - 1)) * (Math.PI / 2) + (r() - 0.5) * 0.12);
  const at = (a: number, d: number): Pt => [o[0] + sx * Math.cos(a) * d, o[1] + sy * Math.sin(a) * d];
  let d = '';
  for (const a of angles) {
    const e = at(a, R * (0.85 + r() * 0.25));
    d += `M${f1(o[0])} ${f1(o[1])}L${f1(e[0])} ${f1(e[1])}`;
  }
  const rings = 6 + Math.floor(r() * 3);
  for (let j = 1; j <= rings; j++) {
    const dist = R * (0.1 + (j / rings) * 0.8);
    for (let i = 0; i < threads - 1; i++) {
      const p = at(angles[i], dist * (0.96 + r() * 0.08)),
        q = at(angles[i + 1], dist * (0.96 + r() * 0.08));
      // o fio cede para o canto, no meio do caminho entre os dois raios
      const mid = at((angles[i] + angles[i + 1]) / 2, dist * 0.86);
      d += `M${f1(p[0])} ${f1(p[1])}Q${f1(mid[0])} ${f1(mid[1])} ${f1(q[0])} ${f1(q[1])}`;
    }
  }
  let spider = '';
  if (r() < 0.55) {
    const a = angles[Math.floor(threads / 2)];
    const hang = at(a, R * 0.45);
    const drop = (18 + r() * 26) * k * sy;
    const bx = hang[0],
      by = hang[1] + drop;
    const s = 3.2 * k;
    let legs = '';
    for (const side of [-1, 1])
      for (let l = 0; l < 4; l++) {
        const ly = by - s * 0.4 + l * s * 0.45;
        legs += `M${f1(bx + side * s * 0.6)} ${f1(ly)}q${f1(side * s * 1.1)} ${f1(-s * 0.9)} ${f1(side * s * 1.9)} ${f1((l - 1.5) * s * 0.5 + s * 0.4)}`;
      }
    spider = `<path d='M${f1(hang[0])} ${f1(hang[1])}V${f1(by - s)}' stroke='#e8e8e8' stroke-width='${f1(0.5 * k)}'/><path d='${legs}' fill='none' stroke='#1a1a1a' stroke-width='${f1(0.7 * k)}' stroke-linecap='round'/><circle cx='${f1(bx)}' cy='${f1(by - s * 0.6)}' r='${f1(s * 0.55)}' fill='#1a1a1a'/><ellipse cx='${f1(bx)}' cy='${f1(by + s * 0.4)}' rx='${f1(s * 0.8)}' ry='${f1(s)}' fill='#1a1a1a'/>`;
  }
  out.front +=
    `<defs><clipPath id='${uid}-ficha'><rect width='${f1(W)}' height='${f1(H)}'/></clipPath></defs>` +
    `<g clip-path='url(#${uid}-ficha)' fill='none' stroke-linecap='round'>` +
    `<path d='${d}' stroke='#000' stroke-opacity='.18' stroke-width='${f1(0.9 * k)}' transform='translate(${f1(0.5 * k)} ${f1(0.7 * k)})'/>` +
    `<path d='${d}' stroke='#f7f7f7' stroke-opacity='.85' stroke-width='${f1(0.6 * k)}'/>` +
    `</g>${spider}`;
}

// ----- Beijo de batom -----

const LIPSTICK = ['#d6203a', '#e8458b', '#8e1f5a', '#ff5a4c', '#b0306a', '#6b1d2f', '#ff7aa8', '#c2564a', '#7a2a8c'];

/** As bocas, num quadro de 40×28: a de lábios fechados, a de biquinho e a de sorriso. */
const LIPS: readonly { up: string; low: string }[] = [
  {
    up: 'M1 12C5 7 10 3.5 14.5 3.5C17 3.5 18.8 5 20 6.4C21.2 5 23 3.5 25.5 3.5C30 3.5 35 7 39 12C33 12.6 26 11.4 20 12.4C14 11.4 7 12.6 1 12Z',
    low: 'M1 13.2C7 14 14 13.6 20 14.4C26 13.6 33 14 39 13.2C35.5 20.5 28 25 20 25C12 25 4.5 20.5 1 13.2Z',
  },
  {
    up: 'M8 12C11 8 14 5 17 5C18.4 5 19.4 6.4 20 7.6C20.6 6.4 21.6 5 23 5C26 5 29 8 32 12C27 12.8 24 12 20 12.6C16 12 13 12.8 8 12Z',
    low: 'M8 13.4C12 14.2 16 13.8 20 14.4C24 13.8 28 14.2 32 13.4C30.4 20.4 25.6 24.6 20 24.6C14.4 24.6 9.6 20.4 8 13.4Z',
  },
  {
    up: 'M1 10C5 7.6 10 4.5 14.5 4.5C17 4.5 18.8 6 20 7.2C21.2 6 23 4.5 25.5 4.5C30 4.5 35 7.6 39 10C33 12.4 26 12.4 20 13C14 12.4 7 12.4 1 10Z',
    low: 'M1 11.2C7 13.8 14 14 20 14.4C26 14 33 13.8 39 11.2C35 19.4 28 23 20 23C12 23 5 19.4 1 11.2Z',
  },
];

/**
 * Marca de beijo de batom: uma, duas ou três, de boca fechada, de biquinho ou sorrindo, de tamanhos e
 * cores diferentes. Umas bem apertadas, outras de leve; umas marcaram só de um lado; às vezes a boca
 * encostou duas vezes e ficou a sombra da primeira. Os vincos e a tinta falhando de leve.
 */
function kiss(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const col = LIPSTICK[Math.floor(r() * LIPSTICK.length)];
  const n = r() < 0.5 ? 1 : r() < 0.7 ? 2 : 3;
  const taken: { p: Pt; R: number }[] = [];
  let defs = '',
    body = '';
  let first: Pt | null = null;
  for (let i = 0; i < n; i++) {
    // do tamanho de uma boca de gente: nada de boquinha miúda
    const w = (46 + r() * 18) * k;
    // as outras, perto da primeira (um rastro de beijos), ou soltas pela beirada
    const prev: Pt | null = first;
    const near: boolean = !!prev && r() < 0.5;
    const p: Pt = near && prev ? [clamp(prev[0] + (r() - 0.5) * w * 2.4, w * 0.5, W - w * 0.5), clamp(prev[1] + (r() - 0.5) * w * 1.6, w * 0.4, H - w * 0.4)] : spot(W, H, r, taken, w * 0.55, w * 0.5);
    const [x, y] = p;
    first = first ?? p;
    const lips = LIPS[Math.floor(r() * LIPS.length)];
    const sx = 0.85 + r() * 0.3,
      sy = 0.75 + r() * 0.5;
    const rot = (r() - 0.5) * 70;
    const press = r() < 0.35 ? 0.45 + r() * 0.2 : 0.8 + r() * 0.15;
    let creases = '';
    for (let j = 0; j < 12; j++) {
      const cx = 5 + j * 2.7 + (r() - 0.5);
      creases += `M${f1(cx)} ${f1(11.2 - 2 - r() * 3)}L${f1(cx + (cx - 20) * 0.08)} ${f1(11.4)}M${f1(cx)} ${f1(14.6)}L${f1(cx + (cx - 20) * 0.1)} ${f1(17 + r() * 5)}`;
    }
    const mouth = `<path d='${lips.up}' fill='${col}'/><path d='${lips.low}' fill='${col}'/><path d='${creases}' stroke='#fff' stroke-opacity='.4' stroke-width='.55' stroke-linecap='round'/>`;
    // marcou só de um lado: some aos poucos para o outro
    let mask = '';
    if (r() < 0.4) {
      const id = `${uid}-meia${i}`;
      defs += `<linearGradient id='${id}-g' gradientTransform='rotate(${Math.round(r() * 360)} .5 .5)'><stop offset='.3' stop-color='#fff'/><stop offset='.85' stop-color='#fff' stop-opacity='.05'/></linearGradient><mask id='${id}' maskContentUnits='objectBoundingBox'><rect width='1' height='1' fill='url(#${id}-g)'/></mask>`;
      mask = ` mask='url(#${id})'`;
    }
    const place = (dx: number, dy: number, turn: number) =>
      `translate(${f1(x + dx)} ${f1(y + dy)}) rotate(${f1(rot + turn)}) scale(${((w / 40) * sx).toFixed(3)} ${((w / 40) * sy).toFixed(3)}) translate(-20 -14)`;
    // encostou duas vezes: a primeira ficou fraquinha, um pouco ao lado
    if (r() < 0.25) body += `<g transform='${place((r() - 0.5) * 6 * k, (r() - 0.5) * 5 * k, (r() - 0.5) * 16)}' opacity='${(press * 0.35).toFixed(2)}'>${mouth}</g>`;
    body += `<g transform='${place(0, 0, 0)}' opacity='${press.toFixed(2)}'${mask}>${mouth}</g>`;
  }
  out.front += `<defs>${inkFilter(`${uid}-batom`, 7 + Math.floor(r() * 90), 0.8 + r() * 0.8)}${defs}</defs><g filter='url(#${uid}-batom)'>${body}</g>`;
}

// ===================== A TV e o computador (2026-10-02) =====================

// ----- Antena de TV -----

/**
 * A antena de coelhinho em cima da ficha: a base de plástico sentada na beirada de cima, as duas varetas
 * de cromo abertas em V passando da ficha, com as bolinhas na ponta, e o fio chato descendo de lado.
 * Às vezes uma ponta ganhou a bolota de palha de aço, para pegar melhor.
 */
function tvAntenna(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const kk = Math.max(0.5, k);
  const bx = W * (0.68 + r() * 0.18),
    by = 13 * kk; // o pé da base, já dentro da ficha
  const bw = (52 + r() * 8) * kk,
    bh = (22 + r() * 4) * kk;
  const plastic = ['#26272c', '#3b2f2a', '#5b5f66', '#e9e4d8'][Math.floor(r() * 4)];
  const light = plastic === '#e9e4d8';
  const hub: Pt = [bx, by - bh * 0.92];
  // as varetas: três gomos cada, afinando, abertas para os dois lados (uma às vezes torta)
  let rods = '',
    rodShadow = '',
    tips = '';
  const spread = 24 + r() * 18;
  const steel = `url(#${uid}-cromo)`;
  for (const side of [-1, 1]) {
    const ang = ((side * (spread + (r() - 0.5) * 12) - 90) * Math.PI) / 180;
    const len = (80 + r() * 30) * kk;
    const bent = r() < 0.2;
    const ux = Math.cos(ang),
      uy = Math.sin(ang);
    const widths = [3.6, 2.7, 1.9].map((w) => w * kk);
    let p: Pt = [hub[0] + ux * 4 * kk, hub[1] + uy * 4 * kk];
    for (let s = 0; s < 3; s++) {
      const L = len * [0.36, 0.33, 0.31][s];
      // a vareta torta dobra no último gomo
      const a2 = bent && s === 2 ? ang + side * 0.5 : ang;
      const q: Pt = [p[0] + Math.cos(a2) * L, p[1] + Math.sin(a2) * L];
      rods += `<path d='M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}' stroke='#4a4f57' stroke-width='${f1(widths[s] + 1 * kk)}'/><path d='M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}' stroke='${steel}' stroke-width='${f1(widths[s])}'/>`;
      // a emenda de um gomo para o outro: um anelzinho
      if (s < 2) rods += `<circle cx='${f1(q[0])}' cy='${f1(q[1])}' r='${f1(widths[s] * 0.62)}' fill='#d9dde2' stroke='#4a4f57' stroke-width='${f1(0.5 * kk)}'/>`;
      // a sombra só onde a vareta passa por cima do papel
      if (p[1] > 0 || q[1] > 0) rodShadow += `<path d='M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}'/>`;
      p = q;
    }
    if (side === 1 && r() < 0.4) {
      // a palha de aço: uma bolota amassada, cheia de facetas
      const R = 7 * kk;
      let foil = '';
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2,
          d = r() * R * 0.75;
        const cx = p[0] + Math.cos(a) * d,
          cy = p[1] + Math.sin(a) * d;
        const pts: Pt[] = [];
        for (let v = 0; v < 5; v++) {
          const b = (v / 5) * Math.PI * 2 + r();
          pts.push([cx + Math.cos(b) * R * (0.25 + r() * 0.35), cy + Math.sin(b) * R * (0.25 + r() * 0.35)]);
        }
        foil += `<path d='M${pts.map((q) => `${f1(q[0])} ${f1(q[1])}`).join('L')}Z' fill='${['#f1f3f5', '#c4c9cf', '#9aa1a9', '#e2e5e9', '#7d848c'][Math.floor(r() * 5)]}'/>`;
      }
      tips += `<circle cx='${f1(p[0])}' cy='${f1(p[1])}' r='${f1(R)}' fill='#aeb4bb'/>${foil}`;
    } else tips += `<circle cx='${f1(p[0])}' cy='${f1(p[1])}' r='${f1(2.8 * kk)}' fill='${steel}' stroke='#4a4f57' stroke-width='${f1(0.6 * kk)}'/><circle cx='${f1(p[0] - 0.9 * kk)}' cy='${f1(p[1] - 0.9 * kk)}' r='${f1(0.9 * kk)}' fill='#fff'/>`;
  }
  // a base: o domo de plástico, com o botão de sintonia na frente e o brilho de cima
  const dome = `M${f1(bx - bw / 2)} ${f1(by)}C${f1(bx - bw / 2)} ${f1(by - bh * 1.25)} ${f1(bx + bw / 2)} ${f1(by - bh * 1.25)} ${f1(bx + bw / 2)} ${f1(by)}Z`;
  const base =
    `<path d='${dome}' fill='${plastic}'/>` +
    `<path d='${dome}' fill='url(#${uid}-domo)'/>` +
    `<rect x='${f1(bx - bw / 2 - 2 * kk)}' y='${f1(by - 2.5 * kk)}' width='${f1(bw + 4 * kk)}' height='${f1(4 * kk)}' rx='${f1(1.5 * kk)}' fill='${light ? '#cfc8b8' : '#18191c'}'/>` +
    `<circle cx='${f1(bx + bw * 0.18)}' cy='${f1(by - bh * 0.38)}' r='${f1(3.4 * kk)}' fill='${light ? '#bdb5a3' : '#5a5d63'}' stroke='${light ? '#8f8775' : '#101113'}' stroke-width='${f1(0.7 * kk)}'/>` +
    `<path d='M${f1(bx + bw * 0.18)} ${f1(by - bh * 0.38 - 2.6 * kk)}v${f1(2 * kk)}' stroke='${light ? '#6f6858' : '#c9ccd1'}' stroke-width='${f1(0.8 * kk)}' stroke-linecap='round'/>` +
    `<circle cx='${f1(hub[0])}' cy='${f1(hub[1] + 2 * kk)}' r='${f1(4.6 * kk)}' fill='${light ? '#d8d1c1' : '#2e3035'}' stroke='${light ? '#8f8775' : '#0e0f11'}' stroke-width='${f1(0.7 * kk)}'/>`;
  // o fio chato de TV antiga, saindo da base para a direita e caindo pelo lado de fora da ficha
  const c0: Pt = [bx + bw / 2 - 3 * kk, by - 2 * kk];
  const c1: Pt = [W + (7 + r() * 8) * kk, by + (40 + r() * 30) * kk];
  const wire = `M${f1(c0[0])} ${f1(c0[1])}C${f1(c0[0] + 16 * kk)} ${f1(c0[1] + 2 * kk)} ${f1(c1[0])} ${f1(c1[1] - 34 * kk)} ${f1(c1[0])} ${f1(c1[1])}S${f1(c1[0] - 3 * kk)} ${f1(c1[1] + 50 * kk)} ${f1(c1[0] + 4 * kk)} ${f1(c1[1] + 90 * kk)}`;
  out.front +=
    `<defs><linearGradient id='${uid}-cromo' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f7f8fa'/><stop offset='.45' stop-color='#aab0b8'/><stop offset='.7' stop-color='#eef0f3'/><stop offset='1' stop-color='#7d848c'/></linearGradient>` +
    `<linearGradient id='${uid}-domo' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.32'/><stop offset='.45' stop-color='#fff' stop-opacity='.04'/><stop offset='1' stop-color='#000' stop-opacity='.3'/></linearGradient>` +
    `<filter id='${uid}-sombra-antena' x='-30%' y='-30%' width='160%' height='160%'><feGaussianBlur stdDeviation='${f1(1.4 * kk)}'/></filter></defs>` +
    `<g fill='none' stroke='#000' stroke-opacity='.28' stroke-width='${f1(2.6 * kk)}' stroke-linecap='round' transform='translate(${f1(2 * kk)} ${f1(3.5 * kk)})' filter='url(#${uid}-sombra-antena)'>${rodShadow}<path d='${wire}'/></g>` +
    `<path d='${dome}' transform='translate(${f1(1.5 * kk)} ${f1(3 * kk)})' fill='#000' opacity='.35' filter='url(#${uid}-sombra-antena)'/>` +
    `<g fill='none' stroke-linecap='round'><path d='${wire}' stroke='#6b5232' stroke-width='${f1(3.4 * kk)}'/><path d='${wire}' stroke='#a7834f' stroke-width='${f1(1.6 * kk)}'/><path d='${wire}' stroke='#3f2f1c' stroke-width='${f1(0.5 * kk)}' stroke-dasharray='${f1(3 * kk)} ${f1(2 * kk)}'/></g>` +
    `<g fill='none' stroke-linecap='round'>${rods}</g>` +
    base +
    tips;
}

// ----- Filtro de TV de tubo -----

/** O letreiro do canto da TV. */
const CHANNEL = ['SEM SINAL', 'CANAL 3', 'CANAL 4', 'AV 1', 'VÍDEO 2', 'CH 04', 'BUSCANDO…'];

/**
 * A ficha vista numa TV de tubo: as linhas de varredura, a grade de fósforo vermelho, verde e azul, a
 * tela escurecendo nas beiradas e mais ainda nas quinas, o reflexo do vidro curvo e uma faixa clara
 * rolando devagar de cima para baixo (parada para quem pediu menos movimento), com o letreiro verde do
 * canal num canto. Por cima de tudo.
 */
function crtFilter(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const kk = Math.max(0.5, k);
  const pitch = (2.6 + r() * 0.8) * kk;
  const strength = 0.16 + r() * 0.08;
  const tint = ['#7dff9a', '#ffd27a', '#9ad8ff', null][Math.floor(r() * 4)];
  const rx = 18 * kk;
  const label = CHANNEL[Math.floor(r() * CHANNEL.length)];
  const fs = 12 * kk;
  const lx = W - 16 * kk,
    ly = 14 * kk + fs;
  out.front +=
    `<defs>` +
    `<pattern id='${uid}-varre' width='4' height='${f1(pitch)}' patternUnits='userSpaceOnUse'><rect width='4' height='${f1(pitch * 0.45)}' fill='#000' fill-opacity='${strength.toFixed(2)}'/></pattern>` +
    `<pattern id='${uid}-fosforo' width='${f1(3 * kk)}' height='4' patternUnits='userSpaceOnUse'><rect width='${f1(kk)}' height='4' fill='#ff2a2a'/><rect x='${f1(kk)}' width='${f1(kk)}' height='4' fill='#2aff4a'/><rect x='${f1(2 * kk)}' width='${f1(kk)}' height='4' fill='#2a5bff'/></pattern>` +
    `<radialGradient id='${uid}-vinheta' cx='.5' cy='.5' r='.72'><stop offset='.55' stop-color='#000' stop-opacity='0'/><stop offset='.85' stop-color='#000' stop-opacity='.28'/><stop offset='1' stop-color='#000' stop-opacity='.62'/></radialGradient>` +
    `<linearGradient id='${uid}-vidro' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.2'/><stop offset='.35' stop-color='#fff' stop-opacity='.04'/><stop offset='.36' stop-color='#fff' stop-opacity='0'/></linearGradient>` +
    `<linearGradient id='${uid}-rola' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='.09'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>` +
    `<filter id='${uid}-borda' x='-5%' y='-5%' width='110%' height='110%'><feGaussianBlur stdDeviation='${f1(5 * kk)}'/></filter>` +
    `<filter id='${uid}-quina' x='-5%' y='-5%' width='110%' height='110%'><feGaussianBlur stdDeviation='${f1(1.6 * kk)}'/></filter>` +
    `<clipPath id='${uid}-tela'><rect width='${f1(W)}' height='${f1(H)}'/></clipPath>` +
    `</defs>` +
    `<g clip-path='url(#${uid}-tela)'>` +
    (tint ? `<rect width='${f1(W)}' height='${f1(H)}' fill='${tint}' fill-opacity='.07'/>` : '') +
    `<rect width='${f1(W)}' height='${f1(H)}' fill='url(#${uid}-fosforo)' opacity='.07'/>` +
    `<rect width='${f1(W)}' height='${f1(H)}' fill='url(#${uid}-varre)'/>` +
    `<g class='rola' style='--rola:${f1(H + 60 * kk)}px'><rect y='${f1(-50 * kk)}' width='${f1(W)}' height='${f1(44 * kk)}' fill='url(#${uid}-rola)'/></g>` +
    `<rect width='${f1(W)}' height='${f1(H)}' fill='url(#${uid}-vinheta)'/>` +
    // a moldura de dentro do tubo: a tela é redonda nas quinas e escura na beirada
    `<rect x='${f1(-6 * kk)}' y='${f1(-6 * kk)}' width='${f1(W + 12 * kk)}' height='${f1(H + 12 * kk)}' rx='${f1(rx)}' fill='none' stroke='#000' stroke-opacity='.55' stroke-width='${f1(14 * kk)}' filter='url(#${uid}-borda)'/>` +
    // as quinas fora da tela redonda: escuras como a moldura do tubo, sem deixar ponta de papel clara
    `<path fill-rule='evenodd' d='M-2 -2H${f1(W + 2)}V${f1(H + 2)}H-2ZM${f1(rx)} 0H${f1(W - rx)}Q${f1(W)} 0 ${f1(W)} ${f1(rx)}V${f1(H - rx)}Q${f1(W)} ${f1(H)} ${f1(W - rx)} ${f1(H)}H${f1(rx)}Q0 ${f1(H)} 0 ${f1(H - rx)}V${f1(rx)}Q0 0 ${f1(rx)} 0Z' fill='#050506' fill-opacity='.82' filter='url(#${uid}-quina)'/>` +
    `<path d='M0 0H${f1(W * 0.62)}C${f1(W * 0.42)} ${f1(H * 0.12)} ${f1(W * 0.18)} ${f1(H * 0.3)} 0 ${f1(H * 0.58)}Z' fill='url(#${uid}-vidro)'/>` +
    `</g>` +
    // o letreiro verde do canal no canto, como o da TV quando troca de canal ou fica sem sinal
    `<g font-family='ui-monospace, Consolas, "Courier New", monospace' font-weight='700' font-size='${f1(fs)}' letter-spacing='${f1(1 * kk)}' text-anchor='end'>` +
    `<text x='${f1(lx + 1.2 * kk)}' y='${f1(ly + 1.4 * kk)}' fill='#000' fill-opacity='.5'>${label}</text><text x='${f1(lx)}' y='${f1(ly)}' fill='#5dff6e' stroke='#06210c' stroke-opacity='.85' stroke-width='${f1(2.4 * kk)}' stroke-linejoin='round' paint-order='stroke'>${label}</text></g>`;
}

// ----- Barras de cor -----

/**
 * Um adesivo das barras de cor da TV fora do ar: as sete barras, a fileira fininha invertida embaixo e a
 * faixa escura com o branco e o azul, com a beirada branca do corte e o brilho do plástico.
 */
function colorBars(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const w = (96 + r() * 18) * k,
    h = w * 0.66;
  const [x, y] = cornerAt(W, H, Math.floor(r() * 2), w * 0.55 + 6 * k, h * 0.55 + 8 * k);
  const rot = (r() - 0.5) * 16;
  const top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const mid = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  const bw = w / 7;
  let bars = '';
  top.forEach((c, i) => (bars += `<rect x='${f1(i * bw)}' width='${f1(bw + 0.4)}' height='${f1(h * 0.66)}' fill='${c}'/>`));
  mid.forEach((c, i) => (bars += `<rect x='${f1(i * bw)}' y='${f1(h * 0.66)}' width='${f1(bw + 0.4)}' height='${f1(h * 0.09)}' fill='${c}'/>`));
  const low: [number, string][] = [
    [1.25, '#00214c'],
    [1.25, '#ffffff'],
    [1.25, '#32006a'],
    [1.5, '#131313'],
    [0.33, '#090909'],
    [0.34, '#131313'],
    [0.33, '#1d1d1d'],
    [0.75, '#131313'],
  ];
  let lx = 0;
  for (const [u, c] of low) {
    bars += `<rect x='${f1(lx)}' y='${f1(h * 0.75)}' width='${f1(u * bw + 0.4)}' height='${f1(h * 0.25)}' fill='${c}'/>`;
    lx += u * bw;
  }
  const b = 3 * k;
  out.front +=
    `<defs><filter id='${uid}-sombra-barras' x='-20%' y='-20%' width='140%' height='150%'><feGaussianBlur stdDeviation='${f1(1.5 * k)}'/></filter>` +
    `<linearGradient id='${uid}-brilho-barras' x1='0' y1='0' x2='1' y2='1'><stop offset='.1' stop-color='#fff' stop-opacity='.3'/><stop offset='.4' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) translate(${f1(-w / 2)} ${f1(-h / 2)})'>` +
    `<rect x='${f1(-b + 1 * k)}' y='${f1(-b + 2 * k)}' width='${f1(w + 2 * b)}' height='${f1(h + 2 * b)}' rx='${f1(2.5 * k)}' fill='#000' opacity='.32' filter='url(#${uid}-sombra-barras)'/>` +
    `<rect x='${f1(-b)}' y='${f1(-b)}' width='${f1(w + 2 * b)}' height='${f1(h + 2 * b)}' rx='${f1(2.5 * k)}' fill='#f7f5ef'/>` +
    bars +
    `<rect width='${f1(w)}' height='${f1(h)}' fill='url(#${uid}-brilho-barras)'/>` +
    `</g>`;
}

// ----- Disquete -----

const FLOPPY = ['#26282e', '#2f5fc4', '#c23a33', '#e4ddc9', '#6f45b0', '#2c8a5a', '#f0c330'];
const FLOPPY_LABEL = ['SAVE 1', 'BACKUP', 'ZERADO!', 'NÃO APAGAR', 'MEUS JOGOS', 'DISCO 2/3', 'FASE 8', 'SAVE FINAL'];

/**
 * Um disquete de 3½ colado na ficha: o corpo de plástico com a quina cortada, a janela de metal que
 * corre com a fenda do disco, os furinhos de trava embaixo e a etiqueta escrita à mão.
 */
function floppyDisk(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const s = (74 + r() * 12) * k;
  const [x, y] = cornerAt(W, H, Math.floor(r() * 3), s * 0.55 + 6 * k, s * 0.55 + 6 * k);
  const rot = (r() - 0.5) * 30;
  const body = FLOPPY[Math.floor(r() * FLOPPY.length)];
  const pale = body === '#e4ddc9' || body === '#f0c330';
  const c = s * 0.07;
  const shape = `M${f1(c * 0.6)} 0H${f1(s - c)}L${f1(s)} ${f1(c)}V${f1(s - c * 0.6)}Q${f1(s)} ${f1(s)} ${f1(s - c * 0.6)} ${f1(s)}H${f1(c * 0.6)}Q0 ${f1(s)} 0 ${f1(s - c * 0.6)}V${f1(c * 0.6)}Q0 0 ${f1(c * 0.6)} 0Z`;
  const shx = s * 0.22,
    shw = s * 0.52,
    shh = s * 0.34;
  const label = FLOPPY_LABEL[Math.floor(r() * FLOPPY_LABEL.length)];
  const stripe = ['#e8453c', '#2f7de0', '#2fae4e', '#f2a93b', '#8a5cf6'][Math.floor(r() * 5)];
  const ink = r() < 0.6 ? '#2a3fa0' : '#222';
  out.front +=
    `<defs><filter id='${uid}-sombra-disco' x='-20%' y='-20%' width='140%' height='150%'><feGaussianBlur stdDeviation='${f1(1.6 * k)}'/></filter>` +
    `<linearGradient id='${uid}-metal' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#9aa1a9'/><stop offset='.3' stop-color='#e9ecef'/><stop offset='.55' stop-color='#b9bfc6'/><stop offset='1' stop-color='#d7dbe0'/></linearGradient>` +
    `<linearGradient id='${uid}-plastico' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.18'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.18'/></linearGradient></defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) translate(${f1(-s / 2)} ${f1(-s / 2)})'>` +
    `<path d='${shape}' transform='translate(${f1(1.2 * k)} ${f1(2.4 * k)})' fill='#000' opacity='.38' filter='url(#${uid}-sombra-disco)'/>` +
    `<path d='${shape}' fill='${body}'/><path d='${shape}' fill='url(#${uid}-plastico)'/>` +
    // o rebaixo onde a janela corre
    `<rect x='${f1(shx - s * 0.04)}' y='0' width='${f1(shw + s * 0.2)}' height='${f1(shh + s * 0.02)}' fill='#000' fill-opacity='.14'/>` +
    `<rect x='${f1(shx)}' y='0' width='${f1(shw)}' height='${f1(shh)}' fill='url(#${uid}-metal)'/>` +
    `<rect x='${f1(shx + shw * 0.62)}' y='${f1(shh * 0.16)}' width='${f1(shw * 0.17)}' height='${f1(shh * 0.66)}' rx='${f1(0.6 * k)}' fill='#3a3d42'/>` +
    // a etiqueta: a faixa de cor em cima e o nome à mão
    `<rect x='${f1(s * 0.12)}' y='${f1(s * 0.46)}' width='${f1(s * 0.76)}' height='${f1(s * 0.5)}' rx='${f1(1 * k)}' fill='#fbf8ef'/>` +
    `<rect x='${f1(s * 0.12)}' y='${f1(s * 0.46)}' width='${f1(s * 0.76)}' height='${f1(s * 0.07)}' fill='${stripe}'/>` +
    `<path d='M${f1(s * 0.17)} ${f1(s * 0.8)}H${f1(s * 0.83)}M${f1(s * 0.17)} ${f1(s * 0.9)}H${f1(s * 0.83)}' stroke='#9fb6d8' stroke-width='${f1(0.5 * k)}'/>` +
    `<text x='${f1(s * 0.5)}' y='${f1(s * 0.76)}' text-anchor='middle' font-family='var(--f-hand)' font-weight='700' font-size='${f1(s * 0.13)}' fill='${ink}' transform='rotate(-3 ${f1(s * 0.5)} ${f1(s * 0.72)})'>${label}</text>` +
    // os furinhos de trava e a setinha de encaixe
    `<rect x='${f1(s * 0.05)}' y='${f1(s * 0.86)}' width='${f1(s * 0.05)}' height='${f1(s * 0.07)}' fill='${pale ? '#6b6457' : '#0b0c0e'}'/>` +
    `<rect x='${f1(s * 0.9)}' y='${f1(s * 0.86)}' width='${f1(s * 0.05)}' height='${f1(s * 0.07)}' fill='${pale ? '#6b6457' : '#0b0c0e'}'/>` +
    `<path d='M${f1(s * 0.05)} ${f1(s * 0.08)}l${f1(s * 0.04)} ${f1(s * 0.04)}l${f1(s * 0.04)} ${f1(-s * 0.04)}' fill='none' stroke='${pale ? '#6b6457' : '#9aa1a9'}' stroke-width='${f1(0.7 * k)}'/>` +
    `</g>`;
}

// ----- Janela de erro -----

const ERRORS: readonly (readonly [string, string])[] = [
  ['Resenha boa demais.', 'O mural não aguentou.'],
  ['Este jogo travou', 'o seu coração.'],
  ['Nota acima do', 'permitido pelo sistema.'],
  ['Não foi possível', 'parar de jogar.'],
  ['Memória insuficiente', 'para tanta saudade.'],
  ['Erro 404: tempo livre', 'não encontrado.'],
  ['Deseja mesmo zerar', 'de novo? (Sim)'],
];

/**
 * A janelinha de erro de computador antigo, impressa e colada na ficha: a barra de título azul com o X,
 * o corpo cinza em relevo, o ícone vermelho, o recado de duas linhas e o botão de OK, com a setinha do
 * mouse em cima dele.
 */
function errorWindow(W: number, H: number, k: number, r: () => number, uid: string, out: DecorArt): void {
  const w = (150 + r() * 16) * k,
    h = w * 0.5;
  const [x, y] = cornerAt(W, H, Math.floor(r() * 2), w * 0.5 + 8 * k, h * 0.5 + 10 * k);
  const rot = (r() - 0.5) * 9;
  const [l1, l2] = ERRORS[Math.floor(r() * ERRORS.length)];
  const tb = h * 0.2,
    u = w / 150;
  const font = `Tahoma, Verdana, "Segoe UI", sans-serif`;
  const bevel = (bx: number, by: number, bw: number, bh: number, inset = false) =>
    `<path d='M${f1(bx)} ${f1(by + bh)}V${f1(by)}H${f1(bx + bw)}' fill='none' stroke='${inset ? '#808080' : '#fff'}' stroke-width='${f1(1.2 * u)}'/><path d='M${f1(bx)} ${f1(by + bh)}H${f1(bx + bw)}V${f1(by)}' fill='none' stroke='${inset ? '#fff' : '#404040'}' stroke-width='${f1(1.2 * u)}'/>`;
  const ok = { x: w * 0.62, y: h * 0.7, w: w * 0.24, h: h * 0.18 };
  const cur = (cx: number, cy: number, s: number) =>
    `<path d='M${f1(cx)} ${f1(cy)}v${f1(17 * s)}l${f1(4 * s)} ${f1(-3.8 * s)}l${f1(2.9 * s)} ${f1(6.2 * s)}l${f1(2.8 * s)} ${f1(-1.3 * s)}l${f1(-2.9 * s)} ${f1(-6 * s)}h${f1(5.6 * s)}Z' fill='#fff' stroke='#000' stroke-width='${f1(1 * s)}' stroke-linejoin='round'/>`;
  out.front +=
    `<defs><filter id='${uid}-sombra-erro' x='-20%' y='-20%' width='140%' height='150%'><feGaussianBlur stdDeviation='${f1(1.8 * k)}'/></filter>` +
    `<linearGradient id='${uid}-titulo' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#0a246a'/><stop offset='1' stop-color='#3a6ea5'/></linearGradient></defs>` +
    `<g transform='translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) translate(${f1(-w / 2)} ${f1(-h / 2)})'>` +
    `<rect x='${f1(1.5 * k)}' y='${f1(3 * k)}' width='${f1(w)}' height='${f1(h)}' fill='#000' opacity='.4' filter='url(#${uid}-sombra-erro)'/>` +
    `<rect width='${f1(w)}' height='${f1(h)}' fill='#d4d0c8'/>` +
    bevel(0.6 * u, 0.6 * u, w - 1.2 * u, h - 1.2 * u) +
    `<rect x='${f1(3 * u)}' y='${f1(3 * u)}' width='${f1(w - 6 * u)}' height='${f1(tb)}' fill='url(#${uid}-titulo)'/>` +
    `<text x='${f1(7 * u)}' y='${f1(3 * u + tb * 0.72)}' font-family='${font}' font-weight='700' font-size='${f1(tb * 0.62)}' fill='#fff'>Erro</text>` +
    // o X de fechar
    `<rect x='${f1(w - 3 * u - tb * 0.9)}' y='${f1(3 * u + tb * 0.12)}' width='${f1(tb * 0.8)}' height='${f1(tb * 0.76)}' fill='#d4d0c8'/>` +
    bevel(w - 3 * u - tb * 0.9, 3 * u + tb * 0.12, tb * 0.8, tb * 0.76) +
    `<path d='M${f1(w - 3 * u - tb * 0.72)} ${f1(3 * u + tb * 0.3)}l${f1(tb * 0.44)} ${f1(tb * 0.4)}m0 ${f1(-tb * 0.4)}l${f1(-tb * 0.44)} ${f1(tb * 0.4)}' stroke='#000' stroke-width='${f1(1.4 * u)}'/>` +
    // o ícone de erro: o círculo vermelho com o X branco
    `<circle cx='${f1(w * 0.14)}' cy='${f1(h * 0.5)}' r='${f1(h * 0.15)}' fill='#d81e1e' stroke='#7a0d0d' stroke-width='${f1(0.8 * u)}'/>` +
    `<path d='M${f1(w * 0.14 - h * 0.065)} ${f1(h * 0.435)}l${f1(h * 0.13)} ${f1(h * 0.13)}m0 ${f1(-h * 0.13)}l${f1(-h * 0.13)} ${f1(h * 0.13)}' stroke='#fff' stroke-width='${f1(2.2 * u)}' stroke-linecap='round'/>` +
    `<g font-family='${font}' font-size='${f1(h * 0.115)}' fill='#000'><text x='${f1(w * 0.27)}' y='${f1(h * 0.46)}'>${l1}</text><text x='${f1(w * 0.27)}' y='${f1(h * 0.6)}'>${l2}</text></g>` +
    // o botão de OK, com o pontilhado do foco
    `<rect x='${f1(ok.x)}' y='${f1(ok.y)}' width='${f1(ok.w)}' height='${f1(ok.h)}' fill='#d4d0c8' stroke='#000' stroke-width='${f1(0.8 * u)}'/>` +
    bevel(ok.x + 0.8 * u, ok.y + 0.8 * u, ok.w - 1.6 * u, ok.h - 1.6 * u) +
    `<rect x='${f1(ok.x + 3 * u)}' y='${f1(ok.y + 2.6 * u)}' width='${f1(ok.w - 6 * u)}' height='${f1(ok.h - 5.2 * u)}' fill='none' stroke='#000' stroke-width='${f1(0.5 * u)}' stroke-dasharray='${f1(0.8 * u)} ${f1(0.8 * u)}'/>` +
    `<text x='${f1(ok.x + ok.w / 2)}' y='${f1(ok.y + ok.h * 0.7)}' text-anchor='middle' font-family='${font}' font-size='${f1(h * 0.11)}' fill='#000'>OK</text>` +
    cur(ok.x + ok.w * 0.62, ok.y + ok.h * 0.45, 0.85 * u) +
    `</g>`;
}
