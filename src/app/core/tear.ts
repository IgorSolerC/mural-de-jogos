import { wobble } from './wall-physics';

/**
 * O recorte de revista, sorteado pelo id: sempre o mesmo para o mesmo desejo, nunca igual ao do
 * vizinho. Sai como máscaras SVG (caixa 100 × 100, esticada no elemento): o contorno do papel e, nos
 * rasgos, um pouco para dentro, o da foto impressa. Onde a revista rasgou, a camada de tinta sai
 * antes do papel e sobra a fibra branca entre as duas; onde a tesoura cortou, não sobra nada.
 *
 * Rasgados à mão: `bordas` (tudo), `topo` (um rasgo grande enviesado), `lado`, `canto` (arrancado)
 * e `dois` (dois lados). Cortados: `tesoura` (reto, às vezes com o degrau de onde a tesoura parou,
 * às vezes com o canto dobrado), `picote` (tesoura de picotar, em zigue-zague) e `destacavel` (o
 * cartão destacável da revista: cantos redondos e os dentinhos do picote).
 */
export type TearKind = 'bordas' | 'topo' | 'lado' | 'canto' | 'dois' | 'tesoura' | 'picote' | 'destacavel';
/** Um pedaço da página que veio junto com a foto: nada, o pé da matéria, uma coluna ou a cabeça. */
export type PageBit = 'nenhum' | 'baixo' | 'lado' | 'cabeca';
/** O formato da foto recortada. */
export type Shape = 'retrato' | 'alto' | 'quase' | 'quadrado';
/** De que revista saiu: couché brilhante, revista velha amarelada ou retícula grossa de gráfica barata. */
export type Print = 'brilho' | 'velha' | 'reticula';

export const SHAPE_RATIO: Record<Shape, string> = { retrato: '3 / 4', alto: '2 / 3', quase: '4 / 5', quadrado: '1 / 1' };
export const SHAPE_W_H: Record<Shape, number> = { retrato: 3 / 4, alto: 2 / 3, quase: 4 / 5, quadrado: 1 };

export interface Tear {
  kind: TearKind;
  page: PageBit;
  shape: Shape;
  print: Print;
  /** `url("data:image/svg+xml,…")` do papel inteiro. */
  paper: string;
  /** A máscara da foto; `none` quando foi a tesoura (a foto sai no mesmo corte do papel). */
  photo: string;
  /** O canto de cima dobrado para trás, em % da largura e da altura; null sem dobra. */
  fold: { side: 'esq' | 'dir'; w: number; h: number } | null;
}

type Pt = [number, number];
type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
export const TEAR_KINDS: readonly TearKind[] = ['bordas', 'topo', 'lado', 'canto', 'dois', 'tesoura', 'picote', 'destacavel'];
const CUT: ReadonlySet<TearKind> = new Set(['tesoura', 'picote', 'destacavel']);

/** A largura de referência de um recorte na parede, para os dentes do picote terem tamanho de dente. */
const REF_W = 190;

interface Plan {
  /** Quanto cada lado rasga (0 = reto). */
  amp: Record<Side, number>;
  /** O rasgo grande entra enviesado: quanto ele come de cada ponta do lado. */
  slope: Partial<Record<Side, [number, number]>>;
  /** O canto arrancado (índice do canto: 0 no alto à esquerda, em sentido horário) e o tamanho. */
  corner: { at: number; a: number; b: number } | null;
}

