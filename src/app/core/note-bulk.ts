import { Injectable, inject } from '@angular/core';
import { lookKey } from './category-looks';
import { Importance, KanbanCard, setImportance, setWall } from './kanban';
import { KanbanStore } from './kanban-store';
import { sanitizeTags } from './note-labels';
import { Review, Stock, audienceFields, isNote, isPinnedNote, withPin } from './review';
import { ReviewStore } from './review-store';
import { canWrite } from './shared-notes';
import { SharedStore } from './shared-store';
import { StudyStore } from './study-store';
import { KanbanDeps } from './kanban-deps';
import { NoteDone } from './note-done';
import { plural } from './text';
import { WallMotion } from './wall-motion';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';

/**
 * Mudar várias anotações (ou análises) de uma vez (PLANO-SELECAO.md, 3): o que a folha "Editar as marcadas"
 * (ui/bulk-edit-sheet.ts) pede. Só vai o que a pessoa mexeu; o resto de cada uma fica como está.
 */
export interface BulkPatch {
  /** O grupo de todas (null: sem grupo). Mudar de grupo tira da pasta, como no editor e na API. */
  category?: string | null;
  /** A pasta de todas, no grupo comum delas (null: direto no grupo). */
  folder?: string | null;
  /** As tags: `all` entram em todas; `drop` saem de todas. As outras de cada uma ficam. */
  tags?: { all: readonly string[]; drop: readonly string[] };
  /** Quem vê. Público entra sem aviso no Feed (o "visível": dezenas de uma vez não viram dezenas de avisos). */
  audience?: 'publica' | 'privada';
  stock?: Stock;
  pinned?: boolean;
  /** No quadro (só as que estão nele): a importância (null: nenhuma) e se aparecem no mural também. */
  board?: { importance?: Importance | null; wall?: boolean };
  /** Nos Flashcards (só as que são flashcards): onde aparecem; null: como o baralho pede. */
  study?: { wall: boolean | null };
}

/** Como ficou: quantas mudaram, as que ficaram de fora e por quê, e o Desfazer de tudo. */
export interface BulkResult {
  changed: number;
  /** As compartilhadas: quem vê muda em Compartilhar, e quem só lê não muda a cartolina. */
  skipped: number;
  undo: () => void;
}

/** A mesma tag em outra grafia ("bug" e "Bug") é a mesma tag. */
const tagKey = (t: string) => lookKey(t);

/**
 * A anotação com o que a folha pede (sem carimbar a hora). `can`: o que ela deixa mudar (numa compartilhada,
 * quem vê muda em Compartilhar, e a cartolina só com quem escreve nela).
 */
export function patched(r: Review, p: BulkPatch, now: string, can: { audience: boolean; stock: boolean } = { audience: true, stock: true }): Review {
  const next: Review = { ...r };
  if (p.category !== undefined) {
    if (p.category) next.category = p.category;
    else delete next.category;
    // mudou de grupo: sai da pasta de antes (a pasta é do grupo)
    if (lookKey(next.category ?? '') !== lookKey(r.category ?? '')) delete next.folder;
  }
  if (p.folder !== undefined && lookKey(next.category ?? '') === lookKey(p.category === undefined ? (r.category ?? '') : (p.category ?? ''))) {
    if (p.folder) next.folder = p.folder;
    else delete next.folder;
    delete next.subject;
  }
  if (p.tags) {
    const drop = new Set([...p.tags.drop, ...p.tags.all].map(tagKey));
    const tags = sanitizeTags([...(r.tags ?? []).filter((t) => !drop.has(tagKey(t))), ...p.tags.all]);
    if (tags.length) next.tags = tags;
    else delete next.tags;
  }
  if (can.audience && p.audience !== undefined) {
    const want = p.audience === 'privada';
    if (!!r.private !== want) {
      delete next.private;
      delete next.quiet;
      delete next.publishedAt;
      Object.assign(next, audienceFields(want ? 'privada' : 'visivel', r, now));
    }
  }
  if (can.stock && p.stock) next.stock = p.stock;
  if (p.pinned !== undefined && isNote(r) && isPinnedNote(r) !== p.pinned) return withPin(next, p.pinned, now);
  return next;
}

