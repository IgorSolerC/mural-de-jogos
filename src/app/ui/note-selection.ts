import { DestroyRef, Signal, WritableSignal, afterRenderEffect, computed, effect, inject, signal, untracked } from '@angular/core';
import { CopyContexts } from '../core/copy-context';
import { notesAsText } from '../core/note-copy';
import { Review } from '../core/review';
import { MENU_CLASS, MenuItem } from './context-menu';
import { ICON } from './icons';
import { Toasts } from './toast';

const MARKED = 'data-marcada';
/** O atalho de copiar, como está escrito no teclado de quem usa. */
export const COPY_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C';

/** A chave de uma pasta marcada na lista das marcas (nenhum id de ficha começa assim). */
export const FOLDER_MARK = 'pasta:';
/** A pasta marcada (o id dela), ou null se a chave é de uma ficha. */
export const folderOfMark = (key: string): string | null => (key.startsWith(FOLDER_MARK) ? key.slice(FOLDER_MARK.length) : null);

/**
 * As pastas que também se marcam, junto com as fichas (PLANO-MARCAR-PASTAS.md, D1–D3): nas Anotações, na galeria
 * de pixel arts e na Wishlist.
 */
export interface FolderMarks {
  /** A pasta na parede (o elemento que recebe o tracejado) e o id dela. */
  markable: string;
  idOf: (el: Element) => string | null;
  /** As pastas que dá para marcar agora, pelo id (as vivas, que você pode mexer). */
  live: () => ReadonlySet<string>;
  /** Marcando, dois toques numa pasta abrem ela (o toque sozinho marca). */
  open: (id: string) => void;
  /**
   * As fichas de dentro de uma pasta (todas, também as das pastas de dentro dela, na ordem da parede): o que a
   * cópia leva de uma pasta marcada.
   */
  inside: (folder: string) => readonly string[];
}

/**
 * Onde as marcas moram, quando não é na peça (nas análises, o Lado a lado: core/side-by-side.ts). Guarda as
 * chaves, na ordem em que foram marcadas: os ids das fichas e, onde as pastas marcam, as das pastas
 * (`FOLDER_MARK` + id).
 */
export interface SelectionStore {
  readonly ids: Signal<readonly string[]>;
  set(ids: readonly string[]): void;
}

/**
 * Onde e como marcar: cada página diz quais são as fichas dela e quando as marcas deixam de valer. `T` é o que se
 * marca: as anotações (o padrão) ou outra coisa com id, como as obras da galeria de pixel arts, que diz como copiar
 * as marcadas (`copy`).
 */
export interface NoteSelectionConfig<T = Review> {
  /** A página: só as fichas dentro dela marcam. */
  host: HTMLElement;
  /** As fichas que marcam (o elemento que recebe o tracejado) e o atributo com o id da anotação. */
  markable: string;
  idOf: (el: Element) => string | null;
  /** Se marcar vale agora (o seu mural, o seu quadro). */
  on: () => boolean;
  /** As fichas que dá para marcar (e copiar), pelo id. */
  notes: () => ReadonlyMap<string, T>;
  /**
   * O texto das marcadas para o Ctrl+C e o aviso de quando copiou. Sem ele, o das anotações (`notesAsText`): quem
   * marca outra coisa que não anotações diz o seu. `inside`: quantas vieram de dentro das pastas marcadas.
   */
  copy?: (items: readonly T[], inside: number) => { text: string; done: string };
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
  /** As pastas também se marcam (sem: só as fichas). */
  folders?: FolderMarks;
  /** O modo marcando (o botão Marcar da pasta do mural); sem ele, a peça guarda o seu. */
  mode?: WritableSignal<boolean>;
  /** Sair do modo deixa as marcas (as do Lado a lado ficam para comparar); sem isso, sair desmarca. */
  keep?: () => boolean;
}

/**
 * Marcar várias fichas de uma vez, no mural (anotações e análises), no Kanban e nos Flashcards
 * (PLANO-SELECAO.md, 1), e também as pastas, onde a página diz quais são (PLANO-MARCAR-PASTAS.md). Ctrl+clique
 * (⌘ no Mac) ou Shift+clique numa ficha ou pasta começa: ela fica com o tracejado em volta e o adesivo com a
 * ordem. Marcando, o toque marca ou desmarca (não abre; dois toques abrem a pasta), Shift+toque marca o
 * intervalo desde a última marcada, na ordem da tela, e Ctrl+C copia o texto das marcadas (core/note-copy.ts),
 * com o de dentro das pastas. Esc, um toque no vão da página ou o Pronto da tira saem do modo. A tira
 * (ui/selection-tray.ts) diz quantas e o que fazer com elas. Criada no construtor da página (precisa do
 * contexto de injeção).
 */
