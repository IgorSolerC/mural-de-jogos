import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { sameGame } from '../core/game-lookup';
import { g, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { Draft, Kind, PickedGame, RELEVANCES, Relevance, WISH_NOTE_MAX, Wish, WishPatch, cleanWishNote, fold, formatScore, newId, relevanceLabel, relevanceOf, withWishPatch } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Desk, WishEditHooks } from '../core/desk';
import { CategoryColorId, categoryColorHex } from '../core/category-looks';
import { wishTagKey } from '../core/mural-config';
import type { TagEntry } from '../core/note-labels';
import { Settings } from '../core/settings';
import { ViewTransitions } from '../core/view-transitions';
import { wishTagCounts, wishTagHex } from '../core/wishlist-view';
import { TagColors, TagPicker } from './tag-picker';
import { FolderPicker } from './folder-picker';
import { RichEditor } from './rich-editor';
import { WishTags } from './wish-tags';
import type { LucideIconData } from 'lucide-angular';
import { WishFolders } from '../core/wish-folders';
import { Toasts } from './toast';
import { Confirm } from './confirm';
import { CoverPicker } from './cover-picker';
import { CoverSleeve } from './cover-sleeve';
import { DraftCard } from './draft-card';
import { GameSearch } from './game-search';
import { RelevanceSticker } from './relevance-sticker';
import { WishClip } from './wish-clip';
import { MuralSrc } from './stored-image';

/** As etiquetas da folha do recorte. */
export type WishProp = 'vontade' | 'tags' | 'pasta' | 'capa';

/** Para onde vai o que se escolhe aqui: a wishlist (recorte de revista) ou o Pra depois (folha de caderno). */
export type AdderMode = 'wish' | 'draft';

/**
 * Recortar do catálogo: o diálogo da wishlist, e o mesmo diálogo para guardar direto no Pra depois. O nome
 * (com o auto-complete do mural) e a capa, escolhida entre as que o catálogo tem do mesmo título, ou colada de
 * um link, ou nenhuma. Ao lado, o recorte como ele vai ficar na parede.
 *
 * Na wishlist (PLANO-WISHLIST.md, A2), a folha é a do editor das anotações, igual para pôr e para editar, com
 * tudo à vista desde o começo: a obra no alto (a busca, ou a capinha e o nome), a fileira de etiquetas (Vontade,
 * Tags, Pasta e Capa: cada uma diz o que está escolhido e abre a sua parte logo embaixo) e a Descrição, com o
 * editor de texto das anotações (o Visual ou o Markdown, o que a pessoa escolheu).
 *
 * Aberto com um desejo (`edit`), é o "Editar recorte" (PLANO-WISHLIST.md, P11): muda o desejo sem resenhar,
 * com o recorte de verdade ao lado (sem "Outro recorte": trocar o id faria o desejo sumir e voltar na
 * sincronização), e no pé Tirar da wishlist, Começar a resenha e Salvar (com o Desfazer).
 */
