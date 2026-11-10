import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ImageStore } from '../../core/image-store';

/** O lado maior da miniatura (seção 9.4 do plano). */
export const THUMB_PX = 256;
/** Quanto as miniaturas podem ocupar na memória; as menos usadas saem primeiro. */
export const THUMB_BUDGET = 40 * 1024 * 1024;
/** Quantas são feitas ao mesmo tempo (decodificar a de 900 px custa uns ms cada). */
const AT_ONCE = 2;

interface Thumb {
  bitmap: ImageBitmap;
  url: string;
  bytes: number;
}

/**
 * As miniaturas das imagens do Quadro livre (PLANO-QUADRO-LIVRE.md, seção 9.4): de longe, a imagem guardada
 * de 900 px vira uma cópia de 256 px feita aqui mesmo, a partir do blob do `ImageStore`, e guardada **só na
 * memória**: nada vai para a nuvem nem fica no navegador (a regra do logout não tem o que apagar). O canvas da
 * camada de longe desenha o `bitmap`; a peça do meio mostra o `url` num `<img>`.
 *
 * Uma por tela do quadro (`providers` dele), não do site: fechar o quadro solta tudo, e quem dá as imagens
 * (o `ImageStore` do dono, ou outro numa página de teste) é o de onde o quadro está.
 */
@Injectable()
export class FreeBoardThumbs {
  private readonly images = inject(ImageStore);
  /** Sobe quando uma miniatura fica pronta (quem desenha procura de novo). */
  readonly version = signal(0);
  private readonly cache = new Map<string, Thumb>();
  private readonly waiting = new Set<string>();
  private readonly queue: string[] = [];
  private running = 0;
  private bytes = 0;
  private bump = 0;
  private dead = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.dead = true;
      cancelAnimationFrame(this.bump);
      for (const t of this.cache.values()) this.drop(t);
      this.cache.clear();
    });
  }

  /** A miniatura pronta (e ela passa a ser a mais recente), ou null. */
  get(id: string): Thumb | null {
    const t = this.cache.get(id);
    if (!t) return null;
    this.cache.delete(id);
    this.cache.set(id, t);
    return t;
  }

  /** Pede a miniatura de `id`, se ainda não tem nem está na fila. */
  want(id: string): void {
    if (this.dead || this.cache.has(id) || this.waiting.has(id)) return;
    this.waiting.add(id);
    this.queue.push(id);
    this.pump();
  }

  private pump(): void {
    while (this.running < AT_ONCE && this.queue.length) {
      const id = this.queue.shift()!;
      this.running++;
      void this.make(id)
        .catch(() => null)
        .then((t) => {
          this.running--;
          this.waiting.delete(id);
          if (t && !this.dead) this.keep(id, t);
          else if (t) this.drop(t);
          this.pump();
        });
    }
  }

  private async make(id: string): Promise<Thumb | null> {
    const image = await this.images.get(id);
    if (!image || this.dead) return null;
    const scale = Math.min(1, THUMB_PX / Math.max(1, image.largura, image.altura));
    const w = Math.max(1, Math.round(image.largura * scale));
    const h = Math.max(1, Math.round(image.altura * scale));
    const bitmap = await createImageBitmap(image.blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    // um canvas da CPU: o da placa de vídeo precisaria trazer os pixels de volta (travava a página ao dar zoom)
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
    return { bitmap, url: URL.createObjectURL(blob), bytes: bitmap.width * bitmap.height * 4 + blob.size };
  }

  private keep(id: string, t: Thumb): void {
    this.cache.set(id, t);
    this.bytes += t.bytes;
    // as menos usadas saem até caber (a primeira do Map é a mais antiga)
    for (const [old, thumb] of this.cache) {
      if (this.bytes <= THUMB_BUDGET || old === id) break;
      this.cache.delete(old);
      this.bytes -= thumb.bytes;
      this.drop(thumb);
    }
    // várias prontas no mesmo quadro de animação: um aviso só
    if (!this.bump) {
      this.bump = requestAnimationFrame(() => {
        this.bump = 0;
        this.version.update((v) => v + 1);
      });
    }
  }

  private drop(t: Thumb): void {
    t.bitmap.close();
    URL.revokeObjectURL(t.url);
  }
}
