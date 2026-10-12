import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Um quadro de avisos: a moldura de pinus cru com quatro parafusos e o papelão dentro (o quadro dos
 * Ajustes e do perfil), para pregar folhas e bilhetes. O que vai dentro é de quem usa; a folga da
 * moldura vem de `--folga` (14px) e o respiro do papelão de `--respiro` (18px).
 */
@Component({
  selector: 'app-pine-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="parafuso p1" aria-hidden="true"></span>
    <span class="parafuso p2" aria-hidden="true"></span>
    <span class="parafuso p3" aria-hidden="true"></span>
    <span class="parafuso p4" aria-hidden="true"></span>
    <div class="papelao"><ng-content /></div>
  `,
  styleUrl: './pine-board.scss',
})
export class PineBoard {}
