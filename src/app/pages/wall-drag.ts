import type { NoteFolder } from '../core/folders';
import { DragHold, DragStart, edgeSpeed } from '../ui/drag-hold';
import { dragGroup, dragPile, scopeOf } from '../ui/drag-pile';
import { WALL_NOTES, wallNoteId } from '../ui/note-menu';

/** Parar o arrasto em cima de uma pasta (ou de um pedaço do caminho) por este tempo abre ela. */
export const SPRING_MS = 750;
/** A faixa perto do alto e do pé da tela onde a página rola sozinha arrastando. */
const EDGE = 70;

/**
 * O que muda as pastas do seu Murall (core/note-folders.ts, `NoteFolders`, entregue pela página do dono à
 * parede): a parede é a mesma da visita e não importa nada que escreve (a regra "Visita: as mesmas peças do
 * dono", no CLAUDE.md). Cada mudança devolve como desfazer.
 */
export interface FolderActions {
  place(ids: readonly string[], folder: string | null): { moved: number; undo: () => void };
  gather(ids: readonly string[], category: string | null | undefined, parent: string | null): { folder: NoteFolder; undo: () => void } | null;
  create(category: string | null | undefined, parent: string | null, name: string): NoteFolder | null;
  move(id: string, parent: string | null): (() => void) | null;
  rename(id: string, name: string): () => void;
  join(from: string, into: string): () => void;
  dissolve(id: string): () => void;
  contentsOf(id: string): { notes: number; folders: number };
  countsIn(category: string | null | undefined): Map<string, number>;
}

/** O que se arrasta na parede: anotações (a pega e as marcadas que vão junto) ou uma pasta. */
export type WallDragItem = { kind: 'notas'; lead: string; ids: readonly string[] } | { kind: 'pasta'; id: string };

/** Onde cai: com outra anotação, numa pasta nova (`juntar`), ou numa pasta (`guardar`; null: a raiz do grupo). */
export type WallDrop = { kind: 'juntar'; with: string } | { kind: 'guardar'; folder: string | null };

/** O que a parede diz ao arrasto: o que vale arrastar, os nomes e o que fazer ao soltar. */
export interface WallDragConfig {
  /** A parede (as fichas, as pastas e o caminho na barra ficam dentro dela ou da página). */
  host: HTMLElement;
  /** Se arrastar vale agora (o seu Murall, numa aba de grupo, sem marcar para o lado a lado). */
  on: () => boolean;
  /** As marcadas (Ctrl+clique): pegar uma delas leva todas. */
  marked: () => readonly string[];
  /** A pasta aberta (null: a raiz do grupo) e o nome do grupo. */
  openFolder: () => string | null;
  groupName: () => string;
  /** O nome de uma pasta viva, ou null. */
  folderName: (id: string) => string | null;
  /** A pasta de verdade de uma anotação (null: solta na raiz). */
  folderOf: (note: string) => string | null;
  /** A pasta e todas as de dentro (para nunca pôr uma pasta dentro dela mesma). */
  below: (id: string) => ReadonlySet<string>;
  /** A de cima de uma pasta (null: a raiz). */
  parentOf: (id: string) => string | null;
  /** Solta: faz. */
  drop: (item: WallDragItem, to: WallDrop) => void;
  /** Parou em cima de uma pasta ou de um pedaço do caminho: abre ela (null: a raiz). */
  open: (id: string | null) => void;
  /** O dedo segurou e soltou sem arrastar: o menu do que se segurou. */
  menu: (item: WallDragItem, box: HTMLElement, x: number, y: number) => void;
}

/** A cópia do papel de uma ficha para o arrasto: sem a etiqueta das ações (Finalizar, Fixar) e sem os ids. */
function copyFace(face: HTMLElement): HTMLElement {
  const copy = face.cloneNode(true) as HTMLElement;
  for (const el of Array.from(copy.querySelectorAll('.acoes'))) el.remove();
  for (const el of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('[data-ficha], [data-lugar], [data-pasta], [id]'))]) {
    el.removeAttribute('data-ficha');
    el.removeAttribute('data-lugar');
    el.removeAttribute('data-pasta');
    el.removeAttribute('id');
  }
  return copy;
}

