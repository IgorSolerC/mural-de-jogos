import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CircleCheckBig, CircleDashed, LucideAngularModule, Trophy } from 'lucide-angular';
import { STATUS_LABEL, Status } from '../core/review';

/** Etiqueta de etiquetadora de preço. Platinado vem em adesivo holográfico. */
@Component({
  selector: 'app-status-label',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'status()' },
  template: `
    <lucide-icon [img]="icon()" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
    <span>{{ label() }}</span>
  `,
  styles: `
    :host {
      --stripe: #ff8a1f;
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 9px 5px;
      background:
        linear-gradient(var(--stripe), var(--stripe)) top 3px left 0 / 100% 1.5px no-repeat,
        linear-gradient(var(--stripe), var(--stripe)) bottom 3px left 0 / 100% 1.5px no-repeat,
        var(--paper);
      border-radius: 2px;
      color: #2a1d4a;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      line-height: 1;
      box-shadow: 0 1px 1.5px rgb(0 0 0 / 0.3);
      rotate: -2.5deg;
    }
    :host(.finalizado) {
      --stripe: #10a64a;
      color: #0d3b1f;
    }
    :host(.incompleto) {
      color: #5a2a00;
    }
    /* Adesivo holográfico: faixas de difração finas sobre prata, brilho que corre no hover */
    :host(.platinado) {
      --stripe: transparent;
      color: #16162b;
      background:
        linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.9) 45%, transparent 60%) calc(var(--shine) * 1.6 - 60%) 0 / 220% 100% no-repeat,
        /* verniz leitoso: o brilho continua, mas a palavra fica legível */
        linear-gradient(rgb(255 255 255 / 0.4), rgb(255 255 255 / 0.4)),
        var(
          --holo-foil,
          repeating-linear-gradient(62deg, rgb(255 255 255 / 0.35) 0 1px, transparent 1px 4px),
          linear-gradient(100deg, #b6f0ff, #f7b8ff 22%, #fff3a6 42%, #a8ffd6 62%, #b9c9ff 80%, #ffc2e2)
        );
      box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.7),
        inset 0 -1px 0 rgb(0 0 0 / 0.12),
        0 1px 2px rgb(0 0 0 / 0.35);
      transition: --shine 900ms var(--ease-physical);
    }
    lucide-icon {
      display: inline-flex;
      margin-top: -1px;
    }
  `,
})
export class StatusLabel {
  readonly status = input.required<Status>();
  protected readonly label = computed(() => STATUS_LABEL[this.status()]);
  protected readonly icon = computed(() =>
    this.status() === 'platinado' ? Trophy : this.status() === 'finalizado' ? CircleCheckBig : CircleDashed,
  );
}
