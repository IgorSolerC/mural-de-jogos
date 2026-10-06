import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArrowLeft, ArrowRight, ChevronDown, LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { getRecord, recordKey } from '../core/game-records';
import { measuresFor } from '../core/higher-lower';
import { cap, countOf, g } from '../core/kinds';
import { loadKnockout } from '../core/knockout-save';
import { Mural } from '../core/mural';
import { loadStats } from '../core/muraldle-save';
import { ME, Players } from '../core/players';
import { Review, VERDICT_LABEL, formatAmount, formatReviewDate, formatScore, todayISO } from '../core/review';
import {
  WEEKDAYS_LONG,
  inYear,
  monthLong,
  monthName,
  portraitLines,
  queueStats,
  strength,
  wallStats,
  yearsIn,
} from '../core/stats';
import { playOut, podium } from '../core/tournament';
import { BonusSticker } from '../ui/bonus';
import { CoverSleeve } from '../ui/cover-sleeve';
import { Skulls } from '../ui/difficulty';
import { ReviewReader } from '../ui/review-reader';
import { StatusLabel } from '../ui/status-label';
import { VerdictStamp } from '../ui/verdict';
import { Tally } from './comparison/tally';
import { Categorias } from './stats/categorias';
import { Coluna, Colunas, Marca } from './stats/colunas';
import { Dispersao } from './stats/dispersao';
import { Folhinha } from './stats/folhinha';
import { Linha, PontoLinha } from './stats/linha';
import { ListaRank } from './stats/lista-rank';
import { Numero, Numeros } from './stats/numeros';
import { Pesos } from './stats/pesos';
import { Regua } from './stats/regua';

export type Aba = 'resumo' | 'notas' | 'tempo' | 'habitos' | 'carimbos' | 'cartolinas' | 'curiosidades';

/** As páginas do dossiê, cada uma uma aba de divisória na régua. */
const ABAS: readonly { id: Aba; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'notas', label: 'Notas' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'habitos', label: 'Hábitos' },
  { id: 'carimbos', label: 'Vereditos e bônus' },
  { id: 'cartolinas', label: 'Cartolinas' },
  { id: 'curiosidades', label: 'Curiosidades' },
];

const one = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

/** As cores das fichas de número, na ordem: uma de cada, para o quadro não repetir. */
const KPI_STOCKS = [
  ['rosa', '#f4f4f0'],
  ['amarelo', '#e62e2d'],
  ['verde', '#f4f4f0'],
  ['azul', '#e62e2d'],
  ['laranja', '#f4f4f0'],
  ['lilas', '#e62e2d'],
] as const;

/**
 * Estatísticas: o mural inteiro em números, dividido em páginas por abas de fichário (Resumo, Notas,
 * Tempo, Hábitos, Vereditos e bônus, Cartolinas, Curiosidades). Cada número vem pregado num papel do
 * mundo do mural: fichas de cartolina com os números grandes, folhas de bloquinho com listas e
 * recordes, papel milimetrado com os gráficos e folha pautada com o que é texto.
 * Serve ao seu mural e ao de um colega aberto em Comparar (`Players`), e pode olhar um ano só.
 * As contas moram em `core/stats.ts`.
 */
