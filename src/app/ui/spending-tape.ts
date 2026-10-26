import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { MONTHS_SHORT } from '../core/dates';
import { NEED_LABEL, Need, PAY_LABEL, Row, brl } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { SpendingEditor } from './spending-editor';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Uma linha da fita, já com o que ela mostra. */
interface Line {
  row: Row;
  /** A primeira do dia (na ordem por dia): mostra o dia e abre o picote em cima. */
  firstOfDay: boolean;
  day: number;
  weekday: string;
  color: string;
  category: string;
  /** Quanto já voltou deste gasto (reembolsos ligados). */
  back: number;
}

/**
 * A fita do mês: os lançamentos como a bobina de uma máquina de somar, uma linha baixa por lançamento
 * (o dia na margem, o selinho da categoria, o nome, as marcas e o valor), para ver o mês inteiro de uma
 * vez. Por dia (o mais recente em cima, um picote entre os dias) ou os maiores primeiro. Tocar numa linha
 * abre a folhinha dela embaixo, para mudar ou apagar.
 */
@Component({
  selector: 'app-spending-tape',
  imports: [IconModule, SpendingEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h2 class="titulo" id="gf-titulo">
        {{ title() }}
        <span class="n">{{ rows().length }}</span>
      </h2>
      @if (filterName(); as f) {
        <button type="button" class="filtro" (click)="clearFilter.emit()" [attr.aria-label]="'Mostrar todas as categorias (agora só ' + f + ')'">
          <span class="selo" [style.--cor]="filterColor()" aria-hidden="true"></span>
          Só {{ f }}
          <lucide-icon [img]="CloseIcon" [size]="14" aria-hidden="true" />
        </button>
      } @else if (need() !== undefined) {
        <button type="button" class="filtro" (click)="clearFilter.emit()" [attr.aria-label]="'Mostrar todos os gastos (agora só ' + needName() + ')'">
          Só {{ needName() }}
          <lucide-icon [img]="CloseIcon" [size]="14" aria-hidden="true" />
        </button>
      }
      <div class="ordem" role="group" aria-label="Ordem da fita">
        <button type="button" class="tinta-pequena" [attr.aria-pressed]="order() === 'dia'" (click)="order.set('dia')">Por dia</button>
        <button type="button" class="tinta-pequena" [attr.aria-pressed]="order() === 'valor'" (click)="order.set('valor')">Maiores</button>
      </div>
    </header>

    @if (lines().length) {
      <ol class="linhas" aria-labelledby="gf-titulo">
        @for (l of lines(); track l.row.entry.id) {
          @let e = l.row.entry;
          <li class="linha" [class.novo-dia]="l.firstOfDay" [class.aberta]="open() === e.id" [class.prevista]="future()">
            <button
              type="button"
              class="botao"
              [attr.aria-expanded]="open() === e.id"
              [attr.aria-label]="label(l)"
              (click)="toggle(e.id)"
            >
              <span class="dia" aria-hidden="true">
                @if (l.firstOfDay || order() === 'valor') {
                  <b>{{ l.day }}</b><small>{{ l.weekday }}</small>
                }
              </span>
              <span class="selo" [style.--cor]="l.color" aria-hidden="true"></span>
              <span class="nome" aria-hidden="true">{{ e.title }}</span>
              <span class="marcas" aria-hidden="true">
                @if (l.row.part; as p) {
                  <span class="canhoto" [title]="'Parcela ' + p.n + ' de ' + p.of">{{ p.n }}/{{ p.of }}</span>
                }
                @if (l.row.fixed) {
                  <lucide-icon class="fixo" [img]="RepeatIcon" [size]="13" title="Todo mês" />
                }
                @if (e.need === 'luxo' || e.need === 'conforto') {
                  <span class="carimbo-precisava" [attr.data-need]="e.need">{{ needLabel[e.need] }}</span>
                }
                @if (e.pay === 'pix') {
                  <span class="pix">Pix</span>
                }
                @if (l.back) {
                  <span class="voltou">voltou {{ brl(l.back) }}</span>
                }
                @if (e.refundOf) {
                  <lucide-icon class="volta" [img]="BackIcon" [size]="13" title="Reembolso de um gasto" />
                }
              </span>
              <span class="cat" aria-hidden="true">{{ l.category }}</span>
              <span class="valor" [class.entrada]="e.flow === 'entrada'" aria-hidden="true">{{ e.flow === 'entrada' ? '+' : '' }}{{ brl(l.row.amount) }}</span>
            </button>
            @if (open() === e.id) {
              <app-spending-editor [row]="l.row" [month]="month()" (done)="open.set(null)" />
            }
          </li>
        }
      </ol>
    } @else {
      <p class="vazio">{{ emptyText() }}</p>
    }
  `,
  styleUrl: './spending-tape.scss',
})
export class SpendingTape {
  private readonly store = inject(SpendingStore);

  readonly rows = input.required<Row[]>();
  readonly month = input.required<string>();
  /** O mês aberto é depois do de hoje: o que aparece é o previsto (fixos e parcelas). */
  readonly future = input(false);
  /** Só esta categoria (escolhida num envelope). */
  readonly filter = input<string | null>(null);
  /** Só os gastos com esta resposta ao "Precisava?" (`null`: os sem resposta), escolhida na peça dela. */
  readonly need = input<Need | null | undefined>(undefined);
  /** Quanto já voltou de cada gasto. */
  readonly refunds = input<Map<string, number>>(new Map());
  readonly clearFilter = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly RepeatIcon = ICON.repetir;
  protected readonly BackIcon = ICON.desfazer;
  protected readonly brl = brl;
  protected readonly needLabel = NEED_LABEL;

  protected readonly order = signal<'dia' | 'valor'>('dia');
  protected readonly open = signal<string | null>(null);

  protected readonly title = computed(() => {
    const m = Number(this.month().slice(5, 7)) - 1;
    return (this.future() ? 'Previsto em ' : 'Fita de ') + ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m];
  });

  protected readonly filterName = computed(() => {
    const f = this.filter();
    return f ? (this.store.category(f)?.name ?? 'Sem categoria') : null;
  });
  protected readonly needName = computed(() => {
    const n = this.need();
    return n ? NEED_LABEL[n].toLocaleLowerCase('pt-BR') : 'sem resposta';
  });
  protected readonly filterColor = computed(() => `var(--stock-${this.store.category(this.filter() ?? '')?.color ?? 'cinza'})`);

  protected readonly lines = computed<Line[]>(() => {
    const rows = [...this.rows()];
    if (this.order() === 'valor') rows.sort((a, b) => b.amount - a.amount);
    let last = '';
    return rows.map((row) => {
      const c = this.store.category(row.entry.category);
      const d = new Date(Date.UTC(+row.day.slice(0, 4), +row.day.slice(5, 7) - 1, +row.day.slice(8, 10)));
      const first = row.day !== last;
      last = row.day;
      return {
        row,
        firstOfDay: this.order() === 'dia' && first,
        day: d.getUTCDate(),
        weekday: WEEKDAYS[d.getUTCDay()],
        color: `var(--stock-${c?.color ?? 'cinza'})`,
        category: c?.name ?? 'Sem categoria',
        back: this.refunds().get(row.entry.id) ?? 0,
      };
    });
  });

  protected readonly emptyText = computed(() =>
    this.filter() ? 'Nada nesta categoria no mês.' : this.need() !== undefined ? 'Nada assim no mês.' : this.future() ? 'Nada previsto para este mês ainda.' : 'Nada lançado neste mês ainda. Anote o primeiro aí em cima.',
  );

  protected toggle(id: string): void {
    this.open.set(this.open() === id ? null : id);
  }

  /** A linha inteira, dita de uma vez para o leitor de tela. */
  protected label(l: Line): string {
    const e = l.row.entry;
    const parts = [
      `${l.day} de ${MONTHS_SHORT[Number(l.row.day.slice(5, 7)) - 1]}`,
      e.title,
      `${e.flow === 'entrada' ? 'entrou' : 'saiu'} ${brl(l.row.amount)}`,
      l.category,
    ];
    if (l.row.part) parts.push(`parcela ${l.row.part.n} de ${l.row.part.of}`);
    if (l.row.fixed) parts.push('todo mês');
    if (e.pay && e.pay !== 'parcelado') parts.push(PAY_LABEL[e.pay]);
    if (e.need) parts.push(NEED_LABEL[e.need]);
    if (l.back) parts.push(`voltou ${brl(l.back)}`);
    return parts.join(', ');
  }
}
