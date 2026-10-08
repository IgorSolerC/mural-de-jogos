import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hasFormatting, parseRich } from '../core/rich-text';
import { NoteLinks } from '../core/note-links';
import { Review } from '../core/review';

/**
 * O texto da ficha na leitura, com a formatação do editor (ver core/rich-text.ts): negrito, itálico,
 * listas e checklists. Quem desenha é o Angular, nunca HTML vindo do texto. Sem nenhuma marca, o
 * texto sai como sempre saiu, um bloco só; com marcas, linha a linha, cada uma numa linha da pauta.
 *
 * O pai dá a letra, o tamanho e a altura da linha (`--line`); as tarefas só marcam com `checkable`.
 *
 * Os links "[[título]]" só valem com `links` (nas anotações, ver core/note-links.ts): a caneta azul
 * sublinhada, que abre a outra anotação; tracejado, o que aponta para uma anotação que não existe.
 * Sem `links` (as resenhas), os colchetes ficam como foram escritos.
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
                    @if (checkable()) {
                      <input type="checkbox" [checked]="it.done" (change)="toggled.emit(it.line)" />
                    } @else {
                      <span class="caixa" [class.marcada]="it.done" aria-hidden="true"></span>
                      <span class="sr-only">{{ it.done ? 'Feito:' : 'A fazer:' }}</span>
                    }
                    <span class="tarefa">@for (s of it.spans; track $index) {<ng-container *ngTemplateOutlet="span; context: { $implicit: s }" />}</span>
                  </label>
                </li>
              }
            </ul>
          }
        }
      }
    }
    <ng-template #span let-s>@if (s.link) {<ng-container *ngTemplateOutlet="elo; context: { $implicit: s }" />} @else if (s.bold && s.italic) {<strong><em>{{ s.text }}</em></strong>} @else if (s.bold) {<strong>{{ s.text }}</strong>} @else if (s.italic) {<em>{{ s.text }}</em>} @else {{{ s.text }}}</ng-template>
    <!-- o link: um span com papel de link (quebra a linha junto com o texto, o que um botão não faz) -->
    <ng-template #elo let-s>@let l = links(); @if (!l) {{{ '[[' + s.text + ']]' }}} @else if (!l.resolve) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic">{{ s.text }}</span>} @else {@let note = l.resolve(s.text); @if (note && l.open) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic" role="link" tabindex="0" [attr.aria-label]="'Abrir a anotação ' + note.game.name" (click)="go($event, note)" (keydown.enter)="go($event, note)">{{ s.text }}</span>} @else if (note) {<span class="elo" [class.negrito]="s.bold" [class.italico]="s.italic">{{ s.text }}</span>} @else if (l.create) {<span class="elo quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" role="button" tabindex="0" [attr.aria-label]="'Criar a anotação ' + s.text" [title]="'Ainda não tem uma anotação ' + s.text + '. Toque para criar.'" (click)="make($event, s.text)" (keydown.enter)="make($event, s.text)" (keydown.space)="make($event, s.text)">{{ s.text }}</span>} @else {<span class="elo quebrado" [class.negrito]="s.bold" [class.italico]="s.italic" title="Essa anotação não existe">{{ s.text }}</span>}}</ng-template>
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
    .tarefas input,
    .tarefas .caixa {
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
      /* na cor da tinta: o amarelo sumia na cartolina amarela */
      outline: 3px solid currentColor;
      outline-offset: 2px;
    }
    /* feita: o tique vermelho de caneta por cima da caixinha, e o texto riscado a lápis */
    .tarefas input:checked,
    .tarefas .caixa.marcada {
      background:
        no-repeat center / 120% 120%
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23c4302b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    .feita .tarefa {
      text-decoration: line-through 2px rgb(21 21 21 / 0.45);
      opacity: 0.7;
    }
    /* O link: a letra de sempre, sublinhada à mão com a caneta vermelha (cada linha com o seu
       risco, levemente torto); passando por cima, o marca-texto. A cor do risco e do marca-texto
       segue a cartolina da ficha (ver as variações logo abaixo). */
    .elo {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%23c4302b' stroke-width='2.3' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(255 218 66 / 0.55);
      color: inherit;
      text-decoration: none;
      border-radius: 1px;
      padding-bottom: 0.1em;
      background:
        var(--elo-traco) no-repeat left bottom / 100% 0.42em,
        linear-gradient(transparent 50%, var(--elo-fundo, transparent) 50%, var(--elo-fundo, transparent) 94%, transparent 94%) no-repeat;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .elo[tabindex] {
      cursor: pointer;
    }
    .elo[tabindex]:hover,
    .elo[tabindex]:focus-visible {
      --elo-fundo: var(--elo-marca);
    }
    .elo:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    .elo.negrito {
      font-weight: 700;
    }
    .elo.italico {
      font-style: italic;
    }
    /* a anotação não existe (ainda): o risco tracejado, a lápis, e a letra mais apagada */
    .elo.quebrado {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.2C16 5.2 31 7 49 5.8S82 4.9 99 6' fill='none' stroke='%23151515' stroke-opacity='.55' stroke-width='1.8' stroke-dasharray='5 4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      opacity: 0.85;
    }
    /* na cartolina amarela o marca-texto amarelo some: o rosa */
    :host-context(app-review-card[data-cor='amarelo']) .elo {
      --elo-marca: rgb(255 112 168 / 0.42);
    }
    /* na cartolina vermelha a caneta vermelha some: o risco amarelo */
    :host-context(app-review-card[data-cor='vermelho']) .elo,
    :host-context(app-review-card[data-cor='vermelho-escuro']) .elo {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%23ffd84d' stroke-width='2.5' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(255 216 77 / 0.35);
    }
    /* nas outras escuras: a caneta vermelha clara, que aparece no escuro */
    :host-context(app-review-card[data-cor$='-escuro']:not([data-cor='vermelho-escuro'])) .elo,
    :host-context(app-review-card[data-cor='preto']) .elo {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.4C16 4.9 31 7.3 49 5.7S82 4.6 99 5.9' fill='none' stroke='%23ff8f80' stroke-width='2.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
      --elo-marca: rgb(255 218 66 / 0.28);
    }
    :host-context(app-review-card[data-cor$='-escuro']) .elo.quebrado,
    :host-context(app-review-card[data-cor='preto']) .elo.quebrado {
      --elo-traco: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M1 6.2C16 5.2 31 7 49 5.8S82 4.9 99 6' fill='none' stroke='%23f3ece0' stroke-opacity='.6' stroke-width='1.8' stroke-dasharray='5 4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
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
  /** Os links para outras anotações; null, os colchetes ficam no texto (as resenhas). */
  readonly links = input<NoteLinks | null>(null);

  protected readonly formatted = computed(() => hasFormatting(this.text()));
  protected readonly blocks = computed(() => parseRich(this.text()));

  /** Tocou num link: só ele age (a ficha embaixo, a caixinha da tarefa, nada mais). */
  protected go(e: Event, note: Review): void {
    e.preventDefault();
    e.stopPropagation();
    this.links()?.open?.(note);
  }

  protected make(e: Event, title: string): void {
    e.preventDefault();
    e.stopPropagation();
    this.links()?.create?.(title);
  }
}

