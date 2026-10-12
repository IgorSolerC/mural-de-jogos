import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageBackground } from '../core/profile';

/**
 * A parede atrás do perfil (ver PAGE_BACKGROUNDS em core/profile.ts), pintada na caixa de quem a põe:
 * presa atrás da página inteira, atrás da prévia nas Configurações, ou num retalho da cartela. O
 * desenho das paredes fica só aqui, para não pesar duas vezes na folha de estilo de quem usa.
 */
@Component({
  selector: 'app-page-wall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="parede" [attr.data-parede]="wall()"></span>',
  styleUrl: './page-wall.scss',
  host: { 'aria-hidden': 'true' },
})
export class PageWall {
  readonly wall = input.required<PageBackground>();
}
