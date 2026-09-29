import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Link, LucideAngularModule, RefreshCw, Scissors, Shuffle, X } from 'lucide-angular';
import { GameLookup, LookupError, imageLoads, sameTitle } from '../core/game-lookup';
import { g, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { Kind, PickedGame, Wish, formatScore, initialOf, newId } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CoverSleeve } from './cover-sleeve';
import { GameSearch } from './game-search';
import { WishClip } from './wish-clip';

/**
 * Recortar do catálogo: o diálogo da wishlist. Só o nome (com o auto-complete do mural) e a capa,
 * escolhida entre as que o catálogo tem do mesmo título, ou colada de um link, ou nenhuma. Ao lado,
 * o recorte como ele vai ficar na parede.
 */
@Component({
  selector: 'app-wish-adder',
  imports: [CoverSleeve, GameSearch, LucideAngularModule, WishClip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wish-adder.html',
  styleUrl: './wish-adder.scss',
})
export class WishAdder {
  private readonly store = inject(ReviewStore);
  private readonly mural = inject(Mural);
  private readonly lookup = inject(GameLookup);
  /** O desejo novo foi para a lista. */
  readonly wished = output<string>();
  /** Já estava na lista: a pessoa quer ver o que está lá. */
  readonly seen = output<string>();

  protected readonly CloseIcon = X;
  protected readonly CutIcon = Scissors;
  protected readonly SwapIcon = RefreshCw;
  protected readonly LinkIcon = Link;
  protected readonly RerollIcon = Shuffle;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild(GameSearch);
  private readonly pasteField = viewChild<ElementRef<HTMLInputElement>>('pasteField');

  protected readonly kind = signal<Kind>('jogos');
  protected readonly profile = computed(() => profileOf(this.kind()));
  protected readonly words = computed(() => {
    const p = this.profile();
    return { o: `${g(p, 'o', 'a')} ${p.singular}`, um: `${g(p, 'um', 'uma')} ${p.singular}`, esse: `${g(p, 'esse', 'essa')} ${p.singular}` };
  });
  /** O id sorteia o recorte (rasgo, formato, nome): trocar o id é recortar de novo. */
  protected readonly id = signal(newId());
  /** Quantas vezes recortou de novo desde que abriu: a prévia só é colada de novo depois da primeira. */
  protected readonly rerolls = signal(0);
  protected readonly game = signal<PickedGame | null>(null);
  protected readonly searchSeed = signal('');
  /** As capas que dá para escolher; a primeira é a que veio com o item. */
  protected readonly choices = signal<PickedGame[]>([]);
  /** A capa escolhida (a URL); null é recorte sem capa. */
  protected readonly cover = signal<string | null>(null);
  protected readonly loadingChoices = signal(false);
  protected readonly choicesError = signal<string | null>(null);
  protected readonly pasting = signal(false);
  protected readonly pasteUrl = signal('');
  protected readonly pasteBusy = signal(false);
  protected readonly pasteError = signal<string | null>(null);
  protected readonly attempted = signal(false);
  /** Capas que não abriram: somem da escolha. */
  private readonly broken = signal<ReadonlySet<string>>(new Set());
  protected readonly shown = computed(() => this.choices().filter((c) => c.coverUrl && !this.broken().has(c.coverUrl)));
  private abort: AbortController | undefined;
  /** O link colado sendo testado: cancela quando troca de item, fecha o campo ou o diálogo. */
  private pasteAbort: AbortController | undefined;

  /** O mesmo título já está na wishlist deste mural. */
  protected readonly dup = computed<Wish | null>(() => {
    const gm = this.game();
    if (!gm) return null;
    return this.mural.wishes().find((w) => sameYearTitle(w.game, gm)) ?? null;
  });
  /** Já tem resenha no mural: vale lembrar (quem quer rejogar adiciona assim mesmo). */
  protected readonly reviewed = computed(() => {
    const gm = this.game();
    if (!gm) return null;
    return this.mural.reviews().find((r) => sameYearTitle(r.game, gm)) ?? null;
  });
  protected readonly fmt = formatScore;
  protected readonly initialOf = initialOf;

  /** O recorte que vai para a parede, montado com o que já foi escolhido. */
  protected readonly preview = computed<Wish>(() => {
    const gm = this.game();
    return {
      id: this.id(),
      kind: this.kind(),
      game: gm ? { ...this.chosen(gm) } : { name: '', coverUrl: null, source: 'manual' },
      createdAt: '',
      updatedAt: '',
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.abort?.abort());
  }

  open(): void {
    this.abort?.abort();
    this.kind.set(this.mural.kind());
    this.id.set(newId());
    this.rerolls.set(0);
    this.game.set(null);
    this.searchSeed.set('');
    this.search()?.reset();
    this.choices.set([]);
    this.cover.set(null);
    this.loadingChoices.set(false);
    this.choicesError.set(null);
    this.closePaste();
    this.attempted.set(false);
    this.broken.set(new Set());
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
    this.abort?.abort();
    this.dialog().nativeElement.close();
  }

  /** O clique começou fora da folha? Selecionar texto e soltar fora dela não fecha. */
  protected downOnBackdrop = false;

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement && this.downOnBackdrop) this.close();
  }

  protected pick(game: PickedGame): void {
    this.game.set(game);
    this.cover.set(game.coverUrl);
    this.choices.set(game.coverUrl ? [game] : []);
    this.choicesError.set(null);
    this.closePaste();
    this.attempted.set(false);
    void this.loadChoices(game);
  }

  private async loadChoices(game: PickedGame): Promise<void> {
    this.abort?.abort();
    // sem nome de catálogo não há outras capas para achar: fica o link ou nenhuma
    if (game.source === 'manual') return;
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.loadingChoices.set(true);
    try {
      const found = await this.lookup.coverChoices(game, this.kind(), ctrl.signal);
      if (ctrl.signal.aborted) return;
      // os links colados enquanto buscava continuam na frente
      const pasted = this.choices().filter((c) => c.coverUrl && !found.some((f) => f.coverUrl === c.coverUrl) && c !== game);
      this.choices.set([...pasted, ...found]);
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
      this.choicesError.set(e instanceof LookupError ? e.message : 'Não consegui procurar outras capas agora.');
    } finally {
      if (!ctrl.signal.aborted) this.loadingChoices.set(false);
    }
  }

  protected choose(url: string | null): void {
    this.cover.set(url);
  }

  /** A capa não abriu: sai da escolha, e se era a escolhida, vale a próxima (ou nenhuma). */
  protected onBroken(url: string | null): void {
    if (!url) return;
    this.broken.update((set) => new Set(set).add(url));
    if (this.cover() === url) this.cover.set(this.shown()[0]?.coverUrl ?? null);
  }

  protected swap(): void {
    this.abort?.abort();
    this.loadingChoices.set(false);
    this.searchSeed.set(this.game()?.name ?? '');
    this.game.set(null);
    this.choices.set([]);
    this.cover.set(null);
    this.closePaste();
    setTimeout(() => this.search()?.focus());
  }

  protected openPaste(): void {
    this.pasting.set(true);
    this.pasteError.set(null);
    setTimeout(() => this.pasteField()?.nativeElement.focus());
  }

  protected closePaste(): void {
    this.pasteAbort?.abort();
    this.pasting.set(false);
    this.pasteUrl.set('');
    this.pasteError.set(null);
    this.pasteBusy.set(false);
  }

  /** Um link de imagem colado vira mais uma capa, se abrir como imagem. */
  protected async usePaste(): Promise<void> {
    const gm = this.game();
    const url = this.pasteUrl().trim();
    if (!gm || this.pasteBusy()) return;
    if (!/^https:\/\/\S+$/.test(url) || url.length > 2000) {
      this.pasteError.set('Cole um link que comece com https://');
      return;
    }
    this.pasteBusy.set(true);
    this.pasteError.set(null);
    this.pasteAbort?.abort();
    const ctrl = new AbortController();
    this.pasteAbort = ctrl;
    const ok = await imageLoads(url, ctrl.signal);
    // enquanto testava, a pessoa trocou de item ou desistiu: o link não vai para o outro
    if (ctrl.signal.aborted || this.game() !== gm) return;
    this.pasteBusy.set(false);
    if (!ok) {
      this.pasteError.set('Esse link não abriu como imagem. Copie o endereço da imagem, não o da página.');
      return;
    }
    if (!this.choices().some((c) => c.coverUrl === url)) this.choices.update((list) => [{ ...gm, coverUrl: url }, ...list]);
    this.cover.set(url);
    this.pasting.set(false);
    this.pasteUrl.set('');
  }

  protected onPasteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void this.usePaste();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.closePaste();
    }
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
      this.seen.emit(dup.id);
      return;
    }
    const now = new Date().toISOString();
    this.store.saveWish({ id: this.id(), kind: this.kind(), game: this.chosen(gm), createdAt: now, updatedAt: now });
    this.close();
    this.wished.emit(this.id());
  }

  /** O item com a capa escolhida, e a fonte de onde ela veio. */
  private chosen(gm: PickedGame): PickedGame {
    const url = this.cover();
    if (!url) return { ...gm, coverUrl: null };
    const from = this.choices().find((c) => c.coverUrl === url);
    return from ? { ...gm, coverUrl: url, source: from.source, sourceId: from.sourceId } : { ...gm, coverUrl: url };
  }
}

function sameYearTitle(a: PickedGame, b: PickedGame): boolean {
  return sameTitle(a.name, b.name) && (!a.year || !b.year || a.year === b.year);
}
