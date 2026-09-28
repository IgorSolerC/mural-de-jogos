import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { VERDICT_LABEL, Verdict, formatScore } from '../core/review';
import { VERDICT_ICON } from './verdict';

const ICON_SIZE = { card: 19, compact: 16, big: 23 } as const;

/**
 * O julgamento: etiqueta adesiva dupla, destacável no picote. À esquerda, a Média impressa em papel
 * branco; à direita, o veredito numa faixa de tinta preta. As duas metades têm a mesma altura e o
 * mesmo peso, unidas por um picote com entalhes. É a mesma etiqueta na ficha do mural e na leitura.
 */
@Component({
  selector: 'app-judge-label',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'size()' },
  template: `
    <p class="grade" role="img" [attr.aria-label]="'Média ' + grade().text + ' de 10'" [class.top]="grade().top">
      <span class="int" aria-hidden="true">{{ grade().int }}</span>
      @if (grade().dec) {
        <span class="dec" aria-hidden="true">,{{ grade().dec }}</span>
      }
    </p>
    @if (verdict(); as v) {
      <p class="band" [class.gold]="v === 'masterpiece'" role="img" [attr.aria-label]="'Veredito: ' + verdictLabels[v]" [style.--v]="'var(--verdict-' + v + '-lit)'">
        <lucide-icon [img]="verdictIcons[v]" [size]="iconSize()" [strokeWidth]="2.6" aria-hidden="true" />
        <span aria-hidden="true">{{ verdictLabels[v] }}</span>
      </p>
    }
  `,
  styles: `
    :host {
      --notch: 5px;
      display: flex;
      align-items: stretch;
      min-height: 58px;
      /* sombra que segue o recorte dos entalhes, colada no papel */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 5px 6px rgb(0 0 0 / 0.22));
      /* colada meio torta, ao contrário da ficha */
      rotate: calc(var(--tilt, 0) * -0.5deg - 1deg);
    }
    .grade {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 76px;
      padding: 4px 14px 3px 13px;
      border-radius: 3px;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .int {
      font-size: 2.9rem;
      letter-spacing: -0.03em;
    }
    .dec {
      font-size: 1.9rem;
      letter-spacing: -0.02em;
      /* a vírgula e a casa decimal no mesmo pé do inteiro, só menores */
      align-self: flex-end;
      margin-bottom: 0.2em;
    }
    /* 9 ou mais: o número sai em vermelho, como nota alta de professor */
    .grade.top {
      color: var(--red-deep);
    }
    .band {
      position: relative;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 18px 0 17px;
      border-radius: 0 3px 3px 0;
      /* picote: a linha pontilhada onde o canhoto se destaca */
      border-left: 2px dotted rgb(255 255 255 / 0.5);
      /* uma tinta só, a do pincel: preto assenta em qualquer uma das seis cartolinas */
      background: var(--ink);
      color: var(--paper);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.02rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
      mask:
        radial-gradient(circle at 0 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 0 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }
    /* Masterpiece: o mesmo canhoto preto, com a palavra e o fio da moldura estampados a quente
       em folha de ouro. O brilho corre pela folha quando a ficha levanta, como no Platinado. */
    .band.gold {
      border-left-color: rgb(243 210 122 / 0.55);
      transition: --shine 900ms var(--ease-physical);
    }
    .band.gold::after {
      content: '';
      position: absolute;
      inset: 4px 4px 4px 5px;
      border: 1.5px solid #d8ab48;
      border-radius: 2px;
      pointer-events: none;
    }
    .band.gold span {
      background:
        linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.95) 45%, transparent 60%) calc(var(--shine) * 1.6 - 60%) 0 / 220% 100% no-repeat,
        linear-gradient(100deg, #d8ab48 0%, #f7dc8a 30%, #fff4c4 45%, #e3b857 65%, #f3d27a 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .band lucide-icon {
      display: inline-flex;
      margin-top: -1px;
      color: var(--v);
    }
    /* os entalhes de ticket, em cima e embaixo, onde as duas metades se encontram */
    .grade:not(:only-child) {
      border-radius: 3px 0 0 3px;
      mask:
        radial-gradient(circle at 100% 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 100% 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }

    /* ===== Ficha simples: a etiqueta cabe ao lado da foto ===== */
    :host(.compact) {
      --notch: 4px;
      min-height: 42px;
    }
    :host(.compact) .grade {
      min-width: 56px;
      padding: 3px 10px 2px 9px;
    }
    :host(.compact) .int {
      font-size: 2.25rem;
    }
    :host(.compact) .dec {
      font-size: 1.5rem;
    }
    :host(.compact) .band {
      gap: 5px;
      padding: 0 11px 0 10px;
      font-size: 0.84rem;
      letter-spacing: 0.08em;
    }

    /* ===== Leitura: a mesma etiqueta, vista de perto ===== */
    :host(.big) {
      --notch: 6px;
      min-height: 74px;
    }
    :host(.big) .grade {
      min-width: 96px;
      padding: 5px 18px 4px 16px;
    }
    :host(.big) .int {
      font-size: 3.7rem;
    }
    :host(.big) .dec {
      font-size: 2.4rem;
    }
    :host(.big) .band {
      gap: 9px;
      padding: 0 24px 0 21px;
      font-size: 1.3rem;
    }
    :host(.big) .band.gold::after {
      inset: 5px 5px 5px 6px;
    }
  `,
})
export class JudgeLabel {
  readonly value = input.required<number | null>();
  readonly verdict = input<Verdict | null>(null);
  readonly size = input<'card' | 'compact' | 'big'>('card');

  /** "9,4" → inteiro 9 e decimal 4, escritos em tamanhos diferentes, o decimal menor. */
  protected readonly grade = computed(() => {
    const v = this.value();
    const text = formatScore(v);
    const [int, dec = ''] = text.split(',');
    return { text, int, dec, top: (v ?? 0) >= 9 };
  });
  protected readonly iconSize = computed(() => ICON_SIZE[this.size()]);
  protected readonly verdictLabels = VERDICT_LABEL;
  protected readonly verdictIcons = VERDICT_ICON;
}
