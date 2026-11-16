import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
import { localDay } from '../core/dates';
import { PIXEL_LOOKS } from '../core/pixel-art';
import { PixelFolders } from '../core/pixel-folders';
import { PixelPiece, pieceTitle, pixelArtOf } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { formatReviewDate } from '../core/review';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
import { PickerFilters } from './picker-filters';
import { PixelFilters } from './pixel-filters';
import { PixelThumb } from './pixel-thumb';

/**
 * Escolher uma pixel art da galeria (PLANO-CAPAS.md): a folha do "Escolher a nota" (ui/card-picker.ts), com o mesmo
 * papel, a busca, o índice dos filtros (as pastas da galeria, o Jeito, quando foi mexida, as tags) e a ordem, só que
 * com as obras em grade (o desenho manda; o nome vem miúdo, e o jeito, o tamanho e a data ficam no título). Tocar numa já escolhe e fecha; Enter na busca escolhe a primeira. No pé, o "Desenhar uma nova": a
 * folha fecha e quem usa abre o ateliê (a capa guarda o desenho na galeria; o widget de pixel art desenha nele).
 * Serve à capa (ui/cover-picker.ts) e ao widget de pixel art das anotações (ui/widget-sheet.ts).
 */
@Component({
  selector: 'app-pixel-picker',
  imports: [BackdropClose, IconModule, Pin, PickerFilters, PixelThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- as teclas ficam aqui: o painel e o editor por baixo não ouvem o Esc nem o que se digita -->
    <dialog #dialog class="sheet escolher" [attr.aria-labelledby]="id + '-t'" (close)="open.set(false)" (backdropClose)="open.set(false)" (keydown)="$event.stopPropagation()">
      @if (open()) {
        <div class="ficha cartolina" data-cor="amarelo">
          <app-pin class="pin" />
          <header class="head">
            <div>
              <h2 [id]="id + '-t'">{{ heading() }}</h2>
              <p class="para">{{ hint() }}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="Fechar" (click)="open.set(false)">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <app-picker-filters [filters]="filters">
            <label class="busca">
              <lucide-icon [img]="SearchIcon" [size]="18" aria-hidden="true" />
              <span class="sr-only">Procurar pelo nome ou pela tag</span>
              <input
                #search
                type="search"
                autocomplete="off"
                placeholder="Procurar pelo nome ou pela tag"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
                (keydown.enter)="$event.preventDefault(); pickFirst()"
                (keydown.arrowdown)="$event.preventDefault(); focusItem(0)"
              />
            </label>
            <div class="body">
              <!-- em grade: a pixel art é o desenho, então ele manda; o nome vem miúdo embaixo, o resto no título -->
              <ul #lista class="lista grade-px" aria-label="Suas pixel arts" (keydown)="onListKey($event)">
                @for (p of shown(); track p.id) {
                  @let on = p.id === chosen();
                  @let meta = metaOf(p);
                  <li>
                    <button type="button" class="obra escolha" [class.on]="on" [attr.aria-current]="on ? 'true' : null" [title]="titleOf(p) + ' · ' + meta" (click)="pick(p)">
                      <!-- o desenho no xadrez do transparente, a miniatura comum da galeria -->
                      <span class="desenho" aria-hidden="true"><app-pixel-thumb [art]="artOf(p)" /></span>
                      <span class="nome">{{ titleOf(p) }}</span>
                      <span class="sr-only">, {{ meta }}</span>
                      @if (on) {
                        <span class="marca" aria-hidden="true"><lucide-icon [img]="CheckIcon" [size]="16" /></span>
                        <span class="sr-only">(a escolhida agora)</span>
                      }
                    </button>
                  </li>
                } @empty {
                  <li class="nada">
                    @if (!gallery.count()) {
                      A sua galeria de pixel arts ainda está vazia.
                      <button type="button" class="nada-link" (click)="createNew()">Desenhar a primeira</button>
                    } @else if (filters.active()) {
                      Nenhuma pixel art com esses filtros@if (query().trim()) { e “{{ query().trim() }}”}.
                      <button type="button" class="nada-link" (click)="filters.clear()">Limpar os filtros</button>
                    } @else {
                      Nenhuma pixel art com “{{ query().trim() }}”.
                      <button type="button" class="nada-link" (click)="createNew()">Desenhar uma nova</button>
                    }
                  </li>
                }
              </ul>
            </div>
          </app-picker-filters>

          <footer class="foot">
            <p class="conta">{{ footHint() }}</p>
            <div class="actions">
              <button type="button" class="btn-quiet" (click)="open.set(false)">Cancelar</button>
              <button type="button" class="btn-ink criar" [disabled]="gallery.full() && keepsNew()" [title]="gallery.full() && keepsNew() ? 'A galeria está cheia: apague uma pixel art para desenhar outra' : 'Abre o ateliê com a tela em branco'" (click)="createNew()">
                <lucide-icon [img]="DrawIcon" [size]="16" aria-hidden="true" />
                Desenhar uma nova
              </button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrls: ['./profile-picker.scss', './card-picker.scss'],
  styles: `
    @use 'pixel-studio/xadrez' as x;

    /* as obras em grade: o desenho grande, quadrado, e o nome miúdo embaixo */
    .grade-px {
      grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
      gap: 18px 14px;
      padding: 6px 4px 10px;

      .nada {
        grid-column: 1 / -1;
      }
    }

    .obra {
      position: relative;
      display: grid;
      gap: 8px;
      width: 100%;
      padding: 6px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      font: inherit;
      text-align: center;
      cursor: pointer;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        translate var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(21 21 21 / 0.06);
        translate: 0 -2px;
      }

      &:focus-visible {
        outline: 3px solid var(--ink);
        outline-offset: -1px;
      }

      /* a escolhida: a borda de tinta no desenho (a da capa escolhida) e o tique no adesivo de tinta */
      &.on {
        background: rgb(21 21 21 / 0.08);

        .desenho {
          outline: 3px solid var(--ink);
          outline-offset: 3px;
        }
      }
    }

    /* o desenho no xadrez do transparente, quadrado, com a sombra de papel solto */
    .desenho {
      display: grid;
      aspect-ratio: 1;
      padding: 10px;
      box-sizing: border-box;
      border-radius: 2px;
      @include x.xadrez(10px);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    }

    .nome {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-family: var(--f-ui);
      font-weight: 600;
      font-size: 0.86rem;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    /* o tique da escolhida: o disco de tinta do "Escolher a nota", no canto do desenho */
    .obra .marca {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 30px;
      height: 30px;
      outline: 0;
      background: var(--ink);
      color: var(--hi);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
      animation: cola var(--t-physical) var(--ease-physical);
    }

    @media (max-width: 720px) {
      .grade-px {
        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
        gap: 14px 10px;
      }
    }
  `,
})
export class PixelPicker {
  readonly open = model(false);
  /** A obra que já está escolhida (o id), ou "": vem primeiro, com o tique. */
  readonly chosen = input('');
  readonly heading = input('Escolher a pixel art');
  readonly hint = input('Uma da sua galeria de pixel arts.');
  readonly footHint = input('Toque numa pixel art para escolher.');
  /** O desenho novo vai para a galeria (a capa): com ela cheia, o Desenhar uma nova fica desligado. */
  readonly keepsNew = input(false);
  readonly picked = output<PixelPiece>();
  /** O "Desenhar uma nova": a folha fecha e quem usa abre o ateliê. */
  readonly create = output<void>();

  protected readonly id = `pixel-escolher-${nextId++}`;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly DrawIcon = ICON.editar;
  protected readonly artOf = pixelArtOf;
  protected readonly titleOf = pieceTitle;
  protected readonly query = signal('');
  protected readonly gallery = inject(PixelGallery);
  private readonly folders = inject(PixelFolders);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  protected readonly filters = new PixelFilters(this.gallery.pieces, this.query);
  /** A escolhida quando a folha abriu: ela vem primeiro, e nada pula enquanto se procura. */
  private readonly before = signal('');
  protected readonly shown = computed(() => {
    const before = this.before();
    return [...this.filters.matching()].sort((a, b) => Number(b.id === before) - Number(a.id === before) || this.filters.compare(a, b));
  });

  constructor() {
    let wasOpen = false;
    afterRenderEffect(() => {
      const el = this.dialog().nativeElement;
      const open = this.open();
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
      if (open && !wasOpen) {
        this.before.set(this.chosen());
        this.query.set('');
        this.filters.reset();
        this.search()?.nativeElement.focus();
      }
      wasOpen = open;
    });
  }

  protected pick(p: PixelPiece): void {
    this.picked.emit(p);
    this.open.set(false);
  }

  protected createNew(): void {
    this.create.emit();
    this.open.set(false);
  }

  protected pickFirst(): void {
    const first = this.shown()[0];
    if (first) this.pick(first);
  }

  /**
   * As setas andam pela grade: para os lados, uma obra; para cima e para baixo, uma fileira. Para cima, da primeira
   * fileira, volta para a busca.
   */
  protected onListKey(e: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: this.columns(), ArrowUp: -this.columns() }[e.key];
    if (!step) return;
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    if (at + step < 0) this.search()?.nativeElement.focus();
    else this.focusItem(at + step);
  }

  /** Quantas obras cabem numa fileira da grade agora. */
  private columns(): number {
    const items = this.items();
    const top = items[0]?.getBoundingClientRect().top;
    const n = items.findIndex((el) => el.getBoundingClientRect().top !== top);
    return n > 0 ? n : Math.max(1, items.length);
  }

  protected focusItem(at: number): void {
    const items = this.items();
    items[Math.max(0, Math.min(at, items.length - 1))]?.focus();
  }

  private items(): HTMLElement[] {
    return Array.from(this.lista()?.nativeElement.querySelectorAll<HTMLElement>('.escolha') ?? []);
  }

  /** O jeito, o tamanho, a pasta e quando foi mexida (ou criada, na ordem das criadas). */
  protected metaOf(p: PixelPiece): string {
    const art = pixelArtOf(p);
    const look = PIXEL_LOOKS.find((l) => l.value === art.look)?.label ?? '';
    const tree = this.folders.tree();
    const where = tree.path(this.folders.folderOf().get(p.id) ?? null).map((f) => f.name).join(' › ');
    const created = this.filters.order() === 'criadas';
    const at = new Date(created ? p.createdAt : p.at);
    const when = Number.isNaN(at.getTime()) ? '' : `${created ? 'criada' : 'mexida'} em ${formatReviewDate(localDay(at))}`;
    return [look, `${art.w} × ${art.h}`, where, when].filter(Boolean).join(' · ');
  }
}

let nextId = 0;
