import { wobble } from './wall-physics';

/**
 * O recorte de revista, sorteado pelo id: sempre o mesmo para o mesmo desejo, nunca igual ao do
 * vizinho. Sai como máscaras SVG (caixa 100 × 100, esticada no elemento): o contorno do papel e, nos
 * rasgos, um pouco para dentro, o da foto impressa. Onde a revista rasgou, a camada de tinta sai
 * antes do papel e sobra a fibra branca entre as duas; onde a tesoura cortou, não sobra nada.
 *
 * Rasgados à mão: `bordas` (tudo), `topo` (um rasgo grande enviesado), `lado`, `canto` (arrancado)
 * e `dois` (dois lados). Cortados: `tesoura` (reto, às vezes com o degrau de onde a tesoura parou),
 * `picote` (tesoura de picotar, em zigue-zague) e `destacavel` (o cartão destacável da revista:
 * cantos redondos e os dentinhos do picote). Qualquer um pode ter uma quina dobrada (`Fold`).
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
  /** A quina dobrada; null sem dobra. */
  fold: Fold | null;
  /** A quina arrancada no rasgo de canto (0 no alto à esquerda, 1 no alto à direita); null sem ela. */
  rip: 0 | 1 | null;
}

/**
 * Como a quina foi dobrada:
 * - `orelha`: dobrada para a frente e achatada: aparece o verso da página por cima da foto;
 * - `curva`: a ponta enrolou e levantou da cola: o verso aparece encurtado, em rolo;
 * - `atras`: dobrada para trás da página: da frente só se vê a linha reta da dobra;
 * - `vinco`: dobraram e desdobraram: a quina está lá, com a marca da dobra atravessada.
 */
export type FoldStyle = 'orelha' | 'curva' | 'atras' | 'vinco';
/** O que está impresso no verso da página: texto de matéria, um pedaço de anúncio colorido, nada. */
export type FoldBack = 'texto' | 'cor' | 'liso';

