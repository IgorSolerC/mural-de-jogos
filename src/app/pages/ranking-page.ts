import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import {
  Bonus,
  BonusKind,
  Review,
  SCORE_KEYS,
  SCORE_LABEL,
  STATUS_LABEL,
  ScoreKey,
  VERDICTS,
  VERDICT_LABEL,
  formatHours,
  formatScore,
} from '../core/review';
import { ReviewStore } from '../core/review-store';
import { ViewTransitions } from '../core/view-transitions';
import { BonusSticker } from '../ui/bonus';
import { CoverSleeve } from '../ui/cover-sleeve';

interface Row {
  review: Review;
  pos: number;
  score: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const printed = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const avgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** O ranking numa folha de bloquinho destacada: uma lista por nota e, ao lado, o balanço do mural. */
@Component({
  selector: 'app-ranking-page',
  imports: [BonusSticker, CoverSleeve, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-page.html',
  styleUrl: './ranking-page.scss',
})
export class RankingPage {
  protected readonly store = inject(ReviewStore);
  protected readonly desk = inject(Desk);
  private readonly vt = inject(ViewTransitions);

  protected readonly PlusIcon = Plus;
  protected readonly keys = SCORE_KEYS;
  protected readonly labels = SCORE_LABEL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly fmt = formatScore;
  protected readonly today = printed.format(new Date());

  protected readonly key = signal<ScoreKey>('final');

  /** Empate divide a posição (1º, 2º, 2º, 4º); no empate, a média decide a ordem. */
  protected readonly rows = computed<Row[]>(() => {
    const k = this.key();
    const scored = this.store
      .reviews()
      .filter((r) => r.scores[k] !== null)
      .sort(
        (a, b) =>
          b.scores[k]! - a.scores[k]! ||
          b.scores.final - a.scores.final ||
          collator.compare(a.game.name, b.game.name),
      );
    let pos = 0;
    return scored.map((r, i) => {
      const score = r.scores[k]!;
      if (i === 0 || score !== scored[i - 1].scores[k]) pos = i + 1;
      return { review: r, pos, score };
    });
  });

  protected readonly left = computed(() => this.store.count() - this.rows().length);

  protected readonly totals = computed(() => {
    const list = this.store.reviews();
    const n = list.length;
    const hours = list.reduce((s, r) => s + (r.hoursPlayed ?? 0), 0);
    const byStatus = { incompleto: 0, finalizado: 0, platinado: 0 };
    const byVerdict = new Map<string, number>();
    const byBonus = new Map<string, { bonus: Bonus; n: number }>();
    let longest: Review | null = null;
    for (const r of list) {
      byStatus[r.status]++;
      if (r.verdict) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);
      for (const b of r.bonuses) {
        const hit = byBonus.get(b.id);
        if (hit) hit.n++;
        else byBonus.set(b.id, { bonus: b, n: 1 });
      }
      if (r.hoursPlayed !== null && (!longest || r.hoursPlayed > (longest.hoursPlayed ?? 0))) longest = r;
    }
    const topVerdict = VERDICTS.map((v) => ({ v, n: byVerdict.get(v) ?? 0 })).sort((a, b) => b.n - a.n)[0];
    /** O bônus mais colado de cada lado, só se ele se destaca: dado pelo menos duas vezes e sem empate. */
    const topBonus = (kind: BonusKind) => {
      const [first, second] = [...byBonus.values()].filter((x) => x.bonus.kind === kind).sort((a, b) => b.n - a.n);
      return first && first.n >= 2 && (!second || second.n < first.n) ? first : null;
    };
    return {
      n,
      avg: n ? avgFmt.format(list.reduce((s, r) => s + r.scores.final, 0) / n) : '–',
      hours: hours ? formatHours(Math.round(hours)) : '–',
      byStatus,
      longest: longest ? `${longest.game.name} · ${formatHours(longest.hoursPlayed)}` : null,
      verdict: topVerdict?.n ? `${VERDICT_LABEL[topVerdict.v]} · ${topVerdict.n}` : null,
      favor: topBonus('favor'),
      contra: topBonus('contra'),
    };
  });

  protected setKey(k: ScoreKey): void {
    if (this.key() === k) return;
    this.vt.run(() => this.key.set(k));
  }

  protected ordinal(n: number): string {
    return `${n}º`;
  }
}
