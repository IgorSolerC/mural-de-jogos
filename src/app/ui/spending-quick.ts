import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { todayISO } from '../core/dates';
import { newId } from '../core/review';
import {
  Flow,
  MAX_INSTALLMENTS,
  NEEDS,
  NEED_LABEL,
  Need,
  PAY_LABEL,
  PAY_METHODS,
  PayMethod,
  brl,
  dayIn,
  monthLabel,
  monthOfDay,
  moneyInput,
  shiftMonth,
  suggestions,
} from '../core/spending';
import { Quick, quickToEntry, readQuick } from '../core/spending-quick';
import { SpendingStore } from '../core/spending-store';
import { Toasts } from './toast';

/** O que a pessoa trocou à mão nos adesivos: vale mais que o que a linha leu. */
interface Overrides {
  flow?: Flow;
  category?: string;
  pay?: PayMethod;
  /** Se precisava (null: tirada à mão). */
  need?: Need | null;
  installments?: number;
  monthly?: boolean;
  /** O dia deste mês (no parcelado, o desta parcela). */
  day?: string;
}

const NEW_CATEGORY = '__nova';
const NO_NEED = '';

/** "hoje", "ontem" ou "24 out". */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'hoje';
  const y = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - 1)).toISOString().slice(0, 10);
  if (day === y) return 'ontem';
  return `${Number(day.slice(8, 10))} ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(day.slice(5, 7)) - 1]}`;
}

/**
 * A linha de anotar dos Gastos: escreve-se o gasto como se fala ("ifood 44,90", "violão 10x 139,90",
 * "salário +4559 todo mês") e Enter lança. Embaixo, em adesivos, o que a linha entendeu (saiu ou entrou,
 * a categoria, como pagou, as parcelas, o dia, se é todo mês), cada um trocado com um toque. Enquanto o
 * nome é escrito, os gastos parecidos de antes aparecem para escolher (com a categoria e o último valor).
 */
