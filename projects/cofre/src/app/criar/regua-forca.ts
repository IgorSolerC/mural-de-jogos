import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Avaliacao } from '../../core/forca';

/** Até onde a régua vai, em bits. */
const FIM = 100;

/**
 * A força da senha numa régua escolar impressa em bits: o traço de lápis vai até a estimativa, e a
 * caneta vermelha marca o mínimo. Para leitores de tela, é um medidor com o texto da situação.
 */
@Component({
  selector: 'cofre-regua-forca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="regua" role="meter" aria-label="Força da senha" [attr.aria-valuenow]="avaliacao().bits" aria-valuemin="0" [attr.aria-valuemax]="fim" [attr.aria-valuetext]="frase()">
      <div class="corpo" aria-hidden="true">
        @for (marca of marcas; track marca) {
          <span class="marca" [class.longa]="marca % 10 === 0" [style.left.%]="marca"></span>
          @if (marca % 20 === 0) {
            <span class="numero" [class.inicio]="marca === 0" [class.fim]="marca === fim" [style.left.%]="marca">{{ marca }}</span>
          }
        }
        <span class="lapis" [class.boa]="avaliacao().situacao !== 'fraca'" [style.width.%]="largura()"></span>
        <span class="minimo" [style.left.%]="avaliacao().minimo"></span>
      </div>
    </div>
    <p class="leitura" [class.fraca]="avaliacao().situacao === 'fraca'">
      <strong>{{ titulo() }}</strong> {{ detalhe() }}
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
    .regua {
      padding: 0 2px;
    }
    .corpo {
      position: relative;
      height: 46px;
      border-radius: 2px;
      background: linear-gradient(180deg, rgb(255 255 255 / 0.7), rgb(255 255 255 / 0.35)), #e9f1ef;
      box-shadow:
        inset 0 0 0 1px rgb(21 21 21 / 0.28),
        0 1px 1px rgb(0 0 0 / 0.18);
      overflow: hidden;
    }
    .marca {
      position: absolute;
      top: 0;
      width: 1px;
      height: 8px;
      background: rgb(21 21 21 / 0.55);
      translate: -0.5px 0;
    }
    .marca.longa {
      height: 14px;
      background: var(--tinta);
    }
    .numero {
      position: absolute;
      top: 14px;
      translate: -50% 0;
      font: 600 0.78rem/1 var(--f-rotulo);
      font-variant-numeric: tabular-nums;
      color: var(--tinta-2);
    }
    .numero.inicio {
      translate: 4px 0;
    }
    .numero.fim {
      translate: calc(-100% - 4px) 0;
    }
    /* o traço de lápis, grafite com o brilho do risco */
    .lapis {
      position: absolute;
      left: 0;
      bottom: 7px;
      height: 6px;
      border-radius: 0 3px 3px 0;
      background: linear-gradient(180deg, #6b6862, #3c3a37 60%, #55524d);
      transition: width 380ms var(--curva);
    }
    .lapis.boa {
      background: linear-gradient(180deg, #2c2b29, #151515 60%, #2a2927);
    }
    /* a caneta vermelha no mínimo */
    .minimo {
      position: absolute;
      top: 3px;
      bottom: 3px;
      width: 3px;
      border-radius: 2px;
      background: var(--caneta);
      translate: -1.5px 0;
      rotate: 4deg;
    }
    .leitura {
      margin: 10px 0 0;
      font: 500 0.98rem/1.4 var(--f-texto);
    }
    .leitura strong {
      font: 800 1rem/1 var(--f-rotulo);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-right: 4px;
    }
    .leitura.fraca strong {
      color: var(--erro);
    }
  `,
})
export class ReguaForca {
  readonly avaliacao = input.required<Avaliacao>();
  protected readonly fim = FIM;
  protected readonly marcas = Array.from({ length: FIM / 5 + 1 }, (_, i) => i * 5);
  protected readonly largura = computed(() => Math.min(100, (this.avaliacao().bits / FIM) * 100));
  protected readonly titulo = computed(() => ({ sorteada: 'Frase sorteada', boa: 'Forte o bastante', fraca: 'Fraca' })[this.avaliacao().situacao]);
  protected readonly detalhe = computed(() => {
    const a = this.avaliacao();
    if (a.situacao === 'sorteada') return `cerca de ${a.bits} bits. A mais forte que dá para lembrar.`;
    if (a.situacao === 'boa') return `cerca de ${a.bits} bits (o mínimo é ${a.minimo}).`;
    if (a.bits === 0) return `o mínimo é ${a.minimo} bits.`;
    return `cerca de ${a.bits} bits; faltam ${a.minimo - a.bits}. Use a frase sorteada ou escreva mais palavras.`;
  });
  protected readonly frase = computed(() => `${this.titulo()}: ${this.detalhe()}`);
}
