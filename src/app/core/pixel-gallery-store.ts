import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  PixelGalleryState,
  PixelPatch,
  PixelPiece,
  PIXEL_GALLERY_MAX,
  PIXEL_GALLERY_TEXT_MAX,
  mergePixelGallery,
  orderedGallery,
  pieceWeight,
  sanitizePixelGallery,
  withPixelPatch,
} from './pixel-gallery';
import { stampAfter } from './dates';
import { newId } from './review';
import { onOtherTab, writeJson } from './storage';
import { fromOtherTab } from './tab-join';

/** As obras deste navegador (saem na limpeza do logout pelo prefixo, e com "Apagar o save"). */
export const PIXEL_GALLERY_KEY = 'meu-mural:pixel-arts:v1';

function read(): PixelGalleryState {
  try {
    return sanitizePixelGallery(JSON.parse(localStorage.getItem(PIXEL_GALLERY_KEY) ?? 'null'));
  } catch {
    return sanitizePixelGallery(null);
  }
}

/**
 * A galeria de pixel arts (PLANO-PIXEL-ARTS.md; ver core/pixel-gallery.ts): guardada neste navegador e, com conta,
 * no mural privado da nuvem (`pixelArts`, juntada obra a obra, ver core/cloud-sync.ts). Cada mudança que alguém
 * pode querer desfazer devolve como desfazer (a obra volta como era, mais nova que a mudança desfeita).
 */
@Injectable({ providedIn: 'root' })
export class PixelGallery {
  readonly state = signal<PixelGalleryState>(read());
  readonly pieces = computed(() => this.state().pieces);
  readonly count = computed(() => this.pieces().length);
  /** Quando a galeria mudou aqui (para a sincronização enviar). */
  readonly changedAt = signal(0);
  /** O topo (ou o N) pediu uma obra nova: a página abre a ficha. */
  readonly compose = signal(0);

  constructor() {
    effect(() => writeJson(PIXEL_GALLERY_KEY, this.state()));
    // outra aba mexeu na galeria: esta acompanha, sem gravar a de antes por cima
    inject(DestroyRef).onDestroy(onOtherTab(PIXEL_GALLERY_KEY, (before) => this.state.set(fromOtherTab(PIXEL_GALLERY_KEY, before, this.state(), read, sanitizePixelGallery))));
  }

  ask(): void {
    this.compose.update((n) => n + 1);
  }

  /** As obras pelo id (as páginas procuram muitas de uma vez: as marcadas, o menu, as pastas). */
  private readonly byId = computed(() => new Map(this.pieces().map((p) => [p.id, p])));

  get(id: string): PixelPiece | undefined {
    return this.byId().get(id);
  }

  /** O peso da galeria, em letras dos desenhos (ver `PIXEL_GALLERY_TEXT_MAX`). */
  readonly weight = computed(() => this.pieces().reduce((n, p) => n + pieceWeight(p), 0));

  /** Cabe mais uma obra? */
  readonly full = computed(() => this.count() >= PIXEL_GALLERY_MAX || this.weight() >= PIXEL_GALLERY_TEXT_MAX);

  /** Uma obra nova com o desenho e os campos (null: o desenho não vale, ou a galeria está cheia, de obras ou de peso). */
  create(fields: PixelPatch & Pick<PixelPiece, 'art'>): PixelPiece | null {
    if (this.full()) return null;
    const now = new Date().toISOString();
    const piece = withPixelPatch({ id: newId(), title: '', art: [], createdAt: now, at: now }, fields);
    if (!piece || this.weight() + pieceWeight(piece) > PIXEL_GALLERY_TEXT_MAX) return null;
    this.put([piece]);
    return piece;
  }

  /**
   * Muda a obra (só o que vem em `patch`) e devolve como desfazer: os campos mudados voltam como eram, se ninguém
   * os mudou de novo no meio. Null: nada mudou (ou a obra não existe, ou o desenho não vale).
   */
  update(id: string, patch: PixelPatch): (() => void) | null {
    return this.updateMany([{ id, patch }]);
  }


