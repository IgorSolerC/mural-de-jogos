import { FbEdge, FbNode, FbSide, FreeBoard, shownEdges, shownNodes } from '../../core/free-board';
import { Camera, EdgePath, GridIndex, Point, Rect, edgePath, grow, intersects, paintOrder, viewRect } from '../../core/free-board-geometry';
import { localImageId } from '../../core/images';
import { parseWidgetLine, readMedia } from '../../core/widgets';

/**
 * A cena do Quadro livre (PLANO-QUADRO-LIVRE.md, seções 9.2, 9.3 e 9.6): dada a câmera, o que fica montado no
 * DOM, em que nível de detalhe, e o que vai para a camada de longe (o canvas 2D). Puro, sem DOM: o motor
 * (free-board-view.ts) só chama `frame` quando a câmera andou o bastante e desenha o que sai daqui.
 */

/** O nível de detalhe de uma peça, pelo tamanho dela na tela (seção 9.3). */
export type Level = 'perto' | 'meio' | 'longe';

/**
 * Os tamanhos na tela (o lado de um quadrado de mesma área, em px) em que a peça muda de nível. A imagem só
 * vem inteira (o arquivo de 900 px, a moldura de foto) quando aparece grande; antes, a miniatura de 256 px.
 */
export const NEAR_PX = 72;
export const NEAR_IMAGE_PX = 140;
export const FAR_PX = 18;

/** Quantas peças podem ficar montadas de uma vez; as mais longe do meio da tela vão para a camada de longe. */
export const MAX_MOUNTED = 300;

/** O que a peça é, para desenhar (lido uma vez por peça, não a cada quadro). */
export type PieceKind = 'moldura' | 'bilhete' | 'imagem' | 'nota' | 'widget';

export interface PieceInfo {
  kind: PieceKind;
  /** O id da imagem guardada no Murall (a miniatura sai dela), ou null. */
  image: string | null;
}

export function pieceInfo(node: FbNode): PieceInfo {
  if (node.t === 'm') return { kind: 'moldura', image: null };
  if (node.t === 'x') return { kind: 'bilhete', image: null };
  const parsed = parseWidgetLine(node.src);
  if (parsed?.name === 'imagem') return { kind: 'imagem', image: localImageId(readMedia(parsed.args).url) };
  if (parsed?.name === 'nota') return { kind: 'nota', image: null };
  return { kind: 'widget', image: null };
}

const side = (r: Rect) => Math.sqrt(Math.max(1, r.w) * Math.max(1, r.h));

/** O nível da peça com o zoom `z`. */
export function levelOf(node: FbNode, info: PieceInfo, z: number): Level {
  const s = side(node) * z;
  if (s < FAR_PX) return 'longe';
  return s >= (info.kind === 'imagem' ? NEAR_IMAGE_PX : NEAR_PX) ? 'perto' : 'meio';
}

export interface MountedPiece {
  node: FbNode;
  info: PieceInfo;
  level: Exclude<Level, 'longe'>;
}

export interface SceneEdge {
  edge: FbEdge;
  path: EdgePath;
}

export interface SceneFrame {
  /** As peças no DOM: as molduras (atrás) e as outras, na ordem de desenhar. */
  frames: MountedPiece[];
  pieces: MountedPiece[];
  /** As peças de longe, para o canvas, na ordem de desenhar. */
  far: { node: FbNode; info: PieceInfo }[];
  /** As setas que tocam a área (todas no canvas, a giz; as com rótulo ganham a fita no DOM). */
  edges: SceneEdge[];
  /** A área do mundo considerada (a tela com a folga), e a câmera de quando foi calculada. */
  area: Rect;
  camera: Camera;
}

/**
 * O quadro pronto para desenhar: o índice em grade das peças, o que cada uma é e a ordem de desenhar.
 * Refeito só quando o quadro muda (na rodada de ver, nunca enquanto a câmera anda).
 */
export class Scene {
  readonly index: GridIndex;
  readonly nodes: ReadonlyMap<string, FbNode>;
  private readonly info = new Map<string, PieceInfo>();
  private readonly order = new Map<string, number>();
  private readonly edges: FbEdge[];
  /** As setas de cada peça (para achar as que tocam a tela sem olhar todas). */
  private readonly edgesOf = new Map<string, FbEdge[]>();

