import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { Bonus, fold } from '../core/review';
import { LABEL_MAX, cleanNewCategory } from '../core/note-labels';
import { categoryColorHex } from '../core/category-looks';
import { Settings } from '../core/settings';
import { CategoryLabel } from './category-label';
import { roveRadios } from './focus';

/**
 * O grupo da anotação, no editor (a parte Grupo): as orelhas dos grupos, como saem da ficha no mural,
 * e a busca que filtra e cria. Um só: tocar escolhe (e o editor fecha a parte); "Sem grupo" tira.
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
    <div class="orelhas" role="radiogroup" [attr.aria-label]="groupLabel()" (keydown)="rove($event)">
      @if (!query().trim() && !required()) {
        <button type="button" role="radio" class="op nenhum" [attr.aria-checked]="!category() && !none()" (click)="choose(null)">Sem grupo</button>
      }
      @for (g of shown(); track g.key) {
        <button type="button" role="radio" class="op" [attr.aria-checked]="g.on" (click)="choose(g.label)">
          <span class="orelha" [class.orelha-cor]="!!g.color" [style.--cat-cor]="g.color"><app-cat-label [label]="g.label" [look]="g.look" [iconSize]="14" /></span>
        </button>
      }
      @if (fresh(); as f) {
        <button type="button" class="op criar" (click)="choose(f)">
          <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
          Criar “{{ f }}”
        </button>
      }
    </div>
  `,
  styleUrl: './group-picker.scss',
})
export class GroupPicker {
  private readonly settings = inject(Settings);
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
  protected readonly query = signal('');
  protected readonly rove = roveRadios;

  /** Os grupos, com o escolhido (mesmo que novo) e os que batem com a busca (os que começam com ela primeiro). */
  protected readonly shown = computed(() => {
    const chosen = this.category();
    const all = new Map<string, string>();
    for (const label of [...(chosen ? [chosen] : []), ...this.categories().map((b) => b.label)]) if (!all.has(fold(label))) all.set(fold(label), label);
    // a busca como o nome do grupo novo, sem o "#" da frente: "#trab" acha o Trabalho em vez de oferecer criar
    const q = fold(cleanNewCategory(this.query()));
    let list = [...all.entries()];
    if (q) list = [...list.filter(([k]) => k.startsWith(q)), ...list.filter(([k]) => !k.startsWith(q) && k.includes(q))];
    // lido aqui para a lista acompanhar a cor trocada nas configurações
    this.settings.categoryLooks();
    return list.map(([key, label]) => {
      const look = this.settings.categoryLook(label);
      return { key, label, look, color: categoryColorHex(look.color), on: !!chosen && fold(chosen) === key };
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
