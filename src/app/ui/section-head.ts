import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ICON, IconModule } from './icons';

/**
 * A cabeça de uma seção da parede (PLANO-ETIQUETAS.md): o nome em letra de rótulo, quantas fichas, o
 * detalhe (a média, as rejogadas) e um fio de giz até o fim da seção, numa linha só, sempre da mesma
 * altura. Nunca alarga a seção: faltando lugar, some o fio, depois o detalhe, e o nome ganha reticências
 * (inteiro na dica e no nome acessível). A mesma peça no mural (o seu e a visita) e no "Tudo" dos
 * Flashcards (o seu e a visita).
 *
 * Dobrável, a linha inteira é o botão que fecha e abre a seção; fechada, o fio fica tracejado e a seta
 * vira. Com `link`, o nome leva a outro lugar (o grupo dos Flashcards). Senão, é só texto.
 */
@Component({
  selector: 'app-section-head',
  imports: [IconModule, NgTemplateOutlet, RouterLink],
  host: { '[class.fechada]': 'foldable() && !open()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (level() === 2) {
      <h2 [id]="headingId()"><ng-container *ngTemplateOutlet="linha" /></h2>
    } @else {
      <h3 [id]="headingId()"><ng-container *ngTemplateOutlet="linha" /></h3>
    }

    <ng-template #linha>
      @if (foldable()) {
        <button type="button" class="cabeca-secao" [attr.aria-expanded]="open()" [attr.aria-controls]="open() ? controls() : null" [title]="tip()" (click)="toggle.emit($event)">
          <ng-container *ngTemplateOutlet="dentro" />
          <lucide-icon class="seta" [img]="ChevronIcon" [size]="16" aria-hidden="true" />
        </button>
      } @else if (link(); as to) {
        <a class="cabeca-secao" [routerLink]="to" [title]="tip()"><ng-container *ngTemplateOutlet="dentro" /></a>
      } @else {
        <span class="cabeca-secao" [title]="tip()"><ng-container *ngTemplateOutlet="dentro" /></span>
      }
    </ng-template>

    <ng-template #dentro>
      <span class="nome">{{ label() }}</span>
      <span class="n" aria-hidden="true">{{ count() }}</span>
      @if (detail()) {
        <span class="detalhe" aria-hidden="true">{{ detail() }}</span>
      }
      @if (summary()) {
        <span class="sr-only">: {{ summary() }}</span>
      }
      <span class="fio" aria-hidden="true"></span>
    </ng-template>
  `,
  styleUrl: './section-head.scss',
})
export class SectionHead {
  /** O nome da seção ("Outubro de 2026", "Fixadas", "#trabalho"). */
  readonly label = input.required<string>();
  /** Quantas fichas (ou baralhos) a seção tem. */
  readonly count = input.required<number>();
  /** O que vem depois do número, menor: "média 8,4", "1 rejogada". Vazio, nada. */
  readonly detail = input('');
  /** O resumo inteiro, para o leitor de tela e a dica ("3 jogos · média 8,4"). */
  readonly summary = input('');
  /** A linha fecha e abre a seção. */
  readonly foldable = input(false);
  /** A seção está aberta (só vale dobrável). */
  readonly open = input(true);
  /** O id do que a seção mostra aberta (o `aria-controls`). */
  readonly controls = input<string | null>(null);
  /** O nível do título: 2 nos seus Flashcards, 3 no mural e nos Flashcards da visita (abaixo do título dela). */
  readonly level = input<2 | 3>(3);
  /** O id do título, para a seção apontar para ele (`aria-labelledby`). */
  readonly headingId = input<string | null>(null);
  /** Para onde o nome leva (o grupo dos Flashcards). Não vale com `foldable`. */
  readonly link = input<string | null>(null);
  /** O que a dica diz que o link faz ("Abrir o grupo"). */
  readonly linkHint = input('');

  /** Tocou na linha dobrável: quem usa fecha ou abre (com o evento, para ler o Alt). */
  readonly toggle = output<MouseEvent>();

  protected readonly ChevronIcon = ICON.abrir;

  protected readonly tip = computed(() => {
    const said = this.summary() ? `${this.label()}: ${this.summary()}` : this.label();
    if (!this.foldable()) return this.link() && this.linkHint() ? `${said}. ${this.linkHint()}` : said;
    return `${said}. ${this.open() ? 'Fechar a seção' : 'Abrir a seção'}`;
  });
}