/** O que mudou de verdade (fora a hora). */
function same(a: Review, b: Review): boolean {
  const { updatedAt: _a, ...x } = a;
  const { updatedAt: _b, ...y } = b;
  return JSON.stringify(x) === JSON.stringify(y);
}

@Injectable({ providedIn: 'root' })
export class NoteBulk {
  private readonly store = inject(ReviewStore);
  private readonly shared = inject(SharedStore);
  private readonly kanban = inject(KanbanStore);
  private readonly study = inject(StudyStore);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly deps = inject(KanbanDeps);
  private readonly noteDone = inject(NoteDone);
  private readonly motion = inject(WallMotion);

  /** O Aplicar da folha: muda, e o bilhete diz quantas, com o Desfazer de todas. */
  run(ids: readonly string[], p: BulkPatch): void {
    let res: BulkResult = { changed: 0, skipped: 0, undo: () => undefined };
    this.motion.run(() => (res = this.apply(ids, p)));
    const r = res as BulkResult;
    const notes = ids.map((id) => this.store.get(id)).filter((x) => !!x);
    const word = notes.every(isNote) ? ['anotação mudou', 'anotações mudaram'] : ['ficha mudou', 'fichas mudaram'];
    const out = r.skipped ? ` (${r.skipped === 1 ? '1 compartilhada ficou como estava' : `${r.skipped} compartilhadas ficaram como estavam`})` : '';
    if (!r.changed) {
      this.toasts.show(r.skipped ? `Nada mudou${out}.` : 'Nada mudou: elas já estavam assim.');
      return;
    }
    this.toasts.show(`${plural(r.changed, word[0], word[1])}${out}.`, { label: 'Desfazer', run: () => this.motion.run(r.undo) }, 8000);
  }

  /** Finalizar, abrir de novo ou apagar as marcadas, na hora (o pé da folha). */
  async act(ids: readonly string[], a: 'finalizar' | 'reabrir' | 'apagar'): Promise<void> {
    if (a === 'apagar') {
      const own = ids.filter((id) => this.store.get(id) && !this.shared.get(id));
      if (!own.length) {
        this.toasts.show('As compartilhadas saem por Compartilhar: nada foi apagado.');
        return;
      }
      const notes = own.map((id) => this.store.get(id)!);
      const isNotes = notes.every(isNote);
      const word = isNotes ? plural(own.length, 'anotação', 'anotações') : plural(own.length, 'ficha', 'fichas');
      const sure = await this.confirm.ask({
        text: `${own.length === 1 ? 'A marcada sai' : `As ${word} saem`} do mural, com o texto.${own.length < ids.length ? ' As compartilhadas ficam: saem por Compartilhar.' : ''}`,
        confirm: `Apagar ${word}`,
      });
      if (!sure) return;
      let done = { removed: 0, skipped: 0, undo: () => undefined as void };
      this.motion.run(() => (done = this.remove(own)));
      const gone = isNotes ? plural(done.removed, 'anotação apagada', 'anotações apagadas') : plural(done.removed, 'ficha apagada', 'fichas apagadas');
      this.toasts.show(`${gone}.`, { label: 'Desfazer', run: () => this.motion.run(done.undo) }, 8000);
      return;
    }
    const want = a === 'finalizar';
    const list = ids.filter((id) => {
      const r = this.store.get(id);
      return !!r && isNote(r) && !!r.doneAt !== want;
    });
    if (!list.length) return;
    if (want) {
      const ok = this.deps.allowFinish(list);
      if (ok !== true && !(await ok)) return;
    }
    const was = new Map(list.map((id) => [id, this.store.get(id)!.doneAt]));
    this.motion.run(() => list.forEach((id) => this.noteDone.set(id, want, { quiet: true })));
    const changed = list.filter((id) => !!this.store.get(id)?.doneAt === want);
    if (!changed.length) return;
    this.toasts.show(
      want ? `${plural(changed.length, 'anotação finalizada', 'anotações finalizadas')}.` : `${plural(changed.length, 'anotação aberta', 'anotações abertas')} de novo.`,
      {
        label: 'Desfazer',
        run: () =>
          this.motion.run(() => {
            for (const id of changed) {
              const r = this.store.get(id);
              if (!r) continue;
              const at = was.get(id);
              const { doneAt: _d, ...rest } = r;
              this.store.update(
                {
                  ...rest,
                  ...(at ? { doneAt: at } : {}),
                  updatedAt: new Date().toISOString(),
                } as Review,
                r,
              );
            }
          }),
      },
      8000,
    );
  }

