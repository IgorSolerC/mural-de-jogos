import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, output, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { STOCKS, STOCK_LABEL, Stock } from '../core/review';
import { CATEGORY_NAME_MAX, Flow, SpendingCategory, brl, moneyInput, parseMoney } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { Pin } from './pin';

/**
 * Ajustar os envelopes: as categorias de saída e de entrada, cada uma com a cartolina dela, o nome e,
 * nas saídas, o limite do mês (vazio, sem limite). Tudo vale na hora, como nos Ajustes. Apagar uma
 * categoria passa os lançamentos dela para "Outros"; os "Outros" de cada lado ficam sempre.
 */
@Component({
  selector: 'app-spending-categories-sheet',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet envelopes" aria-labelledby="ge-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" style="--stock: var(--stock-azul)" data-cor="azul">
        <app-pin class="pin" color="#f4f4f0" />
        <header class="head">
          <div class="titulos">
            <h2 id="ge-titulo">Envelopes</h2>
            <p class="sub">As categorias e o limite de cada mês · vale na hora</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          @for (g of groups(); track g.flow) {
            <section class="grupo" [attr.aria-labelledby]="'ge-' + g.flow">
              <h3 class="grupo-titulo" [id]="'ge-' + g.flow">{{ g.title }}</h3>
              @if (g.flow === 'saida') {
                <p class="dica">O limite é quanto você quer gastar no envelope por mês: passou, ele estoura.</p>
              }
              <ul class="lista">
                @for (c of g.list; track c.id) {
                  <li class="cat">
                    <label class="cor" [style.--cor]="'var(--stock-' + c.color + ')'" [title]="'Cor: ' + stockLabel[c.color]">
                      <span class="sr-only">Cor de {{ c.name }}</span>
                      <select (change)="setColor(c, $any($event.target).value)">
                        @for (s of stocks; track s) {
                          <option [value]="s" [selected]="s === c.color">{{ stockLabel[s] }}</option>
                        }
                      </select>
                    </label>
                    <label class="campo nome">
                      <span class="sr-only">Nome</span>
                      <input type="text" [maxLength]="nameMax" [value]="c.name" (change)="rename(c, $any($event.target).value, $any($event.target))" />
                    </label>
                    @if (g.flow === 'saida') {
                      <label class="campo limite">
                        <span class="rs" aria-hidden="true">R$</span>
                        <span class="sr-only">Limite do mês de {{ c.name }}</span>
                        <input
                          type="text"
                          inputmode="decimal"
                          placeholder="sem limite"
                          [value]="c.budget ? money(c.budget) : ''"
                          (change)="setBudget(c, $any($event.target).value, $any($event.target))"
                        />
                      </label>
                    }
                    @if (fixed(c.id)) {
                      <span class="sem-apagar" aria-hidden="true"></span>
                    } @else {
                      <button type="button" class="icon-btn apagar" [attr.aria-label]="'Apagar ' + c.name" (click)="remove(c)">
                        <lucide-icon [img]="DeleteIcon" [size]="18" aria-hidden="true" />
                      </button>
                    }
                  </li>
                }
              </ul>
              <form class="nova" (submit)="$event.preventDefault(); add(g.flow, nova)">
                <label class="campo">
                  <span class="sr-only">Nova categoria de {{ g.flow === 'saida' ? 'saída' : 'entrada' }}</span>
                  <input #nova type="text" [maxLength]="nameMax" placeholder="Nova categoria" autocomplete="off" />
                </label>
                <button type="submit" class="botao-papel">
                  <lucide-icon [img]="AddIcon" [size]="16" aria-hidden="true" />
                  Criar
                </button>
              </form>
            </section>
          }
        </div>

        <footer class="foot">
          <button type="button" class="btn-ink" (click)="close()">Pronto</button>
        </footer>
      </div>
    </dialog>
  `,
  styleUrl: './spending-categories-sheet.scss',
})
export class SpendingCategoriesSheet {
  private readonly store = inject(SpendingStore);
  private readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly DeleteIcon = ICON.apagar;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly stocks = STOCKS;
  protected readonly stockLabel = STOCK_LABEL;
  protected readonly nameMax = CATEGORY_NAME_MAX;
  protected readonly money = moneyInput;

  protected readonly groups = computed(() => [
    { flow: 'saida' as Flow, title: 'Saídas', list: this.store.categories().filter((c) => c.flow === 'saida') },
    { flow: 'entrada' as Flow, title: 'Entradas', list: this.store.categories().filter((c) => c.flow === 'entrada') },
  ]);

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected fixed(id: string): boolean {
    return id === 'outros' || id === 'outras-entradas';
  }

  protected setColor(c: SpendingCategory, color: Stock): void {
    this.store.saveCategory({ ...c, color });
  }

  protected rename(c: SpendingCategory, name: string, el: HTMLInputElement): void {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      el.value = c.name;
      return;
    }
    if (clean !== c.name) this.store.saveCategory({ ...c, name: clean });
  }

  protected setBudget(c: SpendingCategory, raw: string, el: HTMLInputElement): void {
    if (!raw.trim()) {
      if (c.budget) {
        const next = { ...c };
        delete next.budget;
        this.store.saveCategory(next);
      }
      return;
    }
    const cents = parseMoney(raw);
    if (!cents) {
      el.value = c.budget ? moneyInput(c.budget) : '';
      return;
    }
    if (cents !== c.budget) this.store.saveCategory({ ...c, budget: cents });
    el.value = moneyInput(cents);
  }

  protected add(flow: Flow, el: HTMLInputElement): void {
    if (!el.value.trim()) return;
    this.store.addCategory(el.value, flow);
    el.value = '';
  }

  protected async remove(c: SpendingCategory): Promise<void> {
    const n = this.store.entries().filter((e) => e.category === c.id).length;
    if (n) {
      const ok = await this.confirm.ask({
        title: `Apagar “${c.name}”?`,
        text: `${n === 1 ? 'O lançamento dela passa' : `Os ${n} lançamentos dela passam`} para “Outros”${c.budget ? `, e o limite de ${brl(c.budget)} sai junto` : ''}.`,
        confirm: 'Apagar a categoria',
      });
      if (!ok) return;
    }
    this.store.removeCategory(c.id);
  }
}
