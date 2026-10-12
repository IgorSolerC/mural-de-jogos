import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FrameStyle, PROFILE_FRAMES } from '../core/profile';
import { frameArt } from './frame-art';
import { Pin } from './pin';

/**
 * A cartela das molduras (ver PROFILE_FRAMES em core/profile.ts), para o quadro de cima e para as seções
 * num quadro: cada uma num quadrinho de cortiça com a moldura de verdade em volta, a escolhida pregada
 * com uma tachinha (como os fundos). Os desenhos vêm do mesmo `molduras` do perfil.
 */
@Component({
  selector: 'app-frame-picker',
  imports: [Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cartela">
      @for (f of frames; track f.id) {
        <label class="opcao" [class.on]="value() === f.id">
          <input type="radio" [name]="name()" [checked]="value() === f.id" (change)="picked.emit(f.id)" />
          <span class="amostra" [attr.data-moldura]="f.id" [style.--moldura-arte]="art(f.id)" aria-hidden="true">
            <span class="parafuso p1"></span>
            <span class="parafuso p2"></span>
            <span class="parafuso p3"></span>
            <span class="parafuso p4"></span>
            <span class="miolo-amostra" data-fundo="cortica"></span>
          </span>
          <span class="nome">{{ f.label }}</span>
          @if (value() === f.id) {
            <app-pin class="pin" color="#e62e2d" />
          }
        </label>
      }
    </div>
  `,
  styleUrl: './frame-picker.scss',
})
export class FramePicker {
  readonly value = input.required<FrameStyle>();
  /** O nome do grupo de rádios (um por seção). */
  readonly name = input.required<string>();
  readonly picked = output<FrameStyle>();

  protected readonly frames = PROFILE_FRAMES;
  protected readonly art = frameArt;
}
