import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { reducedMotion } from '../core/motion';
import { Stock } from '../core/review';
import { CardFace, Deck } from '../core/study';
import { StudyCard as Card } from './study-card';
import { StudyCardBack } from './study-card-back';
import { StudyCardFocus } from './study-card-focus';
import { ContextMenu, ContextMenuTrigger, MENU_CLASS, MenuBy, MenuItem, MenuSections } from './context-menu';
import { ICON, IconModule } from './icons';
import { NearPool, NearScreen } from './near-screen';

/** Uma carta como a parede mostra: a frente, a cartolina da anotação e o que se diz dela. */
export interface WallCard {
  /** A anotação da carta. */
  note: string;
  title: string;
  subtitle?: string;
  image?: string;
  stock: Stock;
  /** O progresso na frente (null: sem progresso à mostra, como na visita com ele escondido). */
  face: CardFace | null;
  /** O que o leitor de tela diz da carta (o título e, com o progresso, o nível e a volta). */
  label: string;
  /** A dica do mouse na carta pequena, onde a letra não se lê. */
  hint: string;
  /** O giro da carta na parede. */
  tilt: number;
}

/** Quanto a carta pequena cresce ao virar: da miniatura ao tamanho das grandes (o --escala de study-card-wall.scss). */
const SMALL_GROWS = 2.5;
/** A folga da carta pequena crescida até a beira da tela. */
const SCREEN_GAP = 8;
/** Nada virado. */
const NO_CARDS: ReadonlySet<string> = new Set();

/**
 * A parede de um baralho, uma só para os seus Flashcards e para os de quem você visita (a regra "Visita: as mesmas
 * peças do dono", no CLAUDE.md): as cartas deitadas, a frente à mostra; tocar vira ali mesmo (das grandes, várias;
 * das pequenas, uma de cada vez, crescendo por cima das vizinhas); a etiqueta de tinta do hover maximiza, abre a
 * anotação e, só no seu baralho (`editable`), edita; o botão direito abre o mesmo menu, com o que só o dono faz
 * (`ownerMenu`) depois. Nada aqui conta como estudo, e nada se guarda.
 *
 * O verso e a maximizada leem a carta pela fonte dos Flashcards (core/study-source.ts): a sua, ou a da visita.
 */
