import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { OwnNoteLinks } from '../core/own-note-links';
import { lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { Review, artIdOf, isDarkStock } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CardFront, frontTitle, isPhraseTitle } from '../core/study';
import { StudyStore } from '../core/study-store';
import { pinningFor } from '../core/wall-physics';
import { GrowToFit } from './grow-to-fit';
import { PaperArtLayer } from './paper-layer';
import { RichText } from './rich-text';

/**
 * O que se toca no texto do verso: o toque é dele, não vira a carta (a lista do bilhete colado, ui/linked-card.ts).
 * A linha de uma tarefa é `label` também sem caixinha (só marca quem pode): essa é papel.
 */
const OWN_TOUCH = 'a, button, input, label:has(input), select, textarea, summary, iframe, video, audio, [tabindex], [popover], .tocavel, .spoiler, .codigo-peca, .tabela-peca';
/** O dedo ou o mouse andou mais que isto entre apertar e soltar: arrastou (a barra de rolagem, um trecho), não tocou. */
const DRAG_PX = 6;

/**
 * O verso de uma carta dos Estudos, um só para todo lugar: a sessão de estudo, a parede do baralho e a carta
 * maximizada. É a cartolina da anotação (a cor, o papel e a estampa, sem estrago, mancha nem decoração), no
 * formato da carta (5:7, os mesmos cantos), com a anotação inteira escrita nela, rolando por dentro.
 *
 * Quem usa dá as classes (`verso cartolina`: as cores do texto saem delas, ver ui/rich-text.ts), o lado da
 * carta (`inert`, `aria-hidden`) e o giro. Quem deixa tocar nela para virar ouve `turn`.
 */
@Component({
  selector: 'article[appStudyBack]',
  imports: [GrowToFit, PaperArtLayer, RichText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-label': 'A resposta',
    '[style]': 'view()?.look?.vars',
    '[style.--stock]': 'view() ? "var(--stock-" + view()!.look.stock + ")" : null',
    '[attr.data-cor]': 'view()?.look?.stock',
    '(pointerdown)': 'onPress($event)',
    '(click)': 'onClick($event)',
  },
  template: `
    @if (view(); as c) {
      <app-paper-art class="verso-papel-arte" [id]="c.look.artId" [paper]="c.look.paper" [paperSeed]="c.look.paperSeed" [glitter]="c.look.paper === 'glitter'" [dark]="c.look.dark" />
      <div class="verso-conteudo">
        <!-- o título é o da frente, uma vez só; o nome da anotação só aparece quando é tudo o que ela tem -->
        <h3 class="verso-titulo" [class.frase]="c.phrase" lang="und">{{ c.title }}@if (c.subtitle) {<span> · {{ c.subtitle }}</span>}</h3>
        @if (c.text) {
          <div class="verso-resposta" [inert]="still()" [appGrowToFit]="c.text" [appGrowToFitMin]="fitMin()"><div class="verso-texto"><app-rich-text [text]="c.text" [fold]="true" [foldKey]="c.noteId" [links]="links()" /></div></div>
        } @else if (c.noteTitle !== c.title) {
          <p class="verso-nome">{{ c.noteTitle }}</p>
        } @else {
          <p class="verso-vazio">Esta anotação não tem texto.</p>
        }
      </div>
    }
  `,
  styleUrl: './study-card-back.scss',
})
export class StudyCardBack {
  /** A anotação da carta. */
  readonly note = input.required<string>();
  /**
   * Até quanto a resposta diminui para caber inteira, sem rolar (1: não diminui). Na parede, a carta é
   * pequena e diminui até 3/4; na mesa de estudo e na maximizada, cabe no tamanho de sempre ou rola.
   */
  readonly fitMin = input(1);
  /**
   * A anotação e a frente como estão no editor, ainda sem salvar (o palco da aba Flashcard, ui/flashcard-preview.ts):
   * o verso sai delas, e não do que está guardado.
   */
  readonly draft = input<{ note: Review; front: CardFront } | null>(null);
  /** Só para ver: o texto rola, mas nada nele se toca nem pega o foco (os links levariam para fora do editor). */
  readonly still = input(false);
  /** Tocou no papel, não no que o texto tem para tocar: quem deixa, vira a carta. */
  readonly turn = output<void>();

  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly ownLinks = inject(OwnNoteLinks);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly view = computed(() => {
    const id = this.note();
    const draft = this.draft();
    const card = draft ? { front: draft.front } : this.study.cardOf().get(id);
    const note = draft ? draft.note : this.store.get(id);
    if (!card || !note) return null;
    // no editor, a anotação nova pode ainda não ter nome: o título da frente, como ela está mostrando
    const title = frontTitle(card, note.game.name) || (draft ? 'Sem nome' : '');
    // a cartolina da anotação como o mural a desenha (sem cor escolhida, a sorteada pelo id)
    const stock = pinningFor(note.id, note.stock).stock;
    const dark = isDarkStock(stock);
    return {
      title,
      phrase: isPhraseTitle(title),
      subtitle: card.front.subtitle,
      look: { stock, dark, artId: artIdOf(note), paper: note.paper, paperSeed: note.paperSeed, vars: paperVars(note.paper, note.pattern, lookOf(note), note.patternSeed, dark, note.id) },
      noteId: note.id,
      noteTitle: note.game.name || title,
      text: note.text,
    };
  });

  /**
   * Os links do verso, os mesmos da ficha do mural (core/own-note-links.ts): sem eles, o "[[título|texto]]"
   * sairia com os colchetes, e o lembrete e a ficha colada não abririam.
   */
  protected readonly links = computed(() => this.ownLinks.of(this.note()));

  /** O texto volta ao começo: quem troca de carta no mesmo verso (a mesa de estudo) chama antes de mostrar. */
  toTop(): void {
    this.host.querySelector('.verso-conteudo')?.scrollTo(0, 0);
  }

  /** Onde o dedo ou o mouse apertou, para saber se o clique foi um toque ou o fim de um arrasto. */
  private pressed: { x: number; y: number } | null = null;

  protected onPress(e: PointerEvent): void {
    this.pressed = { x: e.clientX, y: e.clientY };
  }

  /** O toque no papel vira. O que o texto tem para tocar é dele, e quem marcou um trecho ou arrastou a barra de rolagem não pediu para virar. */
  protected onClick(e: MouseEvent): void {
    const at = e.target;
    const from = this.pressed;
    this.pressed = null;
    if (e.defaultPrevented || !(at instanceof Element)) return;
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > DRAG_PX) return;
    // só o que está dentro do verso (em volta dele, a página tem os seus [tabindex])
    const own = at.closest(OWN_TOUCH);
    if (own && this.host.contains(own)) return;
    if (at.classList.contains('verso-conteudo') && e.offsetX > at.clientWidth) return;
    if (getSelection()?.isCollapsed === false) return;
    this.turn.emit();
  }
}
