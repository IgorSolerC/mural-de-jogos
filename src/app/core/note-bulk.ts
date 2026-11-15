import { Injectable, inject } from '@angular/core';
import { lookKey } from './category-looks';
import { Importance, KanbanCard, setImportance, setWall } from './kanban';
import { KanbanStore } from './kanban-store';
import { sanitizeTags } from './note-labels';
import { Review, Stock, audienceFields, fold, isNote, isPinnedNote, withPin } from './review';
import { ReviewStore } from './review-store';
import { SharedRole, canManage, canWrite } from './shared-notes';
import { SharedGroupsStore } from './shared-groups-store';
import { CloudAccount, CloudError } from './cloud-account';
import { SharedStore } from './shared-store';
import { StudyStore } from './study-store';
import { studyOnWall } from './study';
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
  study?: { wall: boolean };
}

/** Como ficou: quantas mudaram, as que ficaram de fora e por quê, e o Desfazer de tudo. */
export interface BulkResult {
  changed: number;
  /** As compartilhadas: quem vê muda em Compartilhar, e quem só lê não muda a cartolina. */
  skipped: number;
  undo: () => void;
}

/**
 * O que apagar faz com cada marcada (PLANO-CONSERTO-GRUPOS.md, rodada 3), pelas mesmas regras de apagar uma só:
 * - `own`: a sua, só daqui: sai do mural, com o Desfazer;
 * - `forAll`: a compartilhada que você pode apagar para todos (a sua; numa de grupo, pelo papel no grupo: o dono e
 *   os gestores qualquer uma, o editor as que escreveu);
 * - `leave`: a compartilhada solta de outra pessoa: você sai dela (ela continua com quem está nela);
 * - `held`: a de um grupo que você não pode apagar (o leitor, o editor numa que não escreveu): fica.
 */
export interface RemovalPlan {
  own: string[];
  forAll: string[];
  leave: string[];
  held: string[];
}

export function removalPlan(
  ids: readonly string[],
  entryOf: (id: string) => { papel: SharedRole; grupo: string | null; criadoPor: { codigo: string } | null } | undefined,
  groupRole: (grupo: string) => SharedRole | undefined,
  me: string | null,
): RemovalPlan {
  const plan: RemovalPlan = { own: [], forAll: [], leave: [], held: [] };
  for (const id of ids) {
    const e = entryOf(id);
    if (!e) plan.own.push(id);
    else if (e.grupo) {
      // (o papel no grupo; antes de a lista dos grupos chegar, o da anotação, que a nuvem já dá pelo grupo)
      const role = groupRole(e.grupo) ?? e.papel;
      const mayDelete = e.papel === 'dono' || canManage(role) || (canWrite(role) && !!me && e.criadoPor?.codigo === me);
      (mayDelete ? plan.forAll : plan.held).push(id);
    } else (e.papel === 'dono' ? plan.forAll : plan.leave).push(id);
  }
  return plan;
}

/** A pergunta de apagar as marcadas, com o que acontece com cada tipo, em números. */
export function removalAsk(plan: RemovalPlan, isNotes: boolean): { title?: string; text: string; confirm: string } {
  const n = plan.own.length + plan.forAll.length + plan.leave.length;
  const word = isNotes ? plural(n, 'anotação', 'anotações') : plural(n, 'ficha', 'fichas');
  const parts = [`${n === 1 ? 'A marcada sai' : `As ${word} saem`} do mural, com o texto.`];
  if (plan.forAll.length)
    parts.push(
      plan.forAll.length === 1
        ? 'Uma delas é compartilhada: ela sai para todos que estão nela, e isso não dá para desfazer.'
        : `${plan.forAll.length} são compartilhadas: elas saem para todos que estão nelas, e isso não dá para desfazer.`,
    );
  if (plan.leave.length)
    parts.push(
      plan.leave.length === 1
        ? 'De uma, compartilhada com você, você só sai: ela continua com quem está nela.'
        : `De ${plan.leave.length}, compartilhadas com você, você só sai: elas continuam com quem está nelas.`,
    );
  if (plan.held.length)
    parts.push(
      plan.held.length === 1
        ? 'Uma, de um grupo compartilhado, fica: nele, o editor apaga só as que escreveu.'
        : `${plan.held.length}, de um grupo compartilhado, ficam: nele, o editor apaga só as que escreveu.`,
    );
  return { ...(plan.forAll.length ? { title: 'Apagar para todos?' } : {}), text: parts.join(' '), confirm: `Apagar ${word}` };
}

/** Quantas compartilhadas o apagar em massa tira da nuvem ao mesmo tempo. */
const BULK_CLOUD_AT_ONCE = 4;

/** A mesma tag em outra grafia ("bug" e "Bug") é a mesma tag. */
const tagKey = (t: string) => fold(t);

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

