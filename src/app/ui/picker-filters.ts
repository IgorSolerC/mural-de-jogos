import { ChangeDetectionStrategy, Component, Signal, computed, inject, input, model, signal } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { Kind, NOTES } from '../core/kinds';
import { Review, fold, isDone } from '../core/review';
import { Settings } from '../core/settings';
import { activeOrder } from '../core/mural-config';
import { NO_CATEGORY_TAB, noteTabKey, noteTabsOf } from '../core/note-tabs';
import { categoryColorHex, lookKey } from '../core/category-looks';
import { categoryIcon } from './category-label';
import { SubjectChip } from './subject-chips';
import { TagChip, TagChips } from './tag-chips';
import { kindTabs } from './picker-kit';

/** O "Sem assunto" no filtro (como no mural e no Kanban). */
const NO_SUBJECT = 'sem';

/** A chave do assunto de uma anotação no filtro: sem acento nem caixa, ou "sem". */
function subjectKey(r: Review): string {
  return r.subject ? fold(r.subject) : NO_SUBJECT;
}

/** As tags de uma anotação, sem acento nem caixa. */
function tagKeys(r: Review): string[] {
  return (r.tags ?? []).map(fold);
}

/** Um grupo no filtro do seletor: a chave da aba (ver `noteTabKey`), o nome, o desenho, a cor e quantas. */
export interface GroupChip {
  key: string;
  label: string;
  icon: LucideIconData | null;
  color: string | null;
  n: number;
  on: boolean;
}

/**
 * O que filtra as anotações num seletor de fichas (o "Escolher a nota" e o "Escolher fichas" do
 * perfil), além do mural e da busca: o grupo, o assunto (um nível abaixo do grupo), as tags e as
 * finalizadas. Só vale com a lista nas anotações (os outros murais não têm grupo nem tag); as
 * finalizadas valem em qualquer aba, porque só a anotação se finaliza.
 *
 * As contagens são as do mural e do Kanban: cada filtro conta quantas ele deixaria com os outros
 * ligados (o grupo, com a busca e as tags; o assunto, com o grupo e as tags; a tag, com o grupo e o
 * assunto). O grupo é um só (é a pasta da anotação); o assunto e as tags, vários (vale qualquer um).
 * Mudar de grupo esquece os assuntos, que são de cada grupo.
 */
export class CardFilters {
  readonly group = signal<string | null>(null);
  readonly subjects = signal<readonly string[]>([]);
  readonly tags = signal<readonly string[]>([]);
  /** As tags escondidas: "todas, menos estas" (o clique direito, como no mural). */
  readonly outs = signal<readonly string[]>([]);
  readonly hideDone = signal(false);

  private readonly settings = inject(Settings);

  constructor(
    /** As fichas que podem ser escolhidas, de todos os murais da lista. */
    private readonly cards: Signal<readonly Review[]>,
    /** O mural da lista (null: todos). */
    private readonly kind: Signal<Kind | null>,
    /** A busca pelo nome. */
    private readonly query: Signal<string>,
    /** O grupo fixo (o "Buscar nota" do quadro de um grupo): sem as abas dos grupos, com os assuntos dele. */
    private readonly fixedGroup: Signal<string | null> = signal(null),
  ) {}

  /** A lista está nas anotações: o grupo, o assunto e as tags valem. */
  readonly notesScope = computed(() => this.kind() === NOTES);

  /** As do mural escolhido, sem as finalizadas quando escondidas (sem a busca: a ordem dos filtros não pula enquanto se digita). */
  private readonly scope = computed(() => {
    const kind = this.kind();
    const noDone = this.hideDone();
    return this.cards().filter((r) => (!kind || r.kind === kind) && !(noDone && isDone(r)));
  });

  /** As do mural escolhido e da busca, sem as finalizadas quando escondidas. */
  private readonly base = computed(() => {
    const q = fold(this.query().trim());
    return q ? this.scope().filter((r) => fold(r.game.name).includes(q)) : this.scope();
  });