export function tearFor(id: string): Tear {
  let n = 0;
  const r = () => wobble(id, 200 + n++);
  const kind = TEAR_KINDS[Math.floor(r() * TEAR_KINDS.length)];
  const pr = r();
  const page: PageBit = pr < 0.24 ? 'baixo' : pr < 0.38 ? 'lado' : pr < 0.5 ? 'cabeca' : 'nenhum';
  const sr = r();
  const shape: Shape = sr < 0.4 ? 'retrato' : sr < 0.65 ? 'alto' : sr < 0.85 ? 'quase' : 'quadrado';
  const qr = r();
  const print: Print = qr < 0.55 ? 'brilho' : qr < 0.8 ? 'velha' : 'reticula';

  // o tamanho do papel em px, para os cortes de tesoura terem dentes e degraus do tamanho certo
  const photoW = page === 'lado' ? REF_W * 0.78 : REF_W;
  const extraH = page === 'baixo' ? 53 : page === 'cabeca' ? 36 : 0;
  const H = photoW / SHAPE_W_H[shape] + extraH;

  if (CUT.has(kind)) {
    const fold =
      kind === 'tesoura' && r() < 0.7
        ? { side: (r() < 0.5 ? 'esq' : 'dir') as 'esq' | 'dir', size: 26 + r() * 16 }
        : null;
    const px =
      kind === 'tesoura' ? scissors(REF_W, H, r, fold) : kind === 'picote' ? pinking(REF_W, H, r) : perforated(REF_W, H, r);
    const pts = px.map(([x, y]) => [(x / REF_W) * 100, (y / H) * 100] as Pt);
    return {
      kind,
      page,
      shape,
      print,
      paper: mask(pts),
      photo: 'none',
      fold: fold && { side: fold.side, w: (fold.size / REF_W) * 100, h: (fold.size / H) * 100 },
    };
  }

  const amp: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  const slope: Plan['slope'] = {};
  let corner: Plan['corner'] = null;
  switch (kind) {
    case 'bordas':
      for (const s of SIDES) amp[s] = 1.6 + r() * 1.4;
      break;
    case 'topo': {
      amp.top = 4 + r() * 2.5;
      const a = 1 + r() * 4;
      slope.top = r() < 0.5 ? [a, a + 4 + r() * 6] : [a + 4 + r() * 6, a];
      amp.bottom = r() < 0.5 ? 1.2 : 0;
      break;
    }
    case 'lado': {
      // a coluna da página fica sempre à esquerda: o rasgo grande vai do outro lado quando ela existe
      const s: Side = page === 'lado' || r() < 0.5 ? 'right' : 'left';
      amp[s] = 3.5 + r() * 2;
      slope[s] = [1 + r() * 5, 1 + r() * 5];
      amp.top = r() < 0.4 ? 1.4 : 0;
      break;
    }
    case 'canto':
      amp.bottom = r() < 0.35 ? 1.4 : 0;
      corner = { at: page === 'lado' || r() < 0.55 ? 1 : 0, a: 22 + r() * 16, b: 18 + r() * 16 };
      break;
    case 'dois': {
      const pair: [Side, Side] = r() < 0.5 ? ['top', 'right'] : ['bottom', 'left'];
      for (const s of pair) amp[s] = 2.2 + r() * 1.8;
      break;
    }
  }
  const plan: Plan = { amp, slope, corner };

  // a foto: os lados rasgados entram mais (fica a fibra); o lado que encosta no pedaço de página é borda de impressão, reta
  const photoAmp = { ...amp };
  const photoSlope: Plan['slope'] = { ...slope };
  const edgeOfPage: Side | null = page === 'baixo' ? 'bottom' : page === 'lado' ? 'left' : page === 'cabeca' ? 'top' : null;
  if (edgeOfPage) {
    photoAmp[edgeOfPage] = 0;
    delete photoSlope[edgeOfPage];
  }
  const cornerOnPage = corner && ((page === 'baixo' && corner.at >= 2) || (page === 'cabeca' && corner.at <= 1));
  const photoCorner = corner && !cornerOnPage ? { ...corner, a: corner.a + 3, b: corner.b + 3 } : null;
  const photoPlan: Plan = { amp: photoAmp, slope: photoSlope, corner: photoCorner };

  let m = 0;
  const r2 = () => wobble(id, 600 + m++);
  return {
    kind,
    page,
    shape,
    print,
    paper: mask(outline(plan, r, 0)),
    photo: mask(outline(photoPlan, r2, 1.9, edgeOfPage)),
    fold: null,
  };
}

/**
 * A tirinha de papel do nome: as duas pontas rasgadas à mão, as beiradas de cima e de baixo quase
 * retas (a caixa é larga e baixa: um passo em x vale uns 2px, em y menos de meio). Como no recorte,
 * duas máscaras: o papel inteiro e o miolo, um pouco para dentro, para a fibra clara aparecer onde
 * rasgou. A mesma folga em passos vira uns 4px nas pontas e 1px em cima e embaixo, como no papel.
 */
export function stripFor(id: string): { paper: string; core: string } {
  let n = 0;
  const r = () => wobble(id, 900 + n++);
  const plan: Plan = {
    amp: { top: 2 + r() * 3, right: 3.5 + r() * 2.5, bottom: 2 + r() * 3, left: 3.5 + r() * 2.5 },
    slope: { right: [r() * 3, r() * 3], left: [r() * 3, r() * 3] },
    corner: null,
  };
  const paper = mask(outline(plan, r, 0));
  let m = 0;
  const r2 = () => wobble(id, 1300 + m++);
  return { paper, core: mask(outline(plan, r2, 3.6)) };
}