  /** Muda as anotações `ids` com o que a folha pediu, com um Desfazer só. */
  apply(ids: readonly string[], p: BulkPatch): BulkResult {
    const now = new Date().toISOString();
    const before: Review[] = [];
    let skipped = 0;
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      const entry = this.shared.get(id);
      // a compartilhada: quem vê muda em Compartilhar; a cartolina, só quem escreve nela
      const can = { audience: !entry, stock: !entry || canWrite(entry.papel) };
      if ((p.audience !== undefined && !can.audience) || (p.stock && !can.stock)) skipped++;
      const next = patched(r, p, now, can);
      if (same(next, r)) continue;
      before.push(r);
      this.store.update({ ...next, updatedAt: now }, r);
    }
    const boardUndo = p.board ? this.applyBoard(ids, p.board) : null;
    const studyUndo = p.study ? this.applyStudy(ids, p.study.wall) : null;
    const changedIds = new Set([...before.map((r) => r.id), ...(boardUndo?.ids ?? []), ...(studyUndo?.ids ?? [])]);
    return {
      changed: changedIds.size,
      skipped,
      undo: () => {
        const back = new Date().toISOString();
        for (const r of before) {
          const live = this.store.get(r.id);
          if (live) this.store.update({ ...r, updatedAt: back }, live);
        }
        boardUndo?.undo();
        studyUndo?.undo();
      },
    };
  }

  /** A importância e o "no mural" das que estão no quadro. */
  private applyBoard(ids: readonly string[], b: NonNullable<BulkPatch['board']>): { ids: string[]; undo: () => void } {
    const was: { board: string; card: KanbanCard }[] = [];
    for (const id of ids) {
      const at = this.kanban.cardOf(id);
      if (!at) continue;
      const card = at.card;
      const imp = b.importance !== undefined && (card.importance ?? null) !== b.importance;
      const r = this.store.get(id);
      const wall = b.wall !== undefined && this.kanban.isOnWall(card, r?.category) !== b.wall;
      if (!imp && !wall) continue;
      was.push({ board: at.board.id, card });
      if (imp) this.kanban.update(at.board.id, (x, when) => setImportance(x, id, b.importance ?? null, when));
      if (wall) this.kanban.setOnWall(id, b.wall!);
    }
    return {
      ids: was.map((w) => w.card.note),
      undo: () => {
        for (const { board, card } of was) {
          this.kanban.update(board, (x, when) => setWall(setImportance(x, card.note, card.importance, when), card.note, card.wall, when));
        }
      },
    };
  }

  /** Onde os flashcards aparecem (null: como o baralho pede). */
  private applyStudy(ids: readonly string[], wall: boolean | null): { ids: string[]; undo: () => void } {
    const cards = this.study.cardOf();
    const was: { note: string; wall: boolean | undefined }[] = [];
    const want = wall ?? undefined;
    for (const id of ids) {
      const c = cards.get(id);
      if (!c || c.wall === want) continue;
      was.push({ note: id, wall: c.wall });
      this.study.setWall(id, want);
    }
    return {
      ids: was.map((w) => w.note),
      undo: () => was.forEach((w) => this.study.setWall(w.note, w.wall)),
    };
  }

  /**
   * Apaga as marcadas que são suas (as compartilhadas saem por Compartilhar: ficam), com o Desfazer de todas,
   * as rejogadas de cada uma junto.
   */
  remove(ids: readonly string[]): {
    removed: number;
    skipped: number;
    undo: () => void;
  } {
    const before: Review[] = [];
    let skipped = 0;
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      if (this.shared.get(id)) {
        skipped++;
        continue;
      }
      before.push(r, ...this.store.revisitsOf(id).filter((x) => !ids.includes(x.id)));
      this.store.remove(id);
    }
    return {
      removed: before.filter((r) => ids.includes(r.id)).length,
      skipped,
      undo: () => this.store.undoRemove(before),
    };
  }
}