@Component({
  selector: 'app-spending-quick',
  imports: [IconModule],
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
        [attr.aria-describedby]="text() ? 'gs-leitura' : null"
        [value]="text()"
        (input)="write($any($event.target).value)"
        (keydown)="key($event)"
      />
      <button type="button" class="lancar" [disabled]="!entry()" (click)="launch()">
        Lançar
        <kbd aria-hidden="true">↵</kbd>
      </button>
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
      @let q = quick();
      <div class="leitura" id="gs-leitura" role="group" aria-label="O que vai ser lançado">
        <button type="button" class="adesivo direcao" [class.entrada]="q.flow === 'entrada'" [attr.aria-label]="(q.flow === 'saida' ? 'Saída' : 'Entrada') + ': trocar'" (click)="set({ flow: q.flow === 'saida' ? 'entrada' : 'saida', category: undefined })">
          <lucide-icon [img]="q.flow === 'saida' ? OutIcon : InIcon" [size]="14" aria-hidden="true" />
          {{ q.flow === 'saida' ? 'Saiu' : 'Entrou' }}
        </button>

        <label class="adesivo escolha" [class.adivinhada]="q.from === 'padrao'">
          <span class="selo" [style.--cor]="colorOf(q.category)" aria-hidden="true"></span>
          {{ nameOf(q.category) }}
          <lucide-icon class="chev" [img]="ChevIcon" [size]="13" aria-hidden="true" />
          <select aria-label="Categoria" [value]="q.category" (change)="chooseCategory($any($event.target).value)">
            @for (c of categoriesOf(q.flow); track c.id) {
              <option [value]="c.id" [selected]="c.id === q.category">{{ c.name }}</option>
            }
            <option [value]="newCategory">Nova categoria…</option>
          </select>
        </label>

        @if (q.flow === 'saida') {
          <label class="adesivo escolha">
            {{ payLabel[q.pay ?? 'avista'] }}
            <lucide-icon class="chev" [img]="ChevIcon" [size]="13" aria-hidden="true" />
            <select aria-label="Como pagou" (change)="choosePay($any($event.target).value)">
              @for (p of pays; track p) {
                <option [value]="p" [selected]="p === q.pay">{{ payLabel[p] }}</option>
              }
            </select>
          </label>
          <label class="adesivo escolha precisava" [class.adivinhada]="!q.need" [attr.data-need]="q.need ?? null">
            {{ q.need ? needLabel[q.need] : 'Precisava?' }}
            <lucide-icon class="chev" [img]="ChevIcon" [size]="13" aria-hidden="true" />
            <select aria-label="Precisava?" (change)="set({ need: $any($event.target).value || null })">
              <option [value]="noNeed" [selected]="!q.need">Sem resposta</option>
              @for (n of needs; track n) {
                <option [value]="n" [selected]="n === q.need">{{ needLabel[n] }}</option>
              }
            </select>
          </label>
          @if (q.installments) {
            <label class="adesivo parcelas">
              <input
                type="number"
                inputmode="numeric"
                min="2"
                [max]="maxInstallments"
                aria-label="Quantas parcelas"
                [value]="q.installments"
                (input)="setInstallments($any($event.target).value)"
              />
              <span>× {{ q.amount ? 'de ' + brl(q.amount) : '' }}@if ((q.part ?? 1) > 1) { · a {{ q.part }}ª agora }</span>
            </label>
          }
        }

        <label class="adesivo escolha dia">
          <lucide-icon [img]="DayIcon" [size]="13" aria-hidden="true" />
          {{ dayText() }}
          <input type="date" aria-label="Dia" [value]="shownDay()" (change)="setDay($any($event.target).value)" />
        </label>

        @if (!q.installments) {
          <button type="button" class="adesivo opcional" [attr.aria-pressed]="!!q.monthly" (click)="set({ monthly: !q.monthly })">
            <lucide-icon [img]="RepeatIcon" [size]="13" aria-hidden="true" />
            {{ q.monthly ? 'Todo mês' : '+ todo mês' }}
          </button>
        }

        <span class="lido" [class.falta]="!q.amount">
          @if (q.amount) {
            {{ q.flow === 'entrada' ? '+' : '−' }}{{ brl(q.amount) }}
          } @else {
            falta o valor
          }
        </span>
      </div>

      @if (naming()) {
        <form class="nova-cat" (submit)="$event.preventDefault(); createCategory(novaCat.value)">
          <label class="campo-mini">
            <span class="sr-only">Nome da categoria nova</span>
            <input #novaCat type="text" maxlength="24" placeholder="Nome da categoria" autocomplete="off" />
          </label>
          <button type="submit" class="tinta-pequena">Criar</button>
          <button type="button" class="tinta-pequena" (click)="naming.set(false)">Cancelar</button>
        </form>
      }
    }
  `,
  styleUrl: './spending-quick.scss',
})
export class SpendingQuick {
  private readonly store = inject(SpendingStore);
  private readonly toasts = inject(Toasts);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('campo');

  protected readonly PenIcon = ICON.escrever;
  protected readonly OutIcon = ICON.abaixo;
  protected readonly InIcon = ICON.acima;
  protected readonly ChevIcon = ICON.abrir;
  protected readonly DayIcon = ICON.calendario;
  protected readonly RepeatIcon = ICON.repetir;
  protected readonly brl = brl;
  protected readonly payLabel = PAY_LABEL;
  protected readonly pays = PAY_METHODS;
  protected readonly maxInstallments = MAX_INSTALLMENTS;
  protected readonly newCategory = NEW_CATEGORY;
  protected readonly needs = NEEDS;
  protected readonly needLabel = NEED_LABEL;
  protected readonly noNeed = NO_NEED;

  protected readonly text = signal('');
  private readonly overrides = signal<Overrides>({});
  protected readonly active = signal(-1);
  /** Esc fechou os parecidos até a próxima letra. */
  private readonly hideSuggestions = signal(false);
  protected readonly naming = signal(false);
  private readonly today = signal(todayISO());

  private readonly read = computed(() =>
    readQuick(this.text(), { entries: this.store.entries(), categories: this.store.categories(), today: this.today(), month: this.store.month() }),
  );

  /** O que vai ser lançado: o que a linha leu, com o que a pessoa trocou nos adesivos por cima. */
  protected readonly quick = computed<Quick>(() => {
    const q = { ...this.read() };
    const o = this.overrides();
    if (o.flow && o.flow !== q.flow) {
      q.flow = o.flow;
      q.category = o.flow === 'saida' ? 'outros' : 'outras-entradas';
      q.from = 'padrao';
      if (o.flow === 'entrada') {
        delete q.need;
        delete q.pay;
        delete q.installments;
        delete q.part;
      } else q.pay ??= 'avista';
    }
    if (o.category) {
      q.category = o.category;
      q.from = 'escrita';
    }
    if (q.flow === 'saida' && o.need !== undefined) {
      if (o.need) q.need = o.need;
      else delete q.need;
    }
    if (q.flow === 'saida' && o.pay) {
      q.pay = o.pay;
      if (o.pay === 'parcelado') {
        q.installments ??= 2;
        q.part ??= 1;
        delete q.monthly;
      } else {
        delete q.installments;
        delete q.part;
      }
    }
    if (q.flow === 'saida' && q.installments && o.installments) {
      q.installments = o.installments;
      if ((q.part ?? 1) > o.installments) q.part = o.installments;
    }
    if (o.monthly !== undefined && !q.installments) {
      if (o.monthly) q.monthly = true;
      else delete q.monthly;
    }
    // o dia: o desta parcela vira o da primeira
    const day = o.day ?? this.dayOfRead(q);
    q.date = q.installments && (q.part ?? 1) > 1 ? dayIn(shiftMonth(monthOfDay(day), -((q.part ?? 1) - 1)), day) : day;
    return q;
  });

  protected readonly entry = computed(() => quickToEntry(this.quick()));

  /** O dia que o adesivo mostra: o do lançamento neste mês (no parcelado, o da parcela de agora). */
  protected readonly shownDay = computed(() => this.overrides().day ?? this.dayOfRead(this.quick()));
  protected readonly dayText = computed(() => dayLabel(this.shownDay(), this.today()));

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

  private dayOfRead(q: Quick): string {
    return q.installments && (q.part ?? 1) > 1 ? dayIn(shiftMonth(monthOfDay(q.date), (q.part ?? 1) - 1), q.date) : q.date;
  }

  protected write(v: string): void {
    this.text.set(v);
    this.active.set(-1);
    this.hideSuggestions.set(false);
    this.today.set(todayISO());
    if (!v.trim()) {
      this.overrides.set({});
      this.naming.set(false);
    }
  }

  protected set(o: Overrides): void {
    this.overrides.update((x) => ({ ...x, ...o }));
  }

  protected setInstallments(v: string): void {
    const n = Math.round(Number(v));
    if (n >= 2 && n <= MAX_INSTALLMENTS) this.set({ installments: n });
  }

  protected setDay(v: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) this.set({ day: v });
  }

  protected chooseCategory(id: string): void {
    if (id === NEW_CATEGORY) {
      this.naming.set(true);
      return;
    }
    this.set({ category: id });
  }

  protected choosePay(p: PayMethod): void {
    this.set({ pay: p });
  }

  protected createCategory(name: string): void {
    if (!name.trim()) return;
    const c = this.store.addCategory(name, this.quick().flow);
    this.set({ category: c.id });
    this.naming.set(false);
    this.field().nativeElement.focus();
  }

  protected categoriesOf(flow: Flow) {
    return this.store.categories().filter((c) => c.flow === flow);
  }

  protected nameOf(id: string): string {
    return this.store.category(id)?.name ?? 'Sem categoria';
  }

  protected colorOf(id: string): string {
    return `var(--stock-${this.store.category(id)?.color ?? 'cinza'})`;
  }

  /** Escolher um parecido: o nome e o último valor dele vão para a linha, prontos para Enter (ou para mudar o valor). */
  protected pick(i: number): void {
    const s = this.shownSuggestions()[i];
    if (!s) return;
    const text = `${s.title} ${s.flow === 'entrada' ? '+' : ''}${moneyInput(s.amount)}`;
    this.text.set(text);
    this.active.set(-1);
    this.overrides.update((o) => ({ ...o, flow: s.flow, category: s.category, ...(s.pay ? { pay: s.pay } : {}), ...(s.need ? { need: s.need } : {}) }));
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
      this.launch();
    } else if (e.key === 'Escape') {
      if (n) this.hideSuggestions.set(true);
      else if (this.text()) this.write('');
    }
  }

  protected launch(): void {
    const draft = this.entry();
    if (!draft) return;
    const now = new Date().toISOString();
    const e = { ...draft, id: newId(), createdAt: now, at: now };
    this.store.save(e);
    const elsewhere = !e.monthly && !e.installments && monthOfDay(e.date) !== this.store.month();
    this.toasts.show(`“${e.title}” lançado${elsewhere ? ` em ${monthLabel(monthOfDay(e.date)).split(' de ')[0]}` : ''}`, {
      label: 'Desfazer',
      run: () => this.store.remove(e.id),
    });
    this.write('');
    this.field().nativeElement.value = '';
    this.field().nativeElement.focus();
  }
}
