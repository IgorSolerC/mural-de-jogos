import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, linkedSignal, output, untracked, viewChild } from '@angular/core';
import { CalloutLook, calloutFallbackTitle, calloutPaper } from '../../core/callouts';
import { FB_TEXT_MAX, noteParts, noteText } from '../../core/free-board';
import { plainText } from '../../core/rich-text';
import { Review } from '../../core/review';
import { CALLOUT_ICON } from '../callout-looks';
import { HeightVar } from '../height-var';
import { IconModule } from '../icons';
import { RichEditor } from '../rich-editor';

let uid = 0;
/** O título é uma linha só, de até 200 letras. */
const TITLE_MAX = 200;

/**
 * A folha de escrever o texto do Quadro livre (PLANO-QUADRO-LIVRE.md, "Escrever o card como uma anotação"): o editor
 * de uma anotação, ao lado do quadro. Em cima, a faixa é o alto do próprio card (o papel do jeito ou da cor, o desenho
 * e o título a pincel, sobre a linha de caneta, como o nome na faixa do editor das anotações); embaixo, o texto no
 * editor de sempre (`app-rich-editor`: o Visual e o Markdown, a régua, a Ajuda, a tela cheia), e o Pronto, na faixa.
 *
 * Mora na tela, fora do mundo do quadro: nem escala com o zoom nem borra. Cada letra sobe em `changed` (o texto
 * inteiro, a primeira linha como título: `noteText`), e o quadro mostra o card mudando; o Pronto, Ctrl+Enter e o Esc
 * pedem para guardar (`done`). Quem guarda é o editor do quadro.
 */
@Component({
  selector: 'app-free-board-text-sheet',
  imports: [HeightVar, IconModule, RichEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './text-sheet.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'false',
    '[attr.aria-labelledby]': 'uid + "-nome"',
    '(keydown)': 'keys($event)',
  },
  template: `
    <h2 class="sr-only" [id]="uid + '-nome'">Escrever o card</h2>
    <!-- a faixa: o alto do card, com o desenho do jeito e o título -->
    <header class="faixa" [attr.data-jeito]="paper()">
      @if (icon(); as ic) {
        <span class="icone" aria-hidden="true"><lucide-icon [img]="ic" [size]="26" /></span>
      }
      <label class="sr-only" [for]="uid + '-titulo'">Título do card</label>
      <textarea
        #titulo
        class="titulo"
        [id]="uid + '-titulo'"
        rows="1"
        autocomplete="off"
        spellcheck="true"
        enterkeyhint="next"
        [maxLength]="titleMax"
        [placeholder]="titleHint()"
        [value]="title()"
        (input)="setTitle($any($event.target))"
        (keydown.enter)="titleEnter($event)"
      ></textarea>
      <button type="button" class="btn-ink pronto" title="Guardar no card (Ctrl+Enter ou Esc também guardam)" aria-keyshortcuts="Control+Enter Escape" (click)="done.emit()">Pronto</button>
    </header>
    <div class="conteudo" appHeightVar="--conteudo-h">
      <app-rich-editor
        #texto
        class="anotacao"
        label="O texto do card"
        placeholder="O que vai no card: listas, tarefas, links…"
        [notes]="notes()"
        [onCard]="false"
        [fill]="true"
        [grows]="true"
        [max]="bodyMax"
        [value]="body()"
        (valueChange)="setBody($event)"
      />
    </div>
  `,
})
export class FreeBoardTextSheet {
  /** A peça (trocar de peça começa de novo). */
  readonly id = input.required<string>();
  /** O texto do card quando a folha abriu (o guardado; lido uma vez por peça). */
  readonly text = input.required<string>();
  readonly look = input<CalloutLook>('nota');
  /** A cor do card (a palavra de `kc`), ou '' para a do jeito. */
  readonly color = input('');
  /** As anotações que os links "[[Título]]" abrem; null, sem links. */
  readonly notes = input<readonly Review[] | null>(null);
  /** O texto inteiro de agora (a cada letra). */
  readonly changed = output<string>();
  /** Pediu para guardar (o Pronto, Ctrl+Enter, o Esc). */
  readonly done = output<void>();

  protected readonly uid = `folha-card-${++uid}`;
  protected readonly titleMax = TITLE_MAX;
  private readonly titleField = viewChild.required<ElementRef<HTMLTextAreaElement>>('titulo');
  private readonly writer = viewChild.required<RichEditor>('texto');

  /** O título e o corpo de quando abriu (o de outra aba chegando no meio não apaga o que se escreve). */
  private readonly start = computed(() => {
    this.id();
    return noteParts(untracked(this.text));
  });
  /** O título como o card mostra (sem as marcas). Mexido, é ele que vai; sem mexer, vai o de antes, com as marcas. */
  protected readonly title = linkedSignal(() => plainText(this.start().title).trim());
  protected readonly body = linkedSignal(() => this.start().body);

  protected readonly paper = computed(() => calloutPaper(this.look(), this.color()));
  protected readonly icon = computed(() => CALLOUT_ICON[this.look()]);
  /** Vazio, o título diz o que o card mostra no lugar dele: o nome do jeito. */
  protected readonly titleHint = computed(() => calloutFallbackTitle(this.look()) || 'Título (opcional)');
  /** O que sobra para o corpo com o título mais longo (uma conta que não muda enquanto se escreve o título). */
  protected readonly bodyMax = FB_TEXT_MAX - TITLE_MAX - 1;

  constructor() {
    // abre no título, se o card ainda não tem nada; senão, no fim do texto
    afterNextRender(() => {
      const empty = !untracked(this.title) && !untracked(this.body).trim();
      if (empty) this.titleField().nativeElement.focus({ preventScroll: true });
      else this.writer().focus();
      this.fit(this.titleField().nativeElement);
    });
  }

  protected setTitle(el: HTMLTextAreaElement): void {
    // uma linha só (colado com quebra, vira espaço): a primeira linha do texto é o título
    const one = el.value.replace(/\s*\n\s*/g, ' ');
    if (one !== el.value) el.value = one;
    this.title.set(one);
    this.fit(el);
    this.tell();
  }

  protected setBody(text: string): void {
    this.body.set(text);
    this.tell();
  }

  /** Enter no título vai para o texto (o Enter que escolhe o kanji da composição é da composição). */
  protected titleEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (k.isComposing || k.keyCode === 229 || k.ctrlKey || k.metaKey) return;
    k.preventDefault();
    this.writer().focus();
  }

  /** O Esc e o Ctrl+Enter guardam; os de dentro do editor (um menu, um painel, a tela cheia) são dele. */
  protected keys(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing) return;
    if ((e.target as Element | null)?.closest?.('dialog')) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      e.stopPropagation();
      this.done.emit();
    }
  }

  private tell(): void {
    const start = this.start();
    const title = this.title().trim() === plainText(start.title).trim() ? start.title : this.title();
    this.changed.emit(noteText(title, this.body()));
  }

  /**
   * O título cresce com o que tem (quebra em mais linhas na faixa). Com o `field-sizing` (text-sheet.scss), o navegador
   * faz isso sozinho, também quando a letra a pincel chega depois: uma altura escrita aqui ficaria velha.
   */
  private fit(el: HTMLTextAreaElement): void {
    if (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }
}
