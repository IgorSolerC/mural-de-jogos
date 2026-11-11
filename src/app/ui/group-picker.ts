import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { Bonus, fold } from '../core/review';
import { LABEL_MAX, cleanNewCategory } from '../core/note-labels';
import { categoryColorHex } from '../core/category-looks';
import { categoryOf } from '../core/note-labels';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { CategoryLabel } from './category-label';
import { roveRadios } from './focus';

/**
 * O grupo da anotação, no editor (a parte Grupo): os grupos em linhas, como as pastas na parte do lado
 * (ui/_indice.scss), em ordem alfabética e em colunas: o desenho do grupo na cor dele, o nome e quantas
 * anotações tem; a escolhida com o traço de marca-texto. A busca filtra e cria. Um só: tocar escolhe (e
 * o editor fecha a parte); "Sem grupo", a primeira linha, tira.
 * O ícone e a cor de cada grupo moram nas configurações do mural, não aqui. Também escolhe o grupo do
 * baralho copiado (ui/study-copy-sheet.ts), onde o grupo é obrigatório: `required` tira o "Sem grupo".
 */
@Component({
  selector: 'app-group-picker',
  imports: [IconModule, CategoryLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="campo">
      <lucide-icon class="lupa" [img]="SearchIcon" [size]="18" aria-hidden="true" />
      <span class="sr-only">Buscar ou criar grupo</span>
      <input
        type="text"
        autocomplete="off"
        enterkeyhint="done"
        [maxLength]="max"
        placeholder="Buscar ou criar grupo"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        (keydown.enter)="$event.preventDefault(); enter()"
      />
    </label>
    <div class="lista" role="radiogroup" [attr.aria-label]="groupLabel()" (keydown)="rove($event)">
      @if (!query().trim() && !required()) {
        <button type="button" role="radio" class="op raiz" [attr.aria-checked]="!category() && !none()" (click)="choose(null)">
          <lucide-icon class="ico" [img]="NoneIcon" [size]="17" aria-hidden="true" />
          <span class="nome">Sem grupo</span>
        </button>
      }
      @for (g of shown(); track g.key) {
        <button type="button" role="radio" class="op" [attr.aria-checked]="g.on" [style.--cat-cor]="g.color" (click)="choose(g.label)">
          <app-cat-label class="nome" [label]="g.label" [look]="g.look" [iconSize]="17" [tint]="!!g.color" />
          @if (g.n) {
            <span class="n"><span class="sr-only">, </span>{{ g.n }}<span class="sr-only"> {{ g.n === 1 ? 'anotação' : 'anotações' }}</span></span>
          }
        </button>
      }
      @if (fresh(); as f) {
        <button type="button" class="op criar" (click)="choose(f)">
          <lucide-icon class="ico" [img]="PlusIcon" [size]="17" aria-hidden="true" />
          <span class="nome">Criar “{{ f }}”</span>
        </button>
      }
    </div>
  `,
  styleUrl: './group-picker.scss',
})
export class GroupPicker {
  private readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly category = model<string | null>(null);
  /** Os grupos à mão (a cartela pronta e os escritos nas outras anotações; ver `categoryLibrary`). */
  readonly categories = input<readonly Bonus[]>([]);
  /** Sem a opção "Sem grupo". */
  readonly required = input(false);
  /** Nenhum colado, nem o "Sem grupo" (várias anotações de grupos diferentes, na folha "Editar as marcadas"). */
  readonly none = input(false);
  /** O nome da lista para o leitor de tela. */
  readonly groupLabel = input('Grupo da anotação');

  protected readonly max = LABEL_MAX;
  protected readonly SearchIcon = ICON.buscar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly NoneIcon = ICON.tirarDaPasta;
  protected readonly query = signal('');
  protected readonly rove = roveRadios;

  /** Quantas anotações há em cada grupo (pelo nome dobrado). */
  private readonly use = computed(() => {
    const use = new Map<string, number>();
    for (const n of this.store.notes()) {
      const c = categoryOf(n);
      if (c) use.set(fold(c), (use.get(fold(c)) ?? 0) + 1);
    }
    return use;
  });

  /**
   * Os grupos, com o escolhido (mesmo que novo): todos em ordem alfabética; procurando, os que batem (os
   * que começam com a busca primeiro).
   */
  protected readonly shown = computed(() => {
    const chosen = this.category();
    const all = new Map<string, string>();
    for (const label of [...(chosen ? [chosen] : []), ...this.categories().map((b) => b.label)]) if (!all.has(fold(label))) all.set(fold(label), label);
    // a busca como o nome do grupo novo, sem o "#" da frente: "#trab" acha o Trabalho em vez de oferecer criar
    const q = fold(cleanNewCategory(this.query()));
    let list = [...all.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    if (q) list = [...list.filter(([k]) => k.startsWith(q)), ...list.filter(([k]) => !k.startsWith(q) && k.includes(q))];
    // lido aqui para a lista acompanhar a cor trocada nas configurações
    this.settings.categoryLooks();
    return list.map(([key, label]) => {
      const look = this.settings.categoryLook(label);
      return { key, label, look, color: categoryColorHex(look.color), on: !!chosen && fold(chosen) === key, n: this.use().get(key) ?? 0 };
    });
  });

  /** O escrito, quando ainda não é nenhum grupo: "Criar “Viagens”". */
  protected readonly fresh = computed(() => {
    const name = cleanNewCategory(this.query());
    return name && !this.shown().some((g) => g.key === fold(name)) ? name : null;
  });

  /** Enter: o primeiro que bate com a busca, ou o grupo novo. */
  protected enter(): void {
    // só "#" não é busca: a lista inteira, e o primeiro seria um grupo qualquer
    const first = cleanNewCategory(this.query()) ? this.shown()[0] : null;
    const name = first?.label ?? this.fresh();
    if (name) this.choose(name);
  }

  protected choose(label: string | null): void {
    this.category.set(label);
    this.query.set('');
  }

  /** O foco vai para a busca (ao abrir a parte). */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus();
  }
}
