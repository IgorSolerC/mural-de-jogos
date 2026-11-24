import { scopeOf } from '../ui/drag-pile';
import { carriesFiles } from '../ui/image-pixels';
import { SPRING_MS } from './wall-drag';

/**
 * Soltar arquivos do computador numa parede de pastas (PLANO-SOLTAR-IMAGENS.md, rodada 3): o mesmo que se vê
 * arrastando uma obra da própria parede (pages/wall-drag.ts), com o arrastar do navegador. O alvo debaixo do
 * ponteiro acende (`data-alvo`: uma pasta, um pedaço do caminho ou a parede da pasta aberta), a etiqueta amarela
 * de marca-texto (`.arrasto-dica`, ui/_arrasto.scss) diz para onde vai, e parar em cima de uma pasta abre ela.
 * A parede decide o que fazer com os arquivos.
 */
export interface WallFileDropConfig {
  /** A página: os alvos ficam dentro dela. */
  host: HTMLElement;
  /** Se soltar vale agora (sem uma folha aberta por cima, por exemplo). */
  on: () => boolean;
  /** A parede da pasta aberta (o alvo de quando não se está em cima de uma pasta): o elemento que acende. */
  wall: () => HTMLElement | null;
  /** O elemento de onde a etiqueta copia o escopo dos estilos. */
  scope: () => Element | null;
  /** A pasta aberta (null: a raiz). */
  openFolder: () => string | null;
  /** O nome de uma pasta viva, ou null; e o da raiz ("a galeria"). */
  folderName: (id: string) => string | null;
  rootName: string;
  /** O que se diz de `n` arquivos indo para `where` ("Trazer 3 imagens para Bichos"). */
  label: (n: number, where: string) => string;
  /** Parou em cima de uma pasta ou de um pedaço do caminho: abre ela (null: a raiz). */
  open: (id: string | null) => void;
  /** Soltou: os arquivos e a pasta (null: a raiz). */
  drop: (files: FileList, folder: string | null) => void;
}

interface Target {
  el: HTMLElement;
  folder: string | null;
  /** A pasta que abre parando em cima (undefined: nenhuma). */
  spring?: string | null;
}

export class WallFileDrop {
  private target: Target | null = null;
  private tip: HTMLElement | null = null;
  private springTimer: ReturnType<typeof setTimeout> | undefined;
  private springFor: string | null | undefined = undefined;
  /** O último ponto do ponteiro (a parede troca embaixo dele quando uma pasta abre). */
  private at = { x: 0, y: 0 };
  private count = 0;

  constructor(private readonly cfg: WallFileDropConfig) {
    const host = cfg.host;
    const over = (e: DragEvent) => this.over(e);
    const leave = (e: DragEvent) => {
      // saiu da página (e não só de um filho dela para outro)
      const to = e.relatedTarget as Node | null;
      if (!to || !host.contains(to)) this.clear();
    };
    const drop = (e: DragEvent) => this.dropped(e);
    const end = () => this.clear();
    host.addEventListener('dragenter', over);
    host.addEventListener('dragover', over);
    host.addEventListener('dragleave', leave);
    host.addEventListener('drop', drop);
    // o Esc no meio do arrasto, ou soltar fora da janela
    document.addEventListener('dragend', end);
    document.addEventListener('drop', end);
    this.off = () => {
      host.removeEventListener('dragenter', over);
      host.removeEventListener('dragover', over);
      host.removeEventListener('dragleave', leave);
      host.removeEventListener('drop', drop);
      document.removeEventListener('dragend', end);
      document.removeEventListener('drop', end);
      this.clear();
    };
  }

  /** Larga tudo (a página saiu). */
  readonly off: () => void;

