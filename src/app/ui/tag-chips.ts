import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NoteTag } from './note-tag';

/** Quantas tags ficam à mão; as outras aparecem no "+N". */
const MAX_SHORTCUTS = 10;

/** Quanto o dedo segura parado numa tag para escondê-la (o clique direito do toque). */
const HOLD = 500;

/**
 * Uma tag do filtro: o valor que liga e desliga, como ela aparece, em quantas anotações está (na
 * escondida, quantas ela esconde), se está ligada e se está escondida (riscada).
 */
export interface TagChip {
  value: string;
  label: string;
  n: number;
  on: boolean;
  out?: boolean;
}

let nextId = 0;

/**
 * O filtro por tags na pasta, depois do picote: o do mural de anotações (ver `TagShortcuts`) e o do
 * Kanban. Um toque liga ou desliga a tag (ligadas várias, vale qualquer uma delas). A desligada é o
 * contorno tracejado de uma etiqueta em branco; a ligada é a etiqueta de papel kraft amarrada, como na
 * ficha. Chegam na ordem em que aparecem (as mais usadas primeiro); com mais de dez, o "+N" mostra as
 * outras, e as ligadas e as escondidas ficam sempre à mão.
 *
 * O clique direito (no teclado, a tecla de menu ou Shift+F10; no dedo, segurar meio segundo) esconde
 * a tag: "todas, menos estas". A escondida fica riscada à caneta, e um toque nela a mostra de novo.
 * Quem decide o que cada gesto muda é quem usa (`toggled` e `excluded`, ver core/tag-filter.ts).
 */
@Component({
  selector: 'app-tag-chips',
  imports: [NoteTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shortcuts(); as s) {
      <ul class="atalhos" aria-label="Filtrar pelas tags">
        @for (t of s.tags; track t.value; let i = $index) {
          <li>
            <button
              type="button"
              class="atalho"
              [class.fora]="!!t.out"
              [attr.aria-pressed]="t.on"
              [attr.aria-describedby]="hintId"
              [title]="titleOf(t)"
              (click)="onClick($event, t)"
              (contextmenu)="onMenu($event, t)"
              (keydown)="lastTouch = false"
              (pointerdown)="onDown($event, t)"
              (pointermove)="onMove($event)"
              (pointerup)="cancelHold()"
              (pointercancel)="cancelHold()"
              (pointerleave)="cancelHold()"
            >
              <app-note-tag [label]="t.label" [ghost]="!t.on" [index]="t.on ? i : null" />
              <span class="n">{{ t.n }}</span>
              @if (t.out) {
                <span class="sr-only">, escondida</span>
              }
            </button>
          </li>
        }
        @if (s.more || all()) {
          <li>
            <button type="button" class="mais" [attr.aria-expanded]="all()" (click)="all.set(!all())">
              {{ all() ? 'Menos' : '+' + s.more }}
              @if (!all()) {
                <span class="sr-only">{{ s.more === 1 ? 'tag' : 'tags' }}</span>
              }
            </button>
          </li>
        }
      </ul>
      <p class="sr-only" [id]="hintId">Clique direito, a tecla de menu ou Shift+F10 esconde as anotações da tag; na escondida, um clique mostra de novo.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .atalhos {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .atalho {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 4px 8px 4px 4px;
      border: 0;
      border-radius: 4px;
      background: none;
      cursor: pointer;
      /* segurar o dedo esconde a tag: sem o menu nem a seleção do navegador no caminho */
      -webkit-touch-callout: none;
      user-select: none;

      &:hover {
        background: rgb(21 21 21 / 0.07);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 1px;
      }
    }

    /* escondida: a etiqueta e a contagem desbotam, e um risco de caneta atravessa as duas, torto,
       como quem cortou a tag da lista */
    .fora app-note-tag,
    .fora .n {
      opacity: 0.6;
    }

    .fora::after {
      content: '';
      position: absolute;
      left: 0;
      right: 3px;
      top: calc(50% - 1.25px);
      height: 2.5px;
      border-radius: 2px;
      background: var(--ink);
      rotate: -2.5deg;
      transform-origin: left center;
      pointer-events: none;
      animation: risca 220ms var(--ease-ui);
    }

    @keyframes risca {
      from {
        scale: 0 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fora::after {
        animation: none;
      }
    }

    .n,
    .mais {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.06em;
      color: rgb(21 21 21 / 0.72);
      font-variant-numeric: tabular-nums;
    }

    .mais {
      min-height: 36px;
      padding: 4px 8px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--ink);
      text-transform: uppercase;
      text-decoration: underline 2px var(--ink);
      text-underline-offset: 4px;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        background: rgb(21 21 21 / 0.07);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 1px;
      }
    }

    /* no celular, uma linha só, que corre de lado dentro da pasta */
    @media (max-width: 720px) {
      .atalhos {
        flex-wrap: nowrap;
      }
      li {
        flex: none;
      }
    }
  `,
})
export class TagChips {
  /** As tags, já na ordem (as mais usadas primeiro). */
  readonly tags = input.required<readonly TagChip[]>();
  /** O clique: liga ou desliga a tag (na escondida, mostra de novo). */
  readonly toggled = output<string>();
  /** O clique direito (ou segurar o dedo): esconde a tag (na escondida, mostra de novo). */
  readonly excluded = output<string>();

  protected readonly hintId = `tags-dica-${nextId++}`;
  /** Mostrando todas as tags (o "+N" aberto). */
  protected readonly all = signal(false);

  protected readonly shortcuts = computed(() => {
    const options = this.tags();
    if (!options.length) return null;
    const shown = this.all() ? options : options.filter((o, i) => i < MAX_SHORTCUTS || o.on || o.out);
    return { tags: shown, more: options.length - shown.length };
  });

  protected titleOf(t: TagChip): string {
    if (t.out) return `Escondida: ${t.n === 1 ? '1 anotação fora' : t.n + ' anotações fora'}. Clique para mostrar de novo`;
    return `${t.on ? 'Clique para tirar do filtro' : 'Clique: só as com ' + t.label}. Botão direito: esconder ${t.label}`;
  }

  /** O último gesto foi o dedo (o menu do navegador que vem dele é o segurar, já tratado). */
  protected lastTouch = false;
  private hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
  /** O dedo segurou e escondeu a tag: o clique que vem quando ele sobe não liga a tag. */
  private swallow = false;

  protected onClick(e: MouseEvent, t: TagChip): void {
    if (this.swallow) {
      this.swallow = false;
      e.preventDefault();
      return;
    }
    this.toggled.emit(t.value);
  }

  protected onMenu(e: MouseEvent, t: TagChip): void {
    e.preventDefault();
    if (this.lastTouch) return;
    this.excluded.emit(t.value);
  }

  protected onDown(e: PointerEvent, t: TagChip): void {
    this.lastTouch = e.pointerType === 'touch';
    this.swallow = false;
    this.cancelHold();
    if (!this.lastTouch) return;
    this.hold = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        this.hold = null;
        this.swallow = true;
        navigator.vibrate?.(12);
        this.excluded.emit(t.value);
      }, HOLD),
    };
  }

  /** O dedo andou: é rolar a fileira, não segurar. */
  protected onMove(e: PointerEvent): void {
    if (this.hold && Math.hypot(e.clientX - this.hold.x, e.clientY - this.hold.y) > 10) this.cancelHold();
  }

  protected cancelHold(): void {
    if (!this.hold) return;
    clearTimeout(this.hold.timer);
    this.hold = null;
  }
}
