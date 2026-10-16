import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FileQuestion, LockKeyhole, LucideAngularModule } from 'lucide-angular';
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
/** A folga mínima em cima da ficha, em em: ela não encosta na linha de cima. */
const TOP_ROOM = 0.2;
/** O respiro entre a orelha da categoria e a linha de cima, em em. */
const EAR_GAP = 0.2;

/**
 * O widget NOTA (ver core/widgets.ts): outra ficha, de qualquer mural, colada no texto como uma
 * cartolina pequena colada na de fora. É a ficha simples de verdade
 * (`GluedReviewCard`, a `ReviewCard` com `compact`), a mesma do mural, encolhida (ou um pouco aumentada) até a altura do
 * tamanho do widget (`--widget-alto`, ver note-widget.ts); numa linha estreita, até caber nela.
 *
 * A ficha é achada pelo id (`CardFinder`): as suas, as do mural aberto de outra pessoa. Escrita à
 * mão só com o título, é a anotação desse título, como um link "[[…]]" (pelos `links` do texto).
 * Tocar nela abre a ficha (`links.openCard`): no seu mural e na leitura. Sem quem abra, ela só se
 * vê (fica `inert`: nem o teclado para nela).
 *
 * Sumiu (apagada, privada no mural de outra pessoa): no lugar, um papel rasgado com o nome dela. A
 * privada vem marcada no texto de quem visita (ver `hideCardTitles`): o papel diz que ela é privada.
 *
 * A peça é colada (`data-colado`): o estrago da ficha de fora não a come.
 */
@Component({
  selector: 'app-linked-card',
  // (ela chega por um import() do widget: a ficha do mural desenha o texto, que desenha esta)
  imports: [LucideAngularModule, GluedReviewCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // (não é o .tocavel do texto: com ele, a linha inteira pegava o toque, e o vazio ao lado da
    // ficha não abria nada; só a ficha pega o toque, o resto deixa passar para a ficha de fora)
    '[class.abre]': 'openable()',
    // encolhida pela largura (a linha estreita), ela ocupa só as linhas que precisa
    '[style.min-height.px]': 'snapped()',
  },
  template: `
    @if (found(); as f) {
      <div class="lugar" data-colado [style.width.px]="box().w" [style.height.px]="box().h" [style.margin-top.px]="box().top">
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
      </div>
      @if (!openable()) {
        <span class="sr-only">{{ spoken(f.review) }}</span>
      }
    } @else {
      <!-- sumiu: o pedaço de papel que ficou colado, com o nome dela (ou, a privada, o cadeado) -->
      <div class="perdida" [class.privada]="ref().hidden" data-colado role="note">
        @if (ref().hidden) {
          <lucide-icon class="perdida-icone" [img]="PrivateIcon" [size]="22" [strokeWidth]="2.3" aria-hidden="true" />
          <span class="perdida-texto">
            <span class="perdida-nome">Nota privada</span>
            <span class="perdida-dica">A nota colada aqui é privada: só quem escreveu vê.</span>
          </span>
        } @else {
          <lucide-icon class="perdida-icone" [img]="LostIcon" [size]="22" [strokeWidth]="2.3" aria-hidden="true" />
          <span class="perdida-texto">
            <span class="perdida-nome">{{ ref().title || 'Uma ficha' }}</span>
            <span class="perdida-dica">{{ ref().id ? 'Essa ficha foi apagada ou não está à mostra.' : 'Nenhuma anotação com esse nome.' }}</span>
          </span>
        }
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
    /* a que abre sobe um pouco com o mouse (ver GluedReviewCard), com a mãozinha */
    :host(.abre) app-review-card {
      cursor: pointer;
    }
    :host(.abre) .lugar {
      pointer-events: auto;
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
  `,
})
export class LinkedCard {
  /** Os parâmetros como foram escritos: o id ("#r…") e o título. */
  readonly args = input.required<readonly string[]>();
  /** Os links do texto onde ela está: quem abre a ficha, e a anotação de um título (escrita à mão). */
  readonly links = input<NoteLinks | null>(null);
  /**
   * O tamanho do widget, em linhas (ver note-widget.ts). A altura chega pela `--widget-alto`, que
   * não avisa quando muda: numa linha estreita (a caixa já com a altura em linhas, `snapped`) nada
   * muda de tamanho e a ficha ficava do tamanho de antes. Com ele, ela se mede de novo.
   */
  readonly lines = input<number | null>(null);

  protected readonly cardWidth = CARD_WIDTH;
  protected readonly LostIcon = FileQuestion;
  protected readonly PrivateIcon = LockKeyhole;
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

  /**
   * O tamanho da ficha na folha: a escala, a caixa que ela ocupa depois de encolher e a folga em
   * cima (`top`): a orelha da categoria, que sai pela beirada de cima, e um respiro cabem no
   * espaço do widget, sem tampar a linha de cima.
   */
  protected readonly box = signal({ s: 1, w: CARD_WIDTH, h: 0, top: 0 });
  /** A altura em linhas inteiras da pauta, quando a ficha encolheu pela largura; null, a do tamanho. */
  protected readonly snapped = signal<number | null>(null);
  private readonly escala = viewChild<ElementRef<HTMLElement>>('escala');
  /** Mede de novo, no próximo quadro (depois do primeiro desenho). */
  private refit: (() => void) | null = null;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    effect(() => {
      this.lines();
      untracked(() => this.refit?.());
    });
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
        // o que sai pela beirada de cima da ficha (a orelha), do tamanho dela (sem a escala)
        let over = 0;
        for (const el of Array.from(card.querySelectorAll<HTMLElement>('.aba-cat'))) {
          if (el.offsetParent === card) over = Math.max(over, -el.offsetTop);
        }
        const em = parseFloat(style.fontSize) || 16;
        const tape = TOP_ROOM * em;
        const gap = over ? EAR_GAP * em : 0;
        // a ficha e a folga cabem juntas na altura do tamanho
        const fitH = Math.min((alto - tape) / h0, (alto - gap) / (h0 + over));
        const s = Math.max(0.2, Math.min(fitH, room / w0, MAX_SCALE));
        const next = { s: Math.round(s * 1000) / 1000, w: Math.round(w0 * s), h: Math.round(h0 * s), top: Math.round(Math.max(over * s + gap, tape)) };
        const now = this.box();
        if (now.s !== next.s || now.w !== next.w || now.h !== next.h || now.top !== next.top) this.box.set(next);
        const line = parseFloat(style.lineHeight);
        const narrow = room / w0 < Math.min(fitH, MAX_SCALE) && line > 0;
        this.snapped.set(narrow ? Math.ceil((next.top + next.h + 4) / line) * line : null);
      };
      const later = () => {
        if (!frame) frame = requestAnimationFrame(fit);
      };
      this.refit = later;
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
        this.refit = null;
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