  /** Quantas finalizadas a lista tem (com o mural e a busca): sem nenhuma, não há o que esconder. */
  readonly doneCount = computed(() => {
    const kind = this.kind();
    const q = fold(this.query().trim());
    return this.cards().filter((r) => isDone(r) && (!kind || r.kind === kind) && (!q || fold(r.game.name).includes(q))).length;
  });

  private found(r: Review): boolean {
    const q = fold(this.query().trim());
    return !q || fold(r.game.name).includes(q);
  }

  private inGroup(r: Review): boolean {
    const g = this.group();
    return !g || noteTabKey(r) === g;
  }

  private bySubject(r: Review): boolean {
    const on = this.subjects();
    return !on.length || on.includes(subjectKey(r));
  }

  private byTags(r: Review): boolean {
    const on = this.tags();
    const out = this.outs();
    const keys = tagKeys(r);
    return (!on.length || keys.some((k) => on.includes(k))) && !keys.some((k) => out.includes(k));
  }

  /**
   * As abas dos grupos, na ordem das do mural (a montada à mão, se houver; senão, dos maiores para os
   * menores, contando todos), cada uma com quantas deixaria com a busca e as tags de agora.
   */
  readonly groupChips = computed<GroupChip[]>(() => {
    if (!this.notesScope() || this.fixedGroup()) return [];
    const tabs = noteTabsOf(this.scope(), undefined, 'Sem grupo', activeOrder(this.settings.notesConfig())).tabs;
    const n = new Map<string, number>();
    for (const r of this.base()) if (this.byTags(r)) n.set(noteTabKey(r), (n.get(noteTabKey(r)) ?? 0) + 1);
    const looks = this.settings.categoryLooks();
    const on = this.group();
    return tabs.map((t) => {
      const look = t.key === NO_CATEGORY_TAB ? {} : (looks[lookKey(t.label)] ?? {});
      return {
        key: t.key,
        label: t.label,
        icon: t.key === NO_CATEGORY_TAB ? null : categoryIcon(t.label, look),
        color: categoryColorHex(look.color),
        n: n.get(t.key) ?? 0,
        on: t.key === on,
      };
    });
  });

