import { DestroyRef, Signal, WritableSignal, afterRenderEffect, computed, effect, inject, signal, untracked } from '@angular/core';
import { CopyContexts } from '../core/copy-context';
import { notesAsText } from '../core/note-copy';
import { Review } from '../core/review';
import { MENU_CLASS } from './context-menu';
import { Toasts } from './toast';

const MARKED = 'data-marcada';
/** O atalho de copiar, como está escrito no teclado de quem usa. */
export const COPY_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C';

/** Onde as marcas moram, quando não é na peça (nas análises, o Lado a lado: core/side-by-side.ts). */
export interface SelectionStore {
  readonly ids: Signal<readonly string[]>;
  set(ids: readonly string[]): void;
}

/** Onde e como marcar: cada página diz quais são as fichas dela e quando as marcas deixam de valer. */
export interface NoteSelectionConfig {
  /** A página: só as fichas dentro dela marcam. */
  host: HTMLElement;
  /** As fichas que marcam (o elemento que recebe o tracejado) e o atributo com o id da anotação. */
  markable: string;
  idOf: (el: Element) => string | null;
  /** Se marcar vale agora (o seu mural, o seu quadro). */
  on: () => boolean;
  /** As fichas que dá para marcar (e copiar), pelo id. */
  notes: () => ReadonlyMap<string, Review>;
  /** O que, mudando, desmarca tudo (o quadro, o mural): as marcas de antes não valem mais. */
  reset: () => unknown;
  /** O que, mudando, redesenha as fichas: as marcas voltam para os elementos novos. */
  layout?: () => unknown;
  /**
   * As fichas daqui se arrastam (o Kanban, as pastas do mural): apertar uma ficha marcada pode ser o começo
   * de arrastar todas juntas, então só o clique (o aperto que não virou arrastar) marca ou desmarca; e o
   * aperto com Ctrl ou Shift segue para a página, que pode arrastar com ele.
   */
  drags?: boolean;
  /** Onde as marcas moram (sem ela, na peça). */
  store?: SelectionStore;
  /** O modo marcando (o botão Marcar da pasta do mural); sem ele, a peça guarda o seu. */
  mode?: WritableSignal<boolean>;
  /** Sair do modo deixa as marcas (as do Lado a lado ficam para comparar); sem isso, sair desmarca. */
  keep?: () => boolean;
}

/**
 * Marcar várias fichas de uma vez, no mural (anotações e análises), no Kanban e nos Flashcards
 * (PLANO-SELECAO.md, 1). Ctrl+clique (⌘ no Mac) ou Shift+clique numa ficha começa: ela fica com o
 * tracejado em volta e o adesivo com a ordem. Marcando, o toque numa ficha marca ou desmarca (não abre),
 * Shift+toque marca o intervalo desde a última marcada, na ordem da tela, e Ctrl+C copia o texto das
 * marcadas (core/note-copy.ts). Esc, um toque no vão da página ou o Pronto da tira saem do modo. A tira
 * (ui/selection-tray.ts) diz quantas e o que fazer com elas. Criada no construtor da página (precisa do
 * contexto de injeção).
 */
export class NoteSelection {
  private readonly toasts = inject(Toasts);
  private readonly copyContexts = inject(CopyContexts);

  private readonly own = signal<readonly string[]>([]);
  private readonly store: SelectionStore;
  /** As marcadas, na ordem em que foram marcadas. */
  readonly ids: Signal<readonly string[]>;
  readonly count = computed(() => this.ids().length);
  /** Marcando agora: o toque numa ficha marca em vez de abrir, e a tira aparece. */
  readonly marking: WritableSignal<boolean>;
  /** A última que entrou: o Shift+toque marca daqui até a tocada. */
  private anchor: string | null = null;
  /** O modo foi ligado pelo botão Marcar: desmarcar a última não sai dele. */
  private sticky = false;

