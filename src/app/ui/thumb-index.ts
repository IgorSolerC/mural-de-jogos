import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Uma linha do índice: a seção (o id dela na página), o kana do entalhe, o romaji e quantas palavras tem. */
export interface ThumbRow {
  id: string;
  kana: string;
  romaji: string;
  count: number;
}

/**
 * O índice de dedo do Dicionário Japonês (PLANO-DICIONARIO.md, 5.3): os entalhes de um dicionário de papel na borda
 * das páginas, um por linha do silabário (あかさたなはまやらわ), no pano azul-marinho com o kana a ouro do dicionário
 * da prateleira. Tocar num entalhe pula para a linha; o da linha em que a página está sai mais para fora; a linha
 * que a busca ou os filtros esvaziaram fica apagada, como num índice de verdade, que não some. Só desenho: a página
 * diz as linhas e a de agora, e faz o pulo.
 */
@Component({
  selector: 'app-thumb-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--n]': 'rows().length' },
  template: `
    <nav class="entalhes" aria-label="Índice do silabário">
      <ol role="list">
        @for (r of rows(); track r.id) {
          <li>
            <button
              type="button"
              class="entalhe"
              [class.aqui]="r.id === current()"
              [disabled]="!r.count"
              [attr.aria-current]="r.id === current() ? 'location' : null"
              [attr.aria-label]="r.kana + ' (' + r.romaji + '): ' + said(r.count)"
              [title]="r.count ? r.kana + ' · ' + r.romaji + ' · ' + said(r.count) : r.kana + ' · nenhuma palavra aqui'"
              (click)="jump.emit(r.id)"
            >
              <span lang="ja" aria-hidden="true">{{ r.kana }}</span>
            </button>
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    :host {
      --alto: 36px;
      --vao: 4px;
      --pano: #1d2b4a;
      --ouro: #d9b45f;
      display: block;
      align-self: start;
      position: sticky;
      /* no meio da altura da tela, sem passar do topo */
      top: max(12px, calc(50dvh - (var(--n) * (var(--alto) + var(--vao))) / 2));
    }
    ol {
      display: flex;
      flex-direction: column;
      gap: var(--vao);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* o entalhe: meia-lua presa na borda da página, o pano escuro e o kana a ouro */
    .entalhe {
      display: grid;
      place-items: center;
      width: 40px;
      height: var(--alto);
      padding: 0 4px 0 0;
      border: 0;
      border-radius: 4px 19px 19px 4px;
      background:
        linear-gradient(90deg, rgb(0 0 0 / 0.28), transparent 9px),
        repeating-linear-gradient(35deg, rgb(255 255 255 / 0.035) 0 1px, transparent 1px 4px),
        var(--pano);
      color: var(--ouro);
      font-family: 'Klee One', var(--f-carta-palavra);
      font-size: 1.08rem;
      font-weight: 600;
      line-height: 1;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
      cursor: pointer;
      transition:
        translate var(--t-physical) var(--ease-physical),
        scale var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui);
    }
    .entalhe:hover:not(:disabled) {
      scale: 1.06;
      color: #ffe08a;
    }
    /* o índice fica na parede escura: o anel do foco é o amarelo, que se vê nela (a tinta preta sumia) */
    .entalhe:focus-visible {
      outline: 2px solid var(--hi);
      outline-offset: 2px;
    }
    /* a linha em que a página está: o entalhe sai mais para fora, com o ouro aceso */
    .entalhe.aqui {
      translate: 7px 0;
      color: #ffe08a;
      box-shadow:
        0 2px 5px rgb(0 0 0 / 0.4),
        inset 0 -2px 0 var(--ouro);
    }
    /* sem palavras (a busca ou os filtros esvaziaram a linha): o entalhe fica, apagado */
    .entalhe:disabled {
      cursor: default;
      color: rgb(217 180 95 / 0.38);
      background: rgb(29 43 74 / 0.45);
      box-shadow: none;
    }
    @media (max-width: 900px) {
      :host {
        --alto: 31px;
        --vao: 3px;
      }
      .entalhe {
        width: 30px;
        font-size: 0.94rem;
        border-radius: 3px 15px 15px 3px;
      }
      .entalhe.aqui {
        translate: 4px 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .entalhe {
        transition: color var(--t-ui) var(--ease-ui);
      }
      .entalhe:hover:not(:disabled) {
        scale: none;
      }
    }
  `,
})
export class ThumbIndex {
  readonly rows = input.required<readonly ThumbRow[]>();
  /** A linha em que a página está (o id), ou null. */
  readonly current = input<string | null>(null);
  readonly jump = output<string>();

  protected said(n: number): string {
    return n === 1 ? '1 palavra' : `${n} palavras`;
  }
}