/**
 * Um pedacinho cortado à tesoura (as palavras da manchete, as letras do título): quatro cortes
 * quase retos, cada canto um tanto fora do esquadro, às vezes um quinto corte que come uma quina.
 * Sai como `clip-path`, em px, para o desvio ser o mesmo numa palavra curta e numa comprida.
 */
export function snipFor(id: string, n: number, max = 3): string {
  let k = 0;
  const r = () => wobble(id, 1700 + n * 13 + k++);
  const d = () => (r() * max).toFixed(1);
  const pts = [`${d()}px ${d()}px`, `calc(100% - ${d()}px) ${d()}px`, `calc(100% - ${d()}px) calc(100% - ${d()}px)`, `${d()}px calc(100% - ${d()}px)`];
  // a quina comida: a tesoura cortou um canto em diagonal (os dois pontos, na ordem do contorno)
  if (r() < 0.3) {
    const at = Math.floor(r() * 4);
    const c = (3 + r() * 4).toFixed(1);
    const cut = [
      [`0 ${c}px`, `${c}px 0`],
      [`calc(100% - ${c}px) 0`, `100% ${c}px`],
      [`100% calc(100% - ${c}px)`, `calc(100% - ${c}px) 100%`],
      [`${c}px 100%`, `0 calc(100% - ${c}px)`],
    ][at];
    pts.splice(at, 1, ...cut);
  }
  return `polygon(${pts.join(', ')})`;
}

/* ===== Cortes de tesoura, desenhados em px e depois esticados na caixa 100 × 100 ===== */

/** Tesoura comum: quatro cortes quase retos, às vezes o degrau de onde ela parou e voltou, às vezes o canto dobrado. */
function scissors(W: number, H: number, r: () => number, fold: { side: 'esq' | 'dir'; size: number } | null): Pt[] {
  const nudge = () => r() * 2.2;
  const c: Pt[] = [
    [nudge(), nudge()],
    [W - nudge(), nudge()],
    [W - nudge(), H - nudge()],
    [nudge(), H - nudge()],
  ];
  // o canto dobrado para trás some do contorno: no lugar dele, a linha da dobra, em diagonal
  const at: Pt[][] = c.map((p) => [p]);
  if (fold?.side === 'esq') at[0] = [[c[0][0], c[0][1] + fold.size], [c[0][0] + fold.size, c[0][1]]];
  if (fold?.side === 'dir') at[1] = [[c[1][0] - fold.size, c[1][1]], [c[1][0], c[1][1] + fold.size]];
  const jogSide = r() < 0.55 ? Math.floor(r() * 4) : -1;
  const jogAt = 0.25 + r() * 0.5;
  const pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push(...at[i]);
    if (i !== jogSide) continue;
    // o degrau: a tesoura parou, a mão voltou um tiquinho para dentro e seguiu dali
    const a = at[i][at[i].length - 1];
    const b = at[(i + 1) % 4][0];
    const p = along(a, b, jogAt);
    const [nx, ny] = inward(a, b);
    pts.push(p, [p[0] + nx * 1.4, p[1] + ny * 1.4]);
  }
  return pts;
}

/** Tesoura de picotar: zigue-zague em volta, com dentes de uns 6px. */
function pinking(W: number, H: number, r: () => number): Pt[] {
  const depth = 3.2;
  // a mão não segura a tesoura no esquadro: cada canto sai um tanto fora do lugar
  const nudge = () => depth + r() * 1.6;
  const c: Pt[] = [
    [nudge(), nudge()],
    [W - nudge(), nudge()],
    [W - nudge(), H - nudge()],
    [nudge(), H - nudge()],
  ];
  const pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const teeth = Math.max(4, Math.round(len / (6 + r() * 0.4)));
    const [nx, ny] = inward(a, b);
    for (let k = 0; k < teeth * 2; k++) {
      const p = along(a, b, k / (teeth * 2));
      // as pontas saem para fora (até a borda), os vales entram
      const out = k % 2 === 1 ? -depth * (0.8 + r() * 0.35) : 0;
      pts.push([p[0] + nx * out, p[1] + ny * out]);
    }
  }
  return pts;
}

