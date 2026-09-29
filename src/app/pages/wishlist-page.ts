import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Dices, LucideAngularModule, Scissors, X } from 'lucide-angular';
import { CUTOUT_STYLES, collage } from '../core/clipping';
import { Desk } from '../core/desk';
import { countOf, g } from '../core/kinds';
import { Mural } from '../core/mural';
import { Wish, fold } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { SearchStrip } from '../ui/search-strip';
import { WishClip } from '../ui/wish-clip';

type Order = 'recentes' | 'antigos' | 'az';

/**
 * O título da página, letra por letra, cada uma recortada de uma revista (índice em
 * `CUTOUT_STYLES`). Escolhido à mão, não sorteado: é o cabeçalho, tem de ficar bom sempre.
 */
const MASTHEAD: readonly { t: string; s: number; tilt: number; dy: number; size: number; clip: string }[] = [
  { t: 'W', s: 1, tilt: -6, dy: 2, size: 1.08, clip: 'polygon(2px 0, 100% 3px, calc(100% - 2px) 100%, 0 calc(100% - 2px))' },
  { t: 'i', s: 2, tilt: 4, dy: -3, size: 1.02, clip: 'polygon(0 2px, calc(100% - 3px) 0, 100% calc(100% - 1px), 3px 100%)' },
  { t: 'S', s: 3, tilt: -2, dy: 4, size: 0.92, clip: 'polygon(3px 1px, 100% 0, calc(100% - 1px) calc(100% - 3px), 0 100%)' },
  { t: 'h', s: 0, tilt: 5, dy: -1, size: 1.1, clip: 'polygon(0 0, calc(100% - 2px) 2px, 100% 100%, 2px calc(100% - 2px))' },
  { t: 'L', s: 6, tilt: -4, dy: 3, size: 0.98, clip: 'polygon(1px 3px, 100% 0, calc(100% - 3px) 100%, 0 calc(100% - 1px))' },
  { t: 'i', s: 5, tilt: 3, dy: -2, size: 1.06, clip: 'polygon(2px 0, calc(100% - 1px) 1px, 100% calc(100% - 3px), 0 100%)' },
  { t: 's', s: 8, tilt: -5, dy: 2, size: 0.95, clip: 'polygon(0 1px, 100% 3px, calc(100% - 2px) 100%, 2px calc(100% - 1px))' },
  { t: 'T', s: 4, tilt: 6, dy: -2, size: 1.04, clip: 'polygon(3px 0, 100% 2px, 100% calc(100% - 2px), 0 100%)' },
];

/**
 * Wishlist: o que você quer jogar, ler ou ver, no mural aberto. Cada item é a capa recortada de uma
 * revista e colada na parede, uma colagem. Tocar num recorte começa a resenha; pregada, ela sai daqui.
 * Sem saber o que escolher? O sorteio tira um da parede.
 */