  private over(e: DragEvent): void {
    if (!carriesFiles(e.dataTransfer)) return;
    // (sem o preventDefault, soltar abriria o arquivo no lugar do site: quando não vale, o navegador mostra o "não";
    // o ateliê aberto, que tem o soltar dele, já disse o que vale)
    const taken = e.defaultPrevented;
    e.preventDefault();
    if (!this.cfg.on()) {
      if (e.dataTransfer && !taken) e.dataTransfer.dropEffect = 'none';
      this.clear();
      return;
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    // (o navegador só diz quantos arquivos, não quais, enquanto se arrasta)
    this.count = Array.from(e.dataTransfer?.items ?? []).filter((i) => i.kind === 'file').length || 1;
    this.at = { x: e.clientX, y: e.clientY };
    this.follow(e.target instanceof Element ? e.target : null);
  }

  /** O alvo de agora: o elemento debaixo do ponteiro (o do evento; depois de abrir uma pasta, o do ponto). */
  private follow(under: Element | null = null): void {
    const next = this.targetAt(under ?? document.elementFromPoint(this.at.x, this.at.y));
    if (next?.el !== this.target?.el || next?.folder !== this.target?.folder) {
      this.target?.el.removeAttribute('data-alvo');
      next?.el.setAttribute('data-alvo', '');
      this.target = next;
    }
    const tip = this.ensureTip();
    if (tip) {
      tip.hidden = !next;
      if (next) {
        const where = next.folder ? (this.cfg.folderName(next.folder) ?? this.cfg.rootName) : this.cfg.rootName;
        tip.textContent = this.cfg.label(this.count, where);
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        tip.style.translate = `${Math.max(8, Math.min(this.at.x + 18, innerWidth - w - 8))}px ${Math.min(this.at.y + 22, innerHeight - h - 8)}px`;
      }
    }
    const spring = next?.spring;
    if (spring === this.springFor) return;
    clearTimeout(this.springTimer);
    this.springFor = spring;
    if (spring === undefined) return;
    this.springTimer = setTimeout(() => {
      this.springFor = undefined;
      this.cfg.open(spring);
      // a parede trocou embaixo do ponteiro: o alvo é refeito quando ela desenhar
      requestAnimationFrame(() => requestAnimationFrame(() => this.tip && this.follow()));
    }, SPRING_MS);
  }

  /** O alvo debaixo do ponteiro: um pedaço do caminho, uma pasta, ou a parede da pasta aberta. */
  private targetAt(hit: Element | null): Target | null {
    if (!hit || !this.cfg.host.contains(hit)) return null;
    const open = this.cfg.openFolder();
    const crumb = hit.closest<HTMLElement>('app-folder-path [data-caminho]');
    if (crumb) {
      const id = crumb.dataset['caminho'] || null;
      if (id && !this.cfg.folderName(id)) return null;
      return { el: crumb, folder: id, spring: id === open ? undefined : id };
    }
    const card = hit.closest<HTMLElement>('app-folder-card[data-pasta]');
    if (card) {
      const id = card.dataset['pasta']!;
      return this.cfg.folderName(id) ? { el: card, folder: id, spring: id } : null;
    }
    const wall = this.cfg.wall();
    return wall ? { el: wall, folder: open } : null;
  }

  private dropped(e: DragEvent): void {
    if (!carriesFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (!this.cfg.on()) {
      this.clear();
      return;
    }
    const target = this.targetAt(e.target instanceof Element ? e.target : document.elementFromPoint(e.clientX, e.clientY));
    const files = e.dataTransfer?.files;
    this.clear();
    if (target && files?.length) this.cfg.drop(files, target.folder);
  }

  private ensureTip(): HTMLElement | null {
    if (this.tip) return this.tip;
    const scope = this.cfg.scope();
    if (!scope) return null;
    const tip = document.createElement('div');
    for (const a of scopeOf(scope)) tip.setAttribute(a, '');
    tip.className = 'arrasto-dica';
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    this.cfg.host.append(tip);
    this.tip = tip;
    return tip;
  }

  private clear(): void {
    clearTimeout(this.springTimer);
    this.springFor = undefined;
    this.target?.el.removeAttribute('data-alvo');
    this.target = null;
    this.tip?.remove();
    this.tip = null;
  }
}