export class NoteSelection<T = Review> {
  private readonly toasts = inject(Toasts);
  private readonly copyContexts = inject(CopyContexts);

  private readonly own = signal<readonly string[]>([]);
  private readonly store: SelectionStore;
  /** Tudo o que está marcado (as fichas pelo id, as pastas pela chave delas), na ordem em que foi marcado. */
  readonly keys: Signal<readonly string[]>;
  /** As fichas marcadas, na ordem em que foram marcadas (sem as pastas). */
  readonly ids: Signal<readonly string[]>;
  /** As pastas marcadas, na ordem em que foram marcadas. */
  readonly folders: Signal<readonly string[]>;
  /** Quantas coisas estão marcadas, fichas e pastas. */
  readonly count = computed(() => this.keys().length);
  /** Marcando agora: o toque numa ficha marca em vez de abrir, e a tira aparece. */
  readonly marking: WritableSignal<boolean>;
  /** A última que entrou (a chave): o Shift+toque marca daqui até a tocada. */
  private anchor: string | null = null;
  /** O modo foi ligado pelo botão Marcar: desmarcar a última não sai dele. */
  private sticky = false;
  /**
   * A pasta do último toque que marcou ou desmarcou: o segundo toque de dois (o duplo clique) nela abre a pasta,
   * mesmo que o primeiro tenha desmarcado a última e saído do modo.
   */
  private lastFolderTap: string | null = null;