@Component({
  selector: 'app-wishlist-page',
  imports: [LucideAngularModule, SearchStrip, WishClip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()', '[class.com-sorteio]': 'winner()' },
  template: `
    <header class="head">
      <div class="titulo-linha">
        <!-- o título recortado letra por letra, como um bilhete de resgate -->
        <h1 class="titulo">
          <span class="sr-only">Wishlist</span>
          <span class="letras" aria-hidden="true">
            @for (l of masthead; track $index) {
              <span
                class="letra"
                [class]="'fonte-' + styles[l.s].font"
                [class.caps]="styles[l.s].caps"
                [style.background]="styles[l.s].bg"
                [style.color]="styles[l.s].ink"
                [style.clip-path]="l.clip"
                [style.rotate.deg]="l.tilt"
                [style.translate]="'0 ' + l.dy + 'px'"
                [style.font-size.em]="l.size"
                >{{ l.t }}</span
              >
            }
          </span>
        </h1>
        @if (mural.wishCount(); as n) {
          <p class="sub">{{ countOf(mural.profile(), n) }} que você quer {{ mural.profile().verb }}</p>
        }
      </div>
      @if (mural.wishCount()) {
        <button type="button" class="cupom" (click)="desk.newWish()">
          <lucide-icon class="tesoura" [img]="CutIcon" [size]="20" [strokeWidth]="2.2" aria-hidden="true" />
          <span class="cupom-txt">
            <small aria-hidden="true">Recorte aqui</small>
            Adicionar {{ mural.profile().singular }}
          </span>
        </button>
      }
    </header>

    @if (mural.wishCount()) {
      <div class="prateleira">
        <app-search-strip
          class="prateleira-busca"
          inputId="busca-desejos"
          label="Procurar na wishlist"
          placeholder="Procurar na wishlist…"
          [value]="query()"
          (valueChange)="query.set($event)"
        />
        <p class="prateleira-giz">Toque num recorte para começar a resenha.</p>
        <span class="prateleira-quebra" aria-hidden="true"></span>

        <div class="prateleira-abas" role="group" aria-label="Ordenar">
          <button type="button" class="plate" [attr.aria-pressed]="order() === 'recentes'" (click)="sort('recentes')">Mais novos</button>
          <button type="button" class="plate" [attr.aria-pressed]="order() === 'antigos'" (click)="sort('antigos')">Mais antigos</button>
          <button type="button" class="plate" [attr.aria-pressed]="order() === 'az'" (click)="sort('az')" aria-label="De A a Z">A–Z</button>
        </div>

        <button #drawBtn type="button" class="plate sortear" [disabled]="visible().length < 2" (click)="draw()">
          <lucide-icon [img]="DiceIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
          Sortear
        </button>
      </div>
      <p class="sr-only" aria-live="polite">{{ winner() ? 'Sorteado: ' + winner()!.game.name : '' }}</p>

      @if (winner(); as w) {
        <!-- o resultado do sorteio: um bilhete arrancado do bloco, preso embaixo da tela; logo depois da
           prateleira, para o teclado chegar nele sem passar por todos os recortes -->
        <aside class="sorteio" aria-labelledby="sorteio-titulo">
          <p class="sorteio-titulo" id="sorteio-titulo">
            Que tal {{ mural.profile().verb }} <strong>{{ w.game.name }}</strong>?
          </p>
          <div class="sorteio-acoes">
            <button #startBtn type="button" class="btn-ink" (click)="startDrawn(w)">Começar a resenha</button>
            <button type="button" class="btn-quiet" (click)="draw()">
              <lucide-icon [img]="DiceIcon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
              Outro
            </button>
          </div>
          <button type="button" class="sorteio-fechar" (click)="closeDraw()" aria-label="Fechar o sorteio">
            <lucide-icon [img]="CloseIcon" [size]="18" [strokeWidth]="2.6" />
          </button>
        </aside>
      }

      @if (query().trim()) {
        <p class="showing" aria-live="polite">
          Mostrando {{ visible().length }} de {{ mural.wishCount() }}
          <button type="button" class="showing-clear" (click)="query.set('')">Limpar busca</button>
        </p>
      }

      @if (!visible().length) {
        <p class="none">{{ g(mural.profile(), 'Nenhum', 'Nenhuma') }} {{ mural.profile().singular }} da wishlist tem “{{ query().trim() }}” no nome.</p>
      }

      <h2 class="sr-only">Recortes</h2>
      <div class="recortes" [style.--colunas]="cols()">
        @for (col of columns(); track $index) {
          <div class="coluna">
            @for (w of col; track w.id) {
              <app-wish-clip
                [attr.data-ficha]="w.id"
                [wish]="w"
                [landing]="desk.landingId() === w.id"
                [class.sorteado]="winner()?.id === w.id"
                [class.na-sombra]="winner() && winner()?.id !== w.id"
                (opened)="drawn.set(null); desk.openWish($event)"
              />
            }
          </div>
        }
      </div>

    } @else {
      <!-- um cupom de catálogo, com a linha de recortar em volta -->
      <section class="vazio" aria-labelledby="desejos-vazio">
        <lucide-icon class="tesoura" [img]="CutIcon" [size]="26" [strokeWidth]="2" aria-hidden="true" />
        <h2 id="desejos-vazio">{{ g(mural.profile(), 'Nenhum', 'Nenhuma') }} {{ mural.profile().singular }} na wishlist</h2>
        <p>
          Viu um trailer, ganhou uma indicação? Recorte aqui o que você quer {{ mural.profile().verb }}: fica só o nome e a
          capa, até a hora de resenhar.
        </p>
        <button type="button" class="btn-ink" (click)="desk.newWish()">
          <lucide-icon [img]="CutIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
          Adicionar {{ g(mural.profile(), 'um', 'uma') }} {{ mural.profile().singular }}
        </button>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 18px 24px;
      margin-bottom: 30px;
    }
    .titulo-linha {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 26px;
    }

    /* ===== O título: oito letras recortadas de oito revistas ===== */
    .titulo {
      margin: 0;
      font-size: 2.7rem;
      line-height: 1;
      rotate: -1.5deg;
    }
    .letras {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .letra {
      display: inline-block;
      min-width: 0.9em;
      padding: 0.1em 0.16em 0.06em;
      text-align: center;
      line-height: 1;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)) drop-shadow(0 4px 5px rgb(0 0 0 / 0.3));
    }
    .letra.fonte-didone {
      font-family: var(--f-didone);
    }
    .letra.fonte-serif {
      font-family: var(--f-serif);
      font-size: 1.04em;
    }
    .letra.fonte-serif-it {
      font-family: var(--f-serif);
      font-style: italic;
      font-size: 1.06em;
    }
    .letra.fonte-label {
      font-family: var(--f-label);
      font-weight: 800;
      font-style: italic;
      padding-top: 0.14em;
    }
    .letra.caps {
      text-transform: uppercase;
    }
    .sub {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      font-variant-numeric: tabular-nums;
    }

    /* o botão de adicionar é um cupom de catálogo: a linha tracejada e a tesoura em cima dela */
    .cupom {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-height: 60px;
      padding: 10px 22px 10px 20px;
      border: 0;
      border-radius: 2px;
      background: #fdfcf9;
      color: var(--ink);
      text-align: left;
      rotate: 1.2deg;
      box-shadow:
        inset 0 0 0 5px #fdfcf9,
        var(--shadow-card);
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        box-shadow var(--t-ui) var(--ease-ui);
    }
    .cupom::before {
      content: '';
      position: absolute;
      inset: 5px;
      border: 2px dashed rgb(21 21 21 / 0.5);
      border-radius: 1px;
      pointer-events: none;
    }
    .cupom .tesoura {
      position: absolute;
      top: -5px;
      left: 14px;
      display: inline-flex;
      padding: 0 3px;
      background: #fdfcf9;
      color: var(--ink);
      transition: translate var(--t-physical) var(--ease-physical);
    }
    .cupom-txt {
      display: grid;
      padding-top: 4px;
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 1.3rem;
      line-height: 1;
      text-transform: uppercase;
    }
    .cupom small {
      font-style: normal;
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      color: var(--red-deep);
      margin-bottom: 3px;
    }
    .cupom:hover {
      rotate: -0.6deg;
      translate: 0 -2px;
      box-shadow:
        inset 0 0 0 5px #fdfcf9,
        var(--shadow-lift);
    }
    /* a tesoura anda pela linha, cortando */
    .cupom:hover .tesoura {
      translate: 18px 0;
    }
    .cupom:focus-visible {
      outline-offset: 4px;
    }

    .sortear {
      margin-left: auto;
      padding-inline: 13px 16px;
    }

    .showing {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      margin: -28px 0 22px;
      font-family: var(--f-label);
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      font-variant-numeric: tabular-nums;
    }
    .showing-clear {
      min-height: 36px;
      padding: 4px 8px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--wall-ink);
      font: inherit;
      letter-spacing: inherit;
      text-decoration: underline 2px var(--hi);
      text-underline-offset: 4px;
    }
    .showing-clear:hover {
      background: rgb(255 255 255 / 0.08);
    }
    .none {
      font-family: var(--f-hand);
      font-size: 1.2rem;
      color: var(--wall-ink);
      overflow-wrap: anywhere;
    }

    /* ===== A colagem: colunas, cada recorte de uma largura e um tanto fora do prumo ===== */
    .recortes {
      display: grid;
      grid-template-columns: repeat(var(--colunas), minmax(0, 1fr));
      align-items: start;
      column-gap: 34px;
      padding-top: 10px;
    }
    app-wish-clip {
      width: calc(var(--largura, 100) * 1%);
      margin-left: calc(var(--desvio, 0) * 1%);
      margin-bottom: var(--vao, 40px);
    }

    /* ===== O bilhete do sorteio ===== */
    .sorteio {
      position: fixed;
      z-index: 40;
      left: 50%;
      bottom: 22px;
      isolation: isolate;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 20px;
      width: min(560px, calc(100vw - 32px));
      padding: 18px 54px 22px 22px;
      translate: -50% 0;
      rotate: -0.8deg;
      color: var(--ink);
      /* a sombra fica no bilhete; o papel e o serrilhado, num fundo à parte (a máscara comeria a sombra) */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 8px 12px rgb(0 0 0 / 0.5));
      animation: bilhete var(--t-physical) var(--ease-physical) both;
    }
    /* arrancado do bloco: a beirada de cima serrilhada */
    .sorteio::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: var(--paper);
      -webkit-mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
    }
    /* com o bilhete na tela, sobra chão embaixo para ele não esconder a última fileira */
    :host(.com-sorteio) {
      padding-bottom: 150px;
    }
    .sorteio-titulo {
      flex: 1 1 220px;
      font-family: var(--f-hand);
      font-size: 1.25rem;
      line-height: 1.25;
    }
    .sorteio-titulo strong {
      font-weight: 700;
    }
    .sorteio-acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .sorteio-acoes .btn-quiet {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--ink);
    }
    .sorteio-fechar {
      position: absolute;
      top: 12px;
      right: 10px;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--ink);
    }
    .sorteio-fechar:hover {
      background: rgb(21 21 21 / 0.1);
    }
    .sorteio :focus-visible {
      outline-color: var(--ink);
    }
    @keyframes bilhete {
      0% {
        translate: -50% 30px;
        opacity: 0;
      }
    }

    /* vazio: um cupom grande, com a linha de recortar em volta */
    .vazio {
      position: relative;
      max-width: 540px;
      padding: 38px 34px 30px;
      rotate: -0.8deg;
      background: #fdfcf9;
      color: var(--ink);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 10px 12px rgb(0 0 0 / 0.45));
    }
    .vazio::before {
      content: '';
      position: absolute;
      inset: 8px;
      border: 2px dashed rgb(21 21 21 / 0.45);
      pointer-events: none;
    }
    .vazio .tesoura {
      position: absolute;
      top: -4px;
      left: 30px;
      display: inline-flex;
      padding: 0 4px;
      background: #fdfcf9;
    }
    .vazio h2 {
      font-family: var(--f-didone);
      font-size: 2rem;
      line-height: 1.02;
      color: var(--red-deep);
      text-wrap: balance;
    }
    .vazio p {
      margin: 12px 0 22px;
      max-width: 44ch;
      font-family: var(--f-hand);
      font-size: 1.15rem;
      line-height: 1.45;
    }

    @media (max-width: 559px) {
      .titulo {
        font-size: 2.2rem;
      }
      .cupom {
        width: 100%;
        justify-content: center;
        rotate: 0.6deg;
      }
      .recortes {
        column-gap: 18px;
      }
      .vazio {
        padding: 34px 22px 26px;
      }
      :host(.com-sorteio) {
        padding-bottom: 210px;
      }
      .sorteio {
        bottom: 12px;
        padding: 16px 48px 18px 18px;
      }
    }
  `,
})
export class WishlistPage {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  private readonly transitions = inject(ViewTransitions);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly countOf = countOf;
  protected readonly g = g;
  protected readonly CutIcon = Scissors;
  protected readonly DiceIcon = Dices;
  protected readonly CloseIcon = X;
  protected readonly masthead = MASTHEAD;
  protected readonly styles = CUTOUT_STYLES;

  /** Busca pelo nome, sem ligar para acento nem maiúscula; some ao sair da página. */
  protected readonly query = signal('');
  protected readonly order = signal<Order>('recentes');
  /** O id sorteado; o bilhete some quando ele sai da lista. */
  protected readonly drawn = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const needle = fold(this.query().trim());
    const list = this.mural.wishes();
    const found = needle ? list.filter((w) => fold(w.game.name).includes(needle)) : list;
    switch (this.order()) {
      case 'recentes':
        return [...found].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      case 'antigos':
        return [...found].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      case 'az':
        return [...found].sort((a, b) => a.game.name.localeCompare(b.game.name, 'pt-BR', { sensitivity: 'base', numeric: true }));
    }
  });
  /** Quantas colunas cabem: recortes de pelo menos 172px, com 34px entre eles (duas no celular). */
  private readonly drawBtn = viewChild<ElementRef<HTMLButtonElement>>('drawBtn');
  private readonly startBtn = viewChild<ElementRef<HTMLButtonElement>>('startBtn');
  protected readonly cols = signal(6);
  protected readonly columns = computed(() => collage(this.visible(), this.cols()));
  protected readonly winner = computed<Wish | null>(() => this.visible().find((w) => w.id === this.drawn()) ?? null);

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const measure = () => {
      const w = host.clientWidth;
      this.cols.set(innerWidth < 560 ? 2 : Math.max(3, Math.floor((w + 34) / (172 + 34))));
    };
    // "Ver na lista" ou um item novo chegando: se a busca esconde ele, a busca sai da frente
    effect(() => {
      const id = this.desk.landingId();
      if (id && this.query() && !this.visible().some((x) => x.id === id)) this.query.set('');
    });
    afterNextRender(() => {
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(host);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }
  protected sort(o: Order): void {
    if (o === this.order()) return;
    this.transitions.run(() => this.order.set(o));
  }

  /** Tira um recorte da parede, nunca o mesmo da vez anterior, leva a tela até ele e o foco ao bilhete. */
  protected draw(): void {
    const pool = this.visible().filter((w) => w.id !== this.drawn());
    if (!pool.length) return;
    const w = pool[Math.floor(Math.random() * pool.length)];
    this.drawn.set(w.id);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      document.querySelector(`[data-ficha="${w.id}"]`)?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      this.startBtn()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected closeDraw(): void {
    this.drawn.set(null);
    this.drawBtn()?.nativeElement.focus({ preventScroll: true });
  }

  /** Esc fecha o bilhete, mas não quando é para fechar um diálogo aberto por cima. */
  protected onEscape(): void {
    if (!this.winner() || document.querySelector('dialog[open]')) return;
    this.closeDraw();
  }

  protected startDrawn(w: Wish): void {
    this.drawn.set(null);
    this.desk.openWish(w.id);
  }
}
