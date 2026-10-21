import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { CardFinder, FoundCard } from '../core/card-finder';
import { cap, profileOf } from '../core/kinds';
import { NoteLinks } from '../core/note-links';
import { Review, isNote } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { CardLook, readCardRef } from '../core/widgets';
import { GluedReviewCard } from './glued-review-card';
import { RichText } from './rich-text';

/** A largura da ficha simples de verdade, antes de encolher (a de uma coluna do mural). */
const CARD_WIDTH = 300;
/** A da ficha só com a capa e o nome (a de uma coluna da vista "Só capa e nome" do mural). */
const COVER_WIDTH = 140;
/** Quantas notas de texto inteiro cabem uma dentro da outra: mais funda que isso, ela vira ficha. */
const MAX_WHOLE_DEPTH = 2;

/**
 * As notas coladas de onde esta está, de dentro para fora: cada uma diz quem é e se está com o texto
 * inteiro. Uma nota de texto inteiro desenha o texto dela, que pode ter outra nota de texto inteiro:
 * colada nela mesma (ou numa que a cola de volta), ela se desenharia para sempre. A que já está entre
 * as de fora (ou fundo demais) vira a ficha.
 */
class GlueLink {
  readonly id = signal<string | null>(null);
  readonly whole = signal(false);
  constructor(readonly outer: GlueLink | null) {}
  /** Os ids das notas de texto inteiro, desta para fora. */
  wholeChain(): string[] {
    const out: string[] = [];
    for (let at: GlueLink | null = this; at; at = at.outer) if (at.whole() && at.id()) out.push(at.id()!);
    return out;
  }
}
const GLUE = new InjectionToken<GlueLink>('nota colada');
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
  imports: [IconModule, GluedReviewCard, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: GLUE, useFactory: () => new GlueLink(inject(GLUE, { skipSelf: true, optional: true })) }],
  host: {
    '[class.sem-tamanho]': "look() === 'tira' || look() === 'inteira'",
    // (não é o .tocavel do texto: com ele, a linha inteira pegava o toque, e o vazio ao lado da
    // ficha não abria nada; só a ficha pega o toque, o resto deixa passar para a ficha de fora)
    '[class.abre]': 'openable()',
    // encolhida pela largura (a linha estreita), ela ocupa só as linhas que precisa
    '[style.min-height.px]': 'snapped()',
  },
  template: `
    @if (found(); as f) {
      @switch (look()) {
        @case ('tira') {
          <!-- só o título: a tira da cartolina dela, como a anotação no Kanban em "Só os títulos" -->
          <button
            type="button"
            class="tira cartolina"
            data-colado
            [attr.data-cor]="stock()"
            [style.--stock]="'var(--stock-' + stock() + ')'"
            [attr.inert]="openable() ? null : ''"
            [attr.aria-label]="spoken(f.review)"
            (click)="open(f.review)"
          >
            @if (overline(f.review); as o) {
              <span class="tira-assunto">{{ o }}</span>
            }
            <span class="tira-nome">{{ f.review.game.name }}</span>
          </button>
        }
        @case ('inteira') {
          <!-- o texto inteiro: a nota como fica aberta, colada inteira na de fora (a faixa da
               cartolina dela com o nome e a folha creme com o texto todo) -->
          <article class="inteira" data-colado [class.abre]="openable()" [attr.aria-label]="spoken(f.review)">
            <header class="faixa cartolina" [attr.data-cor]="stock()" [style.--stock]="'var(--stock-' + stock() + ')'">
              @if (overline(f.review); as o) {
                <span class="faixa-assunto">{{ o }}</span>
              }
              @if (openable()) {
                <button type="button" class="faixa-nome" (click)="open(f.review)">{{ f.review.game.name }}</button>
              } @else {
                <span class="faixa-nome">{{ f.review.game.name }}</span>
              }
            </header>
            <div class="folha">
              @if (f.review.text.trim()) {
                <app-rich-text class="folha-texto" [text]="f.review.text" [fold]="true" [foldKey]="f.review.id" [links]="links()" />
              } @else {
                <p class="folha-vazia">Ainda sem texto.</p>
              }
            </div>
          </article>
        }
        @default {
      <div class="lugar" data-colado [style.width.px]="box().w" [style.height.px]="box().h" [style.margin-top.px]="box().top">
        <div class="escala" #escala [style.width.px]="cardWidth()" [style.scale]="box().s">
          <app-review-card
            [review]="f.review"
            [compact]="look() !== 'capa'"
            [capas]="look() === 'capa'"
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
        }
      }
    } @else {
      <!-- sumiu: o pedaço de papel que ficou colado, com o nome dela (ou, a privada, o cadeado) -->
      <div class="perdida" [class.privada]="ref().hidden" data-colado role="note">
        @if (ref().hidden) {
          <lucide-icon class="perdida-icone" [img]="PrivateIcon" [size]="22" aria-hidden="true" />
          <span class="perdida-texto">
            <span class="perdida-nome">Nota privada</span>
            <span class="perdida-dica">A nota colada aqui é privada: só quem escreveu vê.</span>
          </span>
        } @else {
          <lucide-icon class="perdida-icone" [img]="LostIcon" [size]="22" aria-hidden="true" />
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

    /* a tira e o texto inteiro têm a altura do que mostram, não a do tamanho do widget */
    :host(.sem-tamanho) {
      min-height: 0;
    }

    /* ===== Só o título: a tira da cartolina dela, como a anotação no Kanban em "Só os títulos" =====
       Reta e rente, como a ficha colada; ocupa duas linhas do texto (a tira tem uma e meia, no meio
       delas), e só o que o nome pede de largura. */
    .tira {
      /* a tinta da tira é a da cartolina dela, não a da ficha de fora (a escura dá a clara) */
      --ink: #151515;
      position: relative;
      display: flex;
      align-items: baseline;
      gap: 0.55em;
      max-width: 100%;
      min-height: calc(var(--line, 1.5em) * 1.5);
      margin-block: calc(var(--line, 1.5em) * 0.25);
      padding: 0.3em 0.95em 0.32em 0.85em;
      border: 0;
      border-radius: 2px;
      font-family: var(--f-marker);
      font-size: 1rem;
      font-weight: 400;
      font-style: normal;
      line-height: 1.15;
      letter-spacing: 0.005em;
      text-align: left;
      text-indent: 0;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.32)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.22));
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    .tira-nome {
      min-width: 0;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    /* o assunto (ou o mural da ficha), antes do nome, na letra miúda da linha da data */
    .tira-assunto,
    .faixa-assunto {
      flex: none;
      font-family: var(--f-label);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      line-height: 1.1;
      text-transform: uppercase;
      opacity: 0.82;
    }
    .tira:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 2px;
    }

    /* ===== O texto inteiro: a nota como fica aberta, colada inteira na de fora =====
       A folha creme da leitura com a faixa da cartolina dela em cima, o nome escrito a pincel na
       faixa, e o texto todo embaixo, na pauta azul da leitura. A largura da linha toda; a altura, a
       do texto (a ficha do mural corta, como corta o resto do texto). Tocar em qualquer lugar abre a
       nota; só os links, as tarefas recolhidas, os spoilers e os widgets que tocam pegam o toque. */
    .inteira {
      --ink: #151515;
      --ink-2: rgb(21 21 21 / 0.74);
      --focus: #151515;
      position: relative;
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      /* a largura vem da linha, nunca do que está dentro (uma ficha colada no texto dela pediria a
         largura da ficha inteira, antes de encolher, e a folha passaria da beirada) */
      contain: inline-size;
      margin: calc(var(--line, 1.5em) * 0.3) 0 calc(var(--line, 1.5em) * 0.5);
      border-radius: 2px;
      /* um tom mais claro que o creme da leitura: colada nela, a folha ainda se destaca */
      background-color: #fdfbf5;
      color: var(--ink);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 3px 5px rgb(0 0 0 / 0.22));
      transition:
        translate var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    /* a faixa: a cartolina dela (a tinta clara nas escuras vem com a cartolina) */
    .faixa {
      position: static;
      display: grid;
      justify-items: start;
      gap: 0.15em;
      padding: 0.6em 0.95em 0.5em;
      border-radius: 2px 2px 0 0;
    }
    .faixa-nome {
      max-width: 100%;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font-family: var(--f-marker);
      font-size: 1.4rem;
      font-weight: 400;
      font-style: normal;
      line-height: 1.06;
      letter-spacing: 0.005em;
      text-align: left;
      text-indent: 0;
      text-wrap: balance;
      overflow-wrap: anywhere;
    }
    /* o nome é o botão que abre; a área dele cobre a nota inteira */
    button.faixa-nome {
      cursor: pointer;
    }
    button.faixa-nome::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    button.faixa-nome:focus-visible {
      outline: none;
    }
    .inteira:has(.faixa-nome:focus-visible) {
      outline: 3px solid var(--hi);
      outline-offset: 3px;
    }
    .folha {
      position: relative;
      z-index: 1;
      padding: calc(var(--line, 1.5em) * 0.35) 0.95em calc(var(--line, 1.5em) * 0.45);
      /* a pauta azul da leitura, na altura das linhas do texto */
      background: repeating-linear-gradient(to bottom, transparent 0 calc(var(--line, 1.5em) - 1.5px), rgb(64 110 190 / 0.26) calc(var(--line, 1.5em) - 1.5px) var(--line, 1.5em)) 0 calc(var(--line, 1.5em) * 0.35);
      white-space: normal;
      text-align: left;
    }
    .inteira.abre .folha {
      pointer-events: none;
    }
    .inteira.abre .folha ::ng-deep :is(a.url, .elo[tabindex], .tocavel, .spoiler:not(.revelado), .resumo-btn, app-linked-card.abre .lugar, app-linked-card.abre .tira, app-linked-card.abre .inteira) {
      pointer-events: auto;
    }
    .folha-texto {
      display: block;
    }
    .folha-vazia {
      margin: 0;
      font-family: var(--f-label);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--ink-2);
    }
    /* A folha é creme mesmo dentro de uma ficha escura (ou amarela): o texto volta às cores da
       leitura, e não às da ficha de fora (as do texto seguem a ficha em que ele está) */
    :host .inteira .folha ::ng-deep .formatado .elo {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%231d3577' stroke-width='2.3' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(96 150 235 / 0.3);
    }
    :host .inteira .folha ::ng-deep .formatado .elo.quebrado {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.2C16 5.2 31 7 49 5.8S82 4.9 99 6' fill='none' stroke='%23151515' stroke-opacity='.55' stroke-width='1.8' stroke-dasharray='5 4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
    }
    :host .inteira .folha ::ng-deep .formatado .marca {
      --marca-cor: rgb(255 218 66 / 0.62);
    }
    :host .inteira .folha ::ng-deep .formatado .spoiler {
      --tarja: #151515;
    }
    :host .inteira .folha ::ng-deep .formatado .spoiler.revelado {
      --tarja: rgb(21 21 21 / 0.09);
    }
    :host .inteira .folha ::ng-deep .formatado :is(.feita .tarefa, .feita > .corpo .linha) {
      text-decoration-color: rgb(21 21 21 / 0.45);
    }

    /* a que abre sobe um pouco com o mouse, reta, como a ficha colada */
    @media (hover: hover) {
      :host(.abre) .tira:hover,
      .inteira.abre:hover {
        translate: 0 -2px;
        filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.28)) drop-shadow(0 7px 9px rgb(0 0 0 / 0.22));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tira,
      .inteira {
        transition: none;
      }
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

  protected readonly LostIcon = ICON.notaSumida;
  protected readonly PrivateIcon = ICON.privada;
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

  private readonly glue = inject(GLUE);
  /**
   * O jeito de verdade: o escrito, menos o texto inteiro que não pode ser (colado dentro dele mesmo,
   * fundo demais, ou com o texto escondido pelo modo sem spoilers): esse vira a ficha.
   */
  protected readonly look = computed<CardLook>(() => {
    const look = this.ref().look;
    if (look !== 'inteira') return look;
    const f = this.found();
    const above = this.glue.outer?.wholeChain() ?? [];
    if (!f || f.masked || above.length >= MAX_WHOLE_DEPTH || above.includes(f.review.id)) return 'ficha';
    return look;
  });
  /** A largura da ficha antes de encolher: a da coluna do mural, ou a da vista "Só capa e nome". */
  protected readonly cardWidth = computed(() => (this.look() === 'capa' ? COVER_WIDTH : CARD_WIDTH));
  /** A cartolina dela no mural: a tira e a faixa do texto inteiro são do mesmo papel. */
  protected readonly stock = computed(() => {
    const r = this.found()?.review;
    return r ? pinningFor(r.id, r.stock).stock : 'amarelo';
  });

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
    // quem esta nota é, para as que vierem coladas dentro do texto inteiro dela
    effect(() => {
      this.glue.id.set(this.found()?.review.id ?? null);
      this.glue.whole.set(this.look() === 'inteira');
    });
    effect(() => {
      this.lines();
      this.look();
      untracked(() => this.refit?.());
    });
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      let frame = 0;
      const fit = () => {
        frame = 0;
        const card = this.escala()?.nativeElement.firstElementChild as HTMLElement | null | undefined;
        if (!card) {
          // a tira e o texto inteiro têm a altura deles: nada a encolher
          this.snapped.set(null);
          return;
        }
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

  /**
   * A linha miúda antes do nome, na tira e no texto inteiro: o assunto da anotação; a ficha de outro
   * mural diz de qual ("Jogo", "Livro").
   */
  protected overline(r: Review): string {
    return isNote(r) ? (r.subject ?? '') : cap(profileOf(r.kind).singular);
  }

  /** Para o leitor de tela, quando a ficha não abre: o que ela é. */
  protected spoken(r: Review): string {
    return isNote(r) ? `Anotação colada: ${r.game.name}` : `Ficha de ${cap(profileOf(r.kind).singular)} colada: ${r.game.name}`;
  }
}
