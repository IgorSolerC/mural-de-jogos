import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hasFormatting, parseRich } from '../core/rich-text';

/**
 * O texto da ficha na leitura, com a formatação do editor (ver core/rich-text.ts): negrito, itálico,
 * listas e checklists. Quem desenha é o Angular, nunca HTML vindo do texto. Sem nenhuma marca, o
 * texto sai como sempre saiu, um bloco só; com marcas, linha a linha, cada uma numa linha da pauta.
 *
 * O pai dá a letra, o tamanho e a altura da linha (`--line`); as tarefas só marcam com `checkable`.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // formatado, cada linha guarda os próprios espaços: os do molde entre os blocos não contam
  host: { '[class.formatado]': 'formatted()' },
  template: `
    @if (!formatted()) {
      {{ text() }}
    } @else {
      @for (b of blocks(); track $index) {
        @switch (b.kind) {
          @case ('p') {
            @for (l of b.lines; track $index) {
              <div class="linha">@for (s of l; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</div>
            }
          }
          @case ('ul') {
            <ul class="lista">
              @for (it of b.items; track it.line) {
                <li class="linha">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</li>
              }
            </ul>
          }
          @case ('ol') {
            <ol class="lista numerada" [start]="b.start" [style.counter-reset]="'item ' + (b.start - 1)">
              @for (it of b.items; track it.line) {
                <li class="linha">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</li>
              }
            </ol>
          }
          @case ('check') {
            <ul class="lista tarefas">
              @for (it of b.items; track it.line) {
                <li class="linha" [class.feita]="it.done">
                  <label>
                    <input type="checkbox" [checked]="it.done" [disabled]="!checkable()" (change)="toggled.emit(it.line)" />
                    <span class="tarefa">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</span>
                  </label>
                </li>
              }
            </ul>
          }
        }
      }
    }
    <ng-template #span let-s>@if (s.bold && s.italic) {<strong><em>{{ s.text }}</em></strong>} @else if (s.bold) {<strong>{{ s.text }}</strong>} @else if (s.italic) {<em>{{ s.text }}</em>} @else {{{ s.text }}}</ng-template>
  `,
  imports: [NgTemplateOutlet],
  styles: `
    :host {
      display: block;
    }
    :host(.formatado) {
      white-space: normal;
    }
    .linha {
      min-height: var(--line, 1.5em);
      white-space: pre-wrap;
    }
    strong {
      font-weight: 700;
    }
    em {
      font-style: italic;
    }
    .lista {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* o item fica pendurado: a segunda linha começa onde o texto começa, não embaixo do marcador */
    .lista > li {
      position: relative;
      padding-left: 1.35em;
    }
    /* só na lista comum: a numerada tem o número no lugar, e a de tarefas, a caixinha */
    .lista:not(.tarefas, .numerada) > li::before {
      content: '•';
      position: absolute;
      left: 0.3em;
      font-weight: 700;
    }
    .numerada > li {
      counter-increment: item;
      padding-left: 1.7em;
    }
    .numerada > li::before {
      content: counter(item) '.';
      position: absolute;
      left: 0;
      font-variant-numeric: tabular-nums;
    }
    .tarefas > li {
      padding-left: 0;
    }
    .tarefas label {
      display: grid;
      grid-template-columns: 1.35em minmax(0, 1fr);
      align-items: start;
    }
    /* a caixinha desenhada a caneta, sentada na linha da pauta */
    .tarefas input {
      appearance: none;
      width: 0.86em;
      height: 0.86em;
      margin: calc((var(--line, 1.5em) - 0.86em) / 2 + 0.06em) 0 0;
      border: 2px solid currentColor;
      border-radius: 2px 3px 2px 4px;
      rotate: -3deg;
      background: transparent;
      cursor: pointer;
    }
    .tarefas input:disabled {
      cursor: default;
    }
    .tarefas input:focus-visible {
      outline: 3px solid var(--hi, #ffd84d);
      outline-offset: 2px;
    }
    /* feita: o tique vermelho de caneta por cima da caixinha, e o texto riscado a lápis */
    .tarefas input:checked {
      background:
        no-repeat center / 120% 120%
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23c4302b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    .feita .tarefa {
      text-decoration: line-through 2px rgb(21 21 21 / 0.45);
      opacity: 0.7;
    }
    :host-context(.cartolina[data-cor$='-escuro']) .feita .tarefa,
    :host-context(.cartolina[data-cor='preto']) .feita .tarefa {
      text-decoration-color: rgb(243 236 224 / 0.5);
    }
  `,
})
export class RichText {
  readonly text = input.required<string>();
  /** As tarefas podem ser marcadas aqui (a ficha é sua); senão, a caixinha só mostra. */
  readonly checkable = input(false);
  /** Marcou ou desmarcou a tarefa da linha dada. */
  readonly toggled = output<number>();

  protected readonly formatted = computed(() => hasFormatting(this.text()));
  protected readonly blocks = computed(() => parseRich(this.text()));
}

