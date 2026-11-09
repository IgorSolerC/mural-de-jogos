import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { MONTHS_SHORT } from '../core/dates';
import { ME, NEED_LABEL, PAY_LABEL, Row, brl, monthOfDay, peopleOf, shareOf } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { ContextMenu, ContextMenuTrigger, MenuItem, MenuSections } from './context-menu';
import { focusAfterRemoval } from './focus';
import { RemoveAsking } from './remove-asking';
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
  imports: [ContextMenu, IconModule, SpendingEditor],
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
        @for (l of lines(); track l.row.entry.id) {
          @let e = l.row.entry;
          <li class="linha" [class.novo-dia]="l.firstOfDay" [class.aberta]="open() === e.id" [class.prevista]="future()">
            <button
              type="button"
              class="botao"
              [attr.data-lancamento]="e.id"
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
    } @else {
      <p class="vazio">{{ emptyText() }}</p>
    }

    <!-- o botão direito (ou o dedo segurado) numa linha: o menu dela (ui/context-menu.ts) -->
    <app-context-menu #menu [caption]="menuCaption()" [sections]="menuSections()" (closed)="menuOn.set(null)" />
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
  readonly clearFilter = output<void>();
  /** A categoria em que a fita está filtrada sozinha (o envelope escolhido), se está. */
  readonly category = input<string | null>(null);
  /** "Só <categoria>" no menu de uma linha: a fita fica só com ela. */
  readonly onlyCategory = output<string>();
  /** "Só <pessoa>" no menu de uma linha com mais gente: a fita fica só com a parte dela. */
  readonly onlyPerson = output<string>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly RepeatIcon = ICON.repetir;
  protected readonly BackIcon = ICON.desfazer;
  protected readonly PeopleIcon = ICON.pessoas;
  protected readonly brl = brl;
  protected readonly needLabel = NEED_LABEL;

  protected readonly order = signal<'dia' | 'valor'>('dia');
  protected readonly open = signal<string | null>(null);

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

  // ===== o menu do botão direito numa linha =====

  private readonly asking = inject(RemoveAsking);
  private readonly menu = viewChild.required<ContextMenu>('menu');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** A linha com o menu aberto (o id do lançamento). */
  protected readonly menuOn = signal<string | null>(null);
  /** O lançamento da linha com o menu, como está agora. */
  private readonly menuRow = computed(() => {
    const id = this.menuOn();
    return id ? (this.rows().find((r) => r.entry.id === id) ?? null) : null;
  });
  protected readonly menuCaption = computed(() => this.menuRow()?.entry.title ?? '');

  constructor() {
    new ContextMenuTrigger({
      host: this.host,
      targets: '.botao[data-lancamento]',
      keyOf: (box) => box.getAttribute('data-lancamento'),
      hold: true,
      isOpenFor: (id) => this.menu().isOpenFor(id),
      open: (id, box, x, y, by) => {
        this.menuOn.set(id);
        this.menu().show({ key: id, x, y, by, back: box });
      },
    });
  }

  /**
   * O que dá para fazer com um lançamento sem abrir a folhinha: abri-la, deixar a fita só com a
   * categoria dele ou só com uma das pessoas dele (ou, já filtrada nelas, o mês inteiro de novo) e apagar,
   * com a mesma pergunta da folhinha.
   */
  protected readonly menuSections = computed<MenuSections>(() => {
    const row = this.menuRow();
    if (!row) return [];
    const e = row.entry;
    const cat = this.store.category(e.category);
    const only = this.category() === e.category;
    const open: MenuItem[] = this.open() === e.id ? [] : [{ id: 'editar', label: 'Editar', icon: ICON.editar, hint: 'A folhinha dele, para mudar', run: () => this.open.set(e.id) }];
    const people = peopleOf(e);
    const person = this.person();
    // a fita já está só nesta categoria, ou só numa pessoa deste gasto: o mês inteiro de novo
    const filter: MenuItem[] =
      only || (person && people.includes(person)) ? [{ id: 'filtro', label: 'Ver o mês inteiro', icon: ICON.calendario, hint: 'Tirar os filtros da fita', run: () => this.clearFilter.emit() }] : [];
    // com outro filtro ligado, o "Só" se junta a ele (como escolher na cartela dos filtros)
    const along = this.filtered() ? ', junto do filtro de agora' : '';
    if (!only) filter.push({ id: 'categoria', label: `Só ${cat?.name ?? 'Sem categoria'}`, icon: ICON.filtrar, hint: `A fita e o mês a mês só com esta categoria${along}`, run: () => this.onlyCategory.emit(e.category) });
    // cada pessoa com quem o gasto foi (você, não: é a fita de sempre), como no Por pessoa, numa leva só delas
    const who: MenuItem[] = [];
    for (const id of e.flow === 'saida' ? people : []) {
      const name = this.store.person(id)?.name;
      if (id === ME || id === person || !name) continue;
      who.push({ id: `pessoa-${id}`, label: `Só ${name}`, icon: ICON.pessoa, hint: `A parte de ${name} em cada gasto${along}`, run: () => this.onlyPerson.emit(id) });
    }
    return [
      [...open, ...filter],
      who,
      // o fixo visto depois do mês em que nasceu pergunta antes (de quando em diante); o resto apaga com o Desfazer
      [{ id: 'apagar', label: 'Apagar o lançamento', icon: ICON.apagar, danger: true, dialog: !!e.monthly && this.month() > monthOfDay(e.date), run: () => void this.remove(e.id) }],
    ];
  });

  private async remove(id: string): Promise<void> {
    const row = this.rows().find((r) => r.entry.id === id);
    if (!row || !(await this.asking.entry(row.entry, this.month()))) return;
    if (this.open() === id) this.open.set(null);
    // a linha saiu da fita (o foco tinha voltado para ela): o foco vai para a de baixo, ou a de cima
    const ids = this.lines().map((l) => l.row.entry.id);
    focusAfterRemoval(this.host, ids, id, (n) => `.botao[data-lancamento="${CSS.escape(n)}"]`, '.ordem .tinta-pequena');
  }
}
