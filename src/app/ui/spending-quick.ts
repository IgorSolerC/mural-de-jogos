import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { todayISO } from '../core/dates';
import { brl, moneyInput, suggestions } from '../core/spending';
import { readQuick } from '../core/spending-quick';
import { SpendingStore } from '../core/spending-store';
import { SpendingEditor } from './spending-editor';

/**
 * A linha de anotar dos Gastos: escreve-se o gasto como se fala ("ifood 44,90", "violão 10x 139,90",
 * "salário +4559 todo mês", "jantar 600 @bruna") e Enter lança. Embaixo, a mesma folhinha de um lançamento
 * aberto na fita (ui/spending-editor), já preenchida com o que a linha entendeu: o nome, o valor, a
 * categoria, como pagou, se precisava, com quem, as parcelas, o dia, o mês em que conta e se é todo mês.
 * O que for mexido na folhinha fica como a pessoa deixou; o resto segue a linha. Enquanto o nome é escrito,
 * os gastos parecidos de antes aparecem para escolher (com a categoria e o último valor).
 */
@Component({
  selector: 'app-spending-quick',
  imports: [IconModule, SpendingEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tira" [class.escrevendo]="text()">
      <lucide-icon class="lapis" [img]="PenIcon" [size]="18" aria-hidden="true" />
      <input
        #campo
        type="text"
        autocomplete="off"
        autocapitalize="sentences"
        enterkeyhint="done"
        aria-label="Anotar um gasto ou uma entrada"
        placeholder="Anote: ifood 44,90 · violão 10x 139,90 · salário +4559"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="gs-sugestoes"
        [attr.aria-expanded]="shownSuggestions().length > 0"
        [attr.aria-activedescendant]="active() >= 0 ? 'gs-sug-' + active() : null"
        [value]="text()"
        (input)="write($any($event.target).value)"
        (keydown)="key($event)"
      />
    </div>

    @if (shownSuggestions().length) {
      <ul class="sugestoes" id="gs-sugestoes" role="listbox" aria-label="Parecidos com o que você já lançou">
        @for (s of shownSuggestions(); track s.title; let i = $index) {
          <li
            role="option"
            class="sugestao"
            [id]="'gs-sug-' + i"
            [attr.aria-selected]="i === active()"
            [class.ativa]="i === active()"
            (mousedown)="$event.preventDefault()"
            (click)="pick(i)"
          >
            <span class="selo" [style.--cor]="colorOf(s.category)" aria-hidden="true"></span>
            <span class="sug-nome">{{ s.title }}</span>
            <span class="sug-cat">{{ nameOf(s.category) }}</span>
            <span class="sug-valor" [class.entrada]="s.flow === 'entrada'">{{ s.flow === 'entrada' ? '+' : '' }}{{ brl(s.amount) }}</span>
            @if (s.times > 1) {
              <span class="sug-vezes">{{ s.times }}×</span>
            }
          </li>
        }
      </ul>
    }

    @if (text()) {
      <app-spending-editor class="ficha-nova" [seed]="read()" [month]="store.month()" (done)="launched()" />
    }
  `,
  styleUrl: './spending-quick.scss',
})
export class SpendingQuick {
  protected readonly store = inject(SpendingStore);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('campo');
  private readonly editor = viewChild(SpendingEditor);

  protected readonly PenIcon = ICON.escrever;
  protected readonly brl = brl;

  protected readonly text = signal('');
  protected readonly active = signal(-1);
  /** Esc fechou os parecidos até a próxima letra. */
  private readonly hideSuggestions = signal(false);
  private readonly today = signal(todayISO());

  /** O que a linha entendeu (a folhinha embaixo parte disso). */
  protected readonly read = computed(() =>
    readQuick(this.text(), {
      entries: this.store.entries(),
      categories: this.store.categories(),
      people: this.store.people(),
      today: this.today(),
      month: this.store.month(),
    }),
  );

  /** Os parecidos de antes, enquanto o nome é escrito (sem valor ainda). */
  protected readonly shownSuggestions = computed(() => {
    if (this.hideSuggestions() || !this.text().trim() || this.read().amount) return [];
    return suggestions(this.store.entries(), this.read().title || this.text(), 5);
  });

  constructor() {
    // o topo (ou o N) pediu um lançamento novo: o foco vem para a linha
    let first = true;
    effect(() => {
      this.store.compose();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        const el = this.field().nativeElement;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
      });
    });
  }

  protected write(v: string): void {
    this.text.set(v);
    this.active.set(-1);
    this.hideSuggestions.set(false);
    this.today.set(todayISO());
  }

  protected nameOf(id: string): string {
    return this.store.category(id)?.name ?? 'Sem categoria';
  }

  protected colorOf(id: string): string {
    return `var(--stock-${this.store.category(id)?.color ?? 'cinza'})`;
  }

  /**
   * Escolher um parecido: o nome e o último valor dele vão para a linha, prontos para Enter (ou para mudar
   * o valor). A linha já lê do mesmo gasto de antes a categoria, o pagamento e se precisava.
   */
  protected pick(i: number): void {
    const s = this.shownSuggestions()[i];
    if (!s) return;
    const text = `${s.title} ${s.flow === 'entrada' ? '+' : ''}${moneyInput(s.amount)}`;
    this.write(text);
    const el = this.field().nativeElement;
    el.value = text;
    el.focus();
    // o valor fica selecionado: digitar troca, Enter lança como está
    el.setSelectionRange(text.length - moneyInput(s.amount).length, text.length);
  }

  protected key(e: KeyboardEvent): void {
    const n = this.shownSuggestions().length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.active.set((this.active() + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.active.set(this.active() <= 0 ? n - 1 : this.active() - 1);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && n && this.active() >= 0) {
      e.preventDefault();
      this.pick(this.active());
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.editor()?.save();
    } else if (e.key === 'Escape' && (n || this.text())) {
      e.stopPropagation();
      if (n) this.hideSuggestions.set(true);
      else this.write('');
    }
  }

  /** Lançou (ou limpou) pela folhinha: a linha fica vazia, esperando o próximo. */
  protected launched(): void {
    this.write('');
    this.field().nativeElement.value = '';
    this.field().nativeElement.focus({ preventScroll: true });
  }
}