  constructor(private readonly cfg: NoteSelectionConfig) {
    this.store = cfg.store ?? {
      ids: this.own,
      set: (ids) => this.own.set(ids),
    };
    this.ids = this.store.ids;
    this.marking = cfg.mode ?? signal(false);
    if (typeof document === 'undefined') return;
    const down = (e: PointerEvent) => this.down(e);
    const click = (e: MouseEvent) => this.click(e);
    const key = (e: KeyboardEvent) => this.key(e);
    // na descida, antes da ficha: o toque que marca não abre a leitura nem seleciona o texto
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    });
    // o tracejado e o número seguem a lista, depois de a página desenhar as fichas (as do Lado a lado,
    // guardadas, só aparecem marcando)
    afterRenderEffect(() => {
      const ids = this.marking() || !cfg.keep?.() ? this.ids() : [];
      cfg.layout?.();
      untracked(() => this.paint(ids));
    });
    effect(() => {
      cfg.reset();
      untracked(() => this.done());
    });
    effect(() => {
      if (!cfg.on()) untracked(() => this.done());
    });
    // ligou o modo sem nada marcado (o botão Marcar): desmarcar a última não sai dele. Saiu do modo por fora
    // (o Pronto da tira, o Esc do app, trocar de página): as marcas de agora saem
    effect(() => {
      const on = this.marking();
      untracked(() => {
        if (on) {
          if (!this.ids().length) this.sticky = true;
          return;
        }
        this.sticky = false;
        if (!cfg.keep?.()) this.clear();
      });
    });
    // uma marcada que deixou de estar aqui (apagada, ou tirada do quadro por outro aparelho ou pela API)
    // sai das marcas: não vai na cópia, e a ordem das outras não pula um número
    effect(() => {
      const notes = cfg.notes();
      untracked(() => {
        const ids = this.ids();
        const kept = ids.filter((id) => notes.has(id));
        if (kept.length !== ids.length) this.store.set(kept);
      });
    });
  }

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  /** Esta ficha se marca aqui (o seu mural, e uma ficha que vale: nas análises, não a rejogada). */
  canMark(id: string): boolean {
    return this.cfg.on() && this.cfg.notes().has(id);
  }

  /** Liga o modo sem marcar nada (o "Marcar" do menu e o botão da pasta): o toque passa a marcar. */
  start(): void {
    this.sticky = true;
    this.marking.set(true);
  }

  /** Marca ou desmarca uma ficha (o toque marcando, o Ctrl+clique, o "Marcar" do menu). */
  toggle(id: string): void {
    if (!this.canMark(id)) return;
    const ids = this.ids();
    // (as do Lado a lado guardadas, fora do modo, não se desmarcam por um toque que começa a marcar)
    if (ids.includes(id) && (this.marking() || !this.cfg.keep?.())) {
      this.store.set(ids.filter((x) => x !== id));
      if (this.anchor === id) this.anchor = null;
      // a última saiu: quem começou pelo Ctrl+clique termina aqui; quem ligou o Marcar continua marcando
      if (!this.ids().length && !this.sticky && !this.cfg.keep?.()) this.marking.set(false);
      return;
    }
    if (!ids.includes(id)) this.store.set([...ids, id]);
    this.anchor = id;
    this.marking.set(true);
  }

  /** Marca várias (o intervalo do Shift, as visíveis da tira), sem mexer na ordem das que já estavam. */
  add(list: readonly string[]): void {
    const notes = this.cfg.notes();
    const ids = this.ids();
    const fresh = list.filter((id) => notes.has(id) && !ids.includes(id));
    if (fresh.length) this.store.set([...ids, ...fresh]);
    if (list.length) this.anchor = list[list.length - 1];
    this.marking.set(true);
  }

  /** Desmarca tudo, continuando no modo (o Limpar da tira). */
  clear(): void {
    if (this.ids().length) this.store.set([]);
    this.anchor = null;
  }

  /** Sai do modo (Esc, Pronto, o vão da página): as marcas saem, menos as do Lado a lado. */
  done(): void {
    if (this.marking()) this.marking.set(false);
    else if (!this.cfg.keep?.()) this.clear();
    this.anchor = null;
  }

  /** O id da ficha debaixo do toque, se o toque é para marcar (com Ctrl ou Shift, ou marcando). */
  private target(e: MouseEvent): string | null {
    const keyed = e.ctrlKey || e.metaKey || e.shiftKey;
    if (e.altKey || e.button !== 0 || !this.cfg.on() || !(keyed || this.marking())) return null;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(`.${MENU_CLASS}`)) return null;
    // Ctrl ou Shift+clique num link do texto continua abrindo o link (numa aba ou janela nova)
    if (keyed && t.closest('a[href]')) return null;
    const box = t.closest(this.cfg.markable);
    if (!box || !this.cfg.host.contains(box)) return null;
    const id = this.cfg.idOf(box);
    return id && this.cfg.notes().has(id) ? id : null;
  }

  private down(e: PointerEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    // o toque no menu da anotação (ver ui/note-menu.ts): copiar as marcadas não pode desmarcá-las antes
    if (!t || t.closest(`.${MENU_CLASS}`)) return;
    // o botão direito numa marcada abre o menu dela, com as marcadas ainda marcadas
    if (e.button === 2 && this.onMarked(t)) return;
    if (this.target(e)) {
      // sem foco e sem seleção de texto (o Shift estenderia a do navegador): o toque é para marcar (ou, onde
      // as fichas se arrastam, para arrastar)
      e.preventDefault();
      if (!this.cfg.drags) e.stopImmediatePropagation();
      return;
    }
    // o toque no vão da página (não num botão, num campo, numa pasta) sai do modo; o de fora dela (a tira,
    // a pasta do mural, o topo) não
    if (e.button === 0 && this.marking() && this.cfg.host.contains(t) && !t.closest(INTERACTIVE)) this.done();
  }

  /** O toque foi numa ficha marcada desta página. */
  private onMarked(t: Element): boolean {
    const box = t.closest(this.cfg.markable);
    return !!box && box.hasAttribute(MARKED) && this.cfg.host.contains(box);
  }

  private click(e: MouseEvent): void {
    const id = this.target(e);
    if (!id) return;
    // (depois de arrastar, a página engole o clique antes de chegar aqui)
    e.preventDefault();
    e.stopImmediatePropagation();
    const from = this.anchor ?? this.ids().at(-1) ?? null;
    if (e.shiftKey && from && from !== id) {
      const range = this.between(from, id);
      if (range) {
        this.add(range);
        return;
      }
    }
    this.toggle(id);
  }

  /** As fichas da tela de `from` até `to`, na ordem em que aparecem (null: `from` não está à vista). */
  private between(from: string, to: string): string[] | null {
    const order: string[] = [];
    for (const el of this.cfg.host.querySelectorAll(this.cfg.markable)) {
      const id = this.cfg.idOf(el);
      if (id && !order.includes(id)) order.push(id);
    }
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0) return null;
    return a < b ? order.slice(a, b + 1) : order.slice(b, a + 1).reverse();
  }

  private key(e: KeyboardEvent): void {
    if (!this.marking()) return;
    // o Esc do menu da anotação fecha só o menu (ver ui/note-menu.ts)
    if (e.target instanceof Element && e.target.closest(`.${MENU_CLASS}`)) return;
    if (e.key === 'Escape') {
      // o Esc que fecha uma folha ou uma tira aberta por cima (a das dependências, o Mais das abas) fecha só ela
      if (document.querySelector('[popover="auto"]:popover-open, dialog[open]')) return;
      this.done();
      return;
    }
    if (!this.ids().length || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'c') return;
    // um texto selecionado na página ou um campo com o foco copiam como sempre
    const sel = getSelection();
    if ((sel && !sel.isCollapsed) || isEditable(document.activeElement)) return;
    e.preventDefault();
    void this.copy();
  }

  /** Copia as marcadas (o Ctrl+C, o Copiar da tira e o "Copiar as N marcadas" do menu da anotação). */
  async copy(): Promise<void> {
    const byId = this.cfg.notes();
    const notes = this.ids()
      .map((id) => byId.get(id))
      .filter((r) => !!r);
    if (!notes.length) return;
    await this.toasts.copy(
      notesAsText(notes, this.copyContexts.now()),
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

/** O que, tocado no vão da página, não é o vão: os botões, os campos, as pastas, as etiquetas. */
const INTERACTIVE = 'button, a[href], input, select, textarea, label, summary, [contenteditable="true"], [role="button"], [role="tab"], app-folder-card';

function isEditable(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
}
