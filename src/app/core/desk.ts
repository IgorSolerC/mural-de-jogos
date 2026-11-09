import { Injectable, signal } from '@angular/core';
import type { CardLook } from './card-look';
import type { Review } from './review';
import { reducedMotion } from './motion';

/** As abas do editor que os ajustes do Kanban e dos Flashcards abrem direto. */
export type EditorTab = 'kanban' | 'flashcard';
/** Um pedaço de uma aba que já abre aberto e à vista (o boletim do flashcard, pelo "Ver o progresso"). */
export type EditorPart = 'progresso';

export interface DeskHandlers {
  newReview(): void;
  /** Com `fromId`, veio pelo link de outra anotação: ela vira o "Voltar" da leitura. */
  openReview(id: string, fromId?: string): void;
  /** O link para uma anotação que não existe: criar, com o título (e a categoria da anotação `fromId`). */
  newNote(title: string, fromId?: string): void;
  /** Uma anotação nova em branco, já nesta categoria (o "Nova nota" de uma coluna do Kanban). */
  /** `folder`: a pasta (o id) onde ela nasce. */
  newNoteIn(category: string, look?: CardLook, folder?: string | null): void;
  openDraft(id: string): void;
  /** Recortar um item novo para a wishlist. */
  newWish(): void;
  /** Guardar um item novo direto no Pra depois (só nome e capa). */
  newDraft(): void;
  /** Começar a resenha de um desejo. */
  openWish(id: string): void;
  /** Tirar da fila do Pra depois, com o Desfazer (o mesmo do "Tirar da fila" do editor). */
  removeDraft(id: string): void;
  /** Tirar da wishlist, com o Desfazer (o mesmo do "Tirar da wishlist" do editor). */
  removeWish(id: string): void;
  /** A ficha de outra pessoa aberta pelo link: a leitura sem o fechar (ver pages/ficha-page.ts). */
  openLoose(review: Review, owner: string, pool: readonly Review[], code: string, signedIn: boolean): void;
  closeReader(): void;
  /** O editor da sua ficha (o "Editar" da leitura e do menu da anotação), ou direto na aba dos ajustes do Kanban e dos Flashcards. */
  editReview(id: string, tab?: EditorTab, part?: EditorPart): void;
  /** Apagar a sua ficha, do jeito da leitura: a pergunta e o Desfazer, ou sair da compartilhada. */
  removeReview(id: string): void;
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

  /** Uma anotação nova já na categoria (e, de uma coluna com card padrão, já vestida com ele). */
  newNoteIn(category: string, look?: CardLook, folder?: string | null): void {
    this.handlers?.newNoteIn(category, look, folder);
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

  removeDraft(id: string): void {
    this.handlers?.removeDraft(id);
  }

  removeWish(id: string): void {
    this.handlers?.removeWish(id);
  }

  openLoose(review: Review, owner: string, pool: readonly Review[], code: string, signedIn: boolean): void {
    this.handlers?.openLoose(review, owner, pool, code, signedIn);
  }

  closeReader(): void {
    this.handlers?.closeReader();
  }

  editReview(id: string, tab?: EditorTab, part?: EditorPart): void {
    this.handlers?.editReview(id, tab, part);
  }

  removeReview(id: string): void {
    this.handlers?.removeReview(id);
  }

  /** A ficha cai na parede e a tela vai até ela, assim que ela existir na página. */
  land(id: string): void {
    this.landingId.set(id);
    clearTimeout(this.landingTimer);
    this.landingTimer = setTimeout(() => this.landingId.set(null), 1100);
    const reduced = reducedMotion();
    let tries = 0;
    const seek = () => {
      const el = document.querySelector(`[data-ficha="${id}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      else if (++tries < 20) requestAnimationFrame(seek);
    };
    requestAnimationFrame(seek);
  }
}