/** O cartão destacável: cantos redondos de faca e, nos quatro lados, os dentinhos que o picote deixa. */
function perforated(W: number, H: number, r: () => number): Pt[] {
  const R = 9 + r() * 4;
  const inset = 2.2;
  const pts: Pt[] = [];
  const x0 = inset;
  const y0 = inset;
  const x1 = W - inset;
  const y1 = H - inset;
  // os cantos, em sentido horário, com o centro do arco e o ângulo de começo
  const arcs: [number, number, number][] = [
    [x0 + R, y0 + R, Math.PI],
    [x1 - R, y0 + R, -Math.PI / 2],
    [x1 - R, y1 - R, 0],
    [x0 + R, y1 - R, Math.PI / 2],
  ];
  for (let i = 0; i < 4; i++) {
    const [cx, cy, start] = arcs[i];
    for (let k = 0; k <= 5; k++) {
      const t = start + (k / 5) * (Math.PI / 2);
      pts.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R]);
    }
    const next = arcs[(i + 1) % 4];
    const a = pts[pts.length - 1];
    const bStart = next[2];
    const b: Pt = [next[0] + Math.cos(bStart) * R, next[1] + Math.sin(bStart) * R];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const holes = Math.max(3, Math.round(len / 5.4));
    const [nx, ny] = inward(a, b);
    for (let k = 0; k < holes; k++) {
      // cada furo do picote vira um vale; entre dois furos, o dentinho de papel que segurava
      const t0 = k / holes;
      const t1 = (k + 0.5) / holes;
      const p0 = along(a, b, t0 + 0.12 / holes);
      const p1 = along(a, b, t1);
      const p2 = along(a, b, t0 + 0.88 / holes);
      const dent = 1.7 + r() * 0.5;
      pts.push(p0, [p1[0] + nx * dent, p1[1] + ny * dent], p2);
    }
  }
  return pts;
}

/** A normal para dentro de um lado, num contorno em sentido horário com y para baixo. */
function inward(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

/** O contorno rasgado, em sentido horário, lado por lado; `rim` empurra os lados rasgados para dentro. */
function outline(plan: Plan, r: () => number, rim: number, flat: Side | null = null): Pt[] {
  const nudge = () => r() * 0.9;
  const corners: Pt[] = [
    [nudge(), nudge()],
    [100 - nudge(), nudge()],
    [100 - nudge(), 100 - nudge()],
    [nudge(), 100 - nudge()],
  ];
  if (flat === 'bottom') {
    corners[2][1] = 100;
    corners[3][1] = 100;
  } else if (flat === 'left') {
    corners[0][0] = 0;
    corners[3][0] = 0;
  } else if (flat === 'top') {
    corners[0][1] = 0;
    corners[1][1] = 0;
  }
  const pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const side = SIDES[i];
    let from = corners[i];
    let to = corners[(i + 1) % 4];
    const c = plan.corner;
    // canto arrancado: o lado para antes do canto e um rasgo em diagonal liga ao lado seguinte
    if (c && c.at === i) from = along(corners[i], corners[(i + 1) % 4], c.b / 100);
    if (c && c.at === (i + 1) % 4) {
      to = along(corners[i], corners[(i + 1) % 4], 1 - c.a / 100);
      pts.push(...edge(from, to, plan.amp[side], plan.slope[side], rim, r));
      const next = along(corners[(i + 1) % 4], corners[(i + 2) % 4], c.b / 100);
      pts.push(...edge(to, next, 3 + r() * 1.5, [1 + r() * 2, 1 + r() * 2], rim + 0.6, r));
      continue;
    }
    pts.push(...edge(from, to, plan.amp[side], plan.slope[side], rim, r));
  }
  return pts;
}

function along(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Um lado, de `a` até `b` (sem incluir `b`). Reto: sem desvio. Rasgo: um passeio aleatório para
 * dentro do papel, com fiapos de vez em quando, que é como o papel rasga.
 */
function edge(a: Pt, b: Pt, amp: number, slope: [number, number] | undefined, rim: number, r: () => number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const [nx, ny] = inward(a, b);
  if (amp <= 0) return [a];
  const len = Math.hypot(dx, dy);
  const steps = Math.max(8, Math.round(len / 3.2));
  const out: Pt[] = [];
  let walk = r() * amp;
  for (let k = 0; k < steps; k++) {
    const t = k / steps;
    walk = Math.min(amp, Math.max(0, walk + (r() - 0.5) * amp * 0.85));
    const fray = r() < 0.14 ? r() * amp * 0.7 : r() * 0.45;
    const base = slope ? slope[0] + (slope[1] - slope[0]) * t : 0;
    const d = base + walk + fray + rim;
    const jitterT = k === 0 ? 0 : ((r() - 0.5) * 0.4) / steps;
    out.push([a[0] + dx * (t + jitterT) + nx * d, a[1] + dy * (t + jitterT) + ny * d]);
  }
  return out;
}

function mask(pts: Pt[]): string {
  const d = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${d}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
