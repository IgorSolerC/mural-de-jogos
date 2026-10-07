import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KINDS } from './kinds';
import { readBackupFile } from './backup-file';
import { DataKey, LocalData } from './local-data';
import { Bonus, Draft, Kind, LIGHT_STOCKS, Relevance, ROTATION_STOCKS, Review, Stock, Wish, isCatalogBonus, isNote, sanitizeDraft, sanitizeReview, sanitizeWish, settleOriginal, storedNote } from './review';

const KEY = 'mural-de-jogos:resenhas:v1';
const DRAFTS_KEY = 'mural-de-jogos:pendentes:v1';
const WISHES_KEY = 'mural-de-jogos:desejos:v1';
/** Quando cada resenha e cada pendente foi apagado: sem isso, juntar um backup antigo traria tudo de volta. */
const DELETED_KEY = 'mural-de-jogos:apagadas:v1';
/**
 * As anotações moram à parte (na memória, junto com as resenhas): um site antigo, aberto pelo cache,
 * lê e regrava a lista de resenhas sem conhecer anotação, e a jogaria fora.
 */
const NOTES_KEY = 'mural-de-jogos:anotacoes:v1';

/** id → quando foi apagado (ISO). */
export interface Deleted {
  reviews: Record<string, string>;
  drafts: Record<string, string>;
  wishes: Record<string, string>;
}

/** O backup (e o mural da nuvem), versão 2. */
export interface BackupPayload {
  app: 'meu-mural';
  version: 2;
  exportedAt: string;
  owner?: { name: string };
  reviews: Review[];
  /** As anotações, sem notas (ver `storedNote`). Fora de `reviews` para um site antigo nem vê-las. */
  notas?: unknown[];
  drafts: Draft[];
  wishes: Wish[];
  deleted: Deleted;
}