@Component({
  selector: 'app-study-card-wall',
  imports: [Card, ContextMenu, IconModule, NearScreen, StudyCardBack, StudyCardFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-card-wall.html',
  styleUrl: './study-card-wall.scss',
  host: {
    '(document:click)': 'clickedAround($event)',
    '(document:keydown.escape)': 'escapeAround($event)',
    '(window:resize)': 'resized()',
  },
})
export class StudyCardWall {
  readonly deck = input.required<Deck>();
  /** As cartas, já filtradas e na ordem escolhida. */
  readonly cards = input.required<readonly WallCard[]>();
  /** As cartas pequenas, para ver o baralho inteiro. */
  readonly small = input(false);
  /** O baralho é seu: a etiqueta tem o editar. */
  readonly editable = input(false);
  /** O que só o dono faz no menu de uma carta (editar, o progresso, tirar do baralho), depois do que todos fazem. */
  readonly ownerMenu = input<((note: string) => MenuSections) | null>(null);
  /** Ler a anotação da carta. */
  readonly read = output<string>();
  /** Editar a carta (só com `editable`). */
  readonly edit = output<string>();

  protected readonly MaximizeIcon = ICON.aumentar;
  protected readonly ReadIcon = ICON.livros;
  protected readonly AdjustIcon = ICON.ajustar;
  protected readonly calm = reducedMotion();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** A carta maximizada (o id da anotação). */
  protected readonly focused = signal<string | null>(null);
  /** As cartas com o verso à mostra. Fica só na memória da página: virar não é estudar, e nada se guarda. */
  protected readonly flipped = signal<ReadonlySet<string>>(NO_CARDS);
  /** As cartas já viradas neste baralho: o verso delas fica montado, para o giro de volta. */
  protected readonly turnedOnce = signal<ReadonlySet<string>>(NO_CARDS);
  /** O que a voz do leitor de tela diz ao virar. */
  protected readonly spoken = signal('');

  /** O menu do botão direito numa carta (ui/context-menu.ts): a anotação dela. */
  protected readonly menuOn = signal<string | null>(null);
  private readonly menu = viewChild<ContextMenu>('menu');
  /** O nome no alto do menu: a frente (pode ser um kanji só) com o baralho, que diz de onde ela é. */
  protected readonly menuCaption = computed(() => {
    const note = this.menuOn();
    const title = note ? (this.cards().find((c) => c.note === note)?.title ?? '') : '';
    return title && `${title} · ${this.deck().name}`;
  });
  protected readonly menuSections = computed<MenuSections>(() => {
    const note = this.menuOn();
    return note ? this.cardMenu(note) : [];
  });

  constructor() {
    // outra ordem, outro filtro, outro tamanho: o que está na tela é montado antes da pintura, sem passar por uma
    // tela de vagas (ver ui/near-screen.ts); e a carta pequena crescida pode ter mudado de casa
    const nearPool = inject(NearPool);
    afterRenderEffect(() => {
      this.cards();
      this.small();
      nearPool.settle();
      this.resized();
    });
    // outro baralho (o mesmo, com outro nome ou vindo de outro aparelho, não conta): as frentes à mostra de novo,
    // e a carta maximizada, que era do outro, fecha
    const deckId = computed(() => this.deck().id);
    effect(() => {
      deckId();
      untracked(() => {
        this.flipped.set(NO_CARDS);
        this.turnedOnce.set(NO_CARDS);
        this.focused.set(null);
      });
    });
    // outro tamanho: as cartas voltam para a frente (a pequena virada é só uma)
    effect(() => {
      this.small();
      untracked(() => this.flipped.set(NO_CARDS));
    });
    // o botão direito, o dedo segurado ou Shift+F10 numa carta abre o menu dela
    new ContextMenuTrigger({
      host: this.host,
      targets: '[data-carta]',
      keyOf: (box) => {
        const note = box.dataset['carta'];
        return note && this.cards().some((c) => c.note === note) ? `carta:${note}` : null;
      },
      hold: true,
      isOpenFor: (key) => !!this.menu()?.isOpenFor(key),
      open: (key, box, x, y, by) => this.openMenu(key, box, x, y, by),
    });
  }

  /**
   * Tocou na carta: ela vira ali mesmo. Nada conta como estudo. Das grandes, várias ficam viradas, como cartas na
   * mesa; das pequenas, que crescem por cima das vizinhas, uma de cada vez.
   */
  protected flip(note: string, li: HTMLElement): void {
    const small = this.small();
    const back = !this.flipped().has(note);
    if (back && small) this.keepOnScreen(li);
    if (!back) this.keepFocus(li);
    this.flipped.update((set) => {
      const next = new Set(small ? [] : set);
      if (back) next.add(note);
      else next.delete(note);
      return next;
    });
    if (back && !this.turnedOnce().has(note)) this.turnedOnce.update((set) => new Set(set).add(note));
    this.say(back ? 'Verso' : 'Frente', note);
  }

  /** O Esc com o foco na carta virada: ela volta para a frente, e o de fora não mexe em mais nenhuma. */
  protected unflip(note: string, li: HTMLElement, e: Event): void {
    if (!this.flipped().has(note)) return;
    e.stopPropagation();
    this.keepFocus(li);
    this.turnBack(note);
  }

  /**
   * O Esc com o foco em outro lugar: a carta pequena crescida volta (ela cobre as vizinhas, e o foco pode nem estar
   * nela). As grandes não cobrem nada: só voltam com o Esc nelas. Os diálogos e os campos têm o Esc deles.
   */
  protected escapeAround(e: Event): void {
    const grown = this.small() ? [...this.flipped()][0] : undefined;
    if (!grown || document.querySelector('dialog:modal')) return;
    // (o Esc do menu do botão direito fecha só o menu)
    if (e.target instanceof Element && e.target.closest(`input, textarea, select, app-tab-more, .${MENU_CLASS}`)) return;
    this.turnBack(grown);
  }

  /**
   * A carta pequena crescida fecha com um toque fora dela (na outra carta, é o toque dela que troca; no menu do
   * botão direito, é a escolha que decide).
   */
  protected clickedAround(e: Event): void {
    const grown = this.small() ? [...this.flipped()][0] : undefined;
    if (!grown || (e.target instanceof Element && e.target.closest(`.carta-li.virada, .carta-btn, dialog, .${MENU_CLASS}`))) return;
    this.turnBack(grown);
  }

  /** A janela mudou: a carta pequena crescida é empurrada de novo, para continuar dentro da tela. */
  protected resized(): void {
    const li = this.small() ? this.host.querySelector<HTMLElement>('.carta-li.virada') : null;
    if (li) this.keepOnScreen(li);
  }

  private turnBack(note: string): void {
    this.flipped.update((set) => {
      const next = new Set(set);
      next.delete(note);
      return next;
    });
    this.say('Frente', note);
  }

  private say(side: 'Frente' | 'Verso', note: string): void {
    this.spoken.set(`${side} de ${this.cards().find((c) => c.note === note)?.title ?? 'flashcard'}`);
  }

  /** O foco dentro do verso que vai ficar de costas cairia na página: passa para a carta. */
  private keepFocus(li: HTMLElement): void {
    const at = document.activeElement;
    if (at?.closest('.verso') && li.contains(at)) li.querySelector<HTMLElement>('.carta-btn')?.focus({ preventScroll: true });
  }

  /**
   * A carta pequena cresce em volta do meio dela, e o giro a empurra daí: para baixo, com o topo na linha da
   * miniatura (sem cobrir a régua em cima), e para dentro, se passar da beira da tela.
   */
  private keepOnScreen(li: HTMLElement): void {
    const box = li.getBoundingClientRect();
    const view = document.documentElement;
    const push = (size: number, centered: number, wanted: number, screen: number): number => {
      const grown = size * SMALL_GROWS;
      const at = Math.max(SCREEN_GAP, Math.min(wanted, screen - SCREEN_GAP - grown));
      return Math.round(at - (centered - grown / 2));
    };
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    li.style.setProperty('--empurra-x', `${push(box.width, x, x - (box.width * SMALL_GROWS) / 2, view.clientWidth)}px`);
    li.style.setProperty('--empurra-y', `${push(box.height, y, box.top, view.clientHeight)}px`);
  }

  /** Abre o menu da carta; o foco volta para o botão de virar ao fechar. */
  private openMenu(key: string, box: HTMLElement, x: number, y: number, by: MenuBy): void {
    this.menuOn.set(key.slice(key.indexOf(':') + 1));
    this.menu()?.show({ key, x, y, by, back: box.querySelector<HTMLElement>('.carta-btn') });
  }

  /** O menu de uma carta: virar, maximizar e ler a anotação (o que a etiqueta de tinta faz), e o que só o dono faz. */
  private cardMenu(note: string): MenuSections {
    if (!this.cards().some((c) => c.note === note)) return [];
    const up = this.flipped().has(note);
    const look: MenuItem[] = [
      { id: 'virar', label: up ? 'Virar de volta' : 'Virar o flashcard', icon: up ? ICON.esconder : ICON.ver, hint: up ? 'A frente de novo' : 'Atrás está a anotação', run: () => this.flipFromMenu(note) },
      { id: 'maximizar', label: 'Maximizar', icon: ICON.aumentar, dialog: true, run: () => this.focused.set(note) },
      { id: 'ler', label: 'Ler a anotação', icon: ICON.livros, dialog: true, run: () => this.read.emit(note) },
    ];
    return [look, ...(this.ownerMenu()?.(note) ?? [])];
  }

  /** Virar pelo menu: a carta como está agora na parede (ela pode ter sido redesenhada com o menu aberto). */
  private flipFromMenu(note: string): void {
    const li = this.host.querySelector<HTMLElement>(`.carta-li[data-carta="${CSS.escape(note)}"]`);
    if (li) this.flip(note, li);
  }
}
