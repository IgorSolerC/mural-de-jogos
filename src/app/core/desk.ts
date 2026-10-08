import { Injectable, signal } from '@angular/core';

export interface DeskHandlers {
  newReview(): void;
  /** Com `fromId`, veio pelo link de outra anotação: ela vira o "Voltar" da leitura. */
  openReview(id: string, fromId?: string): void;
  /** Uma anotação nova já com o título (o link para uma que ainda não existe). */
  /** O link para uma anotação que não existe: criar, com o título (e a categoria da anotação `fromId`). */
  newNote(title: string, fromId?: string): void;
  openDraft(id: string): void;
  /** Recortar um item novo para a wishlist. */
  newWish(): void;
  /** Guardar um item novo direto no Pra depois (só nome e capa). */
  newDraft(): void;
  /** Começar a resenha de um desejo. */
  openWish(id: string): void;
}

/**
 * A mesa: as fichas grandes (editor e leitura) moram no app, mas qualquer página pode pedir
 * para abrir uma. Também guarda qual ficha acabou de cair na parede.
 */
@Injectable({ providedIn: 'root' })
export class Desk {
  private handlers: DeskHandlers | null = null;
  private landingTimer: ReturnType<typeof setTimeout> | undefined;

  /** A ficha (ou folha) recém-salva, para tocar a chegada. */
  readonly landingId = signal<string | null>(null);

  register(h: DeskHandlers): void {
    this.handlers = h;
  }

  newReview(): void {
    this.handlers?.newReview();
  }

  openReview(id: string, fromId?: string): void {
    this.handlers?.openReview(id, fromId);
  }

  newNote(title: string, fromId?: string): void {
    this.handlers?.newNote(title, fromId);
  }

  openDraft(id: string): void {
    this.handlers?.openDraft(id);
  }

  newWish(): void {
    this.handlers?.newWish();
  }

  newDraft(): void {
    this.handlers?.newDraft();
  }

  openWish(id: string): void {
    this.handlers?.openWish(id);
  }

  /** A ficha cai na parede e a tela vai até ela, assim que ela existir na página. */
  land(id: string): void {
    this.landingId.set(id);
    clearTimeout(this.landingTimer);
    this.landingTimer = setTimeout(() => this.landingId.set(null), 1100);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tries = 0;
    const seek = () => {
      const el = document.querySelector(`[data-ficha="${id}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      else if (++tries < 20) requestAnimationFrame(seek);
    };
    requestAnimationFrame(seek);
  }
}
