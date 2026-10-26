import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { newId } from '../core/review';
import {
  Entry,
  Flow,
  MAX_INSTALLMENTS,
  ME,
  NEEDS,
  NEED_LABEL,
  Need,
  PAY_LABEL,
  PAY_METHODS,
  PayMethod,
  Row,
  Shift,
  TITLE_MAX,
  brl,
  dayIn,
  firstMonth,
  fixedValue,
  isDay,
  monthLabel,
  monthOfDay,
  moneyInput,
  parseMoney,
  peopleOf,
  rowIn,
  rowsIn,
  shiftMonth,
} from '../core/spending';
import { PersonRef, Quick, peopleText } from '../core/spending-quick';
import { SpendingStore } from '../core/spending-store';
import { Confirm } from './confirm';
import { SpendingPeoplePicker } from './spending-people-picker';
import { Toasts } from './toast';

/** O jeito do lançamento: uma vez só, parcelado ou todo mês. */
type Kind = 'uma' | 'parcelado' | 'fixo';

/** O que a pessoa mudou na folhinha, campo a campo (`undefined`: tirou o campo). */
type Edits = { [K in keyof Entry]?: Entry[K] | undefined };

const NEW_CATEGORY = '__nova';

/** O lançamento que a linha de anotar leu, como a folhinha começa (sem valor ainda: 0). */
export function seedEntry(q: Quick): Entry {
  return {
    id: '',
    title: q.title,
    amount: q.amount ?? 0,
    flow: q.flow,
    category: q.category,
    ...(q.flow === 'saida' ? { pay: q.installments ? ('parcelado' as const) : (q.pay ?? 'avista') } : {}),
    ...(q.need && q.flow === 'saida' ? { need: q.need } : {}),
    ...(q.shift && !q.monthly ? { shift: q.shift } : {}),
    ...(q.installments && q.flow === 'saida' ? { installments: q.installments } : {}),
    ...(q.monthly ? { monthly: true as const } : {}),
    date: q.date,
    createdAt: '',
    at: '',
  };
}

/**
 * A folhinha de um lançamento: tudo dele num papel, nada muda até Salvar (ou Lançar). Serve aos dois
 * jeitos de chegar nele, com os mesmos campos:
 *
 * - **aberto na fita** (`row`): para mudar. No fixo, o valor mudado vale deste mês em diante (os meses de
 *   antes ficam como foram) e apagar pergunta se é só neste mês ou daqui para a frente; no parcelado, o
 *   valor é o de cada parcela.
 * - **novo** (`seed`): o que a linha de anotar leu ("ifood 44,90 pix ontem"), e que muda enquanto a pessoa
 *   escreve. O campo mexido aqui fica como ela deixou; os outros seguem a linha.
 */
