import { DestroyRef, afterRenderEffect, effect, inject, signal, untracked } from '@angular/core';
import { notesAsText } from '../core/note-copy';
import { Review } from '../core/review';
import { Toasts } from './toast';
import { plural } from '../core/text';

const MARKED = 'data-marcada';
/** O atalho de copiar, como está escrito no teclado de quem usa. */
const COPY_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C';

/** Onde e como marcar: cada página diz quais são as fichas dela e quando as marcas deixam de valer. */
export interface NoteSelectionConfig {
  /** A página: só as fichas dentro dela marcam. */
  host: HTMLElement;
  /** As fichas que marcam (o elemento que recebe o tracejado) e o atributo com o id da anotação. */
  markable: string;
  idOf: (el: Element) => string | null;
  /** Se o Ctrl+clique marca agora. */
  on: () => boolean;
  /** As anotações que dá para copiar, pelo id. */
  notes: () => ReadonlyMap<string, Review>;
  /** O que, mudando, desmarca tudo (o quadro, a busca, o filtro): as marcas de antes não valem mais. */
  reset: () => unknown;
  /** O que, mudando, redesenha as fichas: as marcas voltam para os elementos novos. */
  layout?: () => unknown;
  /**
   * As fichas daqui se arrastam (o Kanban): apertar uma ficha marcada pode ser o começo de arrastar
   * todas juntas, então só o clique (o aperto que não virou arrastar) desmarca; e o aperto com Ctrl
   * segue para a página, que pode arrastar com ele.
   */
  drags?: boolean;
}

/**
 * Marcar anotações para copiar o texto delas, no mural e no Kanban: Ctrl+clique (⌘ no Mac) numa
 * ficha marca ou desmarca, com um tracejado em volta e o adesivo com a ordem; Ctrl+C copia as
 * marcadas, na ordem em que foram marcadas (ver core/note-copy.ts). Esc ou qualquer outro toque na
 * página desmarca tudo. Pelo teclado também: Ctrl+Enter na ficha com o foco. Criada no construtor da
 * página (precisa do contexto de injeção).
 */
export class NoteSelection {
  private readonly toasts = inject(Toasts);

  /** As marcadas, na ordem em que foram marcadas. */
  readonly ids = signal<readonly string[]>([]);

  constructor(private readonly cfg: NoteSelectionConfig) {
    if (typeof document === 'undefined') return;
    const down = (e: PointerEvent) => this.down(e);
    const click = (e: MouseEvent) => this.click(e);
    const key = (e: KeyboardEvent) => this.key(e);
    // na descida, antes da ficha: o clique com Ctrl não abre a leitura nem começa a arrastar
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    });
    // o tracejado e o número seguem a lista, depois de a página desenhar as fichas
    afterRenderEffect(() => {
      const ids = this.ids();
      cfg.layout?.();
      untracked(() => this.paint(ids));
    });
    effect(() => {
      cfg.reset();
      cfg.on();
      untracked(() => this.clear());
    });
  }

  clear(): void {
    if (this.ids().length) this.ids.set([]);
  }

  /** A anotação debaixo do clique com Ctrl, se o clique é para marcar. */
  private target(e: MouseEvent): string | null {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.button !== 0 || !this.cfg.on()) return null;
    const t = e.target instanceof Element ? e.target : null;
    // Ctrl+clique num link do texto continua abrindo o link numa aba nova
    if (!t || t.closest('a[href]')) return null;
    const box = t.closest(this.cfg.markable);
    if (!box || !this.cfg.host.contains(box)) return null;
    const id = this.cfg.idOf(box);
    return id && this.cfg.notes().has(id) ? id : null;
  }

  private down(e: PointerEvent): void {
    if (this.target(e)) {
      // sem foco e sem seleção de texto: o toque é para marcar (ou, onde as fichas se arrastam, para
      // arrastar com o Ctrl apertado)
      e.preventDefault();
      if (!this.cfg.drags) e.stopImmediatePropagation();
      return;
    }
    // numa ficha marcada, o aperto pode virar arrastar todas: quem desmarca é o clique
    if (this.cfg.drags && this.onMarked(e)) return;
    this.clear();
  }

  /** O aperto foi numa ficha marcada desta página. */
  private onMarked(e: MouseEvent): boolean {
    const t = e.target instanceof Element ? e.target : null;
    const box = t?.closest(this.cfg.markable);
    return !!box && box.hasAttribute(MARKED) && this.cfg.host.contains(box);
  }

  private click(e: MouseEvent): void {
    const id = this.target(e);
    if (!id) {
      // o aperto numa ficha marcada que não virou arrastar (depois de arrastar, a página engole o
      // clique antes de chegar aqui)
      if (this.cfg.drags && this.onMarked(e)) this.clear();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    const ids = this.ids();
    this.ids.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    const n = this.ids().length;
    if (n) this.toasts.show(`${plural(n, 'anotação marcada', 'anotações marcadas')}. ${COPY_KEY} copia o texto; Esc desmarca.`);
    else this.toasts.dismiss();
  }

  private key(e: KeyboardEvent): void {
    if (!this.ids().length) return;
    if (e.key === 'Escape') {
      this.clear();
      this.toasts.dismiss();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'c') return;
    // um texto selecionado na página ou um campo com o foco copiam como sempre
    const sel = getSelection();
    if ((sel && !sel.isCollapsed) || isEditable(document.activeElement)) return;
    e.preventDefault();
    void this.copy();
  }

  private async copy(): Promise<void> {
    const byId = this.cfg.notes();
    const notes = this.ids()
      .map((id) => byId.get(id))
      .filter((r) => !!r);
    if (!notes.length) return;
    await this.toasts.copy(
      notesAsText(notes),
      notes.length === 1 ? 'Copiei o texto da anotação.' : `Copiei o texto das ${notes.length} anotações.`,
      'Não deu para copiar. Tente de novo.',
    );
  }

  private paint(ids: readonly string[]): void {
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    for (const el of this.cfg.host.querySelectorAll<HTMLElement>(this.cfg.markable)) {
      const n = order.get(this.cfg.idOf(el) ?? '');
      el.toggleAttribute(MARKED, !!n);
      if (n) el.style.setProperty('--marca-n', String(n));
      else el.style.removeProperty('--marca-n');
    }
  }
}

function isEditable(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
}