  constructor(private readonly cfg: NoteSelectionConfig<T>) {
    this.store = cfg.store ?? {
      ids: this.own,
      set: (ids) => this.own.set(ids),
    };
    this.keys = this.store.ids;
    this.ids = computed(() => this.keys().filter((k) => !k.startsWith(FOLDER_MARK)), { equal: sameList });
    this.folders = computed(() => this.keys().flatMap((k) => folderOfMark(k) ?? []), { equal: sameList });
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
      const keys = this.marking() || !cfg.keep?.() ? this.keys() : [];
      cfg.layout?.();
      untracked(() => this.paint(keys));
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
          if (!this.keys().length) this.sticky = true;
          return;
        }
        this.sticky = false;
        if (!cfg.keep?.()) this.clear();
      });
    });
    // uma marcada que deixou de estar aqui (apagada, ou tirada do quadro por outro aparelho ou pela API; a pasta
    // desfeita) sai das marcas: não vai na cópia, e a ordem das outras não pula um número
    effect(() => {
      const notes = cfg.notes();
      const live = cfg.folders?.live();
      untracked(() => {
        const keys = this.keys();
        const kept = keys.filter((k) => this.exists(k, notes, live));
        if (kept.length !== keys.length) this.store.set(kept);
      });
    });
  }

  has(id: string): boolean {
    return this.keys().includes(id);
  }

  /** A pasta está marcada. */
  hasFolder(id: string): boolean {
    return this.keys().includes(FOLDER_MARK + id);
  }

  /** Esta ficha se marca aqui (o seu mural, e uma ficha que vale: nas análises, não a rejogada). */
  canMark(id: string): boolean {
    return this.cfg.on() && this.cfg.notes().has(id);
  }

  /** Esta pasta se marca aqui (onde as pastas marcam, e uma pasta que você pode mexer). */
  canMarkFolder(id: string): boolean {
    return this.cfg.on() && !!this.cfg.folders?.live().has(id);
  }

  /** A chave ainda vale: a ficha está aqui, a pasta está viva. */
  private exists(key: string, notes = this.cfg.notes(), live = this.cfg.folders?.live()): boolean {
    const folder = folderOfMark(key);
    return folder === null ? notes.has(key) : !!live?.has(folder);
  }

  /** Liga o modo sem marcar nada (o "Marcar" do menu e o botão da pasta): o toque passa a marcar. */
  start(): void {
    this.sticky = true;
    this.marking.set(true);
  }

  /** Marca ou desmarca uma ficha (o toque marcando, o Ctrl+clique, o "Marcar" do menu). */
  toggle(id: string): void {
    if (this.canMark(id)) this.toggleKey(id);
  }

  /** Marca ou desmarca uma pasta (o toque marcando, o Ctrl+clique, o "Marcar" do menu da pasta). */
  toggleFolder(id: string): void {
    if (this.canMarkFolder(id)) this.toggleKey(FOLDER_MARK + id);
  }

  private toggleKey(key: string): void {
    const keys = this.keys();
    // (as do Lado a lado guardadas, fora do modo, não se desmarcam por um toque que começa a marcar)
    if (keys.includes(key) && (this.marking() || !this.cfg.keep?.())) {
      this.store.set(keys.filter((x) => x !== key));
      if (this.anchor === key) this.anchor = null;
      // a última saiu: quem começou pelo Ctrl+clique termina aqui; quem ligou o Marcar continua marcando
      if (!this.keys().length && !this.sticky && !this.cfg.keep?.()) this.marking.set(false);
      return;
    }
    if (!keys.includes(key)) this.store.set([...keys, key]);
    this.anchor = key;
    this.marking.set(true);
  }

  /**
   * Marca várias (o intervalo do Shift, as visíveis da tira), sem mexer na ordem das que já estavam: os ids das
   * fichas e, onde as pastas marcam, as chaves delas (`FOLDER_MARK` + id).
   */
  add(list: readonly string[]): void {
    const notes = this.cfg.notes();
    const live = this.cfg.folders?.live();
    const keys = this.keys();
    const fresh = list.filter((k) => this.exists(k, notes, live) && !keys.includes(k));
    if (fresh.length) this.store.set([...keys, ...fresh]);
    if (list.length) this.anchor = list[list.length - 1];
    this.marking.set(true);
  }

  /** Desmarca tudo, continuando no modo (o Limpar da tira). */
  clear(): void {
    if (this.keys().length) this.store.set([]);
    this.anchor = null;
  }

  /** Sai do modo (Esc, Pronto, o vão da página): as marcas saem, menos as do Lado a lado. */
  done(): void {
    if (this.marking()) this.marking.set(false);
    else if (!this.cfg.keep?.()) this.clear();
    this.anchor = null;
    this.lastFolderTap = null;
  }

  /**
   * A chave do que está debaixo do toque (o id da ficha, ou a da pasta), se o toque é para marcar (com Ctrl ou
   * Shift, ou marcando).
   */
  private target(e: MouseEvent): string | null {
    const keyed = e.ctrlKey || e.metaKey || e.shiftKey;
    const second = e.detail === 2 && this.lastFolderTap !== null;
    if (e.altKey || e.button !== 0 || !this.cfg.on() || !(keyed || this.marking() || second)) return null;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(`.${MENU_CLASS}`)) return null;
    // Ctrl ou Shift+clique num link do texto continua abrindo o link (numa aba ou janela nova)
    if (keyed && t.closest('a[href]')) return null;
    const folders = this.cfg.folders;
    const folderBox = folders ? t.closest(folders.markable) : null;
    if (folders && folderBox) {
      // (a pasta sendo nomeada: o toque é do campo)
      if (!this.cfg.host.contains(folderBox) || t.closest('input')) return null;
      const id = folders.idOf(folderBox);
      if (!id || !folders.live().has(id)) return null;
      // (fora do modo, só o segundo toque na pasta que o primeiro desmarcou)
      return keyed || this.marking() || this.lastFolderTap === FOLDER_MARK + id ? FOLDER_MARK + id : null;
    }
    if (!keyed && !this.marking()) return null;
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

  /** O toque foi numa ficha (ou pasta) marcada desta página. */
  private onMarked(t: Element): boolean {
    const box = t.closest(this.selector);
    return !!box && box.hasAttribute(MARKED) && this.cfg.host.contains(box);
  }

  private click(e: MouseEvent): void {
    const key = this.target(e);
    if (!key) {
      // (um toque que não marca: o próximo duplo clique é outro)
      this.lastFolderTap = null;
      return;
    }
    // (depois de arrastar, a página engole o clique antes de chegar aqui)
    e.preventDefault();
    e.stopImmediatePropagation();
    const folder = folderOfMark(key);
    // marcando, dois toques numa pasta abrem ela: o segundo volta a marca do primeiro como estava
    if (folder !== null && e.detail === 2 && key === this.lastFolderTap && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
      this.lastFolderTap = null;
      this.toggleKey(key);
      this.cfg.folders?.open(folder);
      return;
    }
    this.lastFolderTap = folder !== null && !e.shiftKey ? key : null;
    const from = this.anchor ?? this.keys().at(-1) ?? null;
    if (e.shiftKey && from && from !== key) {
      const range = this.between(from, key);
      if (range) {
        this.add(range);
        return;
      }
    }
    this.toggleKey(key);
  }

  /** O que está na tela de `from` até `to` (as chaves), na ordem em que aparece (null: `from` não está à vista). */
  private between(from: string, to: string): string[] | null {
    // (a mesma ficha pode aparecer duas vezes, ordenando por tag: vale a primeira; as pastas vêm antes das fichas)
    const seen = new Set<string>();
    for (const el of this.cfg.host.querySelectorAll(this.selector)) {
      const key = this.keyOf(el);
      if (key) seen.add(key);
    }
    const order = [...seen];
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
    if (!this.keys().length || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'c') return;
    // um texto selecionado na página ou um campo com o foco copiam como sempre
    const sel = getSelection();
    if ((sel && !sel.isCollapsed) || isEditable(document.activeElement)) return;
    e.preventDefault();
    void this.copy();
  }

  /**
   * O que a cópia leva, na ordem em que foi marcado: cada ficha marcada e, de cada pasta marcada, as de dentro
   * dela (PLANO-MARCAR-PASTAS.md, D8), sem repetir. `inside`: quantas vieram só de dentro das pastas (a marcada
   * que também está numa pasta marcada conta como marcada).
   */
  copied(): { items: T[]; inside: number } {
    const byId = this.cfg.notes();
    const marked = new Set(this.ids());
    const seen = new Set<string>();
    const items: T[] = [];
    let inside = 0;
    const take = (id: string) => {
      const r = byId.get(id);
      if (!r || seen.has(id)) return;
      seen.add(id);
      items.push(r);
      if (!marked.has(id)) inside++;
    };
    for (const key of this.keys()) {
      const folder = folderOfMark(key);
      if (folder === null) take(key);
      else for (const id of this.cfg.folders?.inside(folder) ?? []) take(id);
    }
    return { items, inside };
  }

  /** Copia as marcadas (o Ctrl+C, o Copiar da tira e o "Copiar as N marcadas" do menu da anotação). */
  async copy(): Promise<void> {
    const { items, inside } = this.copied();
    if (!items.length) {
      const n = this.folders().length;
      if (n) this.toasts.show(n === 1 ? 'A pasta marcada está vazia: não há o que copiar.' : 'As pastas marcadas estão vazias: não há o que copiar.');
      return;
    }
    const own = this.cfg.copy?.(items, inside);
    const notes = items as unknown as Review[];
    await this.toasts.copy(
      own ? own.text : notesAsText(notes, this.copyContexts.now()),
      own ? own.done : `${notes.length === 1 ? 'Copiei o texto da anotação' : `Copiei o texto das ${notes.length} anotações`}${insideWords(inside, notes.length, this.folders().length)}.`,
      'Não deu para copiar. Tente de novo.',
    );
  }

  /** O seletor de tudo o que marca: as fichas e, onde marcam, as pastas. */
  private get selector(): string {
    return this.cfg.folders ? `${this.cfg.markable}, ${this.cfg.folders.markable}` : this.cfg.markable;
  }

  /** A chave de um elemento que marca: o id da ficha, ou a da pasta. */
  private keyOf(el: Element): string | null {
    const folders = this.cfg.folders;
    if (folders && el.matches(folders.markable)) {
      const id = folders.idOf(el);
      return id ? FOLDER_MARK + id : null;
    }
    return this.cfg.idOf(el);
  }

  private paint(keys: readonly string[]): void {
    const order = new Map(keys.map((k, i) => [k, i + 1]));
    for (const el of this.cfg.host.querySelectorAll<HTMLElement>(this.selector)) {
      const n = order.get(this.keyOf(el) ?? '');
      el.toggleAttribute(MARKED, !!n);
      if (n) el.style.setProperty('--marca-n', String(n));
      else el.style.removeProperty('--marca-n');
    }
  }
}

