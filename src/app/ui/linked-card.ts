import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { FileQuestion, LucideAngularModule } from 'lucide-angular';
import { CardFinder, FoundCard } from '../core/card-finder';
import { cap, profileOf } from '../core/kinds';
import { NoteLinks } from '../core/note-links';
import { Review, isNote } from '../core/review';
import { readCardRef } from '../core/widgets';
import { GluedReviewCard } from './glued-review-card';

/** A largura da ficha simples de verdade, antes de encolher (a de uma coluna do mural). */
const CARD_WIDTH = 300;
/** Até quanto a ficha cresce além do tamanho dela (o grande, na leitura): mais que isso, a capinha borra. */
const MAX_SCALE = 2;

/**
 * O widget NOTA (ver core/widgets.ts): outra ficha, de qualquer mural, colada no texto como uma
 * cartolina pequena presa na de fora com dois pedaços de fita crepe. É a ficha simples de verdade
 * (`GluedReviewCard`, a `ReviewCard` com `compact`), a mesma do mural, encolhida (ou um pouco aumentada) até a altura do
 * tamanho do widget (`--widget-alto`, ver note-widget.ts); numa linha estreita, até caber nela.
 *
 * A ficha é achada pelo id (`CardFinder`): as suas, as do mural aberto de outra pessoa. Escrita à
 * mão só com o título, é a anotação desse título, como um link "[[…]]" (pelos `links` do texto).
 * Tocar nela abre a ficha (`links.openCard`): no seu mural e na leitura. Sem quem abra, ela só se
 * vê (fica `inert`: nem o teclado para nela).
 *
 * Sumiu (apagada, privada no mural de outra pessoa): no lugar, um papel rasgado com o nome dela.
 *
 * A peça é colada (`data-colado`): o estrago da ficha de fora não a come.
 */
@Component({
  selector: 'app-linked-card',
  // (ela chega por um import() do widget: a ficha do mural desenha o texto, que desenha esta)
  imports: [LucideAngularModule, GluedReviewCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.tocavel]': 'openable()',
    // encolhida pela largura (a linha estreita), ela ocupa só as linhas que precisa
    '[style.min-height.px]': 'snapped()',
  },
  template: `
    @if (found(); as f) {
      <div class="lugar" data-colado [style.width.px]="box().w" [style.height.px]="box().h">
        <div class="escala" #escala [style.width.px]="cardWidth" [style.scale]="box().s">
          <app-review-card
            [review]="f.review"
            [compact]="true"
            [preview]="true"
            [masked]="f.masked"
            [looks]="f.looks"
            [attr.inert]="openable() ? null : ''"
            (opened)="open(f.review)"
          />
        </div>
        <span class="fita fita-esq" aria-hidden="true"></span>
        <span class="fita fita-dir" aria-hidden="true"></span>
      </div>
      @if (!openable()) {
        <span class="sr-only">{{ spoken(f.review) }}</span>
      }
    } @else {
      <!-- sumiu: o pedaço de papel que ficou colado, com o nome dela -->
      <div class="perdida" data-colado role="note">
        <span class="fita fita-esq" aria-hidden="true"></span>
        <lucide-icon class="perdida-icone" [img]="LostIcon" [size]="22" [strokeWidth]="2.3" aria-hidden="true" />
        <span class="perdida-texto">
          <span class="perdida-nome">{{ ref().title || 'Uma ficha' }}</span>
          <span class="perdida-dica">{{ ref().id ? 'Essa ficha foi apagada ou não está à mostra.' : 'Nenhuma anotação com esse nome.' }}</span>
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      /* o espaço do tamanho (ver note-widget.ts): a ficha, colada no alto dele */
      min-height: var(--widget-alto, calc(var(--line, 1.5em) * 7));
      line-height: var(--line, 1.5em);
      padding-inline: 0.2em;
      white-space: normal;
      text-indent: 0;
    }
    .lugar {
      position: relative;
      flex: none;
      max-width: 100%;
    }
    /* a ficha de verdade, do tamanho dela, encolhida do canto de cima */
    .escala {
      transform-origin: 0 0;
      position: absolute;
      top: 0;
      left: 0;
      /* a letra da página, como no mural: a do texto de fora (à mão, recuada, inclinada) não passa */
      color: var(--ink);
      font-family: var(--f-ui);
      font-size: 1rem;
      font-style: normal;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: normal;
      text-align: left;
      text-indent: 0;
      text-transform: none;
    }
    :host(.tocavel) app-review-card {
      cursor: pointer;
      transition: translate var(--t-quick, 160ms) var(--ease-out, ease-out);
    }
    @media (hover: hover) {
      :host(.tocavel) .lugar:hover app-review-card {
        translate: 0 -2px;
      }
    }

    /* ===== A fita crepe: dois pedaços nas quinas de cima, colando a ficha na de fora ===== */
    .fita {
      position: absolute;
      z-index: 2;
      top: -0.3em;
      width: 2.4em;
      height: 0.68em;
      background: rgb(222 205 160 / 0.86);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.16);
      pointer-events: none;
      /* as pontas rasgadas à mão */
      -webkit-mask: linear-gradient(90deg, transparent 0, #000 2px calc(100% - 2px), transparent 100%);
      mask: linear-gradient(90deg, transparent 0, #000 2px calc(100% - 2px), transparent 100%);
    }
    .fita-esq {
      left: -0.5em;
      rotate: -32deg;
    }
    .fita-dir {
      right: -0.5em;
      rotate: 30deg;
    }

    /* ===== A que sumiu: um pedaço de papel pardo rasgado, com o nome ===== */
    .perdida {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.6em;
      max-width: min(100%, 22em);
      margin-top: 0.35em;
      padding: 0.55em 0.9em 0.6em 0.75em;
      rotate: -1.2deg;
      background: #e9dcc0;
      color: #4a3b26;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.2),
        0 3px 6px -2px rgb(0 0 0 / 0.2);
      /* a beirada de baixo rasgada */
      clip-path: polygon(0 0, 100% 0, 100% 86%, 93% 100%, 84% 90%, 72% 99%, 60% 91%, 47% 100%, 35% 90%, 22% 99%, 11% 91%, 0 98%);
    }
    .perdida .fita-esq {
      left: 50%;
      top: -0.25em;
      translate: -50% 0;
      rotate: -3deg;
    }
    .perdida-icone {
      flex: none;
      opacity: 0.75;
    }
    .perdida-texto {
      display: grid;
      min-width: 0;
      line-height: 1.2;
    }
    .perdida-nome {
      font-family: var(--f-marker);
      font-size: 1.05em;
      overflow-wrap: anywhere;
    }
    .perdida-dica {
      font-family: var(--f-label);
      font-size: 0.72em;
      font-weight: 700;
      opacity: 0.85;
    }
    @media (prefers-reduced-motion: reduce) {
      :host(.tocavel) app-review-card {
        transition: none;
      }
    }
  `,
})
export class LinkedCard {
  /** Os parâmetros como foram escritos: o id ("#r…") e o título. */
  readonly args = input.required<readonly string[]>();
  /** Os links do texto onde ela está: quem abre a ficha, e a anotação de um título (escrita à mão). */
  readonly links = input<NoteLinks | null>(null);