export interface Fold {
  style: FoldStyle;
  /** 0 no alto à esquerda, em sentido horário. */
  corner: 0 | 1 | 2 | 3;
  /** A linha da dobra, na caixa 100 × 100: x1 y1 x2 y2. */
  line: [number, number, number, number];
  /** O pedaço dobrado já virado por cima (orelha, curva), "x,y x,y …" na caixa 100 × 100. */
  flap: string;
  /** A quina marcada pelo vinco, "x,y …" (só no vinco). */
  area: string;
  /** Do meio da dobra até a ponta: onde a luz do verso começa e acaba, x1 y1 x2 y2. */
  shade: [number, number, number, number];
  back: FoldBack;
  /** A cor do anúncio no verso (`cor`). */
  tint: string;
  /** As linhas de texto do verso, já viradas na direção da dobra: x1 y1 x2 y2 cada. */
  lines: [number, number, number, number][];
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
    // o sorteio da dobra antiga da tesoura: consumido do mesmo jeito, para o corte sair igual ao de antes
    let legacyCorner: 0 | 1 | null = null;
    if (kind === 'tesoura' && r() < 0.7) {
      legacyCorner = r() < 0.5 ? 0 : 1;
      r();
    }
    const px =
      kind === 'tesoura' ? scissors(REF_W, H, r) : kind === 'picote' ? pinking(REF_W, H, r) : perforated(REF_W, H, r);
    const folded = foldFor(id, px, REF_W, H, legacyCorner, kind === 'tesoura' ? legacyCorner !== null : null, null);
    return {
      kind,
      page,
      shape,
      print,
      paper: mask(folded.paper.map(([x, y]) => [(x / REF_W) * 100, (y / H) * 100] as Pt)),
      photo: 'none',
      fold: folded.fold,
      rip: null,
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
  const paperPx = outline(plan, r, 0).map(([x, y]) => [(x / 100) * REF_W, (y / 100) * H] as Pt);
  const folded = foldFor(id, paperPx, REF_W, H, null, null, corner?.at ?? null);
  return {
    kind,
    page,
    shape,
    print,
    paper: mask(folded.paper.map(([x, y]) => [(x / REF_W) * 100, (y / H) * 100] as Pt)),
    photo: mask(outline(photoPlan, r2, 1.9, edgeOfPage)),
    fold: folded.fold,
    rip: corner ? (corner.at as 0 | 1) : null,
  };
}

/* ===== A quina dobrada ===== */

const BACK_TINTS = ['#c8156b', '#0f6fae', '#ffd23a', '#b81d1c', '#1f8a4c'];

/**
 * Sorteia a dobra (com o seu próprio sorteio, para não mexer no resto do recorte) e aplica: tira
 * do papel a quina que dobrou (menos no vinco) e devolve o pedaço dobrado, virado pela linha da
 * dobra, com o contorno de verdade (rasgado, picotado…) da quina. Tudo em px, onde virar é virar.
 * `present` força ter ou não ter dobra (a tesoura antiga); `avoid` é o canto que já foi arrancado.
 */
function foldFor(
  id: string,
  paper: Pt[],
  W: number,
  H: number,
  preferCorner: 0 | 1 | null,
  present: boolean | null,
  avoid: number | null,
): { paper: Pt[]; fold: Fold | null } {
  let n = 0;
  const r = () => wobble(id, 5000 + n++);
  const has = present ?? r() < 0.42;
  if (!has) return { paper, fold: null };

  let corner = (preferCorner ?? Math.floor(r() * 4)) as 0 | 1 | 2 | 3;
  if (corner === avoid) corner = ((corner + 2) % 4) as 0 | 1 | 2 | 3;
  const sr = r();
  const style: FoldStyle = sr < 0.4 ? 'orelha' : sr < 0.6 ? 'curva' : sr < 0.8 ? 'atras' : 'vinco';
  const zr = r();
  // orelha pode ser miudinha; rolo, vinco e dobra para trás só aparecem grandes
  const small = style === 'orelha' && zr < 0.3;
  const big = zr >= (style === 'orelha' ? 0.75 : 0.6);
  const size = Math.min(small ? 16 + r() * 8 : big ? 42 + r() * 16 : 30 + r() * 12, Math.min(W, H) * 0.4);
  // cada perna da dobra de um tamanho: a dobra quase nunca sai a 45 graus
  const a = size * (0.78 + r() * 0.5);
  const b = size * (0.78 + r() * 0.5);
  const br = r();
  const back: FoldBack = br < 0.5 ? 'texto' : br < 0.75 ? 'cor' : 'liso';
  const tint = BACK_TINTS[Math.floor(r() * BACK_TINTS.length)];

  // a linha da dobra: A no lado de cima/baixo, B no lado esquerdo/direito da quina
  const cx = corner === 1 || corner === 2 ? W : 0;
  const cy = corner >= 2 ? H : 0;
  const sx = cx === 0 ? 1 : -1;
  const sy = cy === 0 ? 1 : -1;
  const A: Pt = [cx + sx * a, cy];
  const B: Pt = [cx, cy + sy * b];
  const inside = side(A, B, [W / 2, H / 2]) > 0 ? 1 : -1;

  const kept = style === 'vinco' ? paper : clipHalf(paper, A, B, inside);
  const removed = clipHalf(paper, A, B, -inside);
  // a curva enrola: o verso aparece encurtado na direção da dobra
  const squash = style === 'curva' ? 0.64 : 1;
  const turn = (p: Pt): Pt => {
    const q = reflect(p, A, B);
    if (squash === 1) return q;
    const f = foot(q, A, B);
    return [f[0] + (q[0] - f[0]) * squash, f[1] + (q[1] - f[1]) * squash];
  };
  const flapPx = style === 'orelha' || style === 'curva' ? removed.map(turn) : [];
  const tip = turn([cx, cy]);
  const mid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];

