import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryLook } from '../core/category-looks';
import { NO_TABS, tabKeyOf } from '../core/note-tabs';
import { CategoryLabel } from './category-label';
import { ICON, IconModule } from './icons';
import { TabFit } from './tab-fit';
import { TabMore, TabMoreItem } from './tab-more';

/** Um grupo como aba dos Flashcards. */
export interface StudyTab {
  /** O id do grupo no endereço (`studyGroupId`). */
  id: string;
  /** A chave do grupo (a do quadro do Kanban). */
  key: string;
  label: string;
  look: CategoryLook;
  color: string | null;
  /** Quantas para hoje, no número da aba (0: sem número). */
  today: number;
  /** O que a linha do grupo no "Mais" diz ao leitor de tela. */
  say: string;
  /** No "Mais", a linha sem número (um 0 não diria nada). */
  quiet: boolean;
  /** O peso da aba na régua (ui/tab-fit.ts): o tamanho do grupo, e o total com os escondidos. */
  n: number;
  total: number;
}

/** A chave do Tudo na régua das abas. */
const ALL_TAB = 'tudo';

/**
 * As abas dos Flashcards, uma só para os seus e para os de quem você visita (a regra "Visita: as mesmas peças do
 * dono", no CLAUDE.md): Tudo e os grupos, nas divisórias de manilha do mural e do Kanban, com o ícone e a cor de cada
 * grupo; os que não cabem em pé (e os escondidos) vão para o "Mais", a lista de feltro (ui/tab-more.ts). Quem usa dá
 * os grupos na ordem, o endereço de cada um e, nos seus, a ordem montada à mão e os escondidos.
 */
@Component({
  selector: 'app-study-group-tabs',
  imports: [CategoryLabel, IconModule, RouterLink, TabMore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-group-tabs.html',
  styleUrl: './study-group-tabs.scss',
})
export class StudyGroupTabs {
  readonly tabs = input.required<readonly StudyTab[]>();
  /** O grupo aberto (o id; null: Tudo). */
  readonly active = input<string | null>(null);
  /** O endereço de Tudo (sem id) ou de um grupo. */
  readonly path = input.required<(group?: string | null) => string>();
  /** O nome da fileira, para o leitor de tela. */
  readonly label = input('Grupos dos Flashcards');
  /** As abas vêm na ordem montada à mão: ficam em pé as primeiras (não as maiores). */
  readonly ordered = input(false);
  /** As abas que vão sempre para o "Mais" (pela chave da régua, `tabKeyOf`). */
  readonly hidden = input<ReadonlySet<string>>(NO_TABS);
  /** Um grupo escolhido no "Mais": o id dele. */
  readonly chosen = output<string>();

  protected readonly AllIcon = ICON.camadas;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly tabKey = tabKeyOf;
  protected readonly allTab = ALL_TAB;

  protected readonly open = computed(() => {
    const id = this.active();
    return (id && this.tabs().find((g) => g.id === id)) || null;
  });

  /**
   * Quais abas ficam em pé e quais vão para o "Mais", com a régua das abas do mural e do Kanban (ver ui/tab-fit.ts):
   * o Tudo sempre na frente, os grupos escondidos no "Mais" (menos o aberto).
   */
  private readonly fit = new TabFit({
    host: inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    row: '.abas-grupos .abas:not(.medida)',
    tabs: () => this.tabs().map((g) => ({ key: tabKeyOf(g.key), label: g.label, n: g.n, total: g.total })),
    active: () => (this.open() ? tabKeyOf(this.open()!.key) : ALL_TAB),
    ordered: () => this.ordered(),
    hidden: () => this.hidden(),
    lead: () => [ALL_TAB],
  });
  protected readonly shown = computed(() => {
    const keys = new Set(this.fit.layout().shown.map((t) => t.key));
    return this.tabs().filter((g) => keys.has(tabKeyOf(g.key)));
  });
  private readonly more = computed(() => {
    const keys = new Set(this.fit.layout().more.map((t) => t.key));
    return this.tabs().filter((g) => keys.has(tabKeyOf(g.key)));
  });
  /** O "Mais": cada grupo com o número dele. */
  protected readonly moreItems = computed<TabMoreItem[]>(() => this.more().map((g) => ({ key: g.id, label: g.label, n: g.today, look: g.look, say: g.say, quiet: g.quiet })));
  /** O grupo aberto é um dos do "Mais": ele mostra o nome dele, como aba aberta. */
  protected readonly moreOn = computed(() => this.more().find((g) => g.id === this.active()) ?? null);

  /** Abre o grupo escolhido no "Mais". */
  protected choose(id: string): void {
    if (id && id !== this.active()) this.chosen.emit(id);
  }
}