  protected readonly cardWidth = CARD_WIDTH;
  protected readonly LostIcon = FileQuestion;
  private readonly finder = inject(CardFinder);

  protected readonly ref = computed(() => readCardRef(this.args()));
  protected readonly found = computed<FoundCard | null>(() => {
    const { id, title } = this.ref();
    if (id) return this.finder.find(id);
    // só o título: a anotação dele, entre as que o texto conhece
    const note = title ? (this.links()?.resolve?.(title) ?? null) : null;
    return note ? (this.finder.find(note.id) ?? { review: note, mine: false, masked: false, looks: {} }) : null;
  });
  protected readonly openable = computed(() => !!this.found() && !!this.links()?.openCard);

  /** O tamanho da ficha na folha: a escala e a caixa que ela ocupa depois de encolher. */
  protected readonly box = signal({ s: 1, w: CARD_WIDTH, h: 0 });
  /** A altura em linhas inteiras da pauta, quando a ficha encolheu pela largura; null, a do tamanho. */
  protected readonly snapped = signal<number | null>(null);
  private readonly escala = viewChild<ElementRef<HTMLElement>>('escala');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      let frame = 0;
      const fit = () => {
        frame = 0;
        const card = this.escala()?.nativeElement.firstElementChild as HTMLElement | null | undefined;
        if (!card) return;
        const w0 = card.offsetWidth;
        const h0 = card.offsetHeight;
        const style = getComputedStyle(host);
        const alto = parseFloat(style.getPropertyValue('--widget-alto')) || h0;
        // a linha toda, sem o respiro dos lados
        const room = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (!w0 || !h0 || room <= 0) return;
        const s = Math.max(0.2, Math.min(alto / h0, room / w0, MAX_SCALE));
        const next = { s: Math.round(s * 1000) / 1000, w: Math.round(w0 * s), h: Math.round(h0 * s) };
        const now = this.box();
        if (now.s !== next.s || now.w !== next.w || now.h !== next.h) this.box.set(next);
        const line = parseFloat(style.lineHeight);
        const narrow = room / w0 < Math.min(alto / h0, MAX_SCALE) && line > 0;
        this.snapped.set(narrow ? Math.ceil((next.h + 4) / line) * line : null);
      };
      const later = () => {
        if (!frame) frame = requestAnimationFrame(fit);
      };
      const ro = new ResizeObserver(later);
      ro.observe(host);
      // a ficha muda de altura (o título quebra, a capa chega); a caixa que corta muda o que cabe
      const watchCard = () => {
        const card = this.escala()?.nativeElement.firstElementChild;
        if (card) ro.observe(card);
      };
      watchCard();
      const teto = host.closest<HTMLElement>('[data-widget-teto]');
      if (teto) ro.observe(teto);
      // a ficha aparece depois (achada mais tarde, quando o mural da pessoa chega)
      const mo = new MutationObserver(() => {
        watchCard();
        later();
      });
      mo.observe(host, { childList: true, subtree: false });
      later();
      destroy.onDestroy(() => {
        ro.disconnect();
        mo.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }

  protected open(r: Review): void {
    this.links()?.openCard?.(r);
  }

  /** Para o leitor de tela, quando a ficha não abre: o que ela é. */
  protected spoken(r: Review): string {
    return isNote(r) ? `Anotação colada: ${r.game.name}` : `Ficha de ${cap(profileOf(r.kind).singular)} colada: ${r.game.name}`;
  }
}
