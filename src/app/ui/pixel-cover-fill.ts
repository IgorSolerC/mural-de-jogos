import { Directive, computed, input, signal } from '@angular/core';
import { localImageId } from '../core/images';
import { ArtBox, isPixelCoverSize, opaqueBox } from '../core/pixel-cover';

/** Quanto a capa da nuvem espera escondida pela medida: passou disso, aparece como veio (ms). */
export const MEASURE_WAIT_MS = 4000;

/** A caixa do desenho de cada capa guardada já medida, pelo id (a imagem guardada não muda: o id é do conteúdo). */
const measured = new Map<string, ArtBox | null | Promise<ArtBox | null>>();

/**
 * A capa de pixel art enchendo a capa quadrada do disco (pedido do dono, 24/nov). A capa de pixel art guardada é o
 * PNG 4:5 de core/pixel-cover.ts, com o desenho num quadrado no meio e o resto transparente (para caber nos cortes
 * das outras capas); no vinil do mural de músicas, esse transparente virava uma moldura escura em volta do desenho.
 * Quando a imagem chega, mede onde está o desenho (pela própria imagem; a da nuvem, buscada de novo) e o amplia até
 * o lado maior dele encher a capa, com os pontos nítidos: o desenho quadrado (ou pintado até a borda) enche a capa
 * toda, e nenhum desenho perde um pedaço. As outras imagens (as fotos, os links) ficam como estão.
 *
 * Quem usa dá a capa (`pixelCoverFill`: o `murall://imagem/ID`, ou null para não fazer nada) num `<img>` que cobre
 * uma caixa quadrada posicionada (a `.capa` do ui/_vinyl.scss).
 */
@Directive({
  selector: 'img[pixelCoverFill]',
  host: {
    '(load)': 'loaded($event)',
    '[class.pixel-cheia]': '!!fit()',
    // medindo: a capa espera escondida, para não aparecer com a moldura e pular em seguida
    '[style.opacity]': 'measuring() ? 0 : null',
    '[style.width.%]': 'fit()?.size',
    '[style.height.%]': 'fit()?.tall',
    '[style.left.%]': 'fit()?.left',
    '[style.top.%]': 'fit()?.top',
  },
})
export class PixelCoverFill {
  readonly pixelCoverFill = input<string | null | undefined>(null);

  private readonly id = computed(() => localImageId(this.pixelCoverFill() ?? ''));
  /** A caixa medida, da capa de agora (a de outra capa não vale). */
  private readonly box = signal<{ id: string; box: ArtBox } | null>(null);
  /** A capa sendo medida agora (pelo id). */
  private readonly measuringId = signal<string | null>(null);
  protected readonly measuring = computed(() => !!this.measuringId() && this.measuringId() === this.id());

  /** Onde a imagem fica (em % do lado da capa) para o desenho cobrir a capa, centrado. */
  protected readonly fit = computed(() => {
    const got = this.box();
    if (!got || got.id !== this.id()) return null;
    const { x, y, w, h, width, height } = got.box;
    // o lado maior do desenho cabe na capa: o desenho fica inteiro (o quadrado, ou o pintado até a borda, enche)
    const side = Math.max(w, h);
    return {
      size: (width / side) * 100,
      tall: (height / side) * 100,
      left: 50 - ((x + w / 2) / side) * 100,
      top: 50 - ((y + h / 2) / side) * 100,
    };
  });

  protected loaded(e: Event): void {
    const img = e.target as HTMLImageElement;
    const id = this.id();
    if (!id || !isPixelCoverSize(img.naturalWidth, img.naturalHeight)) return;
    let got = measured.get(id);
    if (got === undefined) {
      got = fromImage(img);
      // a da nuvem (quem visita sem entrar) não deixa ler os pontos pela <img>: busca de novo
      if (got === undefined) got = withDeadline(fetched(img.currentSrc || img.src));
      // (a que não deu para medir fica sem medida até a página recarregar: não busca de novo a cada vez)
      measured.set(id, got);
    }
    const apply = (box: ArtBox | null) => {
      if (box && this.id() === id) this.box.set({ id, box });
    };
    if (!(got instanceof Promise)) return apply(got);
    this.measuringId.set(id);
    void got.then((box) => {
      if (this.measuringId() === id) this.measuringId.set(null);
      apply(box);
    });
  }
}

/** A medida que demora demais (a rede parou no meio) desiste: a capa não fica escondida para sempre. */
function withDeadline(job: Promise<ArtBox | null>): Promise<ArtBox | null> {
  return Promise.race([job, new Promise<null>((res) => setTimeout(() => res(null), MEASURE_WAIT_MS))]);
}

/** Os pontos de uma imagem num canvas, ou undefined quando o navegador não deixa lê-los (a de outro endereço). */
function boxOf(source: CanvasImageSource, width: number, height: number): ArtBox | null | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  try {
    return opaqueBox(ctx.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return undefined;
  }
}

/** Pela própria <img>, na hora: a guardada neste aparelho é um endereço blob: do site, que o canvas lê. */
function fromImage(img: HTMLImageElement): ArtBox | null | undefined {
  return boxOf(img, img.naturalWidth, img.naturalHeight);
}

/**
 * A da nuvem: busca de novo (vem do cache do navegador; o connect-src do site deixa a API), só se for PNG (a capa de
 * pixel art é o único PNG guardado: a foto do aparelho vira WebP ou JPEG).
 */
async function fetched(src: string): Promise<ArtBox | null> {
  try {
    const blob = await (await fetch(src)).blob();
    if (blob.type !== 'image/png') return null;
    const bitmap = await createImageBitmap(blob);
    const box = boxOf(bitmap, bitmap.width, bitmap.height) ?? null;
    bitmap.close();
    return box;
  } catch {
    return null;
  }
}