@Component({
  selector: 'app-wish-adder',
  imports: [BackdropClose, CoverPicker, CoverSleeve, DraftCard, FolderPicker, GameSearch, IconModule, RelevanceSticker, RichEditor, TagPicker, WishClip, WishTags, MuralSrc],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wish-adder.html',
  styleUrl: './wish-adder.scss',
})
export class WishAdder {
  private readonly store = inject(ReviewStore);
  private readonly mural = inject(Mural);
  private readonly settings = inject(Settings);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly transitions = inject(ViewTransitions);
  private readonly confirm = inject(Confirm);
  /** O que a folha tinha ao abrir: fechar com algo diferente pergunta antes de descartar. */
  private snapshot = '';
  /** A pergunta de descartar já está na tela: outro Esc (ou o fundo) não abre uma segunda. */
  private askingDiscard = false;
  protected readonly wishFolders = inject(WishFolders);
  /** O desejo novo foi para a lista. */
  readonly wished = output<string>();
  /** Já estava na lista: a pessoa quer ver o que está lá. */
  readonly seen = output<string>();
  /** O item novo foi para o Pra depois. */
  readonly queued = output<string>();
  /** Já estava no Pra depois: a pessoa quer ver a folha. */
  readonly seenDraft = output<string>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CutIcon = ICON.tesoura;
  protected readonly SwapIcon = ICON.atualizar;
  protected readonly NoteIcon = ICON.praDepois;
  protected readonly RerollIcon = ICON.sortear;
  protected readonly SaveIcon = ICON.pronto;
  protected readonly StartIcon = ICON.editar;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly noteMax = WISH_NOTE_MAX;

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
  /** O desejo aberto no "Editar recorte" (como estava ao abrir); null: pondo um novo. */
  protected readonly editing = signal<Wish | null>(null);
  /** O que a página que abriu o editar faz no fim (tirar com o foco no vizinho, o foco no recorte salvo). */
  private hooks: WishEditHooks = {};
  /**
   * As cores sorteadas para as tags novas (pela chave `wishTagKey`): só vão para as configurações ao salvar,
   * e só as das tags que ficaram; cancelar não deixa cor de tag que nenhum desejo tem.
   */
  private readonly newColors = signal<ReadonlyMap<string, CategoryColorId>>(new Map());
  /** As tags do desejo (só na wishlist). */
  protected readonly tags = signal<string[]>([]);
  /** A descrição: o texto das anotações, que só aparece com a mão em cima do recorte. */
  protected readonly note = signal('');
  /** A etiqueta aberta (a parte dela logo embaixo da fileira), ou nenhuma. */
  protected readonly prop = signal<WishProp | null>(null);
  /** A fileira de etiquetas: o nome, o desenho, o que está escolhido e o que o leitor de tela ouve. */
  protected readonly props = computed(() => {
    const k = this.kind();
    const r = this.relevance();
    const tags = this.tags();
    const folder = this.folder();
    const gm = this.game();
    const fname = folder ? (this.wishFolders.tree().live(folder)?.name ?? null) : null;
    const rel = r === 'comum' ? 'Comum' : relevanceLabel(k, r);
    const capa = !gm ? 'Capa' : gm.coverUrl ? 'Capa' : 'Sem capa';
    const out: { id: WishProp; name: string; icon: LucideIconData; value: string; spoken: string; filled: boolean; off?: boolean }[] = [
      { id: 'vontade', name: 'Vontade', icon: ICON.adesivo, value: rel, spoken: rel, filled: r !== 'comum' },
      { id: 'tags', name: 'Tags', icon: ICON.etiquetas, value: 'Tags', spoken: tags.length ? tags.join(', ') : 'nenhuma', filled: tags.length > 0 },
      { id: 'pasta', name: 'Pasta', icon: ICON.pastaDeNotas, value: fname ?? 'Pasta', spoken: fname ?? 'sem pasta', filled: !!fname },
      { id: 'capa', name: 'Capa', icon: ICON.imagem, value: capa, spoken: !gm ? 'escolha primeiro o item' : gm.coverUrl ? 'escolhida' : 'sem capa', filled: !!gm?.coverUrl, off: !gm },
    ];
    return out;
  });
  protected readonly propNames: Record<WishProp, string> = { vontade: 'Quanta vontade?', tags: 'Tags', pasta: 'Pasta', capa: 'Qual capa?' };
  /** A pasta (o id; null: solto na raiz da Wishlist). Pondo um novo, a aberta na página da Wishlist. */
  protected readonly folder = signal<string | null>(null);
  /** Quantos recortes cada pasta da Wishlist do mural tem (com os das de dentro), para a escolha. */
  protected readonly folderCounts = computed(() => this.wishFolders.countsIn(this.kind()));
  /** As tags à mão: as da Wishlist do mural, as mais usadas primeiro (sem a estrela das anotações). */
  protected readonly tagLib = computed<TagEntry[]>(() =>
    wishTagCounts(this.mural.wishes().filter((w) => w.kind === this.kind())).map((t) => ({ label: t.label, n: t.n, pinned: false })),
  );
  /** As cores das tags da Wishlist do mural, em `NotesConfig.wishTagColors` (a tag nova ganha uma sorteada). */
  protected readonly tagColors = computed<TagColors>(() => {
    const kind = this.kind();
    const colors = this.settings.notesConfig().wishTagColors;
    const fresh = this.newColors();
    return {
      hex: (tag) => wishTagHex(colors, kind, tag) ?? categoryColorHex(fresh.get(wishTagKey(kind, tag))),
      has: (tag) => !!colors[wishTagKey(kind, tag)] || fresh.has(wishTagKey(kind, tag)),
      set: (tag, color) => this.newColors.update((m) => new Map(m).set(wishTagKey(kind, tag), color)),
    };
  });
  /** O mesmo título já está na lista de destino (a wishlist, ou a fila do Pra depois) deste mural. */
  protected readonly dup = computed<Wish | Draft | null>(() => {
    const gm = this.game();
    if (!gm) return null;
    const list: (Wish | Draft)[] = this.mode() === 'draft' ? this.mural.drafts() : this.mural.wishes();
    // editando, o próprio desejo não é repetido
    const self = this.editing()?.id;
    return list.find((w) => w.id !== self && sameGame(w.game, gm)) ?? null;
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
      ...(this.relevance() === 'comum' ? {} : { relevance: this.relevance() }),
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
    this.reset(mode);
    this.kind.set(this.mural.kind());
    this.id.set(newId());
    this.game.set(null);
    this.relevance.set('comum');
    // a pasta aberta na Wishlist deste mural: o recorte nasce nela
    const open = this.wishFolders.open();
    this.folder.set(open && open.kind === this.kind() ? open.id : null);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.showModal();
    // a busca só nasce depois que o diálogo desenha (se ficou um item da última vez, ela não existia)
    setTimeout(() => this.search()?.focus());
  }

  /**
   * O "Editar recorte": a folha com o desejo, para mudar o item, a vontade, as tags, o lembrete e a capa
   * sem resenhar. `hooks`: o que a página de quem abriu faz no fim (o foco no recorte, ou no vizinho).
   */
  edit(wish: Wish, hooks: WishEditHooks = {}): void {
    this.reset('wish');
    this.editing.set(wish);
    this.hooks = hooks;
    this.kind.set(wish.kind);
    this.id.set(wish.id);
    this.game.set({ ...wish.game });
    this.relevance.set(relevanceOf(wish));
    this.tags.set([...(wish.tags ?? [])]);
    this.note.set(wish.note ?? '');
    this.folder.set(this.wishFolders.of(wish));
    this.snapshot = this.serialize();
    this.dialog().nativeElement.showModal();
  }

  /** A folha em branco, no modo pedido. */
  private reset(mode: AdderMode): void {
    this.mode.set(mode);
    this.editing.set(null);
    this.hooks = {};
    this.newColors.set(new Map());
    this.rerolls.set(0);
    this.searchSeed.set('');
    this.search()?.reset();
    this.attempted.set(false);
    this.tags.set([]);
    this.note.set('');
    this.folder.set(null);
    this.prop.set(null);
  }

  /** Abre a parte da etiqueta (de novo: fecha). O foco desce para a parte; fechando, volta para a etiqueta. */
  protected toggleProp(id: WishProp): void {
    if (this.prop() === id) {
      this.closeProp();
      return;
    }
    this.prop.set(id);
    setTimeout(() => {
      const part = this.dialog().nativeElement.querySelector<HTMLElement>('#desejo-parte');
      // na Vontade, o rádio escolhido; nas outras, a busca (ou o primeiro botão)
      const first = id === 'vontade' ? part?.querySelector<HTMLElement>('input:checked') : (part?.querySelector<HTMLElement>('input[type="text"]') ?? part?.querySelector<HTMLElement>('button'));
      first?.focus();
    });
  }

  /** Fecha a parte aberta (Esc, o Pronto, a etiqueta de novo); o foco volta para a etiqueta dela. */
  protected closeProp(e?: Event): void {
    const id = this.prop();
    if (!id) return;
    // o Esc fecha só a parte, não a folha
    e?.preventDefault();
    e?.stopPropagation();
    this.prop.set(null);
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>(`.prop[data-prop="${id}"]`)?.focus());
  }

