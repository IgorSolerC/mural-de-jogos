import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowBigDown, ArrowBigUp, ArrowLeft, ArrowUpDown, LucideAngularModule, RotateCcw, Shuffle } from 'lucide-angular';
import { Desk } from '../core/desk';
import { cap } from '../core/kinds';
import { getRecord, offerRecord, recordKey } from '../core/game-records';
import { Guess, Measure, isRight, measuresFor, pickNext, playable } from '../core/higher-lower';
import { Mural } from '../core/mural';
import { Player, Players } from '../core/players';
import { Review } from '../core/review';
import { PlayerPicker } from '../ui/player-picker';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';

/** Quanto tempo o valor revelado fica à mostra antes da próxima ficha, depois de um acerto. */
const REVEAL_MS = 1100;

interface Round {
  /** A ficha com o valor à mostra. */
  shown: Review;
  /** A ficha da pergunta. */
  hidden: Review;
  /** O chute, depois de feito. */
  guess: Guess | null;
}

/**
 * Maior ou menor: uma ficha com o valor à mostra, a próxima escondida; a pessoa diz se o valor dela é
 * maior ou menor. O primeiro erro acaba a partida; vale a sequência, com recorde por mural, dono e
 * medida. Joga com o seu mural ou com o de um colega (ver `Players`).
 */
