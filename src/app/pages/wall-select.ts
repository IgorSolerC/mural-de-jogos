import { DestroyRef, ElementRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { notesAsText } from '../core/note-copy';
import { SideBySide } from '../core/side-by-side';
import { WallState } from '../core/wall-view';
import { Toasts } from '../ui/toast';

/** A caixa da ficha (ver wall-cards.ts) ou a linha da lista (ver ui/note-index.ts). */
const MARKABLE = '.lugar[data-lugar], .linha[data-ficha]';
const MARKED = 'data-marcada';
/** O atalho de copiar, como está escrito no teclado de quem usa. */
const COPY_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C';

/**
 * Marcar anotações para copiar o texto delas: Ctrl+clique (⌘ no Mac) numa ficha ou numa linha da lista
 * marca ou desmarca, com um tracejado em volta e o adesivo com a ordem; Ctrl+C copia as marcadas, na
 * ordem em que foram marcadas (ver core/note-copy.ts). Esc ou qualquer outro toque na página desmarca
 * tudo. Só no seu mural de anotações. Pelo teclado também: Ctrl+Enter na ficha com o foco.
 */
@Injectable()
export class WallSelection {
  private readonly view = inject(WallState);
  private readonly toasts = inject(Toasts);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;

  /** As marcadas, na ordem em que foram marcadas. */
  readonly ids = signal<readonly string[]>([]);
  private readonly side = inject(SideBySide);
  /** Só no seu mural de anotações, e não enquanto o toque na ficha é para o lado a lado. */
  private readonly on = computed(() => this.view.notes() && this.view.owner() === null && !this.side.picking());

  constructor() {
    if (typeof document === 'undefined') return;
    const down = (e: PointerEvent) => this.down(e);
    const click = (e: MouseEvent) => this.click(e);
    const key = (e: KeyboardEvent) => this.key(e);
    // na descida, antes da ficha: o clique com Ctrl não abre a leitura
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    });
    // o tracejado e o número seguem a lista
    effect(() => this.paint(this.ids()));
    // a parede mudou (busca, filtro, aba, outro mural): as marcas de antes não valem mais
    effect(() => {
      this.view.visible();
      this.on();
      untracked(() => this.clear());
    });
  }

  clear(): void {
    if (this.ids().length) this.ids.set([]);
  }

  /** A anotação debaixo do clique com Ctrl, se o clique é para marcar. */
  private target(e: MouseEvent): string | null {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.button !== 0 || !this.on()) return null;
    const t = e.target instanceof Element ? e.target : null;
    // Ctrl+clique num link do texto continua abrindo o link numa aba nova
    if (!t || t.closest('a[href]')) return null;
    const box = t.closest(MARKABLE);
    if (!box || !this.host.contains(box) || box.querySelector('[data-vaga]')) return null;
    return box.getAttribute('data-lugar') ?? box.getAttribute('data-ficha');
  }

  private down(e: PointerEvent): void {
    if (this.target(e)) {
      // sem foco e sem seleção de texto: o toque é só para marcar
      e.preventDefault();
      return;
    }
    this.clear();
  }

  private click(e: MouseEvent): void {
    const id = this.target(e);
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const ids = this.ids();
    this.ids.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    const n = this.ids().length;
    if (n) this.toasts.show(`${n === 1 ? '1 anotação marcada' : `${n} anotações marcadas`}. ${COPY_KEY} copia o texto; Esc desmarca.`);
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
    const byId = new Map(this.view.wall().map((r) => [r.id, r]));
    const notes = this.ids()
      .map((id) => byId.get(id))
      .filter((r) => !!r);
    if (!notes.length) return;
    try {
      await navigator.clipboard.writeText(notesAsText(notes));
      this.toasts.show(notes.length === 1 ? 'Copiei o texto da anotação.' : `Copiei o texto das ${notes.length} anotações.`);
    } catch {
      this.toasts.show('Não deu para copiar. Tente de novo.');
    }
  }

  private paint(ids: readonly string[]): void {
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    for (const el of this.host.querySelectorAll<HTMLElement>(MARKABLE)) {
      const n = order.get(el.getAttribute('data-lugar') ?? el.getAttribute('data-ficha') ?? '');
      el.toggleAttribute(MARKED, !!n);
      if (n) el.style.setProperty('--marca-n', String(n));
      else el.style.removeProperty('--marca-n');
    }
  }
}

function isEditable(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
}
