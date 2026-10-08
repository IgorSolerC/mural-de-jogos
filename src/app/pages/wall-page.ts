import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChevronDown, ListChecks, LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { Mural } from '../core/mural';
import { Settings } from '../core/settings';
import { SideBySide } from '../core/side-by-side';
import { WallMotion } from '../core/wall-motion';
import { FilterTag } from '../core/wall-filter';
import { WallGroup, WallView } from '../core/wall-view';
import { pinningFor } from '../core/wall-physics';
import { FilterTags } from '../ui/filter-sheet';
import { Pin } from '../ui/pin';
import { PickTray } from '../ui/pick-tray';
import { WallToolbar } from '../ui/wall-toolbar';
import { isNotes } from '../core/kinds';
import { Reactions } from '../core/reactions';
import { WallCardPool, WallCardProps, WallCards } from './wall-cards';
import { DoneStamp } from '../ui/done-stamp';
import { NoteIndex } from '../ui/note-index';
import { ALL_TAB, NO_CATEGORY_TAB } from '../core/note-tabs';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [DoneStamp, FilterTags, LucideAngularModule, NoteIndex, PickTray, Pin, RouterLink, WallCards, WallToolbar],
  providers: [WallCardPool],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-page.html',
  styleUrl: './wall-page.scss',
})
export class WallPage {
  protected readonly mural = inject(Mural);
  protected readonly view = inject(WallView);
  protected readonly desk = inject(Desk);
  protected readonly settings = inject(Settings);
  protected readonly side = inject(SideBySide);
  private readonly motion = inject(WallMotion);
  private readonly pool = inject(WallCardPool);
  private readonly reactions = inject(Reactions);

  protected readonly PlusIcon = Plus;
  protected readonly TasksIcon = ListChecks;
  protected readonly ChevronIcon = ChevronDown;
  /** As seções fecham em todo mural, com as etiquetas à mostra (sem elas, não haveria como abrir). */
  protected readonly foldable = computed(() => this.settings.groupLabels());
  /** O mural de anotações: o vazio fala de anotação, não de resenha. */
  protected readonly notes = computed(() => isNotes(this.mural.kind()));
  protected readonly ghosts = [0, 1, 2];
  /** O dia da última anotação finalizada: o carimbo do "Tudo finalizado". */
  protected readonly lastDone = computed(() =>
    this.mural.wall().reduce<string | null>((max, r) => (r.doneAt && (!max || r.doneAt > max) ? r.doneAt : max), null),
  );
  /** "ficha" nos murais de resenhas, "anotação" no de anotações. */
  protected readonly word = computed(() => (this.notes() ? 'anotação' : 'ficha'));
  protected readonly highlight = computed(() => (this.view.shownSort() === 'nota' ? this.view.activeScore() : null));
  /** O que todas as fichas da parede recebem igual (ver WallCardPool). */
  private readonly cardProps = computed<WallCardProps>(() => ({
    landingId: this.desk.landingId(),
    highlight: this.highlight(),
    compact: this.view.density() === 'simples',
    capas: this.view.density() === 'capas',
    dayOnly: this.view.shownSort() === 'data',
    picking: this.side.picking(),
    picked: this.side.order(),
    masked: this.settings.noSpoilers(),
    times: this.times(),
    reactCode: this.reactions.myCode(),
    // marcando para o lado a lado, o toque na ficha é para marcar
    checkable: !this.side.picking(),
  }));
  /** As obras com rejogada: a original fica sabendo quantas vezes está no mural. */
  private readonly times = computed(() => {
    const out = new Map<string, number>();
    for (const r of this.mural.wall()) if (r.revisitOf) out.set(r.revisitOf, (out.get(r.revisitOf) ?? 1) + 1);
    return out;
  });

  constructor() {
    // sair do mural encerra a marcação
    inject(DestroyRef).onDestroy(() => this.side.picking.set(false));
    this.pool.props = this.cardProps;
    this.pool.onOpen = (id) => this.desk.openReview(id);
    this.pool.onToggle = (id) => this.side.toggle(id);
    // a ficha que saiu do mural (filtro, apagada) vai embora; as outras ficam, prontas
    effect(() => {
      const visible = this.view.visible();
      untracked(() => this.pool.keepOnly(visible));
    });
  }

  protected clearFilters(): void {
    this.motion.run(() => this.view.clearFilters());
  }

  /** "do mural", ou "de Trabalho" com uma aba aberta. */
  protected readonly where = computed(() => {
    const tab = this.view.activeTabLabel();
    if (this.view.activeTab() === NO_CATEGORY_TAB) return 'sem categoria';
    return tab ? `de ${tab}` : 'do mural';
  });

  /** A lista (o índice do caderno), só no mural de anotações. */
  protected readonly lista = computed(() => this.notes() && this.view.density() === 'lista');

  /**
   * O id da seção a partir da chave dela (que pode ter espaço, acento, ":"): continua o mesmo quando a
   * seção muda de lugar, para a etiqueta deslizar junto (ver WallMotion).
   */
  protected idOf(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}`);
  }

  /** Fecha ou abre uma seção; as de baixo deslizam para o lugar novo. */
  protected toggleGroup(key: string): void {
    this.motion.run(() => this.view.toggleCollapsed(key));
  }

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

  /** A busca sai da aba e procura no mural inteiro. */
  protected searchAll(): void {
    this.motion.run(() => this.view.setNoteTab(ALL_TAB));
  }

  protected showDone(): void {
    this.motion.run(() => this.view.showDone.set(true));
  }

  protected removeTag(t: FilterTag): void {
    this.motion.run(() => this.view.toggle(t.key, t.value));
  }
}
