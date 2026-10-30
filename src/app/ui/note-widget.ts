import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, Type, effect, inject, input, signal } from '@angular/core';
import { NoteLinks } from '../core/note-links';
import { WIDGET_LINES, WidgetSize, readAudio, readMedia } from '../core/widgets';
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
 * Numa caixa que corta o texto (a ficha do mural), o widget fica do tamanho dele, como os outros
 * do mesmo tamanho: o que passa do fim da caixa fica escondido, como o texto (antes ele encolhia até
 * caber no que sobrava, e dois contadores iguais saíam de tamanhos diferentes).
 */
@Component({
  selector: 'app-note-widget',
  imports: [AudioTrack, Countdown, GluedMedia, NgComponentOutlet],
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
          <app-countdown [args]="args()" [editavel]="editavel()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      <!-- a foto colada também vem à parte (ela carrega a imagem depois, de qualquer jeito) -->
      @case ('imagem') {
        @defer (on immediate) {
          <app-glued-media kind="imagem" [args]="args()" [editavel]="editavel()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      @case ('video') {
        @defer (on immediate) {
          <app-glued-media kind="video" [args]="args()" [editavel]="editavel()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      @case ('audio') {
        <!-- a fita, o vinil e o player vêm num pedaço à parte do site, carregado só quando aparece uma faixa -->
        @defer (on immediate) {
          <app-audio-track [args]="args()" [editavel]="editavel()" />
        } @placeholder {
          <div class="esperando"></div>
        }
      }
      @case ('nota') {
        <!-- a ficha colada: a ficha simples de verdade, que vem por um import() à parte. A ficha do
             mural desenha o texto, que desenha este widget, que desenha a ficha: um import comum
             faria um ciclo, e quem carregasse primeiro acharia o outro ainda vazio -->
        @if (linkedCard(); as card) {
          <ng-container *ngComponentOutlet="card; inputs: { args: args(), links: links(), lines: lines() }" />
        } @else {
          <div class="esperando"></div>
        }
      }
    }
    <!-- no papel (o PDF, ver ui/pdf-sheet.ts), o vídeo e o som não tocam: o endereço deles vai
         embaixo da peça, clicável no PDF. Na tela, nunca aparece -->
    @if (source(); as s) {
      <a class="fonte" [href]="s.href" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">{{ s.label }}</a>
    }
  `,
  styles: `
    .fonte {
      display: none;
    }
    :host {
      display: block;
      /* a altura do tamanho, em linhas da pauta: a mesma em toda parte */
      --widget-alto: calc(var(--line, 1.5em) * var(--widget-linhas, 7));
      --letra-tam: 1;
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
  /** Os links do texto: a Nota (a ficha colada) abre por eles e acha a anotação de um título. */
  readonly links = input<NoteLinks | null>(null);
  /**
   * No modo Visual (ui/visual-editor/pecas.ts), a peça selecionada: a legenda e o título se escrevem
   * direto nela (ver `WidgetField.inline`). Sem isto, a peça é a da leitura.
   */
  readonly editavel = input(false);
  protected readonly lines = computed(() => WIDGET_LINES[this.size()] ?? WIDGET_LINES.medio);
  /** O endereço do vídeo ou do som, para o papel: "youtube.com/watch?v=…" (sem o https:// e o www.). */
  protected readonly source = computed(() => {
    const name = this.name();
    const url = name === 'video' ? readMedia(this.args()).url : name === 'audio' ? readAudio(this.args()).url : '';
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const u = new URL(url);
      const label = (u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + u.search).slice(0, 90);
      return { href: u.href, label };
    } catch {
      return null;
    }
  });
  /** A ficha colada (o widget Nota), carregada só quando aparece uma (ver o molde). */
  protected readonly linkedCard = signal<Type<unknown> | null>(null);

  constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      if (this.name() !== 'nota' || this.linkedCard()) return;
      void import('./linked-card').then((m) => {
        if (!destroy.destroyed) this.linkedCard.set(m.LinkedCard);
      });
    });
  }
}
