import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { NEWS_KIND_LABEL, NewsEntry, News, VERSION } from '../core/news';
import { Pin } from '../ui/pin';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Inclinações fixas, uma por ficha, para a pilha não parecer impressa (pequenas: as fichas são baixas). */
const TILTS = [-0.4, 0.3, -0.2, 0.45, -0.3, 0.2];

/**
 * Novidades: o que mudou em cada versão do site, da mais nova para a mais velha, uma ficha pautada
 * por versão, fechada numa linha (a versão, o título e a etiqueta Update ou Bugfix). Os updates vêm
 * presos com tachinha; os bugfixes, sem tachinha, mais baixos e recuados. As que
 * a pessoa ainda não tinha visto ganham o adesivo "novo" e já vêm abertas; abrir a página conta tudo
 * como visto (e a faixa de novidade do topo vai embora).
 */
@Component({
  selector: 'app-news-page',
  imports: [LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h1 class="tape-label big">Novidades</h1>
      <p class="resumo">Versão {{ version }}</p>
    </header>

    <!-- uma ficha por versão, fechada numa linha só ("1.15.0 Mural de anotações"); tocar abre o que
         mudou. As que a pessoa ainda não tinha visto já vêm abertas. -->
    <ol class="fichas">
      @for (n of entries; track n.id; let i = $index) {
        <li class="ficha" [class.bugfix]="n.kind === 'bugfix'" [style.rotate.deg]="tilt(i)">
          @if (n.kind === 'update') {
            <app-pin class="pin" color="#e62e2d" />
          }
          @if (fresh.has(n.id)) {
            <span class="novo" aria-hidden="true">Novo</span>
          }
          <details [open]="fresh.has(n.id)">
            <summary>
              <span class="versao">{{ n.version }}</span>
              <h2>
                {{ n.title }}
                @if (fresh.has(n.id)) {
                  <span class="sr-only">(novo)</span>
                }
              </h2>
              <span class="etiqueta" [class.bugfix]="n.kind === 'bugfix'">{{ label[n.kind] }}</span>
              <time class="data" [attr.datetime]="n.date">{{ when(n) }}</time>
              <lucide-icon class="chev" [img]="ChevronIcon" [size]="20" [strokeWidth]="3" aria-hidden="true" />
            </summary>
            <ul class="itens">
              @for (item of n.items; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          </details>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }

    .cabeca {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 18px;
      margin-bottom: 40px;
      padding-left: 4px;
    }

    .resumo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      text-shadow: 0 1px 2px rgb(0 0 0 / 0.9);
    }

    .fichas {
      display: grid;
      gap: 26px;
      max-width: 760px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* Ficha pautada de papelaria: branca, o fio vermelho embaixo da linha do título e a pauta azul no resto */
    .ficha {
      --line: 1.85rem;
      position: relative;
      border-radius: 2px;
      background-color: #fbf9f2;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
      box-shadow: var(--shadow-card);

      .pin {
        top: -10px;
        left: calc(50% - 13px);
      }
    }

    /* o bugfix: um papel mais baixo e recuado, para os updates darem o ritmo da pilha */
    .ficha.bugfix {
      margin-left: 34px;
      background-color: #f4f1e8;
    }

    summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 14px;
      padding: 20px 26px 16px;
      cursor: pointer;
      list-style: none;
      border-radius: 2px;

      &::-webkit-details-marker {
        display: none;
      }

      &:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 3px;
      }
    }

    .bugfix summary {
      padding: 14px 22px 12px;
    }

    .versao {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.25rem;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }

    h2 {
      flex: 1 1 14rem;
      margin: 0;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.45rem;
      line-height: 1.12;
    }

    .bugfix h2 {
      font-size: 1.2rem;
    }

    /* a etiqueta: um carimbo de tinta, azul no update e vermelho no bugfix */
    .etiqueta {
      padding: 2px 8px 1px;
      border: 2px solid currentColor;
      border-radius: 3px;
      color: var(--caneta-azul);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.85rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      rotate: -3deg;

      &.bugfix {
        color: var(--red-deep);
        rotate: 2deg;
      }
    }

    .data {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.92rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-2);
    }

    .chev {
      display: inline-flex;
      color: var(--ink-2);
      transition: rotate var(--t-ui) var(--ease-ui);
    }

    details[open] .chev {
      rotate: 180deg;
    }

    .itens {
      margin: 0 26px;
      padding: 6px 0 14px;
      list-style: none;
      border-top: 2px solid rgb(214 72 72 / 0.55);
      font-family: var(--f-hand);
      font-size: 1.14rem;
      line-height: var(--line);
      background: repeating-linear-gradient(
          to bottom,
          transparent 0 calc(var(--line) - 2px),
          rgb(64 110 190 / 0.32) calc(var(--line) - 2px) var(--line)
        )
        0 6px;

      li {
        position: relative;
        padding-left: 1.2em;
      }
      /* uma linha da pauta em branco entre um item e outro: cada mudança respira (e a letra continua na pauta) */
      li + li {
        margin-top: var(--line);
      }

      /* o tracinho da lista, a caneta */
      li::before {
        content: '–';
        position: absolute;
        left: 0.15em;
      }
    }

    .bugfix .itens {
      margin: 0 22px;
    }

    /* "Novo": um adesivo de tinta com a letra amarela, colado na quina */
    .novo {
      position: absolute;
      top: -12px;
      right: 22px;
      padding: 6px 11px 5px;
      border-radius: 2px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      rotate: 5deg;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.4), 0 4px 8px -3px rgb(0 0 0 / 0.4);
    }

    @media (max-width: 600px) {
      .fichas {
        gap: 22px;
      }

      .ficha.bugfix {
        margin-left: 18px;
      }

      summary,
      .bugfix summary {
        padding: 18px 16px 12px;
      }

      /* no celular o título desce para a linha de baixo, inteiro */
      h2 {
        order: 1;
        flex-basis: 100%;
        font-size: 1.3rem;
      }

      .bugfix h2 {
        font-size: 1.15rem;
      }

      .chev {
        margin-left: auto;
      }

      .itens,
      .bugfix .itens {
        margin: 0 16px;
        font-size: 1.08rem;
      }
    }
  `,
})
export class NewsPage {
  private readonly news = inject(News);

  protected readonly entries = this.news.entries;
  protected readonly version = VERSION;
  protected readonly label = NEWS_KIND_LABEL;
  protected readonly ChevronIcon = ChevronDown;
  /** O que era novo ao abrir a página: o adesivo fica enquanto ela estiver aberta. */
  protected readonly fresh = this.news.unseenIds();

  constructor() {
    this.news.seeAll();
  }

  protected tilt(i: number): number {
    return TILTS[i % TILTS.length];
  }

  protected when(n: NewsEntry): string {
    // curta, para caber na linha da versão: "7 out 2026"
    const [y, m, d] = n.date.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
}