/**
 * O fim do aviso da cópia que levou o de dentro das pastas marcadas (`folders`): " (de dentro das pastas)" quando
 * tudo veio delas, " (5 de dentro da pasta)" quando foi parte; nada sem pasta.
 */
export function insideWords(inside: number, total: number, folders: number): string {
  if (!inside) return '';
  const where = folders === 1 ? 'da pasta' : 'das pastas';
  return inside === total ? ` (de dentro ${where})` : ` (${inside} de dentro ${where})`;
}

/** "Copiar as N marcadas", no menu de uma marcada (a anotação e a pasta): o mesmo que o Ctrl+C. */
export function copyMarkedItem(sel: { count(): number; copy(): Promise<void> }): MenuItem {
  return { id: 'copiar-marcadas', label: `Copiar as ${sel.count()} marcadas`, icon: ICON.camadas, keys: COPY_KEY, ariaKeys: COPY_KEY === '⌘C' ? 'Meta+C' : 'Control+C', run: () => void sel.copy() };
}

/** O que, tocado no vão da página, não é o vão: os botões, os campos, as pastas, as etiquetas. */
const INTERACTIVE = 'button, a[href], input, select, textarea, label, summary, [contenteditable="true"], [role="button"], [role="tab"], app-folder-card';

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function isEditable(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
}
