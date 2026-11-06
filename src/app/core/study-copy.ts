import { Injectable, inject } from '@angular/core';
import { CloudAccount } from './cloud-account';
import { todayISO } from './dates';
import { ImageStore } from './image-store';
import { ImageSync } from './image-sync';
import { localImageId, localImageIds, localImageUrl, swapLocalImages } from './images';
import { cleanCategory } from './note-labels';
import { Review, newId, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { CardFront, DECK_NAME_MAX, Deck, MAX_CARDS, MAX_DECKS, StudyCard, groupKey } from './study';
import { StudyStore } from './study-store';
import { BUILD } from './build';

/**
 * Copiar o baralho de outra pessoa (PLANO-BARALHOS-PUBLICOS.md, 3.4 e D7): um baralho seu, no grupo
 * escolhido, com uma anotação sua para cada carta que você vê, a mesma frente e o progresso do zero.
 */

/**
 * A anotação copiada: o título, o texto e a cartolina (a cor, o papel, a estampa, os enfeites) da de outra
 * pessoa, como uma anotação nova sua, no grupo `group`, privada (a anotação nasce privada). Não vêm as tags,
 * o assunto, de quem era, o "finalizada", a rejogada nem as datas de lá. `images`: os endereços das imagens
 * coladas trocados pelos das cópias suas.
 */
export function copiedNote(src: Review, id: string, group: string, now: string, images: ReadonlyMap<string, string> = new Map()): Review | null {
  const {
    id: _id,
    category: _c,
    subject: _s,
    tags: _t,
    sharedBy: _b,
    doneAt: _d,
    revisitOf: _r,
    artFrom: _a,
    noteRank: _n,
    quiet: _q,
    publishedAt: _p,
    finalOverride: _f,
    ...rest
  } = src;
  const note = sanitizeReview(
    { ...rest, id, category: group, text: swapLocalImages(src.text, images), private: true, completedAt: todayISO(), createdAt: now, updatedAt: now },
    BUILD,
  );
  return note && note.id === id ? note : null;
}

/** O nome do baralho, sem repetir um do mesmo grupo: "Kanji N5", "Kanji N5 2"… */
export function freeDeckName(name: string, group: string, decks: readonly Pick<Deck, 'name' | 'group'>[]): string {
  const key = groupKey(group);
  const taken = new Set(decks.filter((d) => groupKey(d.group) === key).map((d) => d.name.trim().toLocaleLowerCase('pt-BR')));
  const base = name.trim().slice(0, DECK_NAME_MAX);
  if (!taken.has(base.toLocaleLowerCase('pt-BR'))) return base;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const next = base.slice(0, DECK_NAME_MAX - tail.length).trimEnd() + tail;
    if (!taken.has(next.toLocaleLowerCase('pt-BR'))) return next;
  }
}

/** Por que não deu para copiar, numa frase que a folha pode mostrar (o resto é erro inesperado). */
export class DeckCopyProblem extends Error {}

/** O que copiar: o baralho de lá, as cartas que quem visita vê e as anotações delas. */
export interface DeckCopyRequest {
  deck: Deck;
  cards: readonly StudyCard[];
  notes: readonly Review[];
}

export interface DeckCopyResult {
  /** O baralho novo (seu). */
  id: string;
  name: string;
  cards: number;
  /** As imagens que não desceram (ficam com o endereço de antes, e não aparecem). */
  lostImages: number;
  /** Tira o baralho e as anotações criadas. */
  undo: () => void;
}

/** Por que não dá para copiar agora (sem lugar), ou null. */
export function copyLimit(decks: number, cards: number, more: number): string | null {
  if (decks >= MAX_DECKS) return `Você já tem ${MAX_DECKS} baralhos, o máximo. Apague um para copiar este.`;
  if (cards + more > MAX_CARDS) return `As cartas passariam de ${MAX_CARDS}, o máximo dos Estudos. Tire algumas para copiar este.`;
  return null;
}

