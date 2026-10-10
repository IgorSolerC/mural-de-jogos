import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ChevronDown, LucideAngularModule, Plus } from 'lucide-angular';
import { ALL_TAB, NO_CATEGORY_TAB } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { WallMotion } from '../core/wall-motion';
import { pinningFor } from '../core/wall-physics';
import { WallGroup, WallState } from '../core/wall-view';
import { DoneStamp } from '../ui/done-stamp';
import { NoteIndex } from '../ui/note-index';
import { Pin } from '../ui/pin';
import { WallCardPool, WallCardProps, WallCards } from './wall-cards';

/** O que muda nas fichas conforme quem olha o mural (o dono ou quem visita); o resto vem da vista. */
export type WallAccess = Pick<WallCardProps, 'landingId' | 'picking' | 'picked' | 'masked' | 'secret' | 'reactCode' | 'checkable'>;

/**
 * A parede de um mural: as seções com as etiquetas que fecham (o maço preso com elástico), as fichas
 * (completas, inteiras em colagem, simples, só capa, ou a lista das anotações) e os cartões de
 * quando nada aparece; quantas a busca e os filtros acharam fica na pasta (WallToolbar). Lê a vista que a página fornece
 * (`WallState`): o seu mural e o de outra pessoa são a mesma parede, só muda `access` (o que o dono
 * pode fazer nas fichas) e o texto, que fala da pessoa quando o mural é dela.
 */
@Component({
  selector: 'app-wall-board',
  imports: [DoneStamp, LucideAngularModule, NoteIndex, Pin, WallCards],
  providers: [WallCardPool],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-board.html',
  styleUrl: './wall-board.scss',
})
export class WallBoard {
  protected readonly view = inject(WallState);
  private readonly settings = inject(Settings);
  private readonly motion = inject(WallMotion);
  private readonly pool = inject(WallCardPool);

  readonly access = input.required<WallAccess>();
  /** Tocou numa ficha (ou numa linha da lista): o id dela. */
  readonly opened = output<string>();
  /** Marcando para o lado a lado, tocou numa ficha. */
  readonly toggled = output<string>();
  /** "Nova anotação" no cartão de "Tudo finalizado" (só no seu mural). */
  readonly create = output<void>();

  protected readonly PlusIcon = Plus;
  protected readonly ChevronIcon = ChevronDown;

  /** De quem é o mural: null, o seu. */
  protected readonly owner = this.view.owner;
  /** O mural de anotações: o vazio fala de anotação, não de resenha. */
  protected readonly notes = this.view.notes;
  /** "ficha" nos murais de resenhas, "anotação" no de anotações. */
  protected readonly word = computed(() => (this.notes() ? 'anotação' : 'ficha'));
  /** As fichas inteiras: o texto todo, encaixadas em colagem (ver `appFichasMosaico`). */
  protected readonly inteira = computed(() => this.view.density() === 'inteira');
  /** A lista (o índice do caderno), só no mural de anotações. */
  protected readonly lista = computed(() => this.notes() && this.view.density() === 'lista');
  /**
   * As etiquetas das seções (Fixadas, Outubro de 2026…) à mostra: com a opção dos Ajustes, e nunca nas
   * fichas inteiras, onde a parede é uma colagem só (as etiquetas ficam só para os leitores de tela).
   */
  protected readonly labels = computed(() => this.settings.groupLabels() && !this.inteira());
  /** As seções fecham em todo mural, com as etiquetas à mostra (sem elas, não haveria como abrir). */
  protected readonly foldable = computed(() => this.labels());
  /** O dia da última anotação finalizada: o carimbo do "Tudo finalizado". */
  protected readonly lastDone = computed(() =>
    this.view.wall().reduce<string | null>((max, r) => (r.doneAt && (!max || r.doneAt > max) ? r.doneAt : max), null),
  );

  /** "do mural", "de Trabalho" com uma aba aberta; no mural de alguém, "de Marina". */
  protected readonly where = computed(() => {
    const tab = this.view.activeTabLabel();
    if (this.view.activeTab() === NO_CATEGORY_TAB) return 'sem categoria';
    if (tab) return `de ${tab}`;
    return this.owner() === null ? 'do mural' : `de ${this.owner()}`;
  });

  /** O que todas as fichas da parede recebem igual (ver WallCardPool). */
  private readonly cardProps = computed<WallCardProps>(() => ({
    ...this.access(),
    highlight: this.view.shownSort() === 'nota' ? this.view.activeScore() : null,
    compact: this.view.density() === 'simples',
    capas: this.view.density() === 'capas',
    full: this.inteira(),
    dayOnly: this.view.shownSort() === 'data',
    times: this.view.times(),
  }));

  constructor() {
    this.pool.props = this.cardProps;
    this.pool.onOpen = (id) => this.opened.emit(id);
    this.pool.onToggle = (id) => this.toggled.emit(id);
    // a ficha que saiu do mural (filtro, apagada) vai embora; as outras ficam, prontas
    effect(() => {
      const visible = this.view.visible();
      untracked(() => this.pool.keepOnly(visible));
    });
  }

  /**
   * O id da seção a partir da chave dela (que pode ter espaço, acento, ":"): continua o mesmo quando a
   * seção muda de lugar, para a etiqueta deslizar junto (ver WallMotion).
   */
  protected idOf(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}`);
  }

  /** Fecha ou abre uma seção; as de baixo deslizam para o lugar novo. */
  protected toggleGroup(key: string): void {
    const closing = !this.view.isCollapsed(key);
    this.motion.run(() => this.view.toggleCollapsed(key));
    // fechou agora: o elástico estala no maço (o que já vem fechado ao abrir o mural fica parado)
    if (closing) {
      clearTimeout(this.snapTimer);
      this.snapping.set(key);
      this.snapTimer = setTimeout(() => this.snapping.set(null), 900);
    }
  }

  /** A seção que acabou de fechar: o elástico dela estala (ver `.estalando` no wall-board.scss). */
  protected readonly snapping = signal<string | null>(null);
  private snapTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * O maço da seção fechada: as primeiras fichas (até quatro), nas cores das cartolinas, a de cima por
   * último e reta; as de baixo, um pouco tortas, mostram só a beirada.
   */
  protected bundle(g: WallGroup): { color: string; transform: string | null }[] {
    const tilts = ['rotate(-8 32 22) translate(-2 2)', 'rotate(6 32 22) translate(2 1)', 'rotate(-3 32 22) translate(-1 0)'];
    const cards = g.reviews.slice(0, 4).reverse();
    return cards.map((r, i) => ({
      color: `var(--stock-${pinningFor(r.id, r.stock).stock})`,
      transform: i === cards.length - 1 ? null : tilts[(tilts.length - (cards.length - 1) + i) % tilts.length],
    }));
  }

  protected clearFilters(): void {
    this.motion.run(() => this.view.clearFilters());
  }

  /** A busca sai da aba e procura no mural inteiro. */
  protected searchAll(): void {
    this.motion.run(() => this.view.setNoteTab(ALL_TAB));
  }

  protected showDone(): void {
    this.motion.run(() => this.view.showDone.set(true));
  }
}
