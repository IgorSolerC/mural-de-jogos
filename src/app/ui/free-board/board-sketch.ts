import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { guardarNoForno, lerDoForno } from '../../core/forno-store';
import { ImageStore } from '../../core/image-store';
import { FbNode, FreeBoard } from '../../core/free-board';
import { boundsOf, paintOrder } from '../../core/free-board-geometry';
import { parseWidgetLine, readCardRef } from '../../core/widgets';
import { Fornada, desenfornar, enfornar, fornoEpoca, fornoLigado, resumoDe } from '../forno';
import { CardInfo, CardOf } from './far-look';
import { Scene, pieceInfo } from './scene';
import { SKETCH_FONTS, SketchModel, sketchFontsReady, sketchModel } from './sketch-model';
import { fitBox, paintSketch } from './sketch-paint';
import { SketchShapes } from './sketch-shapes';

/** Muda quando o desenho do assado muda (as chaves antigas deixam de valer). */
const BAKE_VERSION = 1;
/** Quantas peças a miniatura desenha (as primeiras na ordem de desenhar: as molduras, depois o resto). */
const MAX_SHAPES = 400;
/** A largura de eucatex que se supõe antes da primeira medida (a da Comum no computador). */
const GUESS_PX = 380;

/**
 * A miniatura de um quadro (PLANO-MINIATURA-CANVAS.md, rodada 1; antes PLANO-QUADRO-LIVRE.md, 4.2 e D15), desenhada a
 * partir dos dados, nada de foto guardada: as molduras de feltro com o pesponto e o nome na fita, o giz das setas por
 * baixo do papel, e cada peça na aparência dela de longe (far-look.ts): o card do texto com a faixa do jeito, a nota
 * colada na cartolina da ficha, o contador e a tabela nos jeitos deles, os pontos da pixel art. O texto se mede em px
 * da tela (um `ResizeObserver` diz o tamanho do desenho): só aparece onde a letra fica legível. Um SVG só.
 */