  /**
   * Os assuntos do grupo ligado (ou do fixo), de A a Z e "Sem assunto" no fim, como os do mural.
   * Sem grupo escolhido não aparecem: o assunto é de cada grupo, e a "História" dos Estudos não é a do
   * Trabalho.
   */
  readonly subjectChips = computed<SubjectChip[]>(() => {
    if (!this.notesScope()) return [];
    const g = this.group();
    if (!this.fixedGroup() && (!g || g === NO_CATEGORY_TAB)) return [];
    const on = new Set(this.subjects());
    const seen = new Map<string, { spell: Map<string, number>; n: number }>();
    for (const r of this.scope()) {
      if (!this.inGroup(r)) continue;
      const k = subjectKey(r);
      const e = seen.get(k) ?? { spell: new Map<string, number>(), n: 0 };
      if (r.subject) e.spell.set(r.subject, (e.spell.get(r.subject) ?? 0) + 1);
      if (this.found(r) && this.byTags(r)) e.n++;
      seen.set(k, e);
    }
    if (![...seen.keys()].some((k) => k !== NO_SUBJECT)) return [];
    for (const k of on) if (!seen.has(k)) seen.set(k, { spell: new Map(), n: 0 });
    const chips = [...seen].map(([value, e]) => ({
      value,
      label: value === NO_SUBJECT ? 'Sem assunto' : e.spell.size ? [...e.spell].reduce((a, x) => (x[1] > a[1] ? x : a))[0] : value,
      n: e.n,
      on: on.has(value),
    }));
    return chips.sort((a, b) => (a.value === NO_SUBJECT ? 1 : b.value === NO_SUBJECT ? -1 : a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })));
  });

  /**
   * As tags das anotações do grupo e do assunto, as mais usadas primeiro, como as do mural; cada uma
   * com quantas deixaria com a busca e as outras tags (a escondida, quantas ela tira).
   */
  readonly tagChips = computed<TagChip[]>(() => {
    if (!this.notesScope()) return [];
    const on = new Set(this.tags());
    const out = new Set(this.outs());
    const seen = new Map<string, { spell: Map<string, number>; uses: number; n: number; hides: number }>();
    for (const r of this.scope()) {
      if (!this.inGroup(r) || !this.bySubject(r)) continue;
      const found = this.found(r);
      const shown = found && this.byTags(r);
      for (const k of new Set(tagKeys(r))) {
        const e = seen.get(k) ?? { spell: new Map<string, number>(), uses: 0, n: 0, hides: 0 };
        e.uses++;
        if (shown) e.n++;
        if (found) e.hides++;
        seen.set(k, e);
      }
      for (const t of r.tags ?? []) {
        const m = seen.get(fold(t))!.spell;
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    for (const k of [...on, ...out]) if (!seen.has(k)) seen.set(k, { spell: new Map(), uses: 0, n: 0, hides: 0 });
    return [...seen]
      .map(([value, e]) => {
        const label = e.spell.size ? [...e.spell].reduce((a, x) => (x[1] > a[1] ? x : a))[0] : value;
        return out.has(value) ? { value, label, n: e.hides, on: false, out: true, uses: e.uses } : { value, label, n: e.n, on: on.has(value), uses: e.uses };
      })
      .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }))
      .map(({ uses: _u, ...chip }) => chip);
  });

  /** Algum filtro de anotação ligado (o grupo, o assunto ou as tags). */
  readonly active = computed(() => this.notesScope() && (!!this.group() || this.subjects().length > 0 || this.tags().length > 0 || this.outs().length > 0));

  /** Quantas a lista teria sem o grupo, o assunto e as tags (o "de N" do "Mostrando"). */
  readonly before = computed(() => this.base().length);

  /** A lista com tudo: o mural, a busca, as finalizadas e, nas anotações, o grupo, o assunto e as tags. */
  readonly matching = computed(() => {
    const list = this.base();
    if (!this.notesScope()) return list;
    return list.filter((r) => this.inGroup(r) && this.bySubject(r) && this.byTags(r));
  });

  /** Um toque no grupo: liga (só ele) ou desliga. Os assuntos são do grupo: saem junto. */
  toggleGroup(key: string): void {
    this.group.update((g) => (g === key ? null : key));
    this.subjects.set([]);
  }

  toggleSubject(value: string): void {
    this.subjects.update((on) => (on.includes(value) ? on.filter((s) => s !== value) : [...on, value]));
  }

  /** O clique numa tag: liga ou desliga; na escondida, mostra de novo. */
  toggleTag(value: string): void {
    if (this.outs().includes(value)) {
      this.outs.update((o) => o.filter((t) => t !== value));
      return;
    }
    this.tags.update((on) => (on.includes(value) ? on.filter((t) => t !== value) : [...on, value]));
  }

  /** O clique direito numa tag: esconde as anotações dela (sai das ligadas); na escondida, mostra de novo. */
  excludeTag(value: string): void {
    if (this.outs().includes(value)) {
      this.toggleTag(value);
      return;
    }
    this.tags.update((on) => on.filter((t) => t !== value));
    this.outs.update((o) => [...o, value]);
  }

  /** Limpar: sem grupo, assunto nem tag (as finalizadas ficam como estão, como a busca). */
  clear(): void {
    this.group.set(null);
    this.subjects.set([]);
    this.tags.set([]);
    this.outs.set([]);
  }

  /** Ao abrir o seletor: tudo desligado, e as finalizadas escondidas onde é o costume (o Kanban). */
  reset(hideDone: boolean): void {
    this.clear();
    this.hideDone.set(hideDone);
  }
}

/** Uma aba de mural no seletor (ver `kindTabs`). */
type KindTab = ReturnType<typeof kindTabs>[number];

/**
 * Os filtros de um seletor de fichas: a busca (a de quem usa, projetada) com as finalizadas ao lado,
 * o mural (os recortes de sempre) e, nas anotações, o grupo, o assunto e as tags. Cada fileira só aparece quando separa
 * alguma coisa, e uma depende da outra: os grupos aparecem com a lista nas anotações, os assuntos
 * com um grupo escolhido. O grupo e o assunto são os mesmos recortes do mural, com o rótulo na frente
 * (como o "Assunto" da pasta); a tag é a etiqueta de papel kraft do mural (o marca-texto da pasta não
 * apareceria na folha amarela do seletor).
 */