  // o texto do verso: as linhas da página, viradas junto com a dobra
  const lines: [number, number, number, number][] = [];
  if (flapPx.length && back === 'texto') {
    const d = unit(reflectVector([1, 0], A, B));
    const nrm: Pt = [-d[1], d[0]];
    const c = centroid(flapPx);
    const reach = size * 1.6;
    for (let k = -12; k <= 12; k++) {
      if (r() < 0.16) continue; // fim de parágrafo
      const o = k * 4.5;
      const p0: Pt = [c[0] + nrm[0] * o - d[0] * reach, c[1] + nrm[1] * o - d[1] * reach];
      const p1: Pt = [c[0] + nrm[0] * o + d[0] * reach, c[1] + nrm[1] * o + d[1] * reach];
      lines.push([...u(p0, W, H), ...u(p1, W, H)] as [number, number, number, number]);
    }
  }

  // a linha da dobra vai de beirada a beirada do papel (rasgado, picotado…), não da caixa: senão
  // o vinco passa do papel e aparece riscado na parede
  const [L0, L1] = chord(paper, A, B) ?? [A, B];
  const pts = (list: Pt[]) => list.map((p) => u(p, W, H).map((v) => v.toFixed(1)).join(',')).join(' ');
  return {
    paper: kept,
    fold: {
      style,
      corner,
      line: [...u(L0, W, H), ...u(L1, W, H)] as [number, number, number, number],
      flap: pts(flapPx),
      area: style === 'vinco' ? pts(removed) : '',
      shade: [...u(mid, W, H), ...u(tip, W, H)] as [number, number, number, number],
      back,
      tint,
      lines,
    },
  };
}

/** De px para a caixa 100 × 100. */
function u(p: Pt, W: number, H: number): Pt {
  return [Math.round((p[0] / W) * 1000) / 10, Math.round((p[1] / H) * 1000) / 10];
}

/** De que lado da reta AB fica o ponto (o sinal do produto vetorial). */
function side(a: Pt, b: Pt, p: Pt): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

/** Corta o polígono pela reta AB e fica com o lado de sinal `keep` (Sutherland–Hodgman, uma reta só). */
function clipHalf(poly: Pt[], a: Pt, b: Pt, keep: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(a, b, p) * keep;
    const sq = side(a, b, q) * keep;
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** O trecho da reta AB que fica dentro do papel: do primeiro ao último ponto em que ela cruza o contorno. */
function chord(poly: Pt[], a: Pt, b: Pt): [Pt, Pt] | null {
  const d = unit([b[0] - a[0], b[1] - a[1]]);
  const hits: { t: number; p: Pt }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(a, b, p);
    const sq = side(a, b, q);
    if ((sp >= 0) === (sq >= 0)) continue;
    const t = sp / (sp - sq);
    const x: Pt = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    hits.push({ t: (x[0] - a[0]) * d[0] + (x[1] - a[1]) * d[1], p: x });
  }
  if (hits.length < 2) return null;
  hits.sort((x, y) => x.t - y.t);
  return [hits[0].p, hits[hits.length - 1].p];
}

function foot(p: Pt, a: Pt, b: Pt): Pt {
  const d = unit([b[0] - a[0], b[1] - a[1]]);
  const t = (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1];
  return [a[0] + d[0] * t, a[1] + d[1] * t];
}

function reflect(p: Pt, a: Pt, b: Pt): Pt {
  const f = foot(p, a, b);
  return [2 * f[0] - p[0], 2 * f[1] - p[1]];
}

function reflectVector(v: Pt, a: Pt, b: Pt): Pt {
  const d = unit([b[0] - a[0], b[1] - a[1]]);
  const dot = v[0] * d[0] + v[1] * d[1];
  return [2 * dot * d[0] - v[0], 2 * dot * d[1] - v[1]];
}

function unit(v: Pt): Pt {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

function centroid(poly: Pt[]): Pt {
  const sx = poly.reduce((s, p) => s + p[0], 0);
  const sy = poly.reduce((s, p) => s + p[1], 0);
  return [sx / poly.length, sy / poly.length];
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

/** Tesoura comum: quatro cortes quase retos, às vezes o degrau de onde ela parou e voltou. */
function scissors(W: number, H: number, r: () => number): Pt[] {
  const nudge = () => r() * 2.2;
  const c: Pt[] = [
    [nudge(), nudge()],
    [W - nudge(), nudge()],
    [W - nudge(), H - nudge()],
    [nudge(), H - nudge()],
  ];
  const at: Pt[][] = c.map((p) => [p]);
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