  /** Escolheu a vontade na parte: a etiqueta mostra o adesivo, e a parte fica aberta para ver como ficou. */
  protected pickRelevance(r: Relevance): void {
    this.relevance.set(r);
  }

  /** Recorta de novo: outro id, outro jeito de rasgar e de colar o nome. */
  protected reroll(): void {
    this.id.set(newId());
    this.rerolls.update((n) => n + 1);
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** O que a pessoa pode ter mudado na folha (o item, a vontade, as tags, a pasta, a descrição). */
  private serialize(): string {
    return JSON.stringify([this.game(), this.relevance(), this.tags(), this.folder(), this.note()]);
  }

  /**
   * Fechar pelo X, pelo Cancelar, pelo Esc ou pelo fundo: com algo mudado, a pergunta de descartar antes (como no
   * editor das anotações); "Continuar" volta para a folha como estava.
   */
  protected requestClose(e?: Event): void {
    if (this.serialize() !== this.snapshot) {
      e?.preventDefault();
      void this.askDiscard();
      return;
    }
    if (e?.type !== 'cancel') this.close();
  }

  private async askDiscard(): Promise<void> {
    if (this.askingDiscard) return;
    this.askingDiscard = true;
    try {
      const editing = !!this.editing();
      const sure = await this.confirm.ask({
        title: 'Descartar o que você mudou?',
        text: editing
          ? 'O recorte ainda não foi salvo. Fechando agora, o que você mudou nele se perde.'
          : `${this.mode() === 'draft' ? 'O item ainda não foi guardado' : 'O recorte ainda não foi posto na wishlist'}. Fechando agora, o que você escreveu se perde.`,
        confirm: 'Descartar',
        cancel: 'Continuar',
      });
      if (sure) this.close();
    } finally {
      this.askingDiscard = false;
    }
  }

  /** O que a folha muda no desejo: o item, a vontade (Comum sai do registro), as tags e o lembrete. */
  private patch(game: PickedGame): WishPatch {
    const r = this.relevance();
    return { game, relevance: r === 'comum' ? undefined : r, tags: this.tags(), note: this.note(), folder: this.folder() ?? undefined };
  }

  /**
   * Editando: só o que a pessoa mudou desde que abriu a folha. O resto fica como está no desejo agora (o
   * que chegou de outro aparelho, ou do Vontade, enquanto a folha estava aberta não é desfeito).
   */
  private changes(from: Wish, game: PickedGame): WishPatch {
    const all = this.patch(game);
    const out: WishPatch = {};
    if (JSON.stringify(from.game) !== JSON.stringify(game)) out.game = game;
    if (relevanceOf(from) !== this.relevance()) out.relevance = all.relevance;
    if ((from.tags ?? []).map(fold).join('\n') !== this.tags().map(fold).join('\n')) out.tags = all.tags;
    if ((from.note ?? '') !== cleanWishNote(this.note())) out.note = all.note;
    if (this.wishFolders.of(from) !== this.folder()) out.folder = all.folder;
    return out;
  }

  /** As cores sorteadas das tags novas que ficaram no desejo vão para as configurações, numa mudança só. */
  private keepNewColors(): void {
    const fresh = this.newColors();
    const kind = this.kind();
    const keep = new Map<string, CategoryColorId>();
    for (const tag of this.tags()) {
      const c = fresh.get(wishTagKey(kind, tag));
      if (c) keep.set(tag, c);
    }
    this.settings.setWishTagColors(kind, keep);
    this.newColors.set(new Map());
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
    const editing = this.editing();
    // editando, o item escolhido já é outro desejo: nada se perde, a folha fica aberta para trocar de novo
    if (dup && editing) {
      this.dialog().nativeElement.querySelector<HTMLElement>('.tira-item .acao-caneta')?.focus();
      return;
    }
    if (dup) {
      this.close();
      if (this.mode() === 'draft') this.seenDraft.emit(dup.id);
      else this.seen.emit(dup.id);
      return;
    }
    if (editing) {
      this.saveEdit(editing, gm);
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
    this.keepNewColors();
    this.store.saveWish(withWishPatch({ id: this.id(), kind: this.kind(), game: gm, createdAt: now, updatedAt: now }, this.patch(gm)));
    this.close();
    this.wished.emit(this.id());
  }

  /**
   * Salva o editar numa gravação só; o recorte muda de lugar na parede com a transição (a ordem pode ter
   * mudado), e o aviso tem o Desfazer. Sem nada mudado, só fecha.
   */
  private saveEdit(editing: Wish, gm: PickedGame): void {
    const patch = this.changes(editing, gm);
    const saved = this.hooks.saved;
    this.keepNewColors();
    this.close();
    // a transição muda no quadro seguinte: o aviso sai de dentro da mudança, quando já se sabe se mudou
    this.transitions.run(() => {
      const old = this.store.updateWish(editing.id, patch);
      if (!old) return;
      saved?.();
      // o Desfazer volta só o que este Salvar mudou (o que mudou depois, aqui ou noutro aparelho, fica)
      const back: WishPatch = {};
      for (const k of Object.keys(patch) as (keyof WishPatch)[]) (back as Record<string, unknown>)[k] = old[k];
      this.toasts.show(`“${gm.name}” mudou na wishlist`, {
        label: 'Desfazer',
        run: () => this.transitions.run(() => this.store.updateWish(editing.id, back)),
      });
    });
  }

  /**
   * Começar a resenha pelo editar: o que mudou fica (sem aviso: o desejo vira resenha logo em seguida), e o
   * editor da resenha abre como no toque. Sem item escolhido, ou com um que já é outro desejo, fica o de antes.
   */
  protected startReview(): void {
    const editing = this.editing();
    if (!editing) return;
    const gm = this.game() && !this.dup() ? this.game()! : editing.game;
    this.close();
    this.store.updateWish(editing.id, this.changes(editing, gm));
    this.desk.openWish(editing.id);
  }

  /** O "Criar" da escolha da pasta: a pasta nasce na hora (como no editor das anotações) e fica escolhida. */
  protected makeFolder(e: { parent: string | null; name: string }): void {
    const made = this.wishFolders.create(this.kind(), e.parent, e.name);
    if (made) this.folder.set(made.id);
    else this.toasts.show('Não cabe mais nenhuma pasta aqui.');
  }

  /** Tirar da wishlist pelo editar (com o Desfazer de quem tira). */
  protected removeEditing(): void {
    const editing = this.editing();
    if (!editing) return;
    const run = this.hooks.remove;
    this.close();
    if (run) run();
    else this.desk.removeWish(editing.id);
  }
}