@Component({
  selector: 'app-picker-filters',
  imports: [IconModule, TagChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = filters();
    @let doneHere = f.doneCount() > 0 || f.hideDone();
    <!-- a busca (de quem usa) e, ao lado, as finalizadas, como o "Finalizadas" ao lado da busca na pasta do mural -->
    <div class="linha-busca">
      <ng-content />
      @if (doneHere) {
        <button
          type="button"
          class="filtro finalizadas"
          [attr.aria-pressed]="f.hideDone()"
          [title]="f.hideDone() ? 'As finalizadas estão fora da lista' : 'Tirar da lista as anotações finalizadas'"
          (click)="f.hideDone.set(!f.hideDone())"
        >
          <lucide-icon [img]="DoneIcon" [size]="15" aria-hidden="true" />
          Esconder finalizadas
          @if (f.doneCount()) {
            <span class="n">{{ f.doneCount() }}</span>
          }
        </button>
      }
    </div>

    @if (kinds(); as ks) {
      <div class="murais" role="group" aria-label="Mural">
        <button type="button" class="filtro" [attr.aria-pressed]="kind() === null" (click)="kind.set(null)">Todos <span class="n">{{ total() }}</span></button>
        @for (k of ks; track k.kind) {
          <button type="button" class="filtro" [attr.aria-pressed]="kind() === k.kind" (click)="kind.set(k.kind)">
            <lucide-icon [img]="k.icon" [size]="15" aria-hidden="true" />
            {{ k.label }} <span class="n">{{ k.count }}</span>
          </button>
        }
      </div>
    }

    @if (f.groupChips(); as gs) {
      @if (gs.length) {
        <div class="fileira" role="group" aria-label="Grupo">
          <span class="rotulo" aria-hidden="true">Grupo</span>
          <div class="correr">
            @for (g of gs; track g.key) {
              <button
                type="button"
                class="filtro grupo"
                [class.sem]="!g.icon"
                [style.--cat-cor]="g.color"
                [attr.aria-pressed]="g.on"
                [title]="g.label"
                (click)="f.toggleGroup(g.key)"
              >
                @if (g.icon) {
                  <lucide-icon class="icone" [class.colorido]="!!g.color" [img]="g.icon" [size]="15" aria-hidden="true" />
                }
                <span class="nome">{{ g.label }}</span><span class="sr-only">, </span>
                <span class="n">{{ g.n }}</span>
              </button>
            }
          </div>
        </div>
      }
    }

    @if (f.subjectChips(); as ss) {
      @if (ss.length) {
        <div class="fileira" role="group" aria-label="Assunto">
          <span class="rotulo" aria-hidden="true">Assunto</span>
          <div class="correr">
            @for (s of ss; track s.value) {
              <button type="button" class="filtro assunto" [class.sem]="s.value === 'sem'" [attr.aria-pressed]="s.on" [title]="s.label" (click)="f.toggleSubject(s.value)">
                <span class="nome">{{ s.label }}</span><span class="sr-only">, </span>
                <span class="n">{{ s.n }}</span>
              </button>
            }
          </div>
        </div>
      }
    }

    @if (f.tagChips().length) {
      <div class="correr tags">
        <app-tag-chips [tags]="f.tagChips()" (toggled)="f.toggleTag($event)" (excluded)="f.excludeTag($event)" />
      </div>
    }

    @if (f.active()) {
      <p class="achados" aria-live="polite">
        <span>Mostrando {{ f.matching().length }} de {{ f.before() }}</span>
        <button type="button" class="tinta-link" (click)="f.clear()">Limpar</button>
      </p>
    }

  `,
  styleUrl: './picker-filters.scss',
})
export class PickerFilters {
  readonly filters = input.required<CardFilters>();
  /** As abas dos murais (null: a lista é de um mural só, sem as abas). */
  readonly kinds = input<readonly KindTab[] | null>(null);
  /** Quantas fichas a lista tem, em todos os murais (o "Todos"). */
  readonly total = input(0);
  readonly kind = model<Kind | null>(null);

  protected readonly DoneIcon = ICON.pronto;
}
