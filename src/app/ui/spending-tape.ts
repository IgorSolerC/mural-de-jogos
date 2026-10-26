import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { MONTHS_SHORT } from '../core/dates';
import { ME, NEED_LABEL, PAY_LABEL, Row, brl, peopleOf, shareOf } from '../core/spending';
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
  /** O dia é de outro mês (conta neste pela fatura): o mês dele, curto ("nov"). */
  otherMonth?: string;
  color: string;
  category: string;
  /** Quanto já voltou deste gasto (reembolsos ligados). */
  back: number;
  /** Com quem foi, quando não é só você: os outros nomes ("Bruna, Biel"; "só Bruna" sem você) e quantos são. */
  people?: { names: string; n: number };
  /** Com uma pessoa escolhida: a parte dela neste gasto ("1/3"). */
  share?: { amount: number; of: number };
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
        <span class="n">{{ filtered() ? rows().length + ' de ' + total() : rows().length }}</span>
      </h2>
      @if (filtered()) {
        <button type="button" class="filtro" (click)="clearFilter.emit()" aria-label="Tirar os filtros e mostrar o mês inteiro">
          Filtrada
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
        @for (l of shown(); track l.row.entry.id) {
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
                  <b>{{ l.day }}</b>
                  @if (l.otherMonth) {
                    <small class="outro-mes">{{ l.otherMonth }}</small>
                  } @else {
                    <small>{{ l.weekday }}</small>
                  }
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
                @if (l.people; as p) {
                  <span class="com" [title]="'Com ' + p.names">
                    <lucide-icon [img]="PeopleIcon" [size]="13" />
                    <span class="com-nomes">{{ p.names }}</span>
                    <span class="com-n">{{ p.n }}</span>
                  </span>
                }
                @if (l.share; as s) {
                  <span class="parte">1/{{ s.of }} de {{ brl(l.row.amount) }}</span>
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
              <span class="valor" [class.entrada]="e.flow === 'entrada'" aria-hidden="true">{{ e.flow === 'entrada' ? '+' : '' }}{{ brl(l.share?.amount ?? l.row.amount) }}</span>
            </button>
            @if (open() === e.id) {
              <app-spending-editor [row]="l.row" [month]="month()" (done)="open.set(null)" />
            }
          </li>
        }
      </ol>
      @if (short() && lines().length > short()!) {
        <button type="button" class="inteira" [attr.aria-expanded]="whole()" (click)="whole.set(!whole())">
          {{ whole() ? 'Recolher a fita' : 'Ver a fita inteira (' + lines().length + ')' }}
        </button>
      }
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
  /** As linhas já vêm filtradas (os filtros moram na pasta): o título diz "3 de 12" e dá para tirar. */
  readonly filtered = input(false);
  /** Quantos lançamentos o mês tem, sem os filtros. */
  readonly total = input(0);
  /** Com uma só pessoa nos filtros: o valor de cada gasto é a parte dela. */
  readonly person = input<string | null>(null);
  /** Quanto já voltou de cada gasto. */
  readonly refunds = input<Map<string, number>>(new Map());
  /** Com os gráficos: a fita mostra só as primeiras linhas, e "Ver a fita inteira" abre o resto. */
  readonly short = input<number | null>(null);
  readonly clearFilter = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly RepeatIcon = ICON.repetir;
  protected readonly BackIcon = ICON.desfazer;
  protected readonly PeopleIcon = ICON.pessoas;
  protected readonly brl = brl;
  protected readonly needLabel = NEED_LABEL;

  protected readonly order = signal<'dia' | 'valor'>('dia');
  protected readonly open = signal<string | null>(null);
  /** A fita curta foi aberta inteira. */
  protected readonly whole = signal(false);

  protected readonly title = computed(() => {
    const m = Number(this.month().slice(5, 7)) - 1;
    return (this.future() ? 'Previsto em ' : 'Fita de ') + ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m];
  });

  protected readonly personName = computed(() => {
    const p = this.person();
    return p ? (this.store.person(p)?.name ?? 'Alguém') : null;
  });

  protected readonly lines = computed<Line[]>(() => {
    const rows = [...this.rows()];
    const person = this.person();
    const sharedOf = (r: Row) => (person ? shareOf(r.entry, r.amount, person) : r.amount);
    if (this.order() === 'valor') rows.sort((a, b) => sharedOf(b) - sharedOf(a));
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
        otherMonth: row.day.slice(0, 7) !== this.month() ? MONTHS_SHORT[d.getUTCMonth()] : undefined,
        color: `var(--stock-${c?.color ?? 'cinza'})`,
        category: c?.name ?? 'Sem categoria',
        back: this.refunds().get(row.entry.id) ?? 0,
        people: this.peopleMark(row),
        share: person && peopleOf(row.entry).length > 1 ? { amount: sharedOf(row), of: peopleOf(row.entry).length } : undefined,
      };
    });
  });

  /** As linhas à mostra: todas, ou as primeiras da fita curta (e a aberta, se estiver mais embaixo). */
  protected readonly shown = computed(() => {
    const n = this.short();
    const lines = this.lines();
    if (!n || this.whole() || lines.length <= n) return lines;
    return lines.filter((l, i) => i < n || l.row.entry.id === this.open());
  });

  protected readonly emptyText = computed(() =>
    this.filtered() ? 'Nada com esses filtros no mês.' : this.future() ? 'Nada previsto para este mês ainda.' : 'Nada lançado neste mês ainda. Anote o primeiro aí em cima.',
  );

  /** A marca de com quem foi: os outros nomes (sem você, que é o normal); "só Bruna" quando você não estava. */
  private peopleMark(row: Row): Line['people'] {
    const ids = peopleOf(row.entry);
    if (row.entry.flow !== 'saida' || (ids.length === 1 && ids[0] === ME)) return undefined;
    const others = ids.filter((id) => id !== ME).map((id) => this.store.person(id)?.name ?? 'Alguém');
    const names = others.length > 2 ? `${others[0]} +${others.length - 1}` : others.join(', ');
    return { names: ids.includes(ME) ? names : `só ${names}`, n: ids.length };
  }

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
      ...(l.share ? [`a parte de ${this.personName()}: ${brl(l.share.amount)}`] : []),
      l.category,
    ];
    if (l.row.part) parts.push(`parcela ${l.row.part.n} de ${l.row.part.of}`);
    if (l.row.fixed) parts.push('todo mês');
    if (l.otherMonth) parts.push(`do dia ${l.day} de ${l.otherMonth}, conta neste mês`);
    if (e.pay && e.pay !== 'parcelado') parts.push(PAY_LABEL[e.pay]);
    if (e.need) parts.push(NEED_LABEL[e.need]);
    if (l.people) parts.push(`com ${peopleOf(e).map((id) => this.store.person(id)?.name ?? 'alguém').join(', ')}`);
    if (l.back) parts.push(`voltou ${brl(l.back)}`);
    return parts.join(', ');
  }
}
