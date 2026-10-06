import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NewsEntry, News } from '../core/news';
import { Pin } from '../ui/pin';

/** Inclinações fixas, uma por ficha, para a pilha não parecer impressa. */
const TILTS = [-0.6, 0.5, -0.3, 0.7, -0.5, 0.3];

/**
 * Novidades: o que mudou em cada atualização do site, da mais nova para a mais velha, uma ficha
 * pautada por atualização. As que a pessoa ainda não tinha visto ganham o adesivo "novo"; abrir a
 * página conta tudo como visto (e a faixa de novidade do topo vai embora).
 */
@Component({
  selector: 'app-news-page',
  imports: [Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h1 class="tape-label big">Novidades</h1>
      <p class="resumo">O que mudou em cada atualização</p>
    </header>

    <ol class="fichas">
      @for (n of entries; track n.id; let i = $index) {
        <li class="ficha" [style.rotate.deg]="tilt(i)" [attr.aria-labelledby]="'nov-' + n.id">
          <app-pin class="pin" color="#e62e2d" />
          @if (fresh.has(n.id)) {
            <span class="novo" aria-hidden="true">Novo</span>
          }
          <p class="data"><time [attr.datetime]="n.date">{{ when(n) }}</time></p>
          <h2 [id]="'nov-' + n.id">
            {{ n.title }}
            @if (fresh.has(n.id)) {
              <span class="sr-only">(novo)</span>
            }
          </h2>
          <ul class="itens">
            @for (item of n.items; track $index) {
              <li>{{ item }}</li>
            }
          </ul>
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
      gap: 40px;
      max-width: 760px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* Ficha pautada de papelaria: branca, o fio vermelho embaixo do título e a pauta azul no resto */
    .ficha {
      --line: 1.85rem;
      position: relative;
      padding: 26px 30px 20px;
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

    .data {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.92rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }

    h2 {
      margin: 2px 0 10px;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.6rem;
      line-height: 1.12;
    }

    .itens {
      margin: 0;
      padding: 6px 0 0;
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

      /* o tracinho da lista, a caneta */
      li::before {
        content: '–';
        position: absolute;
        left: 0.15em;
      }
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
        gap: 34px;
      }

      .ficha {
        padding: 24px 18px 16px;
      }

      h2 {
        font-size: 1.4rem;
      }

      .itens {
        font-size: 1.08rem;
      }
    }
  `,
})
export class NewsPage {
  private readonly news = inject(News);

  protected readonly entries = this.news.entries;
  /** O que era novo ao abrir a página: o adesivo fica enquanto ela estiver aberta. */
  protected readonly fresh = this.news.unseenIds();

  constructor() {
    this.news.seeAll();
  }

  protected tilt(i: number): number {
    return TILTS[i % TILTS.length];
  }

  protected when(n: NewsEntry): string {
    const [y, m, d] = n.date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
