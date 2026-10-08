import { ChangeDetectionStrategy, Component, ElementRef, Injectable, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { Check, CornerDownRight, LucideAngularModule, X } from 'lucide-angular';
import { Desk } from '../core/desk';
import { backlinkLine, backlinksOf } from '../core/note-links';
import { isDone } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { pinningFor } from '../core/wall-physics';
import { shortDay } from './note-index';
import { Pin } from './pin';

/** Qual sub-nota está com a lista das anotações que apontam para ela aberta (o id), ou nenhuma. */
@Injectable({ providedIn: 'root' })
export class NoteBacklinks {
  readonly current = signal<string | null>(null);

  open(id: string): void {
    this.current.set(id);
  }

  close(): void {
    this.current.set(null);
  }
}

/**
 * As anotações que apontam para a sub-nota (o "de onde ela é parte"), numa ficha por cima do mural,
 * aberta pelo indicador de sub-nota da ficha. Cada linha mostra o título, a categoria e a linha do
 * texto onde ela é citada; tocar abre aquela anotação na leitura.
 */
@Component({
  selector: 'app-note-backlinks',
  imports: [LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="sheet citada"
      aria-labelledby="citada-titulo"
      (close)="backlinks.close()"
      (pointerdown)="onPointerDown($event)"
      (click)="onBackdrop($event)"
    >
      @if (note(); as n) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + stock() + ')'" [attr.data-cor]="stock()">
          <app-pin class="pin" color="#f4f4f0" />
          <header class="head">
            <h2 id="citada-titulo">{{ n.game.name }}</h2>
            <button type="button" class="icon-btn" aria-label="Fechar" (click)="backlinks.close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>
          <div class="body">
            @if (rows().length) {
              <p class="conta">
                <lucide-icon [img]="SubIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
                {{ rows().length === 1 ? 'Sub-nota desta anotação' : 'Sub-nota citada nestas ' + rows().length + ' anotações' }}
              </p>
              <ul class="lista">
                @for (r of rows(); track r.id) {
                  <li>
                    <button type="button" class="linha" [class.feita]="r.done" [style.--cor]="r.stock" (click)="openNote(r.id)">
                      <span class="cor" aria-hidden="true"></span>
                      <span class="textos">
                        <span class="topo">
                          <span class="titulo">{{ r.title }}</span>
                          @if (r.done) {
                            <lucide-icon class="feita-icone" [img]="DoneIcon" [size]="15" [strokeWidth]="3" aria-hidden="true" />
                            <span class="sr-only">, finalizada</span>
                          }
                          @if (r.category) {
                            <span class="cat">{{ r.category }}</span>
                          }
                        </span>
                        @if (r.line; as l) {
                          <span class="trecho">{{ l.before }}<span class="elo">{{ l.link }}</span>{{ l.after }}</span>
                        }
                      </span>
                      <span class="data">{{ r.date }}</span>
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="vazio">Nenhuma anotação aponta mais para esta. Ela continua sub-nota até você mudar isso no editor.</p>
            }
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    @use 'sheet';

    :host {
      display: contents;
    }

    dialog.citada {
      max-width: min(520px, calc(100vw - 24px));
    }

    .ficha {
      position: relative;
      rotate: 0.5deg;
    }

    .head {
      align-items: center;
    }
    .head h2 {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .body {
      gap: 10px;
    }
    .conta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.7;
    }

    /* a lista: um pedaço do índice do caderno (as linhas azuis da pauta) */
    .lista {
      margin: 0 0 4px;
      padding: 0;
      list-style: none;
      border-top: 1px solid rgb(90 140 200 / 0.38);
    }
    .lista li {
      border-bottom: 1px solid rgb(90 140 200 / 0.38);
    }
    .linha {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 52px;
      padding: 8px 6px 8px 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(255 218 66 / 0.22);
      }
      &:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: -3px;
      }
    }
    /* a tirinha da cor da cartolina, o marcador de página saindo da margem, como na Lista */
    .cor {
      flex: none;
      align-self: flex-start;
      width: 22px;
      height: 14px;
      margin-top: 5px;
      border-radius: 0 2px 2px 0;
      background: var(--cor);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.18);
    }
    .textos {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .topo {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }
    .titulo {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.15rem;
      line-height: 1.2;
    }
    .feita .titulo {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
      opacity: 0.7;
    }
    .feita-icone {
      flex: none;
      display: inline-flex;
      align-self: center;
      color: #1c7a43;
    }
    /* a categoria na orelha de manilha deitada, como na Lista */
    .cat {
      flex: none;
      max-width: 14ch;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding: 1px 7px;
      border-radius: 5px 5px 0 0;
      background-color: #f3e5bb;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: #151515;
      font-family: var(--f-marker);
      font-size: 0.82rem;
      line-height: 1.3;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    }
    /* a linha onde ela é citada, em até duas linhas, com o link riscado à caneta como na ficha */
    .trecho {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
      overflow-wrap: anywhere;
      font-family: var(--f-hand);
      font-size: 0.98rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
    .elo {
      color: var(--ink);
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%23c4302b' stroke-width='2.3' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat left 0 bottom 0.1em / 100% 0.34em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .data {
      flex: none;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.7;
    }

    .vazio {
      max-width: 44ch;
      font-size: 1rem;
      line-height: 1.5;
    }

    @media (max-width: 560px) {
      .data {
        display: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .linha {
        transition: none;
      }
    }
  `,
})
export class NoteBacklinksDialog {
  protected readonly backlinks = inject(NoteBacklinks);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly SubIcon = CornerDownRight;
  protected readonly CloseIcon = X;
  protected readonly DoneIcon = Check;

  /** A sub-nota aberta (some se ela for apagada com a lista aberta). */
  protected readonly note = computed(() => {
    const id = this.backlinks.current();
    return id ? (this.store.notes().find((n) => n.id === id) ?? null) : null;
  });
  protected readonly stock = computed(() => {
    const n = this.note();
    return n ? pinningFor(n.id, n.stock).stock : 'branco';
  });

  protected readonly rows = computed(() => {
    const n = this.note();
    if (!n) return [];
    const notes = this.store.notes();
    return backlinksOf(n, notes).map((r) => ({
      id: r.id,
      title: r.game.name,
      category: r.category ?? null,
      stock: `var(--stock-${pinningFor(r.id, r.stock).stock})`,
      line: backlinkLine(r, n, notes),
      date: shortDay(r.completedAt),
      done: isDone(r),
    }));
  });

  constructor() {
    afterRenderEffect(() => {
      const open = !!this.note();
      const el = this.dialog().nativeElement;
      if (open && !el.open) {
        el.showModal();
        el.querySelector<HTMLElement>('.linha, .icon-btn')?.focus();
      } else if (!open && el.open) {
        el.close();
      }
    });
  }

  protected openNote(id: string): void {
    this.backlinks.close();
    this.desk.openReview(id);
  }

  /** O clique começou fora da ficha? Arrastar de dentro para fora não fecha. */
  private downOnBackdrop = false;

  protected onPointerDown(e: PointerEvent): void {
    this.downOnBackdrop = e.target === e.currentTarget;
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement && this.downOnBackdrop) this.backlinks.close();
  }
}
