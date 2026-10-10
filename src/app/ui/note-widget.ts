import { ChangeDetectionStrategy, Component, DestroyRef, computed, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { WIDGET_LINES, WidgetSize } from '../core/widgets';
import { AudioTrack } from './audio-track';
import { Countdown } from './countdown';
import { GluedMedia } from './glued-media';

/**
 * Um widget do texto (ver core/widgets.ts), desenhado pelo componente dele. Cada widget novo ganha
 * um `@case` aqui e um componente seu, que recebe os parâmetros como foram escritos. Cada widget
 * vem num `@defer`, para não pesar no carregamento do site.
 *
 * O tamanho (mini, pequeno, médio, grande) é o mesmo para todos e vale em toda parte onde o texto
 * aparece: uma altura em linhas da pauta (`WIDGET_LINES`), a `--widget-alto` (registrada em
 * styles.scss, em px). Cada peça cresce até ela: a foto e o vídeo, o bloquinho do contador, a fita,
 * o disco, a tira. O que é letra de apoio (a legenda, o lado do contador) cresce pouco
 * (`--letra-tam`), para não virar letreiro. Uma peça mais larga que a linha encolhe até caber.
 *
 * Numa caixa que corta o texto (a ficha do mural, marcada com `data-widget-teto`, que dá a altura
 * dela em `--widget-teto`), o widget mede quanto texto vem antes dele (`--widget-acima`) e não passa
 * do fim da caixa, mas nunca fica menor que o mini.
 */
@Component({
  selector: 'app-note-widget',
  imports: [AudioTrack, Countdown, GluedMedia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.tam-mini]': "size() === 'mini'",
    '[class.tam-pequeno]': "size() === 'pequeno'",
    '[class.tam-medio]': "size() === 'medio'",
    '[class.tam-grande]': "size() === 'grande'",
    '[style.--widget-linhas]': 'lines()',
  },
  template: `
    @switch (name()) {
      <!-- o contador também vem à parte (o espaço dele fica guardado, da altura dele) -->
      @case ('contador') {
        @defer (on immediate) {
          <app-countdown [args]="args()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      <!-- a foto colada também vem à parte (ela carrega a imagem depois, de qualquer jeito) -->
      @case ('imagem') {
        @defer (on immediate) {
          <app-glued-media kind="imagem" [args]="args()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      @case ('video') {
        @defer (on immediate) {
          <app-glued-media kind="video" [args]="args()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      @case ('audio') {
        <!-- a fita, o vinil e o player vêm num pedaço à parte do site, carregado só quando aparece uma faixa -->
        @defer (on immediate) {
          <app-audio-track [args]="args()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      /* a altura do tamanho; na caixa que corta, até o fim dela, em linhas inteiras (mas nunca menor
         que o mini) */
      --widget-alto: max(
        calc(var(--line, 1.5em) * 3),
        min(calc(var(--line, 1.5em) * var(--widget-linhas, 7)), calc(var(--widget-teto, 100000px) - var(--widget-acima, 0px)))
      );
      --letra-tam: 1;
    }
    /* (com round(): num navegador sem ele, a variável registrada com var() dentro viraria 0px) */
    @supports (width: round(down, 5px, 2px)) {
      :host {
        --widget-alto: max(
          calc(var(--line, 1.5em) * 3),
          min(
            calc(var(--line, 1.5em) * var(--widget-linhas, 7)),
            round(down, calc(var(--widget-teto, 100000px) - var(--widget-acima, 0px) + 1px), var(--line, 1.5em))
          )
        );
      }
    }
    :host(.tam-mini) {
      --letra-tam: 0.9;
    }
    :host(.tam-pequeno) {
      --letra-tam: 0.95;
    }
    :host(.tam-grande) {
      --letra-tam: 1.15;
    }
    /* o lugar da peça enquanto ela chega: a altura dela, para o texto não pular */
    .esperando {
      min-height: var(--widget-alto);
    }
  `,
})
export class NoteWidget {
  /** O nome do registro ("contador"). */
  readonly name = input.required<string>();
  readonly args = input.required<readonly string[]>();
  readonly size = input<WidgetSize>('medio');
  protected readonly lines = computed(() => WIDGET_LINES[this.size()] ?? WIDGET_LINES.medio);

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
