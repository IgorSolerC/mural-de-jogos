import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { DECK_NAME_MAX, MAX_DECKS_PER_CARD, groupKey, inGroup } from '../core/study';
import { StudyStore } from '../core/study-store';
import { ICON, ICON_CHOICE, IconModule } from './icons';

/**
 * Os baralhos de um flashcard (PLANO-ESTUDOS.md, 6.5 e 6.6): todos os do grupo da anotação à vista, cada um um
 * adesivo que se liga e desliga num toque, e "Novo baralho" no fim (o nome escrito ali, a cor sorteada entre as
 * livres). Um flashcard pode estar em vários baralhos (D3); o progresso é um só. Só os baralhos do grupo da
 * anotação (PLANO-ESTUDOS-GRUPOS.md): os de outro grupo em que ele dorme não aparecem, e a anotação sem grupo
 * não escolhe baralho nenhum.
 */
@Component({
  selector: 'app-study-deck-picker',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!hasGroup()) {
      <!-- a anotação sem grupo não entra em baralho nenhum: a frase no lugar da lista -->
      <p class="sem-grupo">Escolha um grupo para a anotação entrar num baralho.</p>
    } @else {
    <ul class="baralhos" aria-label="Baralhos do flashcard">
      @for (d of mine(); track d.id) {
        @let inside = decks().includes(d.id);
        <li>
          <button type="button" class="adesivo" [class.dentro]="inside" [style.--cor]="'var(--stock-' + d.color + ')'" [attr.aria-pressed]="inside" [disabled]="!inside && full()" (click)="toggle(d.id)">
            @if (inside) {
              <lucide-icon [img]="CheckIcon" [size]="15" aria-hidden="true" />
            } @else if (d.icon) {
              <lucide-icon [img]="iconOf[d.icon]" [size]="14" aria-hidden="true" />
            }
            <span class="adesivo-nome">{{ d.name }}</span>
          </button>
        </li>
      }
      @if (adding()) {
        <li class="novo">
          <label class="campo-novo">
            <span class="sr-only">Nome do baralho novo</span>
            <input #nome type="text" autocomplete="off" placeholder="Nome do baralho" [maxLength]="nameMax" (keydown.enter)="$event.preventDefault(); create()" (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); adding.set(false)" />
          </label>
          <button type="button" class="tinta" (click)="create()">Criar</button>
        </li>
      } @else if (!full()) {
        <li>
          <button type="button" class="mais" (click)="openNew()">
            <lucide-icon [img]="AddIcon" [size]="15" aria-hidden="true" />
            Novo baralho
          </button>
        </li>
      }
    </ul>
    }
  `,
  styleUrl: './study-deck-picker.scss',
})
export class StudyDeckPicker {
  /** Os ids dos baralhos do flashcard, na ordem em que ele entrou neles. */
  readonly decks = model<string[]>([]);
  /** O grupo da anotação, como está no editor agora. */
  readonly group = input<string | null>(null);

  protected readonly CheckIcon = ICON.pronto;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly nameMax = DECK_NAME_MAX;

  private readonly study = inject(StudyStore);
  private readonly nome = viewChild<ElementRef<HTMLInputElement>>('nome');
  protected readonly adding = signal(false);

  protected readonly hasGroup = computed(() => !!groupKey(this.group()));
  /** Os baralhos do grupo, sempre na mesma ordem: ligar um não muda os outros de lugar. */
  protected readonly mine = computed(() => this.study.decks().filter((d) => inGroup(d, this.group())));
  /** Chegou ao limite: conta só os do grupo (`live`, em flashcard-tab, é o que vale ao salvar). */
  protected readonly full = computed(() => this.mine().filter((d) => this.decks().includes(d.id)).length >= MAX_DECKS_PER_CARD);

  protected toggle(id: string): void {
    this.decks.set(this.decks().includes(id) ? this.decks().filter((d) => d !== id) : [...this.decks(), id]);
  }

  protected openNew(): void {
    this.adding.set(true);
    setTimeout(() => this.nome()?.nativeElement.focus());
  }

  /** O baralho novo, já com este flashcard: a cor é uma ainda sem baralho (ou a primeira). */
  protected create(): void {
    const name = this.nome()?.nativeElement.value.trim() ?? '';
    if (!name) return;
    const used = new Set(this.study.decks().map((d) => d.color));
    const color: LightStock = LIGHT_STOCKS.find((s) => !used.has(s) && s !== 'branco') ?? 'amarelo';
    const group = this.group();
    if (!groupKey(group)) return;
    const id = this.study.addDeck(name, color, null, undefined, group);
    this.adding.set(false);
    if (id) this.decks.set([...this.decks(), id]);
  }
}