  constructor(readonly board: FreeBoard) {
    const shown = shownNodes(board);
    this.nodes = new Map(shown.map((n) => [n.i, n]));
    this.index = new GridIndex(shown);
    paintOrder(shown).forEach((n, k) => this.order.set(n.i, k));
    for (const n of shown) this.info.set(n.i, pieceInfo(n));
    this.edges = shownEdges(board);
    for (const e of this.edges) {
      for (const end of [e.a, e.b]) {
        const list = this.edgesOf.get(end) ?? [];
        list.push(e);
        this.edgesOf.set(end, list);
      }
    }
  }

  infoOf(id: string): PieceInfo | undefined {
    return this.info.get(id);
  }

  /** A caixa de tudo (o "Ver tudo"). */
  get bounds(): Rect | null {
    let out: Rect | null = null;
    for (const n of this.nodes.values()) {
      if (!out) out = { x: n.x, y: n.y, w: n.w, h: n.h };
      else {
        const x1 = Math.max(out.x + out.w, n.x + n.w);
        const y1 = Math.max(out.y + out.h, n.y + n.h);
        out.x = Math.min(out.x, n.x);
        out.y = Math.min(out.y, n.y);
        out.w = x1 - out.x;
        out.h = y1 - out.y;
      }
    }
    return out;
  }

  /**
   * O que a câmera mostra numa tela de `w` × `h` px: a tela e meia tela de folga para cada lado (para não
   * piscar na borda enquanto a câmera anda até a próxima conta).
   */
  frame(camera: Camera, w: number, h: number, maxMounted = MAX_MOUNTED): SceneFrame {
    const view = viewRect(camera, w, h);
    const area = grow(view, Math.max(view.w, view.h) / 2);
    const ids = [...this.index.query(area)].sort((a, b) => this.order.get(a)! - this.order.get(b)!);
    const mid: Point = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    const near: MountedPiece[] = [];
    const far: { node: FbNode; info: PieceInfo }[] = [];
    for (const id of ids) {
      const node = this.nodes.get(id)!;
      const info = this.info.get(id)!;
      const level = levelOf(node, info, camera.z);
      if (level === 'longe') far.push({ node, info });
      else near.push({ node, info, level });
    }
    // passou do teto: as mais longe do meio da tela esperam na camada de longe
    if (near.length > maxMounted) {
      const dist = (n: FbNode) => Math.hypot(n.x + n.w / 2 - mid.x, n.y + n.h / 2 - mid.y);
      const keep = new Set([...near].sort((a, b) => dist(a.node) - dist(b.node)).slice(0, maxMounted).map((p) => p.node.i));
      for (const p of near) if (!keep.has(p.node.i)) far.push({ node: p.node, info: p.info });
      near.splice(0, near.length, ...near.filter((p) => keep.has(p.node.i)));
      far.sort((a, b) => this.order.get(a.node.i)! - this.order.get(b.node.i)!);
    }
    const edges: SceneEdge[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      for (const e of this.edgesOf.get(id) ?? []) {
        if (seen.has(e.i)) continue;
        seen.add(e.i);
        const path = this.pathOf(e);
        if (!path || !intersects(grow(path.box, 40), area)) continue;
        edges.push({ edge: e, path });
      }
    }
    return {
      frames: near.filter((p) => p.info.kind === 'moldura'),
      pieces: near.filter((p) => p.info.kind !== 'moldura'),
      far,
      edges,
      area,
      camera: { ...camera },
    };
  }

  /** A curva da seta (null se uma ponta não está no quadro). */
  pathOf(e: FbEdge): EdgePath | null {
    const a = this.nodes.get(e.a);
    const b = this.nodes.get(e.b);
    if (!a || !b) return null;
    return edgePath(a, b, { as: e.as as FbSide | undefined, bs: e.bs as FbSide | undefined });
  }
}

/**
 * A câmera andou o bastante desde a última conta para fazer outra? Mais que um quarto da tela para um lado,
 * ou o zoom mudou mais que 15% (seção 9.2).
 */
export function needsRecount(last: Camera | null, now: Camera, w: number, h: number): boolean {
  if (!last) return true;
  const ratio = now.z / last.z;
  if (ratio > 1.15 || ratio < 1 / 1.15) return true;
  const dx = Math.abs(now.x - last.x) * now.z;
  const dy = Math.abs(now.y - last.y) * now.z;
  return dx > w / 4 || dy > h / 4;
}
