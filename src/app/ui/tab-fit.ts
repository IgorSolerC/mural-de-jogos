import { DestroyRef, Signal, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { MAX_TABS, NoteTab, splitTabs } from '../core/note-tabs';

/** O vão entre duas abas (o `gap` da fileira). */
const GAP = 3;

export interface TabFitOptions {
  /** O componente das abas: a fileira e a régua de medir moram nele. */
  host: HTMLElement;
  /** A fileira das abas em pé (o seletor, dentro do `host`); a régua escondida é a `.medida`. */
  row: string;
  /** As abas dos grupos, na ordem em que vão (null: nenhuma). */
  tabs: () => readonly NoteTab[] | null;
  /** A chave da aba aberta. */
  active: () => string;
  /** As abas vêm na ordem montada à mão: ficam em pé as primeiras dela (não as maiores). */
  ordered: () => boolean;
  /** As abas dos grupos escondidos, que vão sempre para o "Mais". */
  hidden: () => ReadonlySet<string> | undefined;
  /**
   * As abas fixas antes das dos grupos (o "Tudo" do mural, as Fixadas, as Compartilhadas), que sempre
   * ficam em pé: as chaves delas na régua de medir (`data-k`); cada uma tira o lugar de um grupo.
   */
  lead: () => readonly string[];
  /**
   * As abas da frente que podem ir para o "Mais" quando não sobra lugar para nenhum grupo (as especiais,
   * na ordem em que saem); a aberta fica sempre. Sem a opção, todas ficam.
   */
  droppable?: () => readonly string[];
}

/** Quais abas ficam em pé: as dos grupos, as que foram para o "Mais", e as da frente que também foram. */
export interface TabLayout {
  shown: NoteTab[];
  more: NoteTab[];
  /** As chaves das abas da frente que foram para o "Mais" (ver `droppable`). */
  leadMore: string[];
}

/**
 * Quais abas de divisória ficam em pé e quais vão para o "Mais" (ver `splitTabs`): as do mural de
 * anotações (NoteTabsBar) e as dos quadros do Kanban, com a mesma regra. Para saber o que cabe, uma
 * fileira escondida (`.medida`, cada aba com `data-k` = a chave dela, e o "Mais" com "mais") mede
 * cada aba de verdade; mede de novo quando as abas mudam, quando a fonte chega e quando a largura muda.
 *
 * Criada no construtor do componente (precisa do contexto de injeção).
 */
export class TabFit {
  /** A largura de cada aba, medida na régua escondida. */
  private readonly widths = signal<ReadonlyMap<string, number>>(new Map());
  /** A largura que a fileira tem para as abas. */
  private readonly room = signal(0);
  /** Quantas vezes as fontes terminaram de carregar. */
  private readonly fontsLoaded = signal(0);

  /** Quais ficam em pé e quais vão para o "Mais". Sem medida ainda, todas em pé (até o limite). */
  readonly layout: Signal<TabLayout>;

  constructor(private readonly o: TabFitOptions) {
    this.layout = computed(() => {
      const tabs = o.tabs() ?? [];
      const w = this.widths();
      const room = this.room();
      const measured = !!room && !!w.size;
      const active = o.active();
      const split = (lead: readonly string[]) => {
        if (!tabs.length) return { shown: [], more: [] };
        // cada aba da frente tira o lugar de um grupo (fica sempre pelo menos um)
        const slots = Math.max(1, MAX_TABS - lead.length);
        const fits = !measured
          ? undefined
          : (shown: readonly NoteTab[], more: boolean) => {
              let used = -GAP;
              for (const k of lead) used += GAP + (w.get(k) ?? 0);
              for (const x of shown) used += GAP + (w.get(x.key) ?? 0);
              if (more) used += GAP + (w.get('mais') ?? 0);
              return used <= room;
            };
        return splitTabs(tabs, active, fits, o.ordered(), o.hidden(), slots);
      };
      // as da frente, com o "Mais" ao lado se precisar, cabem e deixam lugar para algum grupo?
      const roomy = (lead: readonly string[], shown: readonly NoteTab[], more: boolean) => {
        if (!measured) return true;
        let used = -GAP;
        for (const k of lead) used += GAP + (w.get(k) ?? 0);
        if (more) used += GAP + (w.get('mais') ?? 0);
        return used <= room && (!tabs.length || shown.length > 0);
      };
      let lead = o.lead();
      const leadMore: string[] = [];
      let out = split(lead);
      for (const k of o.droppable?.() ?? []) {
        if (roomy(lead, out.shown, out.more.length > 0 || leadMore.length > 0)) break;
        if (k === active || !lead.includes(k)) continue;
        lead = lead.filter((x) => x !== k);
        leadMore.push(k);
        out = split(lead);
      }
      return { ...out, leadMore };
    });

    // a largura da fileira muda com a janela
    const ro = new ResizeObserver(() => this.measureRoom());
    ro.observe(o.host);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => ro.disconnect());

    // a fonte das abas chegou (na primeira visita, depois das abas desenhadas): mede de novo
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts) {
      const loaded = () => this.fontsLoaded.update((n) => n + 1);
      void fonts.ready.then(loaded);
      fonts.addEventListener('loadingdone', loaded);
      destroy.onDestroy(() => fonts.removeEventListener('loadingdone', loaded));
    }

    // cada vez que as abas mudam (nome, número), a régua escondida mede de novo
    afterRenderEffect(() => {
      o.tabs();
      o.lead();
      this.fontsLoaded();
      const next = new Map<string, number>();
      for (const el of Array.from(o.host.querySelectorAll<HTMLElement>('.medida [data-k]'))) next.set(el.dataset['k']!, el.offsetWidth);
      const now = this.widths();
      if (next.size !== now.size || [...next].some(([k, v]) => now.get(k) !== v)) this.widths.set(next);
      this.measureRoom();
    });
  }

  /** O espaço da fileira para as abas: a largura dela, sem o recuo dos lados. */
  private measureRoom(): void {
    const row = this.o.host.querySelector<HTMLElement>(this.o.row);
    if (!row) return;
    const cs = getComputedStyle(row);
    const room = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (Math.abs(room - this.room()) > 0.5) this.room.set(room);
  }
}
