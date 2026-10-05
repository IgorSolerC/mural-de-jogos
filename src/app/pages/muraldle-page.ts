import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowBigDown, ArrowBigUp, ArrowLeft, Flag, Lock, LucideAngularModule, Puzzle, Share2, Shuffle } from 'lucide-angular';
import { Desk } from '../core/desk';
import { countOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { DailyGame, DailyStats, finishDay, loadDaily, loadStats, saveDaily } from '../core/muraldle-save';
import { Cell, HINTS, HINT_EVERY, columnsFor, compare, dailySecret, dayKey, hintsUnlocked, revealedWords, shareText, wordsShown } from '../core/muraldle';
import { Players } from '../core/players';
import { Review, fold } from '../core/review';
import { CoverSleeve } from '../ui/cover-sleeve';
import { PlayerPicker } from '../ui/player-picker';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';

/** O mínimo de fichas para o jogo ter graça. */
const MIN_CARDS = 3;
const MAX_SUGGESTIONS = 8;

type Mode = 'dia' | 'treino';

interface Game {
  secretId: string;
  guesses: string[];
  done: 'acertou' | 'desistiu' | null;
}

/**
 * O Muraldle, o "Wordle" do mural (como o Loldle): adivinhar a ficha secreta chutando outras fichas
 * do mesmo mural; cada chute ganha uma fileira de quadradinhos comparando com a secreta (ver
 * `core/muraldle.ts`). Uma ficha por dia, com sequência de dias, ou quantas quiser no Treino. Joga com
 * o seu mural ou com o de um colega (ver `Players`).
 */
@Component({
  selector: 'app-muraldle-page',
  imports: [CoverSleeve, LucideAngularModule, PlayerPicker, ReviewCard, ReviewReader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './muraldle-page.html',
  styleUrl: './muraldle-page.scss',
})
export class MuraldlePage {
  protected readonly mural = inject(Mural);
  protected readonly players = inject(Players);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('busca');

  protected readonly BackIcon = ArrowLeft;
  protected readonly GameIcon = Puzzle;
  protected readonly UpIcon = ArrowBigUp;
  protected readonly DownIcon = ArrowBigDown;
  protected readonly LockIcon = Lock;
  protected readonly ShareIcon = Share2;
  protected readonly AgainIcon = Shuffle;
  protected readonly GiveUpIcon = Flag;
  protected readonly hints = HINTS;
  protected readonly minCards = MIN_CARDS;

  protected readonly profile = this.mural.profile;
  protected readonly owner = this.players.selected;
  protected readonly mode = signal<Mode>('dia');
  protected readonly columns = computed(() => columnsFor(this.mural.kind()));

  private readonly today = signal(dayKey());
  /** "jogos|eu": o jogo do dia é de cada mural e de cada dono. */
  private readonly slot = computed(() => `${this.mural.kind()}|${this.owner().id}`);
  protected readonly pool = computed(() => this.owner().reviews);
  private readonly byId = computed(() => new Map(this.pool().map((r) => [r.id, r])));
  protected readonly enough = computed(() => this.pool().length >= MIN_CARDS);
  /** Esperando o backup do colega abrir. */
  protected readonly waiting = computed(() => !this.owner().mine && this.players.loading());

  protected readonly game = signal<Game | null>(null);
  protected readonly stats = signal<DailyStats | null>(null);

  protected readonly secret = computed(() => {
    const g = this.game();
    return g ? (this.byId().get(g.secretId) ?? null) : null;
  });

  /** As fileiras, o chute mais novo em cima. */
  protected readonly rows = computed(() => {
    const g = this.game();
    const s = this.secret();
    if (!g || !s) return [];
    return g.guesses
      .map((id) => this.byId().get(id))
      .filter((r): r is Review => !!r)
      .map((r) => ({ review: r, cells: compare(r, s), hit: r.id === s.id }))
      .reverse();
  });

  protected readonly misses = computed(() => this.rows().filter((r) => !r.hit).length);
  protected readonly done = computed(() => this.game()?.done ?? null);

  // ===== dicas =====
  /** Quantas dicas os erros já liberaram (uma a cada 5) e quantas a pessoa abriu. */
  protected readonly unlocked = computed(() => hintsUnlocked(this.misses()));
  protected readonly opened = signal(0);
  /** Quantos erros faltam para a próxima dica. */
  protected readonly nextHintIn = computed(() =>
    this.unlocked() >= HINTS.length ? null : (this.unlocked() + 1) * HINT_EVERY - this.misses(),
  );
  protected readonly words = computed(() => {
    const s = this.secret();
    return s ? revealedWords(s, wordsShown(this.opened())) : { text: '', cut: false };
  });

  protected openHint(): void {
    if (this.opened() < this.unlocked()) this.opened.update((n) => n + 1);
  }

  // ===== a busca =====
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  protected readonly suggestions = computed(() => {
    const q = fold(this.query().trim());
    if (!q) return [];
    const guessed = new Set(this.game()?.guesses ?? []);
    return this.pool()
      .filter((r) => !guessed.has(r.id) && fold(r.game.name).includes(q))
      .sort((a, b) => {
        const sa = fold(a.game.name).startsWith(q) ? 0 : 1;
        const sb = fold(b.game.name).startsWith(q) ? 0 : 1;
        return sa - sb || a.game.name.localeCompare(b.game.name, 'pt-BR');
      })
      .slice(0, MAX_SUGGESTIONS);
  });

  protected readonly title = computed(() => {
    const who = this.owner().mine ? '' : ` de ${this.owner().name}`;
    const [y, m, d] = this.today().split('-');
    const when = this.mode() === 'dia' ? `${d}/${m}/${y}` : 'treino';
    return `Muraldle · ${this.profile().plural}${who} · ${when}`;
  });

  protected readonly pickedPhrase = computed(() => `Digite o nome ${this.profile().fem ? 'de uma' : 'de um'} ${this.profile().singular}`);
  protected readonly countText = computed(() => countOf(this.profile(), this.pool().length));

  constructor() {
    // o mural, o dono ou o modo mudaram: abre o jogo certo
    effect(() => {
      const slot = this.slot();
      const mode = this.mode();
      const enough = this.enough();
      const waiting = this.waiting();
      this.pool();
      untracked(() => {
        if (waiting || !enough) return this.game.set(null);
        if (mode === 'dia') this.openDaily(slot);
        else if (!this.game() || this.game()!.done || !this.byId().has(this.game()!.secretId)) this.newPractice();
      });
    });
  }

  protected setMode(m: Mode): void {
    if (this.mode() === m) return;
    this.game.set(null);
    this.mode.set(m);
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  protected onKey(e: KeyboardEvent): void {
    const list = this.suggestions();
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault();
      this.activeIndex.set((this.activeIndex() + 1) % list.length);
    } else if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + list.length) % list.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = list[this.activeIndex()] ?? list[0];
      if (pick) this.guess(pick);
    } else if (e.key === 'Escape') {
      this.query.set('');
    }
  }

  protected guess(r: Review): void {
    const g = this.game();
    if (!g || g.done || g.guesses.includes(r.id)) return;
    const hit = r.id === g.secretId;
    const next: Game = { ...g, guesses: [...g.guesses, r.id], done: hit ? 'acertou' : null };
    this.commit(next);
    this.query.set('');
    this.activeIndex.set(0);
    if (hit) this.close(true);
    else queueMicrotask(() => this.input()?.nativeElement.focus());
  }

  protected giveUp(): void {
    const g = this.game();
    if (!g || g.done) return;
    this.commit({ ...g, done: 'desistiu' });
    this.close(false);
  }

  protected newPractice(): void {
    const pool = this.pool();
    if (pool.length < MIN_CARDS) return;
    const last = this.mode() === 'treino' ? this.game()?.secretId : undefined;
    const options = pool.filter((r) => r.id !== last);
    const secret = options[Math.floor(Math.random() * options.length)];
    this.opened.set(0);
    this.game.set({ secretId: secret.id, guesses: [], done: null });
  }

  protected async share(): Promise<void> {
    const text = shareText(this.title(), this.rows().map((r) => r.cells), this.done() === 'acertou');
    try {
      await navigator.clipboard.writeText(text);
      this.toasts.show('Resultado copiado. É só colar no grupo.');
    } catch {
      this.toasts.show('O navegador não deixou copiar.');
    }
  }

  protected open(review: Review): void {
    const owner = this.owner();
    if (owner.mine) this.desk.openReview(review.id);
    else this.reader().open(review, owner.name);
  }

  protected cellLabel(c: Cell, label: string): string {
    const how = c.mark === 'certo' ? 'igual' : c.mark === 'perto' ? 'perto' : c.mark === 'errado' ? 'diferente' : 'sem como comparar';
    const arrow = c.arrow === 'up' ? ', a secreta tem mais' : c.arrow === 'down' ? ', a secreta tem menos' : '';
    return `${label}: ${c.text}, ${how}${arrow}`;
  }

  private openDaily(slot: string): void {
    const today = dayKey();
    this.today.set(today);
    this.stats.set(loadStats(slot, today));
    let saved = loadDaily(slot);
    if (!saved || saved.day !== today || !this.byId().has(saved.secretId)) {
      const secret = dailySecret(this.pool(), today, slot, this.stats()!.recent)!;
      saved = { day: today, secretId: secret.id, guesses: [], done: null };
      saveDaily(slot, saved);
    }
    this.opened.set(0);
    this.game.set({ secretId: saved.secretId, guesses: saved.guesses, done: saved.done });
  }

  private commit(g: Game): void {
    this.game.set(g);
    if (this.mode() === 'dia') {
      const daily: DailyGame = { day: this.today(), secretId: g.secretId, guesses: g.guesses, done: g.done };
      saveDaily(this.slot(), daily);
    }
  }

  /** Fecha o jogo do dia nas contas (o treino não conta). */
  private close(won: boolean): void {
    if (this.mode() === 'dia') this.stats.set(finishDay(this.slot(), this.today(), this.game()!.secretId, won));
    queueMicrotask(() => document.getElementById('resultado')?.focus({ preventScroll: false }));
  }
}