/** A original de uma obra trocou: `from` era a original e virou rejogada de `to`. */
export interface OriginalSwap {
  from: string;
  to: string;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  /** Pendentes (só nome e capa) que entraram na fila. */
  drafts: number;
  /** Desejos que entraram na wishlist. */
  wishes: number;
  /** Resenhas daqui que o backup diz que foram apagadas depois da última mudança nelas. */
  removed: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewStore {
  /** Onde as listas moram: o IndexedDB, com uma cópia no localStorage (ver `LocalData`). Vem antes de tudo: as listas leem dele. */
  private readonly data = inject(LocalData);
  readonly reviews = signal<Review[]>(this.read());
  /** As chaves que o navegador se recusou a salvar (cota cheia, modo privado…), até salvarem de novo. */
  private readonly failedKeys = signal<ReadonlySet<string>>(new Set());
  /**
   * Mensagem enquanto alguma chave não conseguiu salvar. Uma chave que salva não apaga a falha de
   * outra: ao pregar uma resenha vinda da wishlist, a resenha pode falhar e a wishlist (menor) salvar.
   */
  readonly saveError = computed(() =>
    this.failedKeys().size ? 'O navegador não deixou salvar. Baixe um backup agora para não perder essa resenha.' : null,
  );
  readonly count = computed(() => this.reviews().length);
  /** Guardados para resenhar depois, o mais recente primeiro (de todos os murais: ver `Mural`). */
  readonly drafts = signal<Draft[]>(this.readDrafts());
  readonly draftCount = computed(() => this.drafts().length);
  /** A wishlist, o mais recente primeiro (de todos os murais: ver `Mural`). */
  readonly wishes = signal<Wish[]>(this.readWishes());
  private readonly deleted = signal<Deleted>(this.readDeleted());
  /** A última mudança em qualquer coisa que vai no backup: resenhas, pendentes, desejos e exclusões (ms). */
  readonly lastChangeAt = computed(() => {
    let last = 0;
    const see = (iso: string) => {
      const t = Date.parse(iso);
      if (t > last) last = t;
    };
    for (const r of this.reviews()) see(r.updatedAt);
    for (const d of this.drafts()) see(d.updatedAt);
    for (const w of this.wishes()) see(w.updatedAt);
    const del = this.deleted();
    for (const when of [...Object.values(del.reviews), ...Object.values(del.drafts), ...Object.values(del.wishes)]) see(when);
    return last;
  });
  /**
   * Os bônus que a pessoa escreveu, tirados das próprias fichas de cada mural: o mais usado primeiro.
   * Não há lista para cuidar; um bônus que nenhuma ficha usa mais some sozinho.
   */
  readonly customBonuses = computed<Record<Kind, Bonus[]>>(() => {
    const seen = Object.fromEntries(KINDS.map((k) => [k, new Map<string, { bonus: Bonus; n: number }>()])) as Record<
      Kind,
      Map<string, { bonus: Bonus; n: number }>
    >;
    for (const r of this.reviews()) {
      for (const b of r.bonuses) {
        if (isCatalogBonus(r.kind, b.id)) continue;
        const hit = seen[r.kind].get(b.id);
        if (hit) hit.n++;
        else seen[r.kind].set(b.id, { bonus: b, n: 1 });
      }
    }
    const sorted = (m: Map<string, { bonus: Bonus; n: number }>) =>
      [...m.values()].sort((a, b) => b.n - a.n || a.bonus.label.localeCompare(b.bonus.label, 'pt-BR')).map((x) => x.bonus);
    return Object.fromEntries(KINDS.map((k) => [k, sorted(seen[k])])) as Record<Kind, Bonus[]>;
  });

  /** O que foi gravado por último em cada parte (ver o efeito das resenhas). */
  private written: { reviews: readonly Review[]; notes: readonly Review[] } = {
    reviews: this.reviews().filter((r) => !isNote(r)),
    notes: this.reviews().filter(isNote),
  };
  private skipNextWrite = false;
  private skipNextDraftWrite = false;
  private skipNextWishWrite = false;
  private skipNextDeletedWrite = false;
  /**
   * As listas como foram lidas ao abrir. Enquanto nada mudou, não há o que gravar, e gravar ali
   * apagaria um texto corrompido (ou uma entrada que não abriu) antes de alguém poder salvá-lo.
   * Comparar a referência, em vez de pular a primeira passada, não perde uma mudança feita antes dela.
   */
  private readonly loaded = {
    reviews: this.reviews(),
    drafts: this.drafts(),
    wishes: this.wishes(),
    deleted: this.deleted(),
  };

  constructor() {
    effect(() => {
      const list = this.reviews();
      if (this.skipNextWrite) {
        this.skipNextWrite = false;
        return;
      }
      if (list === this.loaded.reviews) return;
      // cada parte só é regravada quando mudou: pregar uma resenha não regrava as anotações
      const reviews = list.filter((r) => !isNote(r));
      const notes = list.filter(isNote);
      if (!sameItems(reviews, this.written.reviews)) this.write(KEY, reviews);
      if (!sameItems(notes, this.written.notes)) this.write(NOTES_KEY, notes.map(storedNote));
      this.written = { reviews, notes };
    });
    effect(() => {
      const list = this.drafts();
      if (this.skipNextDraftWrite) {
        this.skipNextDraftWrite = false;
        return;
      }
      if (list === this.loaded.drafts) return;
      this.write(DRAFTS_KEY, list);
    });
    effect(() => {
      const list = this.wishes();
      if (this.skipNextWishWrite) {
        this.skipNextWishWrite = false;
        return;
      }
      if (list === this.loaded.wishes) return;
      this.write(WISHES_KEY, list);
    });
    effect(() => {
      const d = this.deleted();
      if (this.skipNextDeletedWrite) {
        this.skipNextDeletedWrite = false;
        return;
      }
      if (d === this.loaded.deleted) return;
      this.write(DELETED_KEY, d);
    });

    // Outra aba mexeu no mural: acompanha sem sobrescrever.
    if (typeof window !== 'undefined') {
      this.data.onExternalChange((key) => {
        if (key === KEY || key === NOTES_KEY) {
          this.skipNextWrite = true;
          this.reviews.set(this.read());
        } else if (key === DRAFTS_KEY) {
          this.skipNextDraftWrite = true;
          this.drafts.set(this.readDrafts());
        } else if (key === WISHES_KEY) {
          this.skipNextWishWrite = true;
          this.wishes.set(this.readWishes());
        } else if (key === DELETED_KEY) {
          this.skipNextDeletedWrite = true;
          this.deleted.set(this.readDeleted());
        }
      });
    }

    // Uma versão antiga do site (aberta offline, pelo cache) gravou no localStorage depois da mudança
    // para o IndexedDB: o que ela deixou entra como um backup juntado, sem perder nada dos dois lados.
    const foreign = this.data.takeForeign();
    if (foreign) this.mergeForeign(foreign);
  }

  private mergeForeign(foreign: Partial<Record<DataKey, string>>): void {
    const parse = (key: DataKey): unknown => {
      try {
        return JSON.parse(foreign[key] ?? 'null');
      } catch {
        return null;
      }
    };
    const reviews = parse(KEY);
    const drafts = parse(DRAFTS_KEY);
    const wishes = parse(WISHES_KEY);
    const payload = {
      reviews: Array.isArray(reviews) ? reviews : [],
      ...(Array.isArray(drafts) ? { drafts } : {}),
      ...(Array.isArray(wishes) ? { wishes } : {}),
      deleted: parse(DELETED_KEY),
    };
    try {
      this.importJson(JSON.stringify(payload), 'merge');
    } catch {
      /* nada que sirva: fica o que está no IndexedDB */
    }
  }

  /**
   * A cor com que a ficha nova nasce: sorteada entre as claras (a escura é escolha da pessoa), só não
   * repete a da última pregada no mural. A pessoa troca no editor.
   */
  nextStock(kind: Kind): Stock {
    const latest = this.reviews().filter((r) => r.kind === kind).reduce<Review | null>(
      (acc, r) => (!acc || Date.parse(r.createdAt) > Date.parse(acc.createdAt) ? r : acc),
      null,
    );
    const pool = LIGHT_STOCKS.filter((s) => s !== latest?.stock);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  get(id: string): Review | undefined {
    return this.reviews().find((r) => r.id === id);
  }

  /** Prega a ficha. Devolve a troca de original, se a ficha nova é uma rejogada mais antiga que ela (ver `settle`). */
  add(review: Review): OriginalSwap | null {
    const withStock = review.stock ? review : { ...review, stock: this.nextStock(review.kind) };
    this.reviews.update((list) => [withStock, ...list]);
    return this.settle(review.id);
  }

  /**
   * A original de uma obra é sempre a vez mais antiga: se a ficha salva deixou uma rejogada mais
   * antiga que a original (ou a original mais nova que uma rejogada), a mais antiga vira a original
   * (ver settleOriginal). Devolve quem era e quem passou a ser a original.
   */
  private settle(id: string): OriginalSwap | null {
    const changed = settleOriginal(this.reviews(), id, new Date().toISOString());
    if (!changed.length) return null;
    const byId = new Map(changed.map((r) => [r.id, r]));
    const from = changed.find((r) => r.revisitOf && !this.get(r.id)?.revisitOf);
    const to = changed.find((r) => !r.revisitOf);
    this.reviews.update((list) => list.map((r) => byId.get(r.id) ?? r));
    return from && to ? { from: from.id, to: to.id } : null;
  }

  /**
   * Salva a ficha. Na original, o item (nome, capa, ano) vai junto para as rejogadas dela: é a mesma
   * obra, e a rejogada não tem como trocar o item sozinha.
   */
  update(review: Review): OriginalSwap | null {
    const before = this.get(review.id);
    const sameGame = !before || review.revisitOf || JSON.stringify(before.game) === JSON.stringify(review.game);
    this.reviews.update((list) =>
      list.map((r) => {
        if (r.id === review.id) return review;
        if (!sameGame && r.revisitOf === review.id) return { ...r, game: review.game, updatedAt: review.updatedAt };
        return r;
      }),
    );
    return this.settle(review.id);
  }

  /** As rejogadas (releituras, reassistidas) de uma ficha original. */
  revisitsOf(id: string): Review[] {
    return this.reviews().filter((r) => r.revisitOf === id);
  }

  /** Tira a ficha do mural. A original leva junto as rejogadas dela (o Desfazer traz todas de volta). */
  remove(id: string): Review | undefined {
    const found = this.get(id);
    if (found) {
      const gone = new Set([id, ...this.revisitsOf(id).map((r) => r.id)]);
      this.reviews.update((list) => list.filter((r) => !gone.has(r.id)));
      for (const g of gone) this.mark('reviews', g);
    }
    return found;
  }

  restore(review: Review): void {
    if (this.get(review.id)) return;
    // mudada agora: um backup feito enquanto estava apagada não a apaga de novo ao juntar
    this.reviews.update((list) => [{ ...review, updatedAt: this.afterDeletion('reviews', review.id) }, ...list]);
    this.unmark('reviews', review.id);
  }

  getDraft(id: string): Draft | undefined {
    return this.drafts().find((d) => d.id === id);
  }

  /** Cria ou atualiza um pendente. */
  saveDraft(draft: Draft): void {
    this.drafts.update((list) =>
      list.some((d) => d.id === draft.id) ? list.map((d) => (d.id === draft.id ? draft : d)) : [draft, ...list],
    );
  }

  /**
   * Tira o pendente da fila. `forget: false` é o pendente que virou resenha (o mesmo id segue vivo
   * no mural): esse não fica marcado como apagado.
   */
  removeDraft(id: string, forget = true): Draft | undefined {
    const found = this.getDraft(id);
    if (found) {
      this.drafts.update((list) => list.filter((d) => d.id !== id));
      if (forget) this.mark('drafts', id);
    }
    return found;
  }

  restoreDraft(draft: Draft): void {
    if (this.getDraft(draft.id)) return;
    this.drafts.update((list) => [{ ...draft, updatedAt: this.afterDeletion('drafts', draft.id) }, ...list]);
    this.unmark('drafts', draft.id);
  }

  getWish(id: string): Wish | undefined {
    return this.wishes().find((w) => w.id === id);
  }

  /** Cria ou atualiza um desejo. */
  saveWish(wish: Wish): void {
    this.wishes.update((list) =>
      list.some((w) => w.id === wish.id) ? list.map((w) => (w.id === wish.id ? wish : w)) : [wish, ...list],
    );
  }

  /** Troca quanta vontade: Comum sai do registro (é o padrão). */
  setRelevance(id: string, relevance: Relevance): void {
    const w = this.getWish(id);
    if (!w || (w.relevance ?? 'comum') === relevance) return;
    const { relevance: _old, ...rest } = w;
    this.saveWish({ ...rest, ...(relevance === 'comum' ? {} : { relevance }), updatedAt: new Date().toISOString() });
  }

  /**
   * Tira o desejo da wishlist. `forget: false` é o desejo que virou resenha ou pendente (o mesmo id
   * segue vivo em outro lugar): esse não fica marcado como apagado.
   */
  removeWish(id: string, forget = true): Wish | undefined {
    const found = this.getWish(id);
    if (found) {
      this.wishes.update((list) => list.filter((w) => w.id !== id));
      if (forget) this.mark('wishes', id);
    }
    return found;
  }

  restoreWish(wish: Wish): void {
    if (this.getWish(wish.id)) return;
    this.wishes.update((list) => [{ ...wish, updatedAt: this.afterDeletion('wishes', wish.id) }, ...list]);
    this.unmark('wishes', wish.id);
  }

  /**
   * O backup sai em gzip (.json.gz); sem CompressionStream no navegador, sai o JSON puro. Com o nome
   * da pessoa, ele vai junto (`owner.name`): quem abrir em Comparar já sabe de quem é.
   */
  async exportBackup(ownerName = ''): Promise<{ blob: Blob; ext: string }> {
    const payload = this.snapshot(ownerName);
    const json = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (typeof CompressionStream === 'undefined') return { blob: json, ext: 'json' };
    const gz = await new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    return { blob: new Blob([gz], { type: 'application/gzip' }), ext: 'json.gz' };
  }

  /**
   * O mural inteiro no formato do backup (é também o que vai para a nuvem). 2: cada ficha e cada
   * pendente diz o seu mural; os backups 1 são todos de jogos. O `owner` veio depois sem mudar a
   * versão: quem não conhece o campo simplesmente o ignora.
   */
  snapshot(ownerName = ''): BackupPayload {
    const name = ownerName.trim();
    return {
      app: 'meu-mural',
      version: 2,
      exportedAt: new Date().toISOString(),
      ...(name ? { owner: { name } } : {}),
      reviews: this.reviews().filter((r) => !isNote(r)),
      notas: this.reviews().filter(isNote).map(storedNote),
      drafts: this.drafts(),
      wishes: this.wishes(),
      deleted: this.deleted(),
    };
  }

  /** Tem algo que valha guardar: resenha, pendente, desejo ou alguma exclusão lembrada. */
  hasContent(): boolean {
    const d = this.deleted();
    return (
      this.reviews().length + this.drafts().length + this.wishes().length > 0 ||
      Object.keys(d.reviews).length + Object.keys(d.drafts).length + Object.keys(d.wishes).length > 0
    );
  }

  /** Lê o arquivo do backup, gzip ou JSON puro (os backups antigos), e devolve o texto do JSON. */
  async readBackup(file: Blob): Promise<string> {
    return readBackupFile(file);
  }

  /** Lança Error com mensagem pronta para o usuário quando o arquivo não serve. */
  importJson(text: string, mode: 'merge' | 'replace'): ImportResult {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Esse arquivo não é um JSON válido. Escolha o backup baixado pelo Meu Mural.');
    }
    const rawList = Array.isArray(data) ? data : (data as any)?.reviews;
    if (!Array.isArray(rawList)) {
      throw new Error('Não achei resenhas nesse arquivo. Escolha o backup baixado pelo Meu Mural.');
    }
    // Backups antigos não têm pendentes: nesse caso a fila atual fica como está.
    const rawDrafts = Array.isArray((data as any)?.drafts) ? ((data as any).drafts as unknown[]) : null;
    const incomingDrafts = (rawDrafts ?? []).map(sanitizeDraft).filter((d): d is Draft => d !== null);
    // Nem a wishlist: backups de antes dela deixam a de agora como está.
    const rawWishes = Array.isArray((data as any)?.wishes) ? ((data as any).wishes as unknown[]) : null;
    const incomingWishes = (rawWishes ?? []).map(sanitizeWish).filter((w): w is Wish => w !== null);
    // As anotações vêm à parte; um backup de antes delas (ou de um site antigo) não tem o campo.
    const rawNotes = Array.isArray((data as any)?.notas) ? ((data as any).notas as unknown[]) : null;
    const incoming: Review[] = [];
    let skipped = 0;
    for (const raw of [...rawList, ...(rawNotes ?? [])]) {
      const r = sanitizeReview(raw);
      if (r) incoming.push(r);
      else skipped++;
    }
    const theirs = sanitizeDeleted((data as any)?.deleted);

    if (mode === 'replace') {
      // sem o campo, as anotações daqui ficam como estão (o backup não sabia delas)
      this.reviews.set(withStocks(rawNotes ? incoming : [...incoming, ...this.reviews().filter(isNote)]));
      if (rawDrafts) this.drafts.set(incomingDrafts);
      if (rawWishes) this.wishes.set(incomingWishes);
      this.deleted.set(theirs);
      return {
        added: incoming.length,
        updated: 0,
        skipped,
        drafts: incomingDrafts.length,
        wishes: incomingWishes.length,
        removed: 0,
      };
    }

    // O que foi apagado depois da última mudança na ficha continua apagado, dos dois lados.
    const ours = this.deleted();
    const gone = (when: string | undefined, updatedAt: string) => !!when && Date.parse(when) >= Date.parse(updatedAt);

    let added = 0;
    let updated = 0;
    let removed = 0;
    const byId = new Map(this.reviews().map((r) => [r.id, r]));
    for (const [id, when] of Object.entries(theirs.reviews)) {
      const current = byId.get(id);
      if (current && gone(when, current.updatedAt)) {
        byId.delete(id);
        removed++;
      }
    }
    for (const r of incoming) {
      const current = byId.get(r.id);
      if (gone(ours.reviews[r.id], r.updatedAt) || gone(theirs.reviews[r.id], r.updatedAt)) {
        skipped++;
      } else if (!current) {
        byId.set(r.id, r);
        added++;
      } else if (isNewer(r, current)) {
        byId.set(r.id, r);
        updated++;
      } else {
        skipped++;
      }
    }
    this.reviews.set(withStocks([...byId.values()]));

    // Um pendente ou desejo que virou resenha guarda o mesmo id. Se essa resenha foi apagada depois
    // (aqui ou lá), o pendente e o desejo de um backup antigo também não voltam.
    const asReview = (id: string, updatedAt: string) => gone(ours.reviews[id], updatedAt) || gone(theirs.reviews[id], updatedAt);
    const asDraft = (id: string, updatedAt: string) => gone(ours.drafts[id], updatedAt) || gone(theirs.drafts[id], updatedAt);

    // Pendente que já virou resenha (mesmo id, aqui ou no backup), ou que foi tirado da fila, não fica na fila.
    // O mesmo pendente dos dois lados: fica o mexido por último (a sincronização depende disso).
    const theirDraft = new Map(incomingDrafts.map((d) => [d.id, d]));
    let changedDrafts = 0;
    const kept = this.drafts()
      .filter((d) => !byId.has(d.id) && !gone(theirs.drafts[d.id], d.updatedAt))
      .map((d) => {
        const t = theirDraft.get(d.id);
        if (!t || !isNewer(t, d)) return d;
        changedDrafts++;
        return t;
      });
    const known = new Set([...byId.keys(), ...kept.map((d) => d.id)]);
    const newDrafts = incomingDrafts.filter(
      (d) => !known.has(d.id) && !asDraft(d.id, d.updatedAt) && !asReview(d.id, d.updatedAt),
    );
    if (newDrafts.length || changedDrafts || kept.length !== this.drafts().length) this.drafts.set([...newDrafts, ...kept]);

    // Desejo que já virou resenha ou pendente (mesmo id, aqui ou no backup), ou que foi tirado da lista, não fica.
    const drafted = new Set([...known, ...newDrafts.map((d) => d.id)]);
    // o mesmo desejo dos dois lados: fica o mexido por último (a vontade pode ter mudado lá)
    const theirWish = new Map(incomingWishes.map((w) => [w.id, w]));
    let changedWishes = 0;
    const keptWishes = this.wishes()
      .filter((w) => !drafted.has(w.id) && !gone(theirs.wishes[w.id], w.updatedAt))
      .map((w) => {
        const t = theirWish.get(w.id);
        if (!t || !isNewer(t, w)) return w;
        changedWishes++;
        return t;
      });
    const knownAll = new Set([...drafted, ...keptWishes.map((w) => w.id)]);
    const newWishes = incomingWishes.filter(
      (w) =>
        !knownAll.has(w.id) &&
        !gone(ours.wishes[w.id], w.updatedAt) &&
        !gone(theirs.wishes[w.id], w.updatedAt) &&
        !asDraft(w.id, w.updatedAt) &&
        !asReview(w.id, w.updatedAt),
    );
    if (newWishes.length || changedWishes || keptWishes.length !== this.wishes().length) this.wishes.set([...newWishes, ...keptWishes]);
    this.deleted.set(mergeDeleted(ours, theirs));
    return { added, updated, skipped, drafts: newDrafts.length, wishes: newWishes.length, removed };
  }

  /** Agora, mas sempre depois do registro de quando foi apagado (o Desfazer pode cair no mesmo milissegundo). */
  private afterDeletion(kind: keyof Deleted, id: string): string {
    const when = Date.parse(this.deleted()[kind][id] ?? '');
    return new Date(Math.max(Date.now(), Number.isFinite(when) ? when + 1 : 0)).toISOString();
  }

  private mark(kind: keyof Deleted, id: string): void {
    const when = new Date().toISOString();
    this.deleted.update((d) => ({ ...d, [kind]: { ...d[kind], [id]: when } }));
  }

  private unmark(kind: keyof Deleted, id: string): void {
    if (!(id in this.deleted()[kind])) return;
    this.deleted.update((d) => {
      const next = { ...d[kind] };
      delete next[id];
      return { ...d, [kind]: next };
    });
  }

  private read(): Review[] {
    return withStocks([...this.readList(KEY, sanitizeReview), ...this.readList(NOTES_KEY, sanitizeReview)]);
  }

  private readDrafts(): Draft[] {
    return this.readList(DRAFTS_KEY, sanitizeDraft);
  }

  private readWishes(): Wish[] {
    return this.readList(WISHES_KEY, sanitizeWish);
  }

  private readDeleted(): Deleted {
    try {
      return sanitizeDeleted(JSON.parse(this.data.getItem(DELETED_KEY) ?? 'null'));
    } catch {
      return { reviews: {}, drafts: {}, wishes: {} };
    }
  }

  private write(key: DataKey, value: unknown): void {
    const saved = () => {
      if (this.failedKeys().has(key)) {
        this.failedKeys.update((set) => {
          const next = new Set(set);
          next.delete(key);
          return next;
        });
      }
    };
    const failed = () => {
      if (!this.failedKeys().has(key)) this.failedKeys.update((set) => new Set(set).add(key));
    };
    try {
      // no localStorage grava na hora; no IndexedDB, a gravação termina depois
      const pending = this.data.setItem(key, JSON.stringify(value));
      if (pending) pending.then(saved, failed);
      else saved();
    } catch {
      failed();
    }
  }

  /**
   * Lê uma lista guardada. Se o texto não abre (corrompido) ou alguma entrada não serve, o original
   * vai inteiro para `…:corrompido` antes de qualquer gravação, para poder ser recuperado à mão.
   */
  private readList<T>(key: DataKey, sanitize: (raw: unknown) => T | null): T[] {
    let raw: string | null = null;
    try {
      raw = this.data.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.keepCorrupt(key, raw);
        return [];
      }
      const out = parsed.map(sanitize).filter((x): x is T => x !== null);
      if (out.length !== parsed.length) this.keepCorrupt(key, raw);
      return out;
    } catch {
      if (raw) this.keepCorrupt(key, raw);
      return [];
    }
  }

