import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PageBackground } from '../core/profile';

/** Onde ficam os desenhos das paredes (public/paredes), a partir do endereço do site. */
const ART = new URL('paredes/', document.baseURI).href;

/**
 * A parede (ver PAGE_BACKGROUNDS em core/profile.ts), pintada na caixa de quem a põe: atrás do site
 * inteiro, atrás do perfil de alguém, atrás da prévia nas Configurações, ou num retalho da cartela.
 * O CSS das paredes fica só aqui; os desenhos grandes vêm de public/paredes/<id>.svg (e <id>-2.svg)
 * pelas variáveis --arte e --arte-2, e só a parede que aparece é baixada.
 */
@Component({
  selector: 'app-page-wall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="parede" [attr.data-parede]="wall()" [style.--arte]="art().a" [style.--arte-2]="art().b"></span>',
  styleUrl: './page-wall.scss',
  host: { 'aria-hidden': 'true' },
})
export class PageWall {
  readonly wall = input.required<PageBackground>();

  protected readonly art = computed(() => ({ a: `url("${ART}${this.wall()}.svg")`, b: `url("${ART}${this.wall()}-2.svg")` }));
}
