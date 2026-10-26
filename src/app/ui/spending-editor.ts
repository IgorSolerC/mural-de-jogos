import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import {
  Entry,
  Flow,
  MAX_INSTALLMENTS,
  PAY_LABEL,
  PAY_METHODS,
  PayMethod,
  Row,
  TITLE_MAX,
  brl,
  dayIn,
  fixedValue,
  isDay,
  monthLabel,
  monthOfDay,
  moneyInput,
  parseMoney,
  rowsIn,
  shiftMonth,
} from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { Confirm } from './confirm';
import { Toasts } from './toast';

/** O jeito do lançamento: uma vez só, parcelado ou todo mês. */
type Kind = 'uma' | 'parcelado' | 'fixo';

/**
 * O lançamento aberto na fita, para mudar: tudo dele numa folhinha embaixo da linha, nada muda até
 * Salvar. No fixo, o valor mudado vale deste mês em diante (os meses de antes ficam como foram) e apagar
 * pergunta se é só neste mês ou daqui para a frente; no parcelado, o valor é o de cada parcela.
 */
@Component({
  selector: 'app-spending-editor',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = draft();
    <form class="folhinha" (submit)="$event.preventDefault(); save()" (keydown.escape)="done.emit()">
      <div class="linha-1">
        <div class="segs" role="radiogroup" aria-label="Saiu ou entrou">
          @for (f of flows; track f.id) {
            <label class="seg" [class.entrada]="f.id === 'entrada'">
              <input type="radio" name="ge-direcao" [checked]="d.flow === f.id" (change)="setFlow(f.id)" />
              {{ f.label }}
            </label>
          }
        </div>
        <label class="campo nome" [class.erro]="tried() && !d.title.trim()">
          <span class="sr-only">Nome</span>
          <input #nome type="text" autocomplete="off" [maxLength]="titleMax" [value]="d.title" placeholder="Nome" (input)="patch({ title: $any($event.target).value })" />
        </label>
        <label class="campo valor" [class.erro]="tried() && !amount()">
          <span class="rs" aria-hidden="true">R$</span>
          <span class="sr-only">{{ kind() === 'parcelado' ? 'Valor de cada parcela' : 'Valor' }}</span>
          <input type="text" inputmode="decimal" autocomplete="off" [value]="amountText()" (input)="amountText.set($any($event.target).value)" />
        </label>
      </div>

      <div class="linha-2">
        <label class="escolha">
          <span>Categoria</span>
          <span class="caixa">
            <span class="selo" [style.--cor]="'var(--stock-' + (store.category(d.category)?.color ?? 'cinza') + ')'" aria-hidden="true"></span>
            <select [value]="d.category" (change)="patch({ category: $any($event.target).value })">
              @for (c of categories(); track c.id) {
                <option [value]="c.id" [selected]="c.id === d.category">{{ c.name }}</option>
              }
            </select>
          </span>
        </label>

        @if (d.flow === 'saida') {
          <label class="escolha">
            <span>Pagamento</span>
            <span class="caixa">
              <select (change)="setPay($any($event.target).value)">
                @for (p of pays; track p) {
                  <option [value]="p" [selected]="p === (d.pay ?? 'avista')">{{ payLabel[p] }}</option>
                }
              </select>
            </span>
          </label>
        }

        @if (kind() === 'parcelado') {
          <label class="escolha curto">
            <span>Parcelas</span>
            <span class="caixa">
              <input type="number" inputmode="numeric" min="2" [max]="maxInstallments" [value]="d.installments" (input)="setInstallments($any($event.target).value)" />
            </span>
          </label>
        }

        <label class="escolha">
          <span>{{ kind() === 'parcelado' ? 'Primeira parcela' : kind() === 'fixo' ? 'Desde' : 'Dia' }}</span>
          <span class="caixa">
            <input type="date" [value]="d.date" (change)="setDate($any($event.target).value)" />
          </span>
        </label>

        @if (kind() !== 'parcelado') {
          <button type="button" class="interruptor-linha" role="switch" [attr.aria-checked]="kind() === 'fixo'" (click)="toggleMonthly()">
            <span class="interruptor" aria-hidden="true"><span class="bolinha"></span></span>
            Todo mês
          </button>
        }
      </div>

      @if (d.flow === 'entrada' && refundable().length) {
        <label class="escolha largo">
          <span>É a volta de um gasto?</span>
          <span class="caixa">
            <select (change)="patch({ refundOf: $any($event.target).value || undefined })">
              <option value="" [selected]="!d.refundOf">Não</option>
              @for (r of refundable(); track r.id) {
                <option [value]="r.id" [selected]="r.id === d.refundOf">{{ r.title }} · {{ brl(r.amount) }} ({{ r.when }})</option>
              }
            </select>
          </span>
        </label>
      }

      @if (note(); as n) {
        <p class="nota">{{ n }}</p>
      }
      @if (tried() && problem(); as p) {
        <p class="erro-msg" role="alert">{{ p }}</p>
      }

      <div class="pe">
        <button type="button" class="apagar" (click)="remove()">
          <lucide-icon [img]="DeleteIcon" [size]="16" aria-hidden="true" />
          Apagar
        </button>
        <button type="button" class="cancelar" (click)="done.emit()">Cancelar</button>
        <button type="submit" class="salvar">Salvar</button>
      </div>
    </form>
  `,
  styleUrl: './spending-editor.scss',
})
export class SpendingEditor {
  protected readonly store = inject(SpendingStore);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  readonly row = input.required<Row>();
  readonly month = input.required<string>();
  readonly done = output<void>();

  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nome');

  protected readonly DeleteIcon = ICON.apagar;
  protected readonly brl = brl;
  protected readonly payLabel = PAY_LABEL;
  protected readonly pays = PAY_METHODS;
  protected readonly titleMax = TITLE_MAX;
  protected readonly maxInstallments = MAX_INSTALLMENTS;
  protected readonly flows: readonly { id: Flow; label: string }[] = [
    { id: 'saida', label: 'Saiu' },
    { id: 'entrada', label: 'Entrou' },
  ];

  protected readonly draft = signal<Entry>(null!);
  protected readonly amountText = signal('');
  protected readonly tried = signal(false);

  constructor() {
    afterNextRender(() => this.nameField().nativeElement.focus({ preventScroll: true }));
  }

  ngOnInit(): void {
    const r = this.row();
    this.draft.set({ ...r.entry });
    // no fixo, o valor deste mês (o que a pessoa vê na fita)
    this.amountText.set(moneyInput(r.amount));
  }

  protected readonly kind = computed<Kind>(() => {
    const d = this.draft();
    return d.monthly ? 'fixo' : d.installments ? 'parcelado' : 'uma';
  });

  protected readonly amount = computed(() => parseMoney(this.amountText()));

  protected readonly categories = computed(() => this.store.categories().filter((c) => c.flow === this.draft().flow));

  /** Os gastos que esta entrada pode estar devolvendo: os deste mês e dos dois de antes. */
  protected readonly refundable = computed(() => {
    const out: { id: string; title: string; amount: number; when: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const m = shiftMonth(this.month(), -i);
      for (const r of rowsIn(this.store.entries(), m)) {
        if (r.entry.flow !== 'saida' || r.fixed || r.part) continue;
        out.push({ id: r.entry.id, title: r.entry.title, amount: r.amount, when: `${Number(r.day.slice(8, 10))}/${r.day.slice(5, 7)}` });
      }
    }
    return out;
  });

  /** O que muda além deste mês, dito antes de salvar. */
  protected readonly note = computed(() => {
    const d = this.draft();
    const a = this.amount();
    if (this.kind() === 'fixo' && this.row().fixed && a && a !== this.row().amount && this.month() > monthOfDay(d.date)) {
      return `O valor novo vale de ${monthLabel(this.month()).split(' de ')[0]} em diante; os meses de antes ficam como foram.`;
    }
    if (this.kind() === 'parcelado' && a && d.installments) return `${d.installments}× de ${brl(a)}: ${brl(a * d.installments)} no total.`;
    return null;
  });

  protected readonly problem = computed(() => {
    if (!this.draft().title.trim()) return 'Falta o nome.';
    if (!this.amount()) return 'Falta o valor (assim: 44,90).';
    return null;
  });

  protected patch(p: Partial<Entry>): void {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  protected setFlow(flow: Flow): void {
    this.draft.update((d) => {
      const next: Entry = { ...d, flow, category: flow === 'saida' ? 'outros' : 'outras-entradas' };
      if (flow === 'entrada') {
        delete next.pay;
        delete next.installments;
      } else {
        next.pay = 'avista';
        delete next.refundOf;
      }
      return next;
    });
  }

  protected setPay(p: PayMethod): void {
    this.draft.update((d) => {
      const next: Entry = { ...d, pay: p };
      if (p === 'parcelado') {
        next.installments = d.installments ?? 2;
        delete next.monthly;
        delete next.values;
        delete next.skip;
        delete next.until;
      } else delete next.installments;
      return next;
    });
  }

  protected setInstallments(v: string): void {
    const n = Math.round(Number(v));
    if (n >= 2 && n <= MAX_INSTALLMENTS) this.patch({ installments: n });
  }

  protected setDate(v: string): void {
    if (isDay(v)) this.patch({ date: v });
  }

  protected toggleMonthly(): void {
    this.draft.update((d) => {
      const next = { ...d };
      if (d.monthly) {
        delete next.monthly;
        delete next.values;
        delete next.skip;
        delete next.until;
        // de fixo para uma vez só: fica neste mês
        next.date = dayIn(this.month(), d.date);
      } else {
        next.monthly = true;
        delete next.refundOf;
      }
      return next;
    });
  }

  protected save(): void {
    this.tried.set(true);
    const a = this.amount();
    const d = this.draft();
    if (this.problem() || !a) return;
    const next: Entry = { ...d, title: d.title.trim() };
    const was = this.row().entry;
    if (next.monthly && was.monthly) {
      // o fixo: o valor mudado vale deste mês em diante (no primeiro mês, muda o de nascença)
      const m = this.month();
      if (a !== fixedValue(was, m)) {
        if (m <= monthOfDay(next.date)) next.amount = a;
        else next.values = { ...next.values, [m]: a };
      }
    } else next.amount = a;
    this.store.save(next);
    this.done.emit();
  }

  protected async remove(): Promise<void> {
    const r = this.row();
    const e = r.entry;
    const month = this.month();
    const name = monthLabel(month).split(' de ')[0];
    if (e.monthly && month > monthOfDay(e.date)) {
      const choice = await this.confirm.choose({
        title: `Apagar “${e.title}”?`,
        text: 'Ele se repete todo mês. Os meses de antes continuam com ele.',
        confirm: `De ${name} em diante`,
        secondary: `Só em ${name}`,
      });
      if (!choice) return;
      const before = { ...e };
      if (choice === 'confirm') this.store.stopBefore(e.id, month);
      else this.store.skipMonth(e.id, month);
      this.toasts.show(choice === 'confirm' ? `“${e.title}” parou em ${monthLabel(shiftMonth(month, -1)).split(' de ')[0]}` : `“${e.title}” saiu de ${name}`, {
        label: 'Desfazer',
        run: () => this.store.restore(before),
      });
      this.done.emit();
      return;
    }
    const gone = this.store.remove(e.id);
    if (gone) this.toasts.show(`“${e.title}” apagado`, { label: 'Desfazer', run: () => this.store.restore(gone) });
    this.done.emit();
  }
}