/** Os campos que `next` mudou em `r` (fora a hora), com o valor de antes (undefined: não tinha). */
function changedFields(r: Review, next: Review): Partial<Record<keyof Review, unknown>> {
  const out: Partial<Record<keyof Review, unknown>> = {};
  const keys = new Set([...Object.keys(r), ...Object.keys(next)] as (keyof Review)[]);
  for (const k of keys) {
    if (k === 'updatedAt') continue;
    if (JSON.stringify(r[k]) !== JSON.stringify(next[k])) out[k] = r[k];
  }
  return out;
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
  private readonly groups = inject(SharedGroupsStore);
  private readonly account = inject(CloudAccount);

  /** O que apagar faria com as marcadas (ver `removalPlan`). */
  plan(ids: readonly string[]): RemovalPlan {
    return removalPlan(
      ids,
      (id) => this.shared.get(id),
      (g) => this.groups.get(g)?.papel,
      this.account.account()?.codigo ?? null,
    );
  }

  /** O Aplicar da folha: muda, e o bilhete diz quantas, com o Desfazer de todas. */
  run(ids: readonly string[], p: BulkPatch, words?: readonly [string, string]): void {
    let res: BulkResult = { changed: 0, skipped: 0, undo: () => undefined };
    this.motion.run(() => (res = this.apply(ids, p)));
    const r = res as BulkResult;
    const notes = ids.map((id) => this.store.get(id)).filter((x) => !!x);
    const word = words ?? (notes.every(isNote) ? ['anotação mudou', 'anotações mudaram'] : ['ficha mudou', 'fichas mudaram']);
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
      await this.removeMarked(ids);
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

  /**
   * Apagar as marcadas (o pé da folha): as suas saem com o Desfazer; as compartilhadas que você pode apagar saem
   * para todos (uma de cada vez, pela nuvem); das de outras pessoas você sai; as de um grupo que você não pode
   * apagar ficam. A pergunta diz quantas de cada (PLANO-CONSERTO-GRUPOS.md, rodada 3).
   */
  private async removeMarked(ids: readonly string[]): Promise<void> {
    const plan = this.plan(ids);
    const all = [...plan.own, ...plan.forAll, ...plan.leave];
    if (!all.length) {
      this.toasts.show(plan.held.length ? 'Nada foi apagado: num grupo compartilhado, o editor apaga só as anotações que escreveu.' : 'Nada foi apagado.');
      return;
    }
    const isNotes = all.map((id) => this.store.get(id)).every((r) => !r || isNote(r));
    if (!(await this.confirm.ask(removalAsk(plan, isNotes)))) return;
    let done = { removed: 0, skipped: 0, undo: () => undefined as void };
    if (plan.own.length) this.motion.run(() => (done = this.remove(plan.own)));
    let cloud = 0;
    let failed: string | null = null;
    const shared = [...plan.forAll, ...plan.leave];
    // as compartilhadas vão pela nuvem: com muitas, o bilhete diz que está indo (uma de cada vez seria minutos calado)
    if (shared.length > 3) this.toasts.show(`Apagando ${plural(shared.length, 'anotação compartilhada', 'anotações compartilhadas')}…`);
    const forAll = new Set(plan.forAll);
    for (let i = 0; i < shared.length; i += BULK_CLOUD_AT_ONCE) {
      await Promise.all(
        shared.slice(i, i + BULK_CLOUD_AT_ONCE).map(async (id) => {
          if (!this.shared.get(id)) return;
          try {
            if (forAll.has(id)) await this.shared.deleteForAll(id);
            else await this.shared.leave(id);
            cloud++;
          } catch (err) {
            failed ??= err instanceof CloudError ? err.message : 'Não deu para falar com a nuvem agora.';
          }
        }),
      );
    }
    const n = done.removed + cloud;
    const gone = isNotes ? plural(n, 'anotação apagada', 'anotações apagadas') : plural(n, 'ficha apagada', 'fichas apagadas');
    const rest = failed ? ` Algumas compartilhadas ficaram: ${failed}` : '';
    // o Desfazer volta as suas (as compartilhadas já saíram da nuvem)
    if (done.removed) this.toasts.show(`${gone}.${rest}`, { label: 'Desfazer', run: () => this.motion.run(done.undo) }, 8000);
    else this.toasts.show(`${gone}.${rest}`);
  }

  /** Muda as anotações `ids` com o que a folha pediu, com um Desfazer só. */
  apply(ids: readonly string[], p: BulkPatch): BulkResult {
    const now = new Date().toISOString();
    /** Cada anotação mudada e os campos dela como eram (só os que mudaram: o Desfazer não mexe no resto). */
    const before: { id: string; was: Partial<Record<keyof Review, unknown>> }[] = [];
    let skipped = 0;
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r) continue;
      const entry = this.shared.get(id);
      // a compartilhada: quem vê muda em Compartilhar; a cartolina, só quem escreve nela
      const can = { audience: !entry, stock: !entry || canWrite(entry.papel) };
      // (só conta como "ficou de fora" a que mudaria)
      const held = (p.audience !== undefined && !can.audience && !!r.private !== (p.audience === 'privada')) || (!!p.stock && !can.stock && (r.stock ?? 'branco') !== p.stock);
      if (held) skipped++;
      const next = patched(r, p, now, can);
      if (same(next, r)) continue;
      before.push({ id, was: changedFields(r, next) });
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
        // só os campos que a folha mexeu voltam: o que mudou depois (o texto, outra tag) fica
        for (const { id, was } of before) {
          const live = this.store.get(id);
          if (!live) continue;
          const restored: Record<string, unknown> = { ...live, updatedAt: back };
          for (const [k, v] of Object.entries(was)) {
            if (v === undefined) delete restored[k];
            else restored[k] = v;
          }
          this.store.update(restored as unknown as Review, live);
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

  /**
   * O "Mostrar no mural" dos flashcards, como o interruptor da aba Flashcard do editor: o que vale é o de cada um
   * (`studyOnWall`; guardado fora dos baralhos, no mural), e a escolha igual à dos baralhos não é guardada (volta a
   * seguir os baralhos).
   */
  private applyStudy(ids: readonly string[], wall: boolean): { ids: string[]; undo: () => void } {
    const cards = this.study.cardOf();
    const decks = this.study.decks();
    const was: { note: string; wall: boolean | undefined }[] = [];
    for (const id of ids) {
      const c = cards.get(id);
      if (!c) continue;
      const byDecks = studyOnWall({ decks: c.decks }, decks);
      if ((c.wall ?? byDecks ?? true) === wall) continue;
      was.push({ note: id, wall: c.wall });
      this.study.setWall(id, wall === byDecks ? undefined : wall);
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
