import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { DECK_NAME_MAX, MAX_DECKS_PER_CARD, groupKey, inGroup } from '../core/study';
import { StudyStore } from '../core/study-store';
import { ICON, ICON_CHOICE, IconModule } from './icons';

/** O valor da lista que abre o campo de um baralho novo. */
const NEW = '__novo__';

/**
 * Os baralhos de uma carta (PLANO-ESTUDOS.md, 6.5 e 6.6): um adesivo por baralho em que ela está (o ícone
 * e o nome, com a cor do baralho na ponta, e o X), como o seletor de tags, e "+ Baralho", a lista do
 * aparelho com os outros e "Novo baralho…" no fim (o nome escrito ali, a cor sorteada entre as livres).
 * Uma carta pode estar em vários baralhos (D3); o progresso é um só. Só os baralhos do grupo da anotação
 * (PLANO-ESTUDOS-GRUPOS.md): os de outro grupo em que a carta dorme não aparecem, e a anotação sem grupo
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
    <ul class="baralhos" aria-label="Baralhos da carta">
      @for (d of chosen(); track d.id) {
        <li class="adesivo" [style.--cor]="'var(--stock-' + d.color + ')'">
          @if (d.icon) {
            <lucide-icon [img]="iconOf[d.icon]" [size]="14" aria-hidden="true" />
          }
          <span class="adesivo-nome">{{ d.name }}</span>
          <button type="button" class="tirar" [attr.aria-label]="'Tirar do baralho ' + d.name" (click)="remove(d.id)">
            <lucide-icon [img]="CloseIcon" [size]="14" aria-hidden="true" />
          </button>
        </li>
      }
      @if (adding()) {
        <li class="novo">
          <label class="campo-novo">
            <span class="sr-only">Nome do baralho novo</span>
            <input #nome type="text" autocomplete="off" placeholder="Nome do baralho" [maxLength]="nameMax" (keydown.enter)="$event.preventDefault(); create()" (keydown.escape)="$event.stopPropagation(); adding.set(false)" />
          </label>
          <button type="button" class="tinta" (click)="create()">Criar</button>
        </li>
      } @else if (chosen().length < maxDecks) {
        <li>
          <label class="mais" [class.vazio]="!chosen().length">
            <lucide-icon [img]="AddIcon" [size]="15" aria-hidden="true" />
            {{ chosen().length ? 'Baralho' : 'Escolher o baralho' }}
            <select
              [value]="''"
              aria-label="Pôr em um baralho"
              (mousedown)="onMouse()"
              (keydown)="onKey($event)"
              (change)="changed($any($event.target))"
              (blur)="commit($any($event.target))"
            >
              <option value="" disabled>Pôr em um baralho</option>
              @for (d of others(); track d.id) {
                <option [value]="d.id">{{ d.name }}</option>
              }
              <option [value]="newValue">Novo baralho…</option>
            </select>
          </label>
        </li>
      }
    </ul>
    }
  `,
  styleUrl: './study-deck-picker.scss',
})
export class StudyDeckPicker {
  /** Os ids dos baralhos da carta, na ordem em que ela entrou neles. */
  readonly decks = model<string[]>([]);
  /** O grupo da anotação, como está no editor agora. */
  readonly group = input<string | null>(null);

  protected readonly CloseIcon = ICON.fechar;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly nameMax = DECK_NAME_MAX;
  protected readonly maxDecks = MAX_DECKS_PER_CARD;
  protected readonly newValue = NEW;

  private readonly study = inject(StudyStore);
  private readonly nome = viewChild<ElementRef<HTMLInputElement>>('nome');
  protected readonly adding = signal(false);

  protected readonly hasGroup = computed(() => !!groupKey(this.group()));
  protected readonly chosen = computed(() => this.decks().flatMap((id) => this.study.deck(id) ?? []).filter((d) => inGroup(d, this.group())));
  protected readonly others = computed(() => this.study.decks().filter((d) => !this.decks().includes(d.id) && inGroup(d, this.group())));

  /**
   * A lista fechada do Windows troca de opção (e avisa) a cada seta: pelo teclado, a escolha só vale no
   * Enter ou ao sair da lista; pelo mouse (ou tocando), na hora.
   */
  protected keying = false;

  /** Num método: no molde, um "keying = false" devolveria false, e o Angular cancelaria o clique que abre a lista. */
  protected onMouse(): void {
    this.keying = false;
  }

  protected onKey(e: KeyboardEvent): void {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) this.keying = true;
    else if (e.key === 'Enter') {
      e.preventDefault();
      this.commit(e.target as HTMLSelectElement);
    }
  }

  protected changed(select: HTMLSelectElement): void {
    if (!this.keying) this.commit(select);
  }

  protected commit(select: HTMLSelectElement): void {
    this.keying = false;
    const value = select.value;
    select.value = '';
    if (value === NEW) {
      this.adding.set(true);
      setTimeout(() => this.nome()?.nativeElement.focus());
    } else if (value) this.decks.set([...this.decks(), value]);
  }

  protected remove(id: string): void {
    this.decks.set(this.decks().filter((d) => d !== id));
  }

  /** O baralho novo, já com esta carta: a cor é uma ainda sem baralho (ou a primeira). */
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
