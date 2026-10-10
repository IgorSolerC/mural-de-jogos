import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { WidgetSize } from '../core/widgets';
import { AudioTrack } from './audio-track';
import { Countdown } from './countdown';
import { GluedMedia } from './glued-media';

/**
 * Um widget do texto (ver core/widgets.ts), desenhado pelo componente dele. Cada widget novo ganha
 * um `@case` aqui e um componente seu, que recebe os parâmetros como foram escritos. Cada widget
 * vem num `@defer`, para não pesar no carregamento do site.
 *
 * O tamanho (pequeno, médio, grande) vale em toda parte onde o texto aparece: a peça inteira cresce
 * ou encolhe junto (a letra, a borda, os botões), a partir do médio, que é o de sempre. A foto
 * colada e a faixa também mudam o quanto ocupam da ficha (ver os componentes delas): `--tam` é a
 * escala da letra, e `--widget-teto` (da ficha do mural, ver review-card.ts) é a altura da caixa do
 * texto, que corta o que passa dela. Numa caixa assim (marcada com `data-widget-teto`), o widget mede
 * quanto texto vem antes dele (`--widget-acima`): o grande vai até o fim da ficha, e não além.
 */
@Component({
  selector: 'app-note-widget',
  imports: [AudioTrack, Countdown, GluedMedia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.tam-pequeno]': "size() === 'pequeno'", '[class.tam-grande]': "size() === 'grande'" },
  template: `
    @switch (name()) {
      <!-- o contador também vem à parte (o espaço dele fica guardado, da altura dele) -->
      @case ('contador') {
        @defer (on immediate) {
          <app-countdown [args]="args()" />
        } @placeholder {
          <div class="esperando-contador"></div>
        }
      }
      <!-- a foto colada também vem à parte (ela carrega a imagem depois, de qualquer jeito) -->
      @case ('imagem') {
        @defer (on immediate) {
          <app-glued-media kind="imagem" [args]="args()" [size]="size()" />
        } @placeholder {
          <div class="esperando-foto"></div>
        }
      }
      @case ('video') {
        @defer (on immediate) {
          <app-glued-media kind="video" [args]="args()" [size]="size()" />
        } @placeholder {
          <div class="esperando-foto"></div>
        }
      }
      @case ('audio') {
        <!-- a fita, o vinil e o player vêm num pedaço à parte do site, carregado só quando aparece uma faixa -->
        @defer (on immediate) {
          <app-audio-track [args]="args()" />
        } @placeholder {
          <div class="esperando-faixa"></div>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    /* a escala da peça (o médio fica como sempre foi, sem nada disto): --tam é a da letra; --tam-faixa,
       a da altura da faixa de áudio, que na pequena encolhe mais que a letra (a letra miúda demais não
       se lê) */
    :host(.tam-pequeno) {
      --tam: 0.8;
      --tam-faixa: 0.65;
    }
    :host(.tam-grande) {
      --tam: 1.35;
      --tam-faixa: 1.35;
    }
    /* a pequena encolhe inteira; na grande, a foto colada fica com a borda e a legenda de sempre (só a
       foto cresce, ver glued-media.ts), e o contador e a faixa crescem inteiros */
    :host(.tam-pequeno) > *,
    :host(.tam-grande) > :is(app-countdown, .esperando-contador) {
      font-size: calc(var(--tam) * 1em);
    }
    /* a faixa grande cresce inteira, menos na ficha do mural (--faixa-grande-letra: 1): ali a média já
       ocupa a ficha, e a letra maior só tomaria o lugar do disco e da fita */
    :host(.tam-grande) > :is(app-audio-track, .esperando-faixa) {
      font-size: calc(var(--faixa-grande-letra, var(--tam)) * 1em);
    }
    /* a altura da faixa de áudio na ficha do mural, até o fim da ficha (sobra o respiro de cima e de
       baixo da faixa); a grande nunca menor que a média. O 22em é o da leitura, na letra de sempre */
    :host(.tam-pequeno) {
      --faixa-cap: min(calc(var(--faixa-max, calc(22em / var(--tam))) * var(--tam-faixa)), calc(var(--widget-teto, 100000px) - var(--widget-acima, 0px) - 1.05em));
    }
    :host(.tam-grande) {
      --faixa-cap: max(
        var(--faixa-max, 0px),
        min(calc(var(--faixa-max, calc(22em / var(--tam))) * var(--tam-faixa)), calc(var(--widget-teto, 100000px) - var(--widget-acima, 0px) - 1.05em))
      );
    }
    /* o lugar da faixa enquanto ela chega: a altura de uma tira, para o texto não pular tanto */
    .esperando-faixa {
      min-height: calc(var(--line, 1.5em) * 3);
    }
    /* o do contador: a altura dele (ver countdown.ts) */
    .esperando-contador {
      min-height: calc(var(--line, 1.5em) * 4);
      min-height: round(up, 5.7em, var(--line, 1.5em));
    }
    /* e o da foto: a altura de uma foto pequena */
    .esperando-foto {
      min-height: calc(var(--line, 1.5em) * 5);
    }
  `,
})
export class NoteWidget {
  /** O nome do registro ("contador"). */
  readonly name = input.required<string>();
  readonly args = input.required<readonly string[]>();
  readonly size = input<WidgetSize>('medio');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const box = host.closest<HTMLElement>('[data-widget-teto]');
      if (!box || typeof ResizeObserver === 'undefined') return;
      // do alto da página, pela soma dos offsetTop: o giro da ficha (transform) não entra na conta
      const top = (el: HTMLElement | null) => {
        let y = 0;
        for (; el; el = el.offsetParent as HTMLElement | null) y += el.offsetTop;
        return y;
      };
      let frame = 0;
      const fit = () => {
        frame = 0;
        const above = `${Math.max(0, top(host) - top(box))}px`;
        if (host.style.getPropertyValue('--widget-acima') !== above) host.style.setProperty('--widget-acima', above);
      };
      // o texto de antes muda (escrevendo, marcando uma tarefa): a caixa não muda de altura (ela corta),
      // mas o que está dentro dela, sim
      const ro = new ResizeObserver(() => {
        if (!frame) frame = requestAnimationFrame(fit);
      });
      ro.observe(box);
      if (box.firstElementChild) ro.observe(box.firstElementChild);
      destroy.onDestroy(() => {
        ro.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }
}
