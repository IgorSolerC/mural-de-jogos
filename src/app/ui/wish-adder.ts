import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { BackdropClose } from './backdrop-close';
import { LucideAngularModule, NotebookPen, RefreshCw, Scissors, Shuffle, X } from 'lucide-angular';
import { sameGame } from '../core/game-lookup';
import { g, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { Draft, Kind, PickedGame, RELEVANCES, Relevance, Wish, formatScore, newId, relevanceLabel } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CoverPicker } from './cover-picker';
import { CoverSleeve } from './cover-sleeve';
import { DraftCard } from './draft-card';
import { GameSearch } from './game-search';
import { RelevanceSticker } from './relevance-sticker';
import { WishClip } from './wish-clip';

/** Para onde vai o que se escolhe aqui: a wishlist (recorte de revista) ou o Pra depois (folha de caderno). */
export type AdderMode = 'wish' | 'draft';

/**
 * Recortar do catálogo: o diálogo da wishlist, e o mesmo diálogo para guardar direto no Pra depois. Só o nome (com o auto-complete do mural) e a capa,
 * escolhida entre as que o catálogo tem do mesmo título, ou colada de um link, ou nenhuma. Ao lado,
 * o recorte como ele vai ficar na parede.
 */
@Component({
  selector: 'app-wish-adder',
  imports: [BackdropClose, CoverPicker, CoverSleeve, DraftCard, GameSearch, LucideAngularModule, RelevanceSticker, WishClip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wish-adder.html',
  styleUrl: './wish-adder.scss',
})
export class WishAdder {
  private readonly store = inject(ReviewStore);
  private readonly mural = inject(Mural);
  /** O desejo novo foi para a lista. */
  readonly wished = output<string>();
  /** Já estava na lista: a pessoa quer ver o que está lá. */
  readonly seen = output<string>();
  /** O item novo foi para o Pra depois. */
  readonly queued = output<string>();
  /** Já estava no Pra depois: a pessoa quer ver a folha. */
  readonly seenDraft = output<string>();

  protected readonly CloseIcon = X;
  protected readonly CutIcon = Scissors;
  protected readonly SwapIcon = RefreshCw;
  protected readonly NoteIcon = NotebookPen;
  protected readonly RerollIcon = Shuffle;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild(GameSearch);

  protected readonly kind = signal<Kind>('jogos');
  protected readonly mode = signal<AdderMode>('wish');
  protected readonly profile = computed(() => profileOf(this.kind()));
  protected readonly words = computed(() => {
    const p = this.profile();
    return { o: `${g(p, 'o', 'a')} ${p.singular}`, um: `${g(p, 'um', 'uma')} ${p.singular}`, esse: `${g(p, 'esse', 'essa')} ${p.singular}` };
  });
  /** O id sorteia o recorte (rasgo, formato, nome): trocar o id é recortar de novo. */
  protected readonly id = signal(newId());
  /** Quantas vezes recortou de novo desde que abriu: a prévia só é colada de novo depois da primeira. */
  protected readonly rerolls = signal(0);
  /** O item escolhido, já com a capa escolhida (null na capa é recorte sem capa). */
  protected readonly game = signal<PickedGame | null>(null);
  protected readonly searchSeed = signal('');
  protected readonly attempted = signal(false);
  /** Quanta vontade (só na wishlist): o adesivo do recorte. */
  protected readonly relevance = signal<Relevance>('comum');
  protected readonly relevances = RELEVANCES;
  protected readonly relevanceLabel = relevanceLabel;
  /** O mesmo título já está na lista de destino (a wishlist, ou a fila do Pra depois) deste mural. */
  protected readonly dup = computed<Wish | Draft | null>(() => {
    const gm = this.game();
    if (!gm) return null;
    const list: (Wish | Draft)[] = this.mode() === 'draft' ? this.mural.drafts() : this.mural.wishes();
    return list.find((w) => sameGame(w.game, gm)) ?? null;
  });
  /** Guardando no Pra depois algo que estava na wishlist: sai de lá, como no "Salvar pra depois". */
  protected readonly alsoWished = computed<Wish | null>(() => {
    const gm = this.game();
    if (!gm || this.mode() !== 'draft') return null;
    return this.mural.wishes().find((w) => sameGame(w.game, gm)) ?? null;
  });
  /** Já tem resenha no mural: vale lembrar (quem quer rejogar adiciona assim mesmo). */
  protected readonly reviewed = computed(() => {
    const gm = this.game();
    if (!gm) return null;
    return this.mural.reviews().find((r) => sameGame(r.game, gm)) ?? null;
  });
  protected readonly fmt = formatScore;

  /** O recorte que vai para a parede, montado com o que já foi escolhido. */
  protected readonly preview = computed<Wish>(() => {
    const gm = this.game();
    return {
      id: this.id(),
      kind: this.kind(),
      game: gm ? { ...gm } : { name: '', coverUrl: null, source: 'manual' },
      ...this.relevanceField(),
      createdAt: '',
      updatedAt: '',
    };
  });

  /** A folha do Pra depois como ela vai ficar, com a data de hoje no cabeçalho. */
  protected readonly previewDraft = computed<Draft>(() => {
    const now = new Date().toISOString();
    return { ...this.preview(), createdAt: now, updatedAt: now };
  });

  open(mode: AdderMode = 'wish'): void {
    this.mode.set(mode);
    this.kind.set(this.mural.kind());
    this.id.set(newId());
    this.rerolls.set(0);
    this.game.set(null);
    this.searchSeed.set('');
    this.search()?.reset();
    this.attempted.set(false);
    this.relevance.set('comum');
    this.dialog().nativeElement.showModal();
    // a busca só nasce depois que o diálogo desenha (se ficou um item da última vez, ela não existia)
    setTimeout(() => this.search()?.focus());
  }

  /** Recorta de novo: outro id, outro jeito de rasgar e de colar o nome. */
  protected reroll(): void {
    this.id.set(newId());
    this.rerolls.update((n) => n + 1);
  }

  close(): void {
    this.dialog().nativeElement.close();
  }


  protected pick(game: PickedGame): void {
    this.game.set(game);
    this.attempted.set(false);
  }

  protected swap(): void {
    this.searchSeed.set(this.game()?.name ?? '');
    this.game.set(null);
    setTimeout(() => this.search()?.focus());
  }

  protected save(e: Event): void {
    e.preventDefault();
    const gm = this.game();
    if (!gm) {
      this.attempted.set(true);
      this.search()?.focus();
      return;
    }
    const dup = this.dup();
    if (dup) {
      this.close();
      if (this.mode() === 'draft') this.seenDraft.emit(dup.id);
      else this.seen.emit(dup.id);
      return;
    }
    const now = new Date().toISOString();
    if (this.mode() === 'draft') {
      this.store.saveDraft({ id: this.id(), kind: this.kind(), game: gm, createdAt: now, updatedAt: now });
      // estava na wishlist: agora está na fila, e a wishlist não fica com o mesmo título
      const wished = this.alsoWished();
      if (wished) this.store.removeWish(wished.id);
      this.close();
      this.queued.emit(this.id());
      return;
    }
    this.store.saveWish({ id: this.id(), kind: this.kind(), game: gm, ...this.relevanceField(), createdAt: now, updatedAt: now });
    this.close();
    this.wished.emit(this.id());
  }

  /** Comum é o padrão: não vai para o registro. */
  private relevanceField(): Pick<Wish, 'relevance'> {
    const r = this.relevance();
    return r === 'comum' ? {} : { relevance: r };
  }
}

