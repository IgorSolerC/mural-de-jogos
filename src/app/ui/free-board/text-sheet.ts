import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, linkedSignal, output, untracked, viewChild } from '@angular/core';
import { CalloutLook, calloutFallbackTitle, calloutPaper } from '../../core/callouts';
import { FB_TEXT_MAX, noteParts, noteText } from '../../core/free-board';
import { plainText } from '../../core/rich-text';
import { Review } from '../../core/review';
import { noteIcon, noteIconChoice } from '../callout-looks';
import { IconChart } from '../icon-chart';
import { IconChoice } from '../../core/icon-choices';
import { HeightVar } from '../height-var';
import { ICON, IconModule } from '../icons';
import { RichEditor } from '../rich-editor';
import { RichText } from '../rich-text';
import { NoteLinks } from '../../core/note-links';
import { modKey } from '../key-label';
import { SAVE_KEY, SaveKey } from '../save-key';

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
 *
 * Com `reading`, a mesma folha só para ler o card inteiro (o que ele esconde com o "…", PLANO-CAIXAS-DE-TEXTO.md, E2):
 * o título escrito na faixa, o texto como o card o mostra (`app-rich-text`), e o Fechar no lugar do Pronto (o Esc
 * também fecha). Na visita é a mesma, que lê o texto de agora.
 */