/** Um alvo debaixo do ponteiro: o elemento, onde cai, a frase da etiqueta e a pasta que abre se parar ali. */
interface Target {
  el: HTMLElement;
  drop: WallDrop;
  label: string;
  /** A pasta que abre parando em cima (undefined: não abre nada). */
  spring?: string | null;
}

/**
 * Arrastar na parede de um grupo (PLANO-PASTAS.md, 4.5), com o gesto do Kanban (ui/drag-hold.ts): uma
 * anotação sobre outra cria uma pasta com as duas; sobre uma pasta (ou um pedaço do caminho), guarda nela;
 * uma pasta sobre outra entra nela. Uma etiqueta amarela segue o ponteiro dizendo o que vai acontecer, e
 * parar em cima de uma pasta abre ela, para chegar fundo num gesto só. Perto do alto e do pé da tela, a
 * página rola. O que foi pego fica apagado no lugar enquanto a cópia anda.
 */
export class WallDrag {
  private readonly gesture: DragHold<{ item: WallDragItem; box: HTMLElement }>;
  private ghost: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private grab = { x: 0, y: 0 };
  private target: Target | null = null;
  private dimmed: HTMLElement[] = [];
  private springTimer: ReturnType<typeof setTimeout> | undefined;
  private springFor: string | null | undefined = undefined;
  private item: WallDragItem | null = null;
  /** Arrastando com o dedo: a etiqueta vai acima dele (embaixo, o dedo cobriria). */
  private touch = false;

  constructor(private readonly cfg: WallDragConfig) {
    this.gesture = new DragHold({
      begin: (s) => this.begin(s),
      move: (x, y) => this.follow(x, y),
      drop: () => this.release(),
      end: () => this.clear(),
      hold: (s) => cfg.menu(s.item.item, s.item.box, s.x, s.y),
      edge: (_x, y) => this.edge(y),
    });
    const host = cfg.host;
    const down = (e: PointerEvent) => this.onDown(e);
    // a imagem ou o link de dentro de uma ficha não começa o arrastar do navegador no meio do nosso
    const native = (e: DragEvent) => {
      if (this.gesture.pending) e.preventDefault();
    };
    host.addEventListener('pointerdown', down);
    host.addEventListener('dragstart', native);
    this.off = () => {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('dragstart', native);
      this.gesture.cancel();
    };
  }

  /** Larga tudo (a página saiu). */
  readonly off: () => void;

  /** Arrastando agora. */
  get active(): boolean {
    return this.gesture.active;
  }

  private onDown(e: PointerEvent): void {
    if (!this.cfg.on() || e.button !== 0) return;
    const t = e.target as Element;
    const folder = t.closest<HTMLElement>('app-folder-card[data-pasta]');
    if (folder && this.cfg.host.contains(folder)) {
      // a pasta sendo nomeada não se arrasta
      if (folder.querySelector('input')) return;
      this.gesture.down(e, { item: { kind: 'pasta', id: folder.dataset['pasta']! }, box: folder }, folder);
      return;
    }
    // o que é de dentro da ficha: as caixinhas das tarefas, os botões da etiqueta (só o da ficha inteira
    // arrasta), os campos, os links
    if (t.closest('input, textarea, select, label, a[href], [contenteditable="true"], button:not(.hit)')) return;
    const box = t.closest<HTMLElement>(WALL_NOTES);
    const id = box && this.cfg.host.contains(box) ? wallNoteId(box) : null;
    if (!box || !id) return;
    // as marcadas vão juntas, na ordem da parede (ui/drag-pile.ts, como no Kanban)
    const order = Array.from(this.cfg.host.querySelectorAll(WALL_NOTES), (el) => wallNoteId(el) ?? '');
    const group = dragGroup(id, this.cfg.marked(), order);
    this.gesture.down(e, { item: { kind: 'notas', lead: id, ids: group.length ? group : [id] }, box }, box);
  }