/** Quantas imagens descem ao mesmo tempo (as mesmas de `ImageSync`). */
const IMAGE_WORKERS = 4;

@Injectable({ providedIn: 'root' })
export class DeckCopy {
  /**
   * Quanto esperar por uma imagem: a folha não fecha enquanto copia, e uma resposta que nunca chega não pode
   * prender a pessoa nela. A que passa disso conta como a que não desceu.
   */
  imageWaitMs = 20_000;

  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly images = inject(ImageStore);
  private readonly imageSync = inject(ImageSync);
  private readonly account = inject(CloudAccount);

  /** Por que não cabe (sem lugar para o baralho ou para as cartas), ou null. */
  limit(cards: number): string | null {
    return copyLimit(this.study.decks().length, this.study.state().cards.length, cards);
  }

  /**
   * Copia: as imagens primeiro (viram suas, com outro id), depois as anotações, o baralho e as cartas. Sem
   * lugar, lança o porquê (nada é criado).
   */
  async copy(req: DeckCopyRequest, name: string, rawGroup: string): Promise<DeckCopyResult> {
    const group = cleanCategory(rawGroup);
    if (!group) throw new DeckCopyProblem('Escolha um grupo para o baralho.');
    const byId = new Map(req.notes.map((n) => [n.id, n]));
    const cards = req.cards.filter((c) => byId.has(c.note));
    const full = this.limit(cards.length);
    if (full) throw new DeckCopyProblem(full);

    // as imagens coladas no texto e as da frente
    const ids = new Set<string>();
    for (const c of cards) {
      for (const id of localImageIds(byId.get(c.note)!.text)) ids.add(id);
      const front = c.front.image ? localImageId(c.front.image) : null;
      if (front) ids.add(front);
    }
    const images = new Map<string, string>();
    let lostImages = 0;
    const waiting = [...ids];
    const worker = async () => {
      for (let id = waiting.shift(); id; id = waiting.shift()) {
        const mine = await this.ownImageInTime(id);
        if (mine) images.set(id, localImageUrl(mine));
        else lostImages++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(IMAGE_WORKERS, waiting.length) }, worker));

    const now = new Date().toISOString();
    const deckName = freeDeckName(name.trim() || req.deck.name, group, this.study.decks());
    const deckId = this.study.addDeck(deckName, req.deck.color, req.deck.icon, undefined, group);
    if (!deckId) throw new DeckCopyProblem(copyLimit(MAX_DECKS, 0, 0)!);
    if (req.deck.look) this.study.updateDeck(deckId, { look: req.deck.look });
    const made: string[] = [];
    for (const c of cards) {
      const note = copiedNote(byId.get(c.note)!, newId(), group, now, images);
      if (!note) continue;
      this.store.add(note);
      made.push(note.id);
      const front: CardFront = { ...c.front };
      if (front.image) front.image = swapLocalImages(front.image, images);
      this.study.addCard(note.id, [deckId], front);
    }
    const undo = () => {
      this.study.removeDeck(deckId);
      for (const id of made) this.store.remove(id);
    };
    return { id: deckId, name: deckName, cards: made.length, lostImages, undo };
  }

  /** `ownImage`, com um limite de tempo; null também quando não deu certo. */
  private async ownImageInTime(id: string): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), this.imageWaitMs)));
    try {
      return await Promise.race([this.ownImage(id).catch(() => null), late]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * A imagem de outra pessoa como uma sua (o id da cópia): a que já está aqui é adotada; a outra desce da
   * nuvem (com a sessão, ou pelo endereço público, sem conta) e entra como uma colada. Null se não desceu.
   */
  private async ownImage(id: string): Promise<string | null> {
    const here = await this.images.adopt(id);
    if (here) return here.id;
    if (this.account.signedIn()) {
      if (await this.imageSync.fetch(id)) return (await this.images.adopt(id))?.id ?? null;
      return null;
    }
    const url = this.imageSync.publicUrl(id);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await this.images.add(await res.blob())).id;
  }
}
