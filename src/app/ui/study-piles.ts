import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Stock } from '../core/review';
import { CardFace, Deck } from '../core/study';
import { QueueCounts } from '../core/study-queue';
import { ICON, IconModule } from './icons';
import { NearScreen } from './near-screen';
import { StudyCard } from './study-card';

/** Um baralho como pilha: a carta de cima, as cartolinas de baixo e, nos seus, os montes de hoje. */
export interface StudyPile {
  deck: Deck;
  /** Quantas cartas o baralho tem. */
  cards: number;
  /** A carta de cima da pilha (null: o baralho sem cartas). */
  top: { title: string; subtitle?: string; image?: string; stock: Stock; face: CardFace | null } | null;
  /** As cartolinas das cartas logo embaixo da de cima (até três): as costas da pilha. */
  under: Stock[];
  /** Os montes de hoje, no papelzinho do elástico (null: sem papelzinho, como na visita: os montes são da dona). */
  counts: QueueCounts | null;
  /** Quantas para hoje. */
  today: number;
}

/**
 * Os baralhos de um grupo como pilhas de cartas presas com um elástico na cor de cada um, o nome numa tira de papel
 * embaixo: uma peça só para os seus Flashcards e para os de quem você visita (a regra "Visita: as mesmas peças do
 * dono", no CLAUDE.md). Nos seus, o papelzinho preso no elástico diz os montes de hoje (ou "em dia") e a tira diz se
 * o baralho é público. Cada pilha é o link do baralho e leva `data-baralho` (o menu do botão direito da página).
 */
@Component({
  selector: 'app-study-piles',
  imports: [IconModule, NearScreen, RouterLink, StudyCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-piles.html',
  styleUrl: './study-piles.scss',
})
export class StudyPiles {
  readonly piles = input.required<readonly StudyPile[]>();
  /** O nome da lista, para o leitor de tela ("Baralhos de Japonês"). */
  readonly label = input.required<string>();
  /** O endereço de um baralho. */
  readonly link = input.required<(deck: Deck) => string>();
  /** A tira diz quando o baralho é público (nos seus: quem visita vê). */
  readonly publicMark = input(false);

  /** O baralho público: as pessoas do "Público" do editor da anotação. */
  protected readonly PublicIcon = ICON.pessoas;

  protected countLabel(n: number): string {
    return n === 1 ? '1 flashcard' : `${n} flashcards`;
  }

  /** O que o leitor de tela diz da pilha: o nome, quantas cartas e, nos seus, se é público e quantas para hoje. */
  protected say(p: StudyPile): string {
    return p.deck.name + ', ' + this.countLabel(p.cards) + (this.publicMark() && p.deck.public ? ', público' : '') + (p.counts && p.today ? ', ' + p.today + ' para hoje' : '');
  }

  /** Quantas camadas a pilha desenha embaixo da de cima: mais cartas, mais grossa (até três). */
  protected layers(n: number): number[] {
    return Array.from({ length: n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0 }, (_, i) => i);
  }
}