@Component({
  selector: 'app-stats-page',
  imports: [
    BonusSticker,
    Categorias,
    Colunas,
    CoverSleeve,
    Dispersao,
    Folhinha,
    Linha,
    ListaRank,
    LucideAngularModule,
    NgTemplateOutlet,
    Numeros,
    Pesos,
    ReviewReader,
    Regua,
    RouterLink,
    Skulls,
    StatusLabel,
    Tally,
    VerdictStamp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.scss',
})
export class StatsPage {
  protected readonly mural = inject(Mural);
  protected readonly players = inject(Players);
  protected readonly desk = inject(Desk);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly BackIcon = ArrowLeft;
  protected readonly NextIcon = ArrowRight;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly PlusIcon = Plus;

  protected readonly abas = ABAS;
  protected readonly profile = this.mural.profile;
  protected readonly kind = this.mural.kind;
  protected readonly cap = cap;
  protected readonly g = g;
  protected readonly countOf = countOf;
  protected readonly fmt = formatScore;
  protected readonly verdictLabel = VERDICT_LABEL;
  protected readonly monthName = monthName;
  protected readonly monthLong = monthLong;
  protected readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  // ===== a página aberta, guardada no endereço (?aba=notas): o Voltar do navegador volta a página =====
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly aba = computed<Aba>(() => {
    const q = this.query().get('aba');
    return ABAS.some((a) => a.id === q) ? (q as Aba) : 'resumo';
  });
  protected readonly abaIndex = computed(() => ABAS.findIndex((a) => a.id === this.aba()));
  protected readonly next = computed(() => ABAS[this.abaIndex() + 1] ?? null);
  protected readonly prev = computed(() => ABAS[this.abaIndex() - 1] ?? null);

  protected setAba(id: Aba, scroll = false): void {
    if (this.aba() === id) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: { aba: id === 'resumo' ? null : id }, queryParamsHandling: 'merge' });
    if (scroll) document.getElementById('abas')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  // ===== de quem e de quando =====
  protected readonly player = this.players.selected;
  protected readonly mine = computed(() => this.player().mine);
  protected readonly all = computed(() => this.player().reviews);
  protected readonly years = computed(() => yearsIn(this.all()));
  private readonly chosenYear = signal<number | null>(null);
  /** O ano escolhido, se o mural aberto tem fichas nele; senão, todos. */
  protected readonly year = computed(() => (this.years().includes(this.chosenYear() ?? -1) ? this.chosenYear() : null));
  protected readonly list = computed(() => inYear(this.all(), this.year()));

  protected setYear(v: string): void {
    this.chosenYear.set(v ? Number(v) : null);
  }

  /** "Você" ou "Marina"; "seu mural" ou "o mural de Marina". */
  protected readonly who = computed(() => (this.mine() ? 'você' : this.player().name));
  protected readonly whose = computed(() => (this.mine() ? 'seu mural' : `mural de ${this.player().name}`));

  // ===== as contas =====
  protected readonly s = computed(() => wallStats(this.list(), this.kind()));
  protected readonly portrait = computed(() => portraitLines(this.s(), this.profile(), { you: this.mine(), name: this.player().name }));
  protected readonly queue = computed(() =>
    this.mine() ? queueStats(this.mural.reviews(), this.mural.drafts(), this.mural.wishes()) : null,
  );

  protected readonly intro = computed(() => {
    const s = this.s();
    const p = this.profile();
    const range = this.year() === null && s.first && s.last && s.first !== s.last ? `, terminad${p.fem ? 'as' : 'os'} de ${this.date(s.first)} a ${this.date(s.last)}` : '';
    const when = this.year() ? ` em ${this.year()}` : '';
    return `${countOf(p, s.count)}${when}${range}.`;
  });

  protected readonly kpis = computed<Numero[]>(() => {
    const s = this.s();
    const p = this.profile();
    const q = this.queue();
    const out: Omit<Numero, 'stock' | 'pin'>[] = [];
    out.push({
      label: cap(p.plural),
      value: int.format(s.count),
      sub: this.year() ? `terminad${p.fem ? 'as' : 'os'} em ${this.year()}` : q ? `+ ${q.drafts} pra depois · ${q.wishes} na wishlist` : `no ${this.whose()}`,
    });
    out.push({ label: 'Média', value: this.avg(s.average), sub: s.median === null ? '' : `mediana ${this.avg(s.median)}` });
    const done = s.statuses.filter((x) => x.value !== 'incompleto').reduce((t, x) => t + x.n, 0);
    out.push({ label: 'Até o fim', value: s.finishRate === null ? '–' : `${s.finishRate}%`, sub: `${done} de ${s.count} terminad${p.fem ? 'as' : 'os'}` });
    if (p.amount && s.amount) {
      const total = Math.round(s.amount.total);
      const sub = p.amount.decimals
        ? total >= 48
          ? `≈ ${int.format(Math.round(total / 24))} dias sem parar`
          : `média de ${formatAmount(this.kind(), Math.round(s.amount.avg * 10) / 10)}`
        : total >= 450
          ? `≈ ${int.format(Math.round(total / 300))} livros de 300 páginas`
          : `média de ${formatAmount(this.kind(), Math.round(s.amount.avg))}`;
      out.push({ label: p.amount.total, value: int.format(total), sub });
    } else {
      out.push({ label: 'Notas 10+', value: int.format(s.tens), sub: s.count ? `${this.pct(s.tens, s.count)} do mural` : '' });
    }
    const nine = s.finals.filter((v) => v >= 9).length;
    out.push({ label: 'Notas 9+', value: int.format(nine), sub: s.count ? `${this.pct(nine, s.count)} do mural` : '' });
    out.push({
      label: 'Palavras',
      value: int.format(s.text.words),
      sub: s.text.words >= 300 ? `≈ ${int.format(Math.round(s.text.words / 300))} páginas de livro` : `em ${s.text.withText} ${s.text.withText === 1 ? 'resenha' : 'resenhas'}`,
    });
    return out.map((k, i) => ({ ...k, stock: KPI_STOCKS[i % 6][0], pin: KPI_STOCKS[i % 6][1] }));
  });

  // ===== Notas =====
  protected readonly histTop = computed(() => this.s().histogram.length);
  protected readonly histMarks = computed<Marca[]>(() => {
    const s = this.s();
    const top = this.histTop();
    if (s.average === null || s.median === null) return [];
    const meanLeft = s.average < s.median;
    return [
      { at: Math.min(s.average, top) / top, label: `média ${this.avg(s.average)}`, side: meanLeft ? 'esq' : 'dir' },
      { at: Math.min(s.median, top) / top, label: `mediana ${this.avg(s.median)}`, dashed: true, side: meanLeft ? 'dir' : 'esq' },
    ];
  });

  // ===== Tempo =====
  /** Com um ano escolhido, as colunas são os meses dele; senão, os anos. */
  protected readonly timeBars = computed<Coluna[]>(() => {
    const s = this.s();
    if (this.year() !== null) {
      const row = s.calendar.find((r) => r.year === this.year());
      return (row?.months ?? []).map((m) => ({ key: String(m.month), label: monthName(m.month), n: m.n, avg: m.avg }));
    }
    return s.byYear;
  });

  protected readonly avgLine = computed<PontoLinha[]>(() =>
    this.timeBars().map((b) => ({ key: b.key, label: b.label, value: b.n ? (b.avg ?? null) : null, n: b.n })),
  );

  protected readonly hourBars = computed<Coluna[]>(() => this.s().hours.map((n, h) => ({ key: String(h), label: `${h}h`, n })));

  protected readonly gapText = computed(() => {
    const gap = this.s().longestGap;
    if (!gap) return null;
    const months = gap.days >= 60 ? ` (uns ${Math.round(gap.days / 30)} meses)` : '';
    return `${int.format(gap.days)} ${gap.days === 1 ? 'dia' : 'dias'}${months}`;
  });

  protected readonly topWeekday = computed(() => {
    const w = [...this.s().weekdays].sort((a, b) => b.n - a.n)[0];
    return w && w.n ? WEEKDAYS_LONG[Number(w.key)] : null;
  });

  // ===== Hábitos =====
  protected readonly amountFmt = (v: number) => formatAmount(this.kind(), Math.round(v * 10) / 10);

  protected readonly corrAmount = computed(() => {
    const r = this.s().amount?.corr ?? null;
    const p = this.profile();
    const what = p.amount?.decimals ? 'mais longo' : 'mais grosso';
    switch (strength(r)) {
      case 'forte':
        return r! > 0 ? `Quanto ${what}, maior a nota: as duas coisas andam juntas.` : `Quanto ${what}, menor a nota: o tamanho cansa.`;
      case 'media':
        return r! > 0 ? `Os ${what.replace('mais ', '')}s costumam levar nota um pouco maior.` : `Os ${what.replace('mais ', '')}s costumam levar nota um pouco menor.`;
      case 'fraca':
        return 'O tamanho quase não muda a nota.';
      default:
        return '';
    }
  });

  protected readonly statusStrip = computed(() => {
    const s = this.s();
    return s.statuses.map((x) => ({ ...x, w: s.count ? (x.n / s.count) * 100 : 0 }));
  });

  protected readonly maxDifficulty = computed(() => Math.max(1, ...(this.s().difficulties ?? []).map((d) => d.n)));

  // ===== Vereditos e bônus =====
  protected readonly topVerdict = computed(() => [...this.s().verdicts].sort((a, b) => b.n - a.n)[0]);
  protected readonly maxBonus = computed(() => Math.max(1, ...this.s().bonuses.favor.map((b) => b.n), ...this.s().bonuses.contra.map((b) => b.n)));

  // ===== Cartolinas =====
  protected readonly maxStock = computed(() => Math.max(1, ...this.s().stocks.map((x) => x.n)));
  protected readonly maxSource = computed(() => Math.max(1, ...this.s().covers.sources.map((x) => x.n)));
  protected readonly kit = computed(() => {
    const s = this.s();
    return [
      { id: 'papel', label: 'Papel', items: s.papers, none: 'Só a cartolina de sempre' },
      { id: 'estampa', label: 'Estampa', items: s.patterns, none: 'Nenhuma estampa' },
      { id: 'rabisco', label: 'Rabisco', items: s.scribbles, none: 'Nenhum rabisco' },
      { id: 'estrago', label: 'Estrago', items: s.damages, none: 'Nenhum estrago' },
      { id: 'mancha', label: 'Mancha', items: s.stains, none: 'Nenhuma mancha' },
      { id: 'decoracao', label: 'Decoração', items: s.decors, none: 'Nenhuma decoração' },
    ];
  });

  // ===== Curiosidades =====
  protected readonly initialBars = computed<Coluna[]>(() => this.s().initials.map((x) => ({ key: x.letter, label: x.letter, n: x.n })));
  protected readonly missingLetters = computed(() =>
    this.s()
      .initials.filter((x) => x.n === 0 && x.letter !== '#')
      .map((x) => x.letter),
  );

  /** Os jogos de Extras, só no seu mural: os recordes ficam neste navegador. */
  protected readonly extras = computed(() => {
    if (!this.mine()) return null;
    const kind = this.kind();
    const daily = loadStats(`${kind}|${ME}`, todayISO());
    const records = measuresFor(kind)
      .map((m) => ({ key: m.key, label: m.label, n: getRecord(recordKey('maior-ou-menor', kind, ME, m.key)) }))
      .filter((r) => r.n > 0);
    let champion: Review | null = null;
    const ko = loadKnockout(kind);
    if (ko && ko.owner === ME) {
      const podiumNow = podium(playOut(ko.slots, ko.picks, ko.draws ?? []));
      if (podiumNow) champion = this.mural.reviews().find((r) => r.id === podiumNow.champion) ?? null;
    }
    return { daily, records, champion };
  });

  // ===== formatos =====
  protected avg(v: number | null | undefined): string {
    return v === null || v === undefined ? '–' : one.format(v);
  }

  protected int(v: number): string {
    return int.format(v);
  }

  protected shift(v: number): string {
    return signed.format(v);
  }

  protected pct(n: number, total: number): string {
    return total ? `${Math.round((n / total) * 100)}%` : '–';
  }

  protected width(n: number, max: number): number {
    return max ? Math.max(2, (n / max) * 100) : 0;
  }

  protected date(r: Review): string {
    return formatReviewDate(r.completedAt);
  }

  protected created(r: Review): string {
    const d = new Date(r.createdAt);
    return Number.isNaN(d.getTime()) ? '' : formatReviewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  protected days(n: number): string {
    if (n < 1) return 'desde hoje';
    if (n < 60) return `há ${n} ${n === 1 ? 'dia' : 'dias'}`;
    if (n < 730) return `há ${Math.round(n / 30)} meses`;
    return `há ${one.format(n / 365)} anos`;
  }

  protected plural(n: number, sing: string, plur: string): string {
    return `${int.format(n)} ${n === 1 ? sing : plur}`;
  }

  /** O seu abre na leitura de sempre (com Editar); o do colega, na leitura só de ler, com o nome dele. */
  protected open(r: Review): void {
    if (this.mine()) this.desk.openReview(r.id);
    else this.reader().open(r, this.player().name);
  }
}