@Component({
  selector: 'app-free-board-text-sheet',
  imports: [SaveKey, HeightVar, IconModule, RichEditor, RichText, IconChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './text-sheet.scss',
  host: {
    role: 'dialog',
    'aria-modal': 'false',
    '[attr.aria-labelledby]': 'uid + "-nome"',
    '(keydown)': 'keys($event)',
  },
  template: `
    @if (reading()) {
      <header class="faixa" [attr.data-jeito]="paper()">
        @if (icon(); as ic) {
          <span class="icone" aria-hidden="true"><lucide-icon [img]="ic" [size]="26" /></span>
        }
        <h2 class="titulo lido" [id]="uid + '-nome'">{{ readTitle() }}</h2>
        <button #fechar type="button" class="btn-ink pronto" title="Fechar (Esc)" aria-keyshortcuts="Escape" (click)="done.emit()">Fechar</button>
      </header>
      <div class="conteudo lido">
        @if (readBody().trim()) {
          <app-rich-text class="texto-lido" [text]="readBody()" [links]="links()" />
        }
      </div>
    } @else {
    <h2 class="sr-only" [id]="uid + '-nome'">Escrever o card</h2>
    <!-- a faixa: o alto do card, com o desenho e o título. O desenho é um botão: abre a cartela de ícones do site; sem
         desenho, o recorte vazio com o "+" diz que dá para pôr um -->
    <header class="faixa" [attr.data-jeito]="paper()">
      <button
        #iconeBotao
        type="button"
        class="icone-botao"
        [class.sem]="!icon()"
        aria-haspopup="dialog"
        [attr.aria-label]="icon() ? 'Trocar o ícone do card' : 'Pôr um ícone no card'"
        [title]="icon() ? 'Trocar o ícone' : 'Pôr um ícone'"
        (click)="chart()?.openFrom(iconeBotao)"
      >
        @if (icon(); as ic) {
          <span class="icone" aria-hidden="true"><lucide-icon [img]="ic" [size]="26" /></span>
        } @else {
          <span class="icone vazio" aria-hidden="true"><lucide-icon [img]="Plus" [size]="16" /></span>
        }
      </button>
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
      <button type="button" class="btn-ink pronto" [title]="'Guardar no card (' + saveKey + ', ' + enterKey + ' ou Esc também guardam)'" aria-keyshortcuts="Control+Enter Escape" appSaveKey (click)="done.emit()">Pronto</button>
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
    <app-icon-chart #cartela [row]="false" [value]="iconChoice()" none="Sem ícone" heading="Ícone do card" (pick)="iconPick.emit($event ?? '')" />
    }
  `,
})
export class FreeBoardTextSheet {
  protected readonly saveKey = SAVE_KEY;
  protected readonly enterKey = modKey('Enter');
  /** A peça (trocar de peça começa de novo). */
  readonly id = input.required<string>();
  /** O texto do card quando a folha abriu (o guardado; lido uma vez por peça). */
  readonly text = input.required<string>();
  readonly look = input<CalloutLook>('nota');
  /** A cor do card (a palavra de `kc`), ou '' para a do jeito. */
  readonly color = input('');
  /** As anotações que os links "[[Título]]" abrem; null, sem links. */
  readonly notes = input<readonly Review[] | null>(null);
  /** O desenho escolhido para a faixa ('' sem desenho; omitido, o do jeito: os cards de antes). */
  readonly ic = input<IconChoice | '' | undefined>(undefined);
  /** Só para ler o card inteiro (no ver e na visita), sem escrever. */
  readonly reading = input(false);
  /** Os links do texto lido (os mesmos da peça). */
  readonly links = input<NoteLinks | null>(null);
  /** O texto inteiro de agora (a cada letra). */
  readonly changed = output<string>();
  /** Pediu para guardar (o Pronto, Ctrl+Enter, o Esc). */
  readonly done = output<void>();
  /** Escolheu o desenho da faixa na cartela ('' tirou). Quem guarda é o editor do quadro. */
  readonly iconPick = output<IconChoice | ''>();

  protected readonly uid = `folha-card-${++uid}`;
  protected readonly titleMax = TITLE_MAX;
  private readonly titleField = viewChild<ElementRef<HTMLTextAreaElement>>('titulo');
  private readonly writer = viewChild<RichEditor>('texto');
  private readonly closer = viewChild<ElementRef<HTMLButtonElement>>('fechar');
  protected readonly chart = viewChild<IconChart>('cartela');
  protected readonly Plus = ICON.adicionar;
  /** O card de agora, para ler (o de outra pessoa que muda no meio aparece mudado). */
  private readonly readParts = computed(() => noteParts(this.text()));
  protected readonly readTitle = computed(() => plainText(this.readParts().title).trim() || calloutFallbackTitle(this.look()));
  protected readonly readBody = computed(() => this.readParts().body);

  /** O título e o corpo de quando abriu (o de outra aba chegando no meio não apaga o que se escreve). */
  private readonly start = computed(() => {
    this.id();
    return noteParts(untracked(this.text));
  });
  /** O título como o card mostra (sem as marcas). Mexido, é ele que vai; sem mexer, vai o de antes, com as marcas. */
  protected readonly title = linkedSignal(() => plainText(this.start().title).trim());
  protected readonly body = linkedSignal(() => this.start().body);

  protected readonly paper = computed(() => calloutPaper(this.look(), this.color()));
  protected readonly icon = computed(() => noteIcon(this.look(), this.ic()));
  protected readonly iconChoice = computed(() => noteIconChoice(this.look(), this.ic()));
  /** Vazio, o título diz o que o card mostra no lugar dele: o nome do jeito. */
  protected readonly titleHint = computed(() => calloutFallbackTitle(this.look()) || 'Título (opcional)');
  /** O que sobra para o corpo com o título mais longo (uma conta que não muda enquanto se escreve o título). */
  protected readonly bodyMax = FB_TEXT_MAX - TITLE_MAX - 1;

  constructor() {
    // abre no título, se o card ainda não tem nada; senão, no fim do texto (para ler: no Fechar)
    afterNextRender(() => {
      if (untracked(this.reading)) {
        this.closer()?.nativeElement.focus({ preventScroll: true });
        return;
      }
      const title = this.titleField()?.nativeElement;
      const empty = !untracked(this.title) && !untracked(this.body).trim();
      if (empty) title?.focus({ preventScroll: true });
      else this.writer()?.focusEnd();
      if (title) this.fit(title);
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
    this.writer()?.focus();
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