@Component({
  selector: 'app-board-sketch',
  imports: [SketchShapes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sketch(); as s) {
      <svg [attr.viewBox]="s.box" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g appSketchShapes [items]="s.items"></g>
      </svg>
      @if (baked(); as url) {
        <!-- o assado (rodada 2): o mesmo desenho com as fotos, o texto e a trama, por cima do SVG, num esmaecer -->
        <img class="assada" [class.pronta]="shown()" [src]="url" alt="" draggable="false" (load)="shown.set(true)" />
      }
    } @else {
      <span class="vazio">Quadro vazio</span>
    }
  `,
  styles: `
    /* o desenho nunca manda no tamanho de quem o mostra: um quadro mais alto que largo esticava a folha e
       empurrava o nome para fora dela. O SVG fica por cima, do tamanho da caixa (menos o respiro dela) */
    :host {
      position: relative;
      display: grid;
      place-items: center;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    svg {
      position: absolute;
      inset: var(--sketch-respiro, 0px);
      width: calc(100% - 2 * var(--sketch-respiro, 0px));
      height: calc(100% - 2 * var(--sketch-respiro, 0px));
    }
    .assada {
      position: absolute;
      inset: var(--sketch-respiro, 0px);
      width: calc(100% - 2 * var(--sketch-respiro, 0px));
      height: calc(100% - 2 * var(--sketch-respiro, 0px));
      opacity: 0;
      transition: opacity 320ms ease-out;
      pointer-events: none;
    }
    .assada.pronta {
      opacity: 1;
    }
    @media (prefers-reduced-motion: reduce) {
      .assada {
        transition: none;
      }
    }
    .vazio {
      font: 400 0.95rem var(--f-hand);
      color: var(--wall-ink-2);
    }
  `,
})
export class BoardSketch {
  readonly board = input.required<FreeBoard>();
  /** Acha as fichas coladas (a cor e o nome); sem ele, a nota colada é o papel de ficha sem título. */
  readonly cards = input<CardOf | null>(null);

  /** Assa o desenho (o card do canvas no mural): a mesma miniatura com as fotos e o texto, guardada no forno. */
  readonly bake = input(false);

  /** O tamanho do desenho na tela (px), medido. */
  private readonly size = signal({ w: 0, h: 0 });
  /** O endereço do assado pronto (`blob:` desta aba), ou null. */
  protected readonly baked = signal<string | null>(null);
  /** O assado já carregou (entra no esmaecer). */
  protected readonly shown = signal(false);
  private readonly images = inject(ImageStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** A chave do que está assado (ou sendo assado) agora. */
  private bakingKey = '';
  /** Cada preparo ganha um número: o que termina depois de um mais novo não vale (as esperas terminam fora de ordem). */
  private generation = 0;
  private waiting: { job: Fornada; photos: Map<string, ImageBitmap> } | null = null;

  constructor() {
    const host = this.host;
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.cancelBake();
      this.drop();
    });
    // o desenho mudou (o quadro, as fichas coladas, o tamanho): o assado de antes não vale mais
    effect(() => {
      const model = this.sketch();
      const { w, h } = this.size();
      // (a época do forno muda com a densidade da tela: o zoom do navegador, outro monitor)
      fornoEpoca();
      if (!this.bake() || !model || !w || !h || !fornoLigado()) return;
      const board = this.board();
      untracked(() => void this.prepare(board, w, h));
    });
    if (typeof ResizeObserver === 'undefined') return;
    // o tamanho de layout, não a caixa na tela: a ficha gira e cresce com o mouse, e isso não muda o que cabe
    const ro = new ResizeObserver(() => {
      const svg = host.querySelector('svg');
      const w = svg?.clientWidth || host.clientWidth;
      const h = svg?.clientHeight || host.clientHeight;
      if (w && h && (w !== this.size().w || h !== this.size().h)) this.size.set({ w, h });
    });
    ro.observe(host);
    destroy.onDestroy(() => ro.disconnect());
  }

  /**
   * Prepara o assado do desenho de agora: o modelo rico (com as letras prontas, para medir certo), as fotos que estão
   * neste aparelho e a chave. Já assado (o banco do forno), aparece; senão entra na esteira do forno.
   */
  private async prepare(board: FreeBoard, w: number, h: number): Promise<void> {
    const s = this.scene();
    if (!s) return;
    const gen = ++this.generation;
    const stale = () => gen !== this.generation || this.board() !== board;
    await Promise.all(SKETCH_FONTS.map((f) => document.fonts?.load(f).catch(() => null)));
    if (stale()) return;
    const found = this.found();
    const cards: CardOf = (id) => found.get(id) ?? null;
    const model = sketchModel(s.scene, s.nodes, s.box, cards, w, h, { now: Date.now() });
    const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const photos = await this.photos(model, w, h, dpr);
    // a chave diz tudo o que se vê: o desenho (as cores, os textos, os números), as fotos que vieram e o tamanho
    const key = 'canvas:' + (await resumoDe(JSON.stringify([BAKE_VERSION, w, h, dpr, model, [...photos.keys()].sort()])));
    if (stale() || key === this.bakingKey) {
      for (const b of photos.values()) b.close();
      return;
    }
    this.cancelBake();
    this.drop();
    this.bakingKey = key;
    const kept = await lerDoForno(key);
    if (this.bakingKey !== key || stale()) {
      for (const b of photos.values()) b.close();
      return;
    }
    if (kept) {
      for (const b of photos.values()) b.close();
      this.show(kept);
      return;
    }
    const job: Fornada = {
      pronta: () => this.host.isConnected && this.bakingKey === key && this.distance() < innerHeight,
      distancia: () => this.distance(),
      assar: async () => {
        try {
          if (this.bakingKey !== key) {
            for (const b of photos.values()) b.close();
            return;
          }
          const canvas = new OffscreenCanvas(Math.round(w * dpr), Math.round(h * dpr));
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          paintSketch(ctx, model, w, h, dpr, photos);
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          await guardarNoForno(key, blob);
          if (this.bakingKey === key) this.show(blob);
          // deu certo: as fotos não servem mais (numa falha elas ficam, porque a esteira tenta de novo com o mesmo)
          for (const b of photos.values()) b.close();
          if (this.waiting?.job === job) this.waiting = null;
        } catch (err) {
          // a que não é mais a de agora não vai ser tentada de novo por ninguém que a queira
          if (this.bakingKey !== key) for (const b of photos.values()) b.close();
          throw err;
        }
      },
    };
    this.waiting = { job, photos };
    enfornar(job);
  }

  /** As fotos do desenho que estão neste aparelho, no tamanho em que aparecem (nunca maiores que 512 px). */
  private async photos(model: SketchModel, w: number, h: number, dpr: number): Promise<Map<string, ImageBitmap>> {
    const out = new Map<string, ImageBitmap>();
    const { s } = fitBox(model.box, w, h);
    for (const it of model.items) {
      if (it.t !== 'i' || out.has(it.id)) continue;
      const image = await this.images.get(it.id).catch(() => null);
      if (!image) continue;
      const side = Math.min(512, Math.max(8, Math.ceil(Math.max(it.w, it.h) * s * dpr)));
      const scale = Math.min(1, side / Math.max(1, image.largura, image.altura));
      try {
        out.set(it.id, await createImageBitmap(image.blob, { resizeWidth: Math.max(1, Math.round(image.largura * scale)), resizeHeight: Math.max(1, Math.round(image.altura * scale)), resizeQuality: 'medium' }));
      } catch {
        /* uma imagem que não abre: a peça fica no escuro */
      }
    }
    return out;
  }

  /** Quanto falta para o desenho entrar na tela (0 na tela). */
  private distance(): number {
    const r = this.host.getBoundingClientRect();
    return r.bottom < 0 ? -r.bottom : r.top > innerHeight ? r.top - innerHeight : 0;
  }

  private show(blob: Blob): void {
    this.drop();
    this.baked.set(URL.createObjectURL(blob));
  }

  /** Solta o assado que está na tela (o SVG fica). */
  private drop(): void {
    const url = this.baked();
    if (url) URL.revokeObjectURL(url);
    this.baked.set(null);
    this.shown.set(false);
  }

  private cancelBake(): void {
    // a que esperava na esteira sai dela, com as fotos que tinha aberto
    if (this.waiting) {
      desenfornar(this.waiting.job);
      // (fechar duas vezes não faz mal: a que já assou fechou as dela)
      for (const b of this.waiting.photos.values()) b.close();
    }
    this.waiting = null;
    this.bakingKey = '';
  }

  /** O quadro sem a escala da tela (refeito só quando o quadro muda). */
  private readonly scene = computed(() => {
    const board = this.board();
    const scene = new Scene(board);
    const nodes = [...scene.nodes.values()];
    const box = boundsOf(nodes);
    return box ? { scene, nodes: paintOrder(nodes).slice(0, MAX_SHAPES), box } : null;
  });

  /**
   * As fichas coladas que o quadro cita, achadas: o desenho só é refeito quando uma delas muda (a cor, o nome), não a
   * cada mudança em qualquer ficha do mural (quem acha lê as listas inteiras).
   */
  private readonly found = computed(
    () => {
      const s = this.scene();
      const cards = this.cards();
      const out = new Map<string, CardInfo | null>();
      if (s && cards) for (const id of cardIds(s.nodes)) out.set(id, cards(id));
      return out;
    },
    { equal: sameCards },
  );

  protected readonly sketch = computed<SketchModel | null>(() => {
    const s = this.scene();
    if (!s) return null;
    const found = this.found();
    const { w, h } = this.size();
    // (as letras que chegaram depois: mede de novo)
    sketchFontsReady();
    return sketchModel(s.scene, s.nodes, s.box, (id) => found.get(id) ?? null, w || GUESS_PX, h || (GUESS_PX * 2) / 3);
  });
}

/** Os ids das fichas coladas (o widget Nota) entre as peças. */
function cardIds(nodes: readonly FbNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.t !== 'w' || pieceInfo(n).kind !== 'nota') continue;
    const id = readCardRef(parseWidgetLine(n.src.split('\n')[0])?.args ?? []).id;
    if (id) out.add(id);
  }
  return out;
}

function sameCards(a: ReadonlyMap<string, CardInfo | null>, b: ReadonlyMap<string, CardInfo | null>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (x === y) continue;
    if (!x || !y || x.stock !== y.stock || x.name !== y.name || x.folder !== y.folder) return false;
  }
  return true;
}