  private begin(s: DragStart<{ item: WallDragItem; box: HTMLElement }>): boolean {
    const { item, box } = s.item;
    const face = item.kind === 'pasta' ? box : (box.querySelector<HTMLElement>('app-review-card') ?? box);
    const rect = face.getBoundingClientRect();
    if (!rect.width) return false;
    this.item = item;
    this.touch = s.touch;
    this.grab = { x: s.x - rect.left, y: s.y - rect.top };
    // os estilos da parede valem na cópia e na etiqueta, como nas fichas
    const wall = this.cfg.host.querySelector('.wall') ?? this.cfg.host;
    const scope = scopeOf(wall);
    const ghost = document.createElement('div');
    for (const n of scope) ghost.setAttribute(n, '');
    ghost.className = 'arrasto-fantasma';
    ghost.setAttribute('aria-hidden', 'true');
    const n = item.kind === 'notas' ? item.ids.length : 0;
    if (n > 1 && item.kind === 'notas') {
      // várias: o maço do Kanban (ui/drag-pile.ts), a pega por cima e mais duas por baixo
      const under = item.ids
        .filter((x) => x !== item.lead)
        .map((x) => this.faceOf(x))
        .filter((el) => !!el);
      ghost.append(dragPile(face, under, n, copyFace, scope));
    } else ghost.append(copyFace(face));
    ghost.style.width = `${rect.width}px`;
    // a cópia encolhe em direção ao ponteiro: o alvo embaixo dela continua à vista
    ghost.style.transformOrigin = `${this.grab.x}px ${this.grab.y}px`;
    this.cfg.host.append(ghost);
    this.ghost = ghost;
    const tip = document.createElement('div');
    for (const a of scope) tip.setAttribute(a, '');
    tip.className = 'arrasto-dica';
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    this.cfg.host.append(tip);
    this.tip = tip;
    // o que foi pego fica apagado no lugar
    const ids = item.kind === 'notas' ? item.ids : [];
    this.dimmed = item.kind === 'pasta' ? [box] : Array.from(this.cfg.host.querySelectorAll<HTMLElement>(WALL_NOTES)).filter((el) => ids.includes(wallNoteId(el) ?? ''));
    for (const el of this.dimmed) el.setAttribute('data-arrastada', '');
    document.documentElement.classList.add('parede-arrastando');
    return true;
  }

  /** O papel de uma anotação da parede (a ficha, ou a linha da Lista), se está montado. */
  private faceOf(id: string): HTMLElement | null {
    for (const el of this.cfg.host.querySelectorAll<HTMLElement>(WALL_NOTES)) {
      if (wallNoteId(el) === id) return el.querySelector<HTMLElement>('app-review-card') ?? (el.matches('.linha') ? el : null);
    }
    return null;
  }

  private follow(x: number, y: number): void {
    if (!this.ghost) return;
    this.ghost.style.translate = `${x - this.grab.x}px ${y - this.grab.y}px`;
    const next = this.targetAt(x, y);
    if (next?.el !== this.target?.el || next?.label !== this.target?.label) {
      this.target?.el.removeAttribute('data-alvo');
      next?.el.setAttribute('data-alvo', '');
      this.target = next;
      if (this.tip) {
        this.tip.hidden = !next;
        this.tip.textContent = next?.label ?? '';
      }
    }
    if (this.tip && next) {
      // ao lado do ponteiro (acima do dedo), sem passar da beirada da tela
      const w = this.tip.offsetWidth;
      const h = this.tip.offsetHeight;
      const tx = Math.max(8, Math.min(x + 18, innerWidth - w - 8));
      const ty = this.touch ? Math.max(8, y - h - 48) : Math.min(y + 22, innerHeight - h - 8);
      this.tip.style.translate = `${tx}px ${ty}px`;
    }
    // parar em cima de uma pasta abre ela
    const spring = next?.spring;
    if (spring !== this.springFor) {
      clearTimeout(this.springTimer);
      this.springFor = spring;
      if (spring !== undefined) {
        this.springTimer = setTimeout(() => {
          this.springFor = undefined;
          this.cfg.open(spring);
          // a parede trocou embaixo do ponteiro: o alvo é refeito quando ela desenhar
          requestAnimationFrame(() => this.gesture.refresh());
        }, SPRING_MS);
      }
    }
  }

