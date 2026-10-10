import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Affinity, Portrait, STATUS_ORDER, favouriteVerdict, finishRate } from '../../core/comparison-stats';
import { ReviewPair } from '../../core/comparison';
import { KindProfile, countOf } from '../../core/kinds';
import { Review, STOCK_LABEL, Status, VERDICT_LABEL, Verdict, formatAmount, formatScore } from '../../core/review';
import { BonusSticker } from '../../ui/bonus';
import { CoverSleeve } from '../../ui/cover-sleeve';
import { VERDICT_ICON } from '../../ui/verdict';
import { Tally } from './tally';
import { ONE_DECIMAL as avgFmt, formatAvg } from '../../core/review';

export type Side = 'voce' | 'colega';

export interface OpenRequest {
  review: Review;
  side: Side;
}

interface Dot {
  left: number;
  bottom: number;
}


/** As bolinhas de uma pessoa na régua de notas: empilhadas de meio em meio ponto. */
function dots(finals: readonly number[], top: number): Dot[] {
  const bins = new Map<number, number>();
  for (const v of finals) {
    const b = Math.round(v * 2) / 2;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const out: Dot[] = [];
  for (const [b, n] of bins) {
    const step = Math.min(8, 44 / n);
    for (let i = 0; i < n; i++) out.push({ left: (b / top) * 100, bottom: i * step });
  }
  return out;
}

/**
 * O caderno de perguntas: aquele que passa de mão em mão na escola ("Qual sua cor favorita?").
 * Cada pergunta tem a resposta de quem abriu o mural, a caneta preta, e a do colega, a caneta azul.
 * Só apresenta: as contas vêm prontas de `comparison-stats`.
 */
@Component({
  selector: 'app-caderno',
  imports: [BonusSticker, CoverSleeve, LucideAngularModule, Tally],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './caderno.html',
  styleUrl: './caderno.scss',
})
export class Caderno {
  readonly you = input.required<Portrait>();
  readonly them = input.required<Portrait>();
  readonly affinity = input.required<Affinity | null>();
  readonly pairs = input.required<readonly ReviewPair[]>();
  readonly name = input.required<string>();
  readonly profile = input.required<KindProfile>();
  /** As fichas do colega em segredo ("Evitar spoilers de outros murais"): no top, a nota vira "?". */
  readonly hidden = input<ReadonlySet<string>>(new Set());

  readonly opened = output<OpenRequest>();
  /** Levar um par (a maior briga, a unanimidade) para a lista de fichas lado a lado. */
  readonly showPair = output<ReviewPair>();

  protected readonly fmt = formatScore;
  protected readonly avg = formatAvg;
  protected readonly stockLabel = STOCK_LABEL;
  protected readonly verdictLabel = VERDICT_LABEL;
  protected readonly verdictIcon = VERDICT_ICON;
  protected readonly countOf = countOf;

  /** A régua de notas vai até 11 só quando alguém deu um 11 na mão. */
  protected readonly top = computed(() => (Math.max(0, ...this.you().finals, ...this.them().finals) > 10 ? 11 : 10));
  protected readonly ticks = computed(() => Array.from({ length: this.top() + 1 }, (_, i) => i));

  /** "Marina é mais exigente: dá, em média, 1,1 ponto a menos." */
  protected readonly strictness = computed(() => {
    const a = this.you().average;
    const b = this.them().average;
    if (a === null || b === null) return '';
    const d = Math.round((a - b) * 10) / 10;
    if (Math.abs(d) < 0.3) return 'Os dois usam a mesma régua: as médias quase se encostam.';
    const pts = `${avgFmt.format(Math.abs(d))} ponto${Math.abs(d) >= 2 ? 's' : ''}`;
    return d > 0
      ? `${this.name()} é mais exigente: dá, em média, ${pts} a menos que você.`
      : `Você é mais exigente: dá, em média, ${pts} a menos que ${this.name()}.`;
  });

  protected readonly partner = computed(() => {
    const map = new Map<Review, Review>();
    for (const p of this.pairs()) {
      map.set(p.mine, p.theirs);
      map.set(p.theirs, p.mine);
    }
    return map;
  });

  protected readonly verdictRows = computed(() => {
    const you = this.you().verdicts;
    const them = this.them().verdicts;
    return you.map((v, i) => ({ value: v.value as Verdict, you: v.n, them: them[i].n })).filter((r) => r.you || r.them);
  });
  protected readonly favourite = computed(() => ({ you: favouriteVerdict(this.you()), them: favouriteVerdict(this.them()) }));

  /** "Os dois dão mais Recomendo." ou cada um o seu. */
  protected readonly verdictLine = computed(() => {
    const { you, them } = this.favourite();
    if (!you && !them) return 'Nenhum dos dois carimba veredito.';
    if (you && them && you.value === them.value) return `Os dois carimbam mais ${VERDICT_LABEL[you.value]}.`;
    return '';
  });

  /** As duas pessoas que respondem, na ordem do caderno: você primeiro, de preto; o colega, de azul. */
  protected readonly people = computed(() =>
    (['voce', 'colega'] as const).map((side) => {
      const p = side === 'voce' ? this.you() : this.them();
      return {
        side,
        who: side === 'voce' ? 'Você' : this.name(),
        p,
        dots: dots(p.finals, this.top()),
        rate: finishRate(p),
        status: STATUS_ORDER.filter((s) => p.statuses[s])
          .map((s) => `${p.statuses[s]} ${this.statusWord(s, p.statuses[s])}`)
          .join(' · '),
        amount: formatAmount(this.profile().kind, p.amount, true),
        // as horas de uma ficha em segredo também contam o que a pessoa achou (a ficha esconde)
        longest: p.longest && !(side === 'colega' && this.hidden().has(p.longest.id)) ? `${p.longest.game.name} (${formatAmount(p.longest.kind, p.longest.hoursPlayed)})` : '',
      };
    }),
  );

  private statusWord(s: Status, n: number): string {
    const pr = this.profile();
    return (n === 1 ? pr.status[s] : pr.statusGroup[s]).toLowerCase();
  }

  protected share(n: number, total: number): string {
    return `${n} de ${total}`;
  }

  protected open(review: Review, side: Side): void {
    this.opened.emit({ review, side });
  }
}