@Component({
  selector: 'app-higher-lower-page',
  imports: [LucideAngularModule, PlayerPicker, ReviewCard, ReviewReader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './higher-lower-page.html',
  styleUrl: './higher-lower-page.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class HigherLowerPage {
  protected readonly mural = inject(Mural);
  protected readonly players = inject(Players);
  private readonly desk = inject(Desk);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly BackIcon = ArrowLeft;
  protected readonly GameIcon = ArrowUpDown;
  protected readonly UpIcon = ArrowBigUp;
  protected readonly DownIcon = ArrowBigDown;
  protected readonly AgainIcon = Shuffle;
  protected readonly RulesIcon = RotateCcw;

  protected readonly profile = this.mural.profile;
  protected readonly cap = cap;
  protected readonly measures = computed(() => measuresFor(this.mural.kind()));
  private readonly measureKey = signal<Measure['key']>('final');
  protected readonly measure = computed(() => this.measures().find((m) => m.key === this.measureKey()) ?? this.measures()[0]);

  /** As fichas do mural escolhido que têm o valor da medida. */
  protected readonly pool = computed(() => playable(this.players.selected().reviews, this.measure()));
  /** Quantas fichas de um mural servem para a medida escolhida (para as plaquinhas). */
  protected readonly countFor = (p: Player) => playable(p.reviews, this.measure()).length;
  protected countMeasure(m: Measure): number {
    return playable(this.players.selected().reviews, m).length;
  }

  // ===== a partida =====
  protected readonly phase = signal<'regras' | 'jogando' | 'fim'>('regras');
  protected readonly round = signal<Round | null>(null);
  protected readonly streak = signal(0);
  /** De quem e com qual medida a partida está sendo jogada (fixos até acabar). */
  private readonly playing = signal<{ owner: Player; measure: Measure } | null>(null);
  private readonly used = new Set<string>();
  /** A sequência de acertos, para o fim: cada ficha com o valor dela. */
  protected readonly trail = signal<{ name: string; value: string }[]>([]);
  /** Acabaram as fichas sem nenhum erro. */
  protected readonly cleared = signal(false);
  protected readonly newRecord = signal(false);
  protected readonly record = signal(0);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly owner = computed(() => this.playing()?.owner ?? this.players.selected());
  protected readonly active = computed(() => this.playing()?.measure ?? this.measure());

  protected readonly revealed = computed(() => !!this.round()?.guess);
  protected readonly right = computed(() => {
    const r = this.round();
    if (!r?.guess) return null;
    const m = this.active();
    return isRight(m.value(r.shown)!, m.value(r.hidden)!, r.guess);
  });

  /** O que aparece na etiqueta de cada ficha. */
  protected value(r: Review): string {
    const m = this.active();
    const v = m.value(r);
    return v === null ? '–' : m.format(v);
  }

  /** Muda a cada partida acabada, para o recorde da folha de regras ser lido de novo. */
  private readonly recordTick = signal(0);
  /** O recorde da escolha atual, na folha de regras. */
  protected readonly bestHere = computed(() => {
    this.recordTick();
    return getRecord(this.keyFor(this.players.selected(), this.measure()));
  });

  constructor() {
    // trocar o mural no cartaz no meio da partida volta para as regras
    effect(() => {
      this.mural.kind();
      untracked(() => this.toRules());
    });
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  protected chooseMeasure(m: Measure): void {
    this.measureKey.set(m.key);
  }

  protected start(): void {
    const owner = this.players.selected();
    const measure = this.measure();
    const pool = playable(owner.reviews, measure);
    if (pool.length < 2) return;
    this.clearTimer();
    this.used.clear();
    const first = pool[Math.floor(Math.random() * pool.length)];
    this.used.add(first.id);
    const second = pickNext(pool, this.used, measure.value(first)!, measure)!;
    this.used.add(second.id);
    this.playing.set({ owner, measure });
    this.round.set({ shown: first, hidden: second, guess: null });
    this.streak.set(0);
    this.trail.set([{ name: first.game.name, value: measure.format(measure.value(first)!) }]);
    this.cleared.set(false);
    this.newRecord.set(false);
    this.record.set(getRecord(this.keyFor(owner, measure)));
    this.phase.set('jogando');
    this.focusBoard();
  }

  protected guess(g: Guess): void {
    const r = this.round();
    const p = this.playing();
    if (!r || !p || r.guess || this.phase() !== 'jogando') return;
    this.round.set({ ...r, guess: g });
    const m = p.measure;
    if (!isRight(m.value(r.shown)!, m.value(r.hidden)!, g)) return this.finish(false);

    this.streak.update((n) => n + 1);
    this.trail.update((t) => [...t, { name: r.hidden.game.name, value: m.format(m.value(r.hidden)!) }]);
    this.timer = setTimeout(() => {
      this.timer = null;
      const pool = playable(p.owner.reviews, m);
      const next = pickNext(pool, this.used, m.value(r.hidden)!, m);
      if (!next) return this.finish(true);
      this.used.add(next.id);
      this.round.set({ shown: r.hidden, hidden: next, guess: null });
      this.focusBoard();
    }, REVEAL_MS);
  }

  protected again(): void {
    const p = this.playing();
    if (p) {
      this.players.select(p.owner.id);
      this.measureKey.set(p.measure.key);
    }
    this.start();
  }

  protected toRules(): void {
    this.clearTimer();
    this.playing.set(null);
    this.round.set(null);
    this.phase.set('regras');
  }

  /** As fichas abrem na leitura (a escondida, só depois de revelada). */
  protected open(review: Review): void {
    const r = this.round();
    if (r && review.id === r.hidden.id && !r.guess && this.phase() === 'jogando') return;
    const owner = this.owner();
    if (owner.mine) this.desk.openReview(review.id);
    else this.reader().open(review, owner.name);
  }

  protected onKey(e: KeyboardEvent): void {
    if (this.phase() !== 'jogando' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable], dialog')) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.guess('maior');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.guess('menor');
    }
  }

  private finish(cleared: boolean): void {
    const p = this.playing()!;
    this.cleared.set(cleared);
    this.newRecord.set(offerRecord(this.keyFor(p.owner, p.measure), this.streak()));
    this.record.set(getRecord(this.keyFor(p.owner, p.measure)));
    this.recordTick.update((n) => n + 1);
    this.phase.set('fim');
    this.focusBoard();
  }

  private keyFor(owner: Player, m: Measure): string {
    return recordKey('maior-ou-menor', this.mural.kind(), owner.id, m.key);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private focusBoard(): void {
    queueMicrotask(() => document.getElementById('placar')?.focus({ preventScroll: true }));
  }
}
