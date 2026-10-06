import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { cap, countOf, g } from '../core/kinds';
import { Mural } from '../core/mural';
import {
  Bonus,
  BonusKind,
  Review,
  SCORE_LABEL,
  ScoreKey,
  VERDICTS,
  VERDICT_LABEL,
  formatAmount,
  formatScore,
  shownFinal,
  shownScore,
  scoreKeys,
  scoreOf,
} from '../core/review';
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

/**
 * O ranking numa folha de bloquinho destacada: uma lista por nota e, ao lado, o balanço do mural.
 * Só do mural aberto: um livro nunca disputa posição com um jogo.
 */
@Component({
  selector: 'app-ranking-page',
  imports: [BonusSticker, CoverSleeve, LucideAngularModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-page.html',
  styleUrl: './ranking-page.scss',
})
export class RankingPage {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  private readonly vt = inject(ViewTransitions);
  protected readonly BackIcon = ArrowLeft;

  protected readonly PlusIcon = Plus;
  protected readonly keys = computed(() => scoreKeys(this.mural.kind()));
  protected readonly labels = SCORE_LABEL;
  protected readonly fmt = formatScore;
  protected readonly shown = shownScore;
  protected readonly today = printed.format(new Date());

  private readonly chosen = signal<ScoreKey>('final');
  /** A nota escolhida, se o mural aberto tem ela; senão, a Média. */
  protected readonly key = computed<ScoreKey>(() => (this.keys().includes(this.chosen()) ? this.chosen() : 'final'));

  /** "3 jogos ficaram de fora: não têm nota de História." */
  protected readonly leftText = computed(() => {
    const n = this.left();
    const p = this.mural.profile();
    const who = n === 1 ? `1 ${p.singular} ficou` : `${n} ${p.plural} ficaram`;
    return `${who} de fora: ${n === 1 ? 'não tem' : 'não têm'} nota de ${SCORE_LABEL[this.key()]}.`;
  });
  /** "Jogos no mural", "Séries no mural". */
  protected readonly inWall = computed(() => `${cap(this.mural.profile().plural)} no mural`);
  /** "Rejogadas", "Releituras". */
  protected readonly revisitsLabel = computed(() => cap(this.mural.profile().revisit.many));
  protected readonly emptyText = computed(() => {
    const p = this.mural.profile();
    return `Nada pra ranquear ainda. Pregue ${g(p, 'uns', 'umas')} ${p.plural} e a lista sai com o seu top.`;
  });
  protected readonly countOf = countOf;

  /** Empate divide a posição (1º, 2º, 2º, 4º); no empate, a média decide a ordem. */
  protected readonly rows = computed<Row[]>(() => {
    const k = this.key();
    const scored = this.mural
      .reviews()
      .filter((r) => scoreOf(r.scores, k) !== null)
      .sort(
        (a, b) =>
          scoreOf(b.scores, k)! - scoreOf(a.scores, k)! ||
          shownFinal(b) - shownFinal(a) ||
          collator.compare(a.game.name, b.game.name),
      );
    let pos = 0;
    return scored.map((r, i) => {
      const score = scoreOf(r.scores, k)!;
      if (i === 0 || score !== scoreOf(scored[i - 1].scores, k)) pos = i + 1;
      return { review: r, pos, score };
    });
  });

  protected readonly left = computed(() => this.mural.count() - this.rows().length);

  protected readonly totals = computed(() => {
    const list = this.mural.reviews();
    const kind = this.mural.kind();
    const n = list.length;
    // o tempo gasto conta todas as vezes: as rejogadas também (o ranking em si é só das originais)
    const hours = this.mural.wall().reduce((s, r) => s + (r.hoursPlayed ?? 0), 0);
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
    // no empate, todos os empatados ("Masterpiece e Chato · 3"), não só o que vem primeiro na lista
    const topN = Math.max(0, ...byVerdict.values());
    const tied = VERDICTS.filter((v) => topN > 0 && byVerdict.get(v) === topN).map((v) => VERDICT_LABEL[v]);
    const topVerdict = tied.length ? `${tied.length > 1 ? tied.slice(0, -1).join(', ') + ' e ' + tied.at(-1) : tied[0]} · ${topN}` : null;
    /** O bônus mais colado de cada lado, só se ele se destaca: dado pelo menos duas vezes e sem empate. */
    const topBonus = (kind: BonusKind) => {
      const [first, second] = [...byBonus.values()].filter((x) => x.bonus.kind === kind).sort((a, b) => b.n - a.n);
      return first && first.n >= 2 && (!second || second.n < first.n) ? first : null;
    };
    return {
      n,
      avg: n ? avgFmt.format(list.reduce((s, r) => s + r.scores.final, 0) / n) : '–',
      hours: hours ? formatAmount(kind, Math.round(hours)) : '–',
      byStatus,
      longest: longest ? `${longest.game.name} · ${formatAmount(kind, longest.hoursPlayed)}` : null,
      verdict: topVerdict,
      favor: topBonus('favor'),
      contra: topBonus('contra'),
    };
  });

  protected setKey(k: ScoreKey): void {
    if (this.key() === k) return;
    this.vt.run(() => this.chosen.set(k));
  }

  protected ordinal(n: number): string {
    return `${n}º`;
  }
}