  /** O alvo debaixo do ponteiro, se soltar ali faz alguma coisa. */
  private targetAt(x: number, y: number): Target | null {
    const item = this.item;
    const hit = document.elementFromPoint(x, y);
    if (!item || !hit) return null;
    const open = this.cfg.openFolder();
    // um pedaço do caminho (na barra): guarda ali e, parando, sobe até ele
    const crumb = hit.closest<HTMLElement>('app-folder-path [data-caminho]');
    if (crumb) {
      const id = crumb.dataset['caminho'] || null;
      const drop = this.storeIn(item, id);
      if (!drop) return null;
      return { el: crumb, ...drop, spring: id === open ? undefined : id };
    }
    if (!this.cfg.host.contains(hit)) return null;
    const folder = hit.closest<HTMLElement>('app-folder-card[data-pasta]');
    if (folder) {
      const id = folder.dataset['pasta']!;
      const drop = this.storeIn(item, id);
      if (!drop) return null;
      return { el: folder, ...drop, spring: id };
    }
    const box = hit.closest<HTMLElement>(WALL_NOTES);
    const other = box ? wallNoteId(box) : null;
    if (!box || !other || item.kind !== 'notas' || item.ids.includes(other)) return null;
    const n = item.ids.length;
    return { el: box, drop: { kind: 'juntar', with: other }, label: n === 1 ? 'Nova pasta com as duas' : `Nova pasta com as ${n + 1}` };
  }

  /** Guardar o que se arrasta na pasta `id` (null: a raiz): a frase, ou null se já está lá ou não pode. */
  private storeIn(item: WallDragItem, id: string | null): { drop: WallDrop; label: string } | null {
    const name = id ? this.cfg.folderName(id) : this.cfg.groupName();
    if (id && !name) return null;
    if (item.kind === 'pasta') {
      if (id && this.cfg.below(item.id).has(id)) return null;
      if (this.cfg.parentOf(item.id) === id) return null;
      return { drop: { kind: 'guardar', folder: id }, label: id ? `Guardar em ${name}` : `Levar para ${name}` };
    }
    if (item.ids.every((n) => this.cfg.folderOf(n) === id)) return null;
    return { drop: { kind: 'guardar', folder: id }, label: id ? `Guardar em ${name}` : 'Tirar das pastas' };
  }

  private release(): void {
    const item = this.item;
    const target = this.target;
    if (item && target) this.cfg.drop(item, target.drop);
  }

  /** Perto do alto ou do pé da tela, a página rola. */
  private edge(y: number): boolean {
    if (y < EDGE) {
      window.scrollBy(0, -edgeSpeed(y, EDGE));
      return true;
    }
    if (y > innerHeight - EDGE) {
      window.scrollBy(0, edgeSpeed(innerHeight - y, EDGE));
      return true;
    }
    return false;
  }

  private clear(): void {
    clearTimeout(this.springTimer);
    this.springFor = undefined;
    this.target?.el.removeAttribute('data-alvo');
    this.target = null;
    for (const el of this.dimmed) el.removeAttribute('data-arrastada');
    this.dimmed = [];
    this.ghost?.remove();
    this.ghost = null;
    this.tip?.remove();
    this.tip = null;
    this.item = null;
    document.documentElement.classList.remove('parede-arrastando');
  }
}