  private keepCorrupt(key: string, raw: string): void {
    try {
      // guarda a primeira versão ruim; não troca por uma já limpa numa visita seguinte
      if (!localStorage.getItem(`${key}:corrompido`)) localStorage.setItem(`${key}:corrompido`, raw);
    } catch {
      /* sem espaço: não há o que fazer */
    }
  }
}

/** As duas listas têm as mesmas fichas, na mesma ordem (as mesmas referências)? */
function sameItems(a: readonly Review[], b: readonly Review[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sanitizeDeleted(raw: unknown): Deleted {
  const pick = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!v || typeof v !== 'object') return out;
    for (const [id, when] of Object.entries(v as Record<string, unknown>)) {
      if (/^[\w-]{4,64}$/.test(id) && typeof when === 'string' && !Number.isNaN(Date.parse(when))) out[id] = when;
    }
    return out;
  };
  const d = (raw ?? {}) as Record<string, unknown>;
  return { reviews: pick(d['reviews']), drafts: pick(d['drafts']), wishes: pick(d['wishes']) };
}

/**
 * `a` ganha de `b` na junção: mexido depois, ou, no mesmo instante, o de maior texto canônico. O
 * desempate fixo faz dois aparelhos que juntam um o mural do outro chegarem ao mesmo resultado (sem
 * ele, cada um ficaria com a sua versão e a sincronização reenviaria para sempre).
 */