  /**
   * Muda várias obras numa gravação só (a folha das marcadas) e devolve como desfazer: em cada uma, os campos que
   * mudaram voltam como eram, onde ninguém os mudou de novo no meio. Null: nada mudou.
   */
  updateMany(list: readonly { id: string; patch: PixelPatch }[]): (() => void) | null {
    const changed: { before: PixelPiece; after: PixelPiece }[] = [];
    for (const { id, patch } of list) {
      const before = this.get(id);
      const after = before && withPixelPatch(before, patch);
      if (before && after && JSON.stringify(after) !== JSON.stringify(before)) changed.push({ before, after });
    }
    if (!changed.length) return null;
    this.put(changed.map((c) => c.after));
    const keys = ['title', 'art', 'tags', 'folder', 'note', 'layers'] as const;
    const stamped = new Map(changed.map((c) => [c.before.id, this.get(c.before.id)!]));
    return () => {
      const back: PixelPiece[] = [];
      for (const { before } of changed) {
        const after = stamped.get(before.id)!;
        const now = this.get(before.id);
        if (!now) continue;
        const patch: PixelPatch = {};
        for (const k of keys) {
          if (JSON.stringify(after[k]) !== JSON.stringify(before[k]) && JSON.stringify(now[k]) === JSON.stringify(after[k])) (patch as Record<string, unknown>)[k] = before[k] ?? (k === 'tags' ? [] : k === 'title' ? '' : undefined);
        }
        const next = Object.keys(patch).length ? withPixelPatch(now, patch) : null;
        if (next) back.push(next);
      }
      if (back.length) this.put(back);
    };
  }

  /** Guarda as obras numa pasta (null: a raiz), cada uma com data nova. */
  move(ids: readonly string[], folder: string | null): void {
    const want = new Set(ids);
    const changed = this.pieces()
      .filter((p) => want.has(p.id) && (p.folder ?? null) !== folder)
      .map((p) => withPixelPatch(p, { folder: folder ?? undefined }) ?? p);
    if (changed.length) this.put(changed);
  }

  /** Apaga as obras; devolve as apagadas, como eram (para o Desfazer, `restore`). */
  remove(ids: readonly string[]): PixelPiece[] {
    const st = this.state();
    const want = new Set(ids);
    const gone = st.pieces.filter((p) => want.has(p.id));
    if (!gone.length) return [];
    const removed = { ...st.removed };
    // depois da última mudança de cada uma, mesmo vinda de um aparelho com o relógio adiantado: senão ela volta na junção
    for (const p of gone) removed[p.id] = stampAfter(p.at);
    this.set(orderedGallery(st.pieces.filter((p) => !want.has(p.id)), removed));
    return gone;
  }

  /** Desfazer: as obras voltam como eram, mais novas que a lápide (e que a mudança desfeita). */
  restore(list: readonly PixelPiece[]): void {
    if (!list.length) return;
    const st = this.state();
    const removed = { ...st.removed };
    for (const p of list) delete removed[p.id];
    const back = new Set(list.map((p) => p.id));
    const pieces = st.pieces.filter((p) => !back.has(p.id));
    for (const p of list) pieces.push({ ...p, at: stampAfter(st.removed[p.id] ?? this.get(p.id)?.at ?? p.at) });
    this.set(orderedGallery(pieces, removed));
  }

  /** A galeria que veio de outro aparelho, juntada à daqui. */
  merge(remote: PixelGalleryState): void {
    const next = mergePixelGallery(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  /** Grava as obras (novas, ou no lugar das de mesmo id), cada uma mais nova que antes. */
  private put(list: readonly PixelPiece[]): void {
    const st = this.state();
    const by = new Map(st.pieces.map((p) => [p.id, p]));
    const removed = { ...st.removed };
    for (const p of list) {
      by.set(p.id, { ...p, at: stampAfter(by.get(p.id)?.at ?? removed[p.id]) });
      delete removed[p.id];
    }
    this.set(orderedGallery([...by.values()], removed));
  }

  private set(state: PixelGalleryState): void {
    this.state.set(state);
    this.changedAt.set(Date.now());
  }
}