@Component({
  selector: 'app-spending-editor',
  imports: [IconModule, SpendingPeoplePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = draft();
    <form
      class="folhinha"
      [class.nova]="isNew()"
      [attr.aria-label]="isNew() ? 'O lançamento novo' : null"
      (submit)="$event.preventDefault(); $event.target === $event.currentTarget && save()"
      (keydown.escape)="done.emit()"
    >
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
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" [value]="amountText()" (input)="amountEdit.set($any($event.target).value)" />
        </label>
      </div>

      <div class="linha-2">
        <label class="escolha">
          <span>Categoria</span>
          <span class="caixa">
            <span class="selo" [style.--cor]="'var(--stock-' + (store.category(d.category)?.color ?? 'cinza') + ')'" aria-hidden="true"></span>
            <select [value]="d.category" (change)="chooseCategory($any($event.target))">
              @for (c of categories(); track c.id) {
                <option [value]="c.id" [selected]="c.id === d.category">{{ c.name }}</option>
              }
              <option [value]="newCategory">Nova categoria…</option>
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

          <label class="escolha">
            <span>Precisava?</span>
            <span class="caixa precisava" [attr.data-need]="d.need ?? null">
              <select (change)="setNeed($any($event.target).value)">
                <option value="" [selected]="!d.need">Sem resposta</option>
                @for (n of needs; track n) {
                  <option [value]="n" [selected]="n === d.need">{{ needLabel[n] }}</option>
                }
              </select>
            </span>
          </label>

          <div class="escolha com-quem">
            <span id="ge-com-quem">Com quem</span>
            <button
              #comQuem
              type="button"
              class="caixa pessoas"
              aria-haspopup="true"
              aria-labelledby="ge-com-quem ge-com-quem-nomes"
              [attr.aria-expanded]="picking()"
              (click)="picking.set(!picking())"
            >
              <lucide-icon [img]="PeopleIcon" [size]="14" aria-hidden="true" />
              <span id="ge-com-quem-nomes">{{ peopleText(refs()) }}</span>
              <lucide-icon class="chev" [img]="ChevIcon" [size]="13" aria-hidden="true" />
            </button>
          </div>
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

        @if (kind() !== 'fixo') {
          <label class="escolha">
            <span>Conta em</span>
            <span class="caixa">
              <lucide-icon class="fatura" [img]="BillIcon" [size]="14" aria-hidden="true" />
              <select (change)="setShift($any($event.target).value)">
                @for (s of shifts; track s) {
                  <option [value]="s" [selected]="s === (d.shift ?? 0)">{{ shiftLabel(s) }}</option>
                }
              </select>
            </span>
          </label>
        }

        @if (kind() !== 'parcelado') {
          <button type="button" class="interruptor-linha" role="switch" [attr.aria-checked]="kind() === 'fixo'" (click)="toggleMonthly()">
            <span class="interruptor" aria-hidden="true"><span class="bolinha"></span></span>
            Todo mês
          </button>
        }
      </div>

      @if (naming()) {
        <div class="nova-cat" role="group" aria-label="Categoria nova">
          <label class="campo-mini">
            <span class="sr-only">Nome da categoria nova</span>
            <input
              #novaCat
              type="text"
              maxlength="24"
              placeholder="Nome da categoria"
              autocomplete="off"
              (keydown.enter)="$event.preventDefault(); createCategory(novaCat.value)"
              (keydown.escape)="$event.stopPropagation(); naming.set(false)"
            />
          </label>
          <button type="button" class="tinta-pequena" (click)="createCategory(novaCat.value)">Criar</button>
          <button type="button" class="tinta-pequena" (click)="naming.set(false)">Cancelar</button>
        </div>
      }

      @if (picking() && d.flow === 'saida') {
        <app-spending-people-picker class="na-folhinha" [refs]="refs()" [amount]="amount()" (changed)="setPeople($event)" (closed)="closePicker()" />
      }

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
        @if (!isNew()) {
          <button type="button" class="apagar" (click)="remove()">
            <lucide-icon [img]="DeleteIcon" [size]="16" aria-hidden="true" />
            Apagar
          </button>
        }
        <button type="button" class="cancelar" (click)="done.emit()">{{ isNew() ? 'Limpar' : 'Cancelar' }}</button>
        <button type="submit" class="salvar">
          {{ isNew() ? 'Lançar' : 'Salvar' }}
          @if (isNew()) {
            <kbd aria-hidden="true">↵</kbd>
          }
        </button>
      </div>
    </form>
  `,
  styleUrl: './spending-editor.scss',
})
export class SpendingEditor {
  protected readonly store = inject(SpendingStore);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  /** O lançamento aberto na fita (para mudar), ou nada: um lançamento novo, que parte de `seed`. */
  readonly row = input<Row | null>(null);
  /** Novo: o que a linha de anotar leu até agora. */
  readonly seed = input<Quick | null>(null);
  readonly month = input.required<string>();
  /** Fechou (Salvar, Cancelar, Esc), ou, no novo, lançou ou limpou. */
  readonly done = output<void>();

  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nome');
  private readonly peopleButton = viewChild<ElementRef<HTMLButtonElement>>('comQuem');
  private readonly categoryField = viewChild<ElementRef<HTMLInputElement>>('novaCat');

  protected readonly DeleteIcon = ICON.apagar;
  protected readonly PeopleIcon = ICON.pessoas;
  protected readonly BillIcon = ICON.fatura;
  protected readonly shifts: readonly (Shift | 0)[] = [-1, 0, 1];
  protected readonly ChevIcon = ICON.abrir;
  protected readonly peopleText = peopleText;
  protected readonly brl = brl;
  protected readonly payLabel = PAY_LABEL;
  protected readonly pays = PAY_METHODS;
  protected readonly needs = NEEDS;
  protected readonly needLabel = NEED_LABEL;
  protected readonly titleMax = TITLE_MAX;
  protected readonly maxInstallments = MAX_INSTALLMENTS;
  protected readonly newCategory = NEW_CATEGORY;
  protected readonly flows: readonly { id: Flow; label: string }[] = [
    { id: 'saida', label: 'Saiu' },
    { id: 'entrada', label: 'Entrou' },
  ];

  protected readonly isNew = computed(() => !this.row());

  /** De onde a folhinha parte: o lançamento aberto, ou o que a linha leu. */
  private readonly base = computed<Entry>(() => {
    const r = this.row();
    if (r) return r.entry;
    const q = this.seed();
    return seedEntry(q ?? { title: '', amount: null, flow: 'saida', category: 'outros', date: this.month() + '-01', from: 'padrao' });
  });
  private readonly edits = signal<Edits>({});
  /** O lançamento como está na folhinha: o de partida com o que a pessoa mudou por cima. */
  protected readonly draft = computed<Entry>(() => {
    const out: Record<string, unknown> = { ...this.base() };
    for (const [k, v] of Object.entries(this.edits())) {
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    return out as unknown as Entry;
  });

  /** O valor escrito no campo (null: o de partida). */
  protected readonly amountEdit = signal<string | null>(null);
  protected readonly amountText = computed(() => {
    const typed = this.amountEdit();
    if (typed !== null) return typed;
    const r = this.row();
    // no fixo, o valor deste mês (o que a pessoa vê na fita)
    if (r) return moneyInput(r.amount);
    const a = this.seed()?.amount;
    return a ? moneyInput(a) : '';
  });
  protected readonly tried = signal(false);
  /** A cartela de com quem foi está aberta. */
  protected readonly picking = signal(false);
  /** O nome da categoria nova está sendo escrito. */
  protected readonly naming = signal(false);
  /** Com quem foi, escolhido aqui (null: o de partida). */
  private readonly peopleEdit = signal<PersonRef[] | null>(null);

  private readonly me = computed<PersonRef>(() => ({ id: ME, name: this.store.person(ME)?.name ?? 'Eu' }));

  /** Com quem foi, com os nomes (uma pessoa que sumiu do livro fica de fora; a escrita agora com @ ainda não tem id). */
  protected readonly refs = computed<PersonRef[]>(() => {
    const chosen = this.peopleEdit();
    if (chosen?.length) return chosen;
    if (this.isNew()) return this.seed()?.people ?? [this.me()];
    const out = peopleOf(this.base()).flatMap((id) => {
      const p = this.store.person(id);
      return p ? [{ id, name: p.name }] : [];
    });
    return out.length ? out : [this.me()];
  });

  constructor() {
    // aberto na fita: o foco vai para o nome; o novo deixa o foco na linha de anotar, onde a pessoa escreve
    afterNextRender(() => {
      if (!this.isNew()) this.nameField().nativeElement.focus({ preventScroll: true });
    });
  }

  /** Muda o lançamento da folhinha: guarda só o que ficou diferente do de partida. */
  private change(fn: (d: Entry) => Entry): void {
    const next = fn(this.draft()) as unknown as Record<string, unknown>;
    const base = this.base() as unknown as Record<string, unknown>;
    const edits: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
      if (JSON.stringify(next[k]) !== JSON.stringify(base[k])) edits[k] = next[k];
    }
    this.edits.set(edits as Edits);
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
    const r = this.row();
    if (this.kind() === 'fixo' && r?.fixed && a && a !== r.amount && this.month() > monthOfDay(d.date)) {
      return `O valor novo vale de ${monthLabel(this.month()).split(' de ')[0]} em diante; os meses de antes ficam como foram.`;
    }
    if (this.kind() === 'parcelado' && a && d.installments) {
      const part = rowIn({ ...d, amount: a }, this.month())?.part;
      const now = part && part.n > 1 ? ` Em ${monthLabel(this.month()).split(' de ')[0]}, a ${part.n}ª.` : '';
      return `${d.installments}× de ${brl(a)}: ${brl(a * d.installments)} no total.${now}`;
    }
    return null;
  });

  protected readonly problem = computed(() => {
    if (!this.draft().title.trim()) return 'Falta o nome.';
    if (!this.amount()) return 'Falta o valor (assim: 44,90).';
    return null;
  });

  protected patch(p: Partial<Entry>): void {
    this.change((d) => ({ ...d, ...p }));
  }

  protected chooseCategory(el: HTMLSelectElement): void {
    if (el.value !== NEW_CATEGORY) {
      this.patch({ category: el.value });
      return;
    }
    // "Nova categoria…": o seletor volta para a de agora enquanto o nome é escrito
    el.value = this.draft().category;
    this.naming.set(true);
    setTimeout(() => this.categoryField()?.nativeElement.focus());
  }

  protected createCategory(name: string): void {
    if (!name.trim()) return;
    const c = this.store.addCategory(name, this.draft().flow);
    this.patch({ category: c.id });
    this.naming.set(false);
  }

  protected setFlow(flow: Flow): void {
    this.change((d) => {
      const next: Entry = { ...d, flow, category: flow === 'saida' ? 'outros' : 'outras-entradas' };
      if (flow === 'entrada') {
        delete next.need;
        delete next.people;
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
    this.change((d) => {
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

  protected setNeed(v: Need | ''): void {
    this.change((d) => {
      const next: Entry = { ...d };
      if (v) next.need = v;
      else delete next.need;
      return next;
    });
  }

  protected setPeople(refs: PersonRef[]): void {
    this.peopleEdit.set(refs);
  }

  protected closePicker(): void {
    this.picking.set(false);
    this.peopleButton()?.nativeElement.focus({ preventScroll: true });
  }

  /** "Setembro (mês anterior)": o mês em que conta, perto do mês do dia escolhido. */
  protected shiftLabel(s: Shift | 0): string {
    const name = monthLabel(shiftMonth(monthOfDay(this.draft().date), s)).split(' de ')[0];
    return `${name[0].toLocaleUpperCase('pt-BR')}${name.slice(1)} (${s < 0 ? 'mês anterior' : s > 0 ? 'mês seguinte' : 'mesmo mês'})`;
  }

  protected setShift(v: string): void {
    const s = Number(v);
    this.change((d) => {
      const next: Entry = { ...d };
      if (s === -1 || s === 1) next.shift = s;
      else delete next.shift;
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
    this.change((d) => {
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
        delete next.shift;
      }
      return next;
    });
  }

  /** Salvar o aberto, ou lançar o novo (a linha de anotar chama no Enter). */
  save(): void {
    this.tried.set(true);
    const a = this.amount();
    const d = this.draft();
    if (this.problem() || !a) return;
    const next: Entry = { ...d, title: d.title.trim() };
    // com quem foi (só nas saídas): quem foi escrito agora com @ e ainda não existe entra no livro
    delete next.people;
    if (next.flow === 'saida') {
      const ids = this.refs().map((r) => r.id ?? this.store.addPerson(r.name).id);
      if (ids.length && !(ids.length === 1 && ids[0] === ME)) next.people = ids;
    }
    const was = this.row()?.entry;
    if (!was) {
      const now = new Date().toISOString();
      const e: Entry = { ...next, amount: a, id: newId(), createdAt: now, at: now };
      this.store.save(e);
      const elsewhere = !rowIn(e, this.month());
      this.toasts.show(`“${e.title}” lançado${elsewhere ? ` em ${monthLabel(firstMonth(e)).split(' de ')[0]}` : ''}`, {
        label: 'Desfazer',
        run: () => this.store.remove(e.id),
      });
      this.done.emit();
      return;
    }
    if (next.monthly && was.monthly) {
      // o fixo: o valor mudado vale deste mês em diante (no primeiro mês, muda o de nascença)
      const m = this.month();
      if (a !== fixedValue(was, m)) {
        if (m <= monthOfDay(next.date)) next.amount = a;
        else next.values = { ...next.values, [m]: a };
      }
    } else next.amount = a;
    this.store.save(next);
    // saiu do mês aberto (outro dia, outro mês da fatura): diz para onde foi
    if (!rowIn(next, this.month())) {
      this.toasts.show(`“${next.title}” agora conta em ${monthLabel(firstMonth(next)).split(' de ')[0]}`, { label: 'Desfazer', run: () => this.store.restore(was) });
    }
    this.done.emit();
  }

  protected async remove(): Promise<void> {
    const r = this.row();
    if (!r) return;
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