export function isNewer(a: { updatedAt: string }, b: { updatedAt: string }): boolean {
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (ta !== tb) return ta > tb;
  return canonicalJson(a) > canonicalJson(b);
}

/** JSON com as chaves em ordem: o mesmo objeto dá sempre o mesmo texto, venha de onde vier. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v,
  );
}

/** O apagamento mais recente de cada id, dos dois lados. */
function mergeDeleted(a: Deleted, b: Deleted): Deleted {
  const join = (x: Record<string, string>, y: Record<string, string>) => {
    const out = { ...x };
    for (const [id, when] of Object.entries(y)) if (!out[id] || Date.parse(when) > Date.parse(out[id])) out[id] = when;
    return out;
  };
  return { reviews: join(a.reviews, b.reviews), drafts: join(a.drafts, b.drafts), wishes: join(a.wishes, b.wishes) };
}

/** Fichas antigas ou importadas sem cor ganham a próxima do rodízio, na ordem em que foram criadas. */
function withStocks(list: Review[]): Review[] {
  if (list.every((r) => r.stock)) return list;
  const byDate = [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const assigned = new Map<string, Stock>();
  let prev = -1;
  for (const r of byDate) {
    // o rodízio de sempre, sem o branco (que veio depois): as fichas de antes não mudam de cor
    const i = r.stock ? ROTATION_STOCKS.indexOf(r.stock) : (prev + 1) % ROTATION_STOCKS.length;
    if (!r.stock) assigned.set(r.id, ROTATION_STOCKS[i]);
    prev = i;
  }
  return list.map((r) => (r.stock ? r : { ...r, stock: assigned.get(r.id) }));
}
