import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule, RotateCcw, Shuffle, Swords, Trophy, Undo2 } from 'lucide-angular';
import { Desk } from '../core/desk';
import { countOf, g } from '../core/kinds';
import { SavedKnockout, loadKnockout, saveKnockout } from '../core/knockout-save';
import { Mural } from '../core/mural';
import { ME, Player, Players } from '../core/players';
import { Review } from '../core/review';
import { DUEL_OPTIONS, DuelOption, agreement, drawEntrants, entrantsFor, makeBracket, playOut, podium } from '../core/tournament';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';

/**
 * O mata-mata: as fichas do mural escolhido (o seu ou o de um colega) duelam de duas em duas e a
 * pessoa escolhe quem passa, até sobrar uma. O torneio fica guardado neste navegador, um por mural:
 * dá para sair no meio e continuar depois.
 */
@Component({
  selector: 'app-knockout-page',
  imports: [LucideAngularModule, ReviewCard, ReviewReader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './knockout-page.html',
  styleUrl: './knockout-page.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class KnockoutPage {
  protected readonly mural = inject(Mural);
  protected readonly players = inject(Players);
  private readonly desk = inject(Desk);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly BackIcon = ArrowLeft;
  protected readonly SwordsIcon = Swords;
  protected readonly TrophyIcon = Trophy;
  protected readonly UndoIcon = Undo2;
  protected readonly AgainIcon = Shuffle;
  protected readonly RulesIcon = RotateCcw;

  protected readonly options = DUEL_OPTIONS;
  protected readonly profile = this.mural.profile;

  /** As regras escolhidas antes de começar. */
  protected readonly option = signal<DuelOption>(15);
  protected readonly masked = signal(true);

  /** O torneio do mural aberto (em andamento ou acabado), ou null na tela das regras. */
  protected readonly game = signal<SavedKnockout | null>(null);

  /** De quem são as fichas do torneio: na tela das regras, o escolhido; no torneio, o dono dele. */
  protected readonly owner = computed<Player | undefined>(() => {
    const g = this.game();
    return g ? this.players.byId(g.owner) : this.players.selected();
  });
  private readonly byId = computed(() => new Map((this.owner()?.reviews ?? []).map((r) => [r.id, r])));

  protected readonly out = computed(() => {
    const g = this.game();
    return g ? playOut(g.slots, g.picks) : null;
  });

  protected readonly duel = computed(() => {
    const d = this.out()?.current;
    if (!d) return null;
    const a = this.byId().get(d.a);
    const b = this.byId().get(d.b);
    return a && b ? { ...d, a, b, roundName: this.out()!.rounds[d.round].name } : null;
  });

  protected readonly result = computed(() => {
    const out = this.out();
    const p = out && podium(out);
    if (!out || !p) return null;
    const get = (id: string | null) => (id ? this.byId().get(id) ?? null : null);
    const score = (id: string) => this.byId().get(id)?.scores.final;
    return {
      champion: get(p.champion)!,
      runnerUp: get(p.runnerUp),
      semifinal: p.semifinal.map(get).filter((r): r is Review => r !== null),
      agreement: agreement(out, score),
      rounds: out.rounds
        .map((r) => ({
          name: r.name,
          matches: r.matches
            .filter((m) => m.b !== null)
            .map((m) => ({ winner: get(m.winner)?.game.name ?? '', loser: get(m.winner === m.a ? m.b : m.a)?.game.name ?? '' })),
        }))
        .filter((r) => r.matches.length)
        .reverse(),
    };
  });

  /** Quantas fichas cada opção põe no torneio, com o mural escolhido (0 = não dá). */
  protected entrants(option: DuelOption): number {
    return entrantsFor(option, this.players.selected().reviews.length);
  }

  protected readonly chosenEntrants = computed(() => this.entrants(this.option()));

  protected readonly summary = computed(() => {
    const n = this.chosenEntrants();
    if (!n) return '';
    const p = this.profile();
    const who = this.players.selected();
    const where = who.mine ? `do seu mural` : `do mural de ${who.name}`;
    const all = n === who.reviews.length;
    const every = n === 2 ? `${g(p, 'Os dois', 'As duas')} ${p.plural}` : `${g(p, 'Todos os', 'Todas as')} ${countOf(p, n)}`;
    const picked = all ? `${every} ${where}` : `${countOf(p, n)} ${g(p, 'sorteados', 'sorteadas')} ${where}`;
    return `${picked}, ${n - 1} ${n - 1 === 1 ? 'duelo' : 'duelos'} até ${g(p, 'o campeão', 'a campeã')}.`;
  });

  constructor() {
    // o torneio é de cada mural: trocar o mural no cartaz troca o torneio
    effect(() => {
      const kind = this.mural.kind();
      const loading = this.players.loading();
      untracked(() => {
        const saved = loadKnockout(kind);
        if (!saved) return this.game.set(null);
        // o backup do colega ainda está carregando: espera para saber se as fichas existem
        if (loading && saved.owner !== ME) return this.game.set(null);
        const reviews = this.players.byId(saved.owner)?.reviews;
        const ids = new Set((reviews ?? []).map((r) => r.id));
        const intact = !!reviews && saved.slots.every((s) => s === null || ids.has(s));
        if (!intact) {
          // uma ficha do torneio foi apagada (ou o colega saiu de Comparar): começa de novo
          saveKnockout(kind, null);
          return this.game.set(null);
        }
        this.option.set(saved.option);
        this.masked.set(saved.masked);
        this.game.set(saved);
      });
    });
    // sem fichas para a opção escolhida, fica com a maior que dá
    effect(() => {
      const n = this.players.selected().reviews.length;
      untracked(() => {
        if (entrantsFor(this.option(), n)) return;
        const fit = [...DUEL_OPTIONS].reverse().find((o) => o !== 'todos' && entrantsFor(o, n));
        this.option.set(fit ?? 'todos');
      });
    });
  }

  protected setOwner(id: string): void {
    this.players.select(id);
  }

  protected start(): void {
    const who = this.players.selected();
    const n = this.chosenEntrants();
    if (n < 2) return;
    const entrants = drawEntrants(
      who.reviews.map((r) => r.id),
      n,
    );
    this.commit({
      owner: who.id,
      option: this.option(),
      slots: makeBracket(entrants),
      picks: [],
      masked: this.masked(),
      startedAt: new Date().toISOString(),
    });
    this.focusArena();
  }

  protected pick(id: string): void {
    const g = this.game();
    const d = this.out()?.current;
    if (!g || !d || (id !== d.a && id !== d.b)) return;
    this.commit({ ...g, picks: [...g.picks, id] });
    this.focusArena();
  }

  protected undo(): void {
    const g = this.game();
    if (!g?.picks.length) return;
    this.commit({ ...g, picks: g.picks.slice(0, -1) });
  }

  /** As mesmas regras, outro sorteio. */
  protected again(): void {
    const g = this.game();
    if (!g) return;
    const owner = this.players.byId(g.owner);
    if (!owner) return this.rules();
    this.players.select(owner.id);
    this.option.set(g.option);
    this.masked.set(g.masked);
    this.start();
  }

  /** Volta para a tela das regras e esquece o torneio. */
  protected rules(): void {
    this.commit(null);
  }

  protected toggleMasked(): void {
    const g = this.game();
    if (g) this.commit({ ...g, masked: !g.masked });
  }

  /** As fichas do resultado abrem na leitura: as suas no leitor do mural, as do colega com o nome dele. */
  protected open(review: Review): void {
    const owner = this.owner();
    if (owner?.mine) this.desk.openReview(review.id);
    else this.reader().open(review, owner?.name ?? 'Colega');
  }

  protected optionLabel(o: DuelOption): string {
    return o === 'todos' ? 'Todos' : String(o);
  }

  protected onKey(e: KeyboardEvent): void {
    const d = this.out()?.current;
    if (!d || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable], dialog')) return;
    if (e.key === 'ArrowLeft' || e.key === '1') {
      e.preventDefault();
      this.pick(d.a);
    } else if (e.key === 'ArrowRight' || e.key === '2') {
      e.preventDefault();
      this.pick(d.b);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.undo();
    }
  }

  private commit(game: SavedKnockout | null): void {
    this.game.set(game);
    saveKnockout(this.mural.kind(), game);
  }

  /** Depois de cada escolha o foco volta para o placar, que anuncia o duelo novo. */
  private focusArena(): void {
    queueMicrotask(() => document.getElementById('placar')?.focus({ preventScroll: true }));
  }
}
