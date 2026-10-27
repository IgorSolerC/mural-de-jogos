import { Injectable, inject } from '@angular/core';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_NOTAS, ESPELHO_POR_ENVIO, type ContextoNotasV1, type GrupoV1, type NotaV1, type TipoDoEspelho } from '../../../contrato/api-v1/notas';
import { lookKey } from './category-looks';
import { CloudAccount, CloudError } from './cloud-account';
import { KanbanCard, boardCategories } from './kanban';
import { KanbanStore } from './kanban-store';
import { Review, shownToOthers } from './review';
import { ReviewStore } from './review-store';
import { checkCount } from './rich-text';
import { Settings } from './settings';
import { nameCollator } from './text';

/**
 * O espelho da API das AIs, pelo lado do site (PLANO-API.md, seção 8): depois de cada sincronização
 * que deixou o aparelho igual à nuvem, o site traduz as anotações para o formato público v1 e manda à
 * nuvem só o que mudou (a nuvem guarda as impressões do que já tem). A API lê dali, sem abrir o
 * mural. Só para a conta que pode usar a API, e só quando alguma chave dela lê as Anotações.
 *
 * Nada fica no navegador: o "o que já foi" mora na nuvem, e o resto vive na memória desta aba.
 */

/** O teto de um envio, em caracteres (a API aceita até 640 mil; a CPU de 10 ms do Worker pede menos). */
const LOT_MAX_CHARS = 480_000;

export interface MirrorItem {
  tipo: TipoDoEspelho;
  id: string;
  hash: string;
  dados: NotaV1 | ContextoNotasV1;
}

/** O cartão da nota no Kanban, como a v1 mostra. */
export interface CardView {
  coluna: string;
  card: Pick<KanbanCard, 'importance' | 'status'>;
  onWall: boolean;
}

/** A anotação no formato público v1 (o "quem vê" é o de verdade: só no Kanban também é privada). */
export function notaV1(r: Review, card: CardView | null, boardOnly: ReadonlySet<string>): NotaV1 {
  const tasks = checkCount(r.text);
  return {
    id: r.id,
    titulo: r.game.name,
    texto: r.text,
    grupo: r.category?.trim() || null,
    assunto: r.subject?.trim() || null,
    tags: [...(r.tags ?? [])],
    data: r.completedAt ?? null,
    finalizada_em: r.doneAt ?? null,
    fixada: r.noteRank === 'fixada',
    visibilidade: shownToOthers(r, boardOnly) ? 'publica' : 'privada',
    capa: r.game.coverUrl ?? null,
    tarefas: { feitas: tasks.done, total: tasks.total },
    kanban: card ? { coluna: card.coluna, importancia: card.card.importance ?? null, status: card.card.status ?? null, no_mural: card.onWall } : null,
    criada_em: r.createdAt,
    versao: r.updatedAt,
  };
}

/** As tags de um punhado de notas, da mais usada para a menos (sem ligar para caixa e acento). */
function tagCounts(notes: readonly Review[]): { nome: string; notas: number }[] {
  const out = new Map<string, { nome: string; notas: number }>();
  for (const n of notes) {
    for (const t of new Set(n.tags ?? [])) {
      const k = dobra(t);
      const e = out.get(k);
      if (e) e.notas++;
      else out.set(k, { nome: t, notas: 1 });
    }
  }
  return [...out.values()].sort((a, b) => b.notas - a.notas || nameCollator.compare(a.nome, b.nome));
}

/**
 * O vocabulário das Anotações: os grupos (na ordem das abas, com os assuntos guardados e os usados), as
 * tags de cada grupo e as fixas. É o que a AI usa em vez de inventar nomes.
 */
export function contextoV1(notes: readonly Review[], subjects: Readonly<Record<string, readonly string[]>>, pinned: readonly string[]): ContextoNotasV1 {
  const byGroup = new Map<string, Review[]>();
  for (const n of notes) {
    const g = n.category?.trim();
    if (!g) continue;
    const k = lookKey(g);
    byGroup.set(k, [...(byGroup.get(k) ?? []), n]);
  }
  const grupos: GrupoV1[] = boardCategories(notes).map((c) => {
    const mine = byGroup.get(lookKey(c.label)) ?? [];
    const names = new Map<string, string>();
    for (const s of [...(subjects[lookKey(c.label)] ?? []), ...mine.map((n) => n.subject?.trim() ?? '')]) if (s && !names.has(dobra(s))) names.set(dobra(s), s);
    return { nome: c.label, notas: c.notes, assuntos: [...names.values()].sort(nameCollator.compare), tags: tagCounts(mine) };
  });
  const loose = notes.filter((n) => !n.category?.trim());
  return { grupos, sem_grupo: { notas: loose.length, tags: tagCounts(loose) }, tags_fixas: [...pinned] };
}

/** A impressão de um item: os primeiros 32 dígitos do SHA-256 do JSON (a ordem dos campos é a da v1). */
export async function hashOf(dados: unknown): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(dados))));
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Os lotes de um envio: até 50 itens e até `LOT_MAX_CHARS` caracteres cada. */
export function lots<T>(items: readonly T[], size: (t: T) => number, maxItems = ESPELHO_POR_ENVIO, maxChars = LOT_MAX_CHARS): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const it of items) {
    const s = size(it);
    if (cur.length && (cur.length >= maxItems || chars + s > maxChars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

interface RemoteMirror {
  areas: string[];
  rev: number | null;
  hashes: Partial<Record<TipoDoEspelho, Record<string, string>>>;
}

@Injectable({ providedIn: 'root' })
export class ApiMirror {
  private readonly account = inject(CloudAccount);
  private readonly store = inject(ReviewStore);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  /** A última rev que o espelho alcançou nesta aba (a mesma rev não pede a nuvem de novo). */
  private doneRev: number | null = null;
  /** A última rev em sincronia que esta aba viu (para o `kick` depois de criar uma chave). */
  private seenRev: number | null = null;
  private running: Promise<void> | null = null;

  /** Depois de uma sincronização que deixou o aparelho igual à nuvem na rev `rev`. Nunca falha. */
  afterSync(rev: number): Promise<void> {
    this.seenRev = rev;
    if (!this.account.account()?.api || rev < 1 || rev === this.doneRev) return Promise.resolve();
    // uma rodada por vez: a que chega no meio espera e roda com a rev mais nova
    const run = (this.running ?? Promise.resolve()).then(() => this.mirror(this.seenRev ?? rev));
    this.running = run.finally(() => {
      if (this.running === run) this.running = null;
    });
    return run;
  }

  /** As chaves mudaram (uma nova pode ler as Anotações): confere de novo na rev de agora. */
  kick(): Promise<void> {
    this.doneRev = null;
    return this.seenRev === null ? Promise.resolve() : this.afterSync(this.seenRev);
  }

  /** Os itens das Anotações no formato v1, com as impressões: as notas da conta (as compartilhadas não) e o contexto. */
  async items(): Promise<MirrorItem[]> {
    const shared = this.store.sharedIds();
    const notes = this.store.notes().filter((n) => !shared.has(n.id));
    const boardOnly = this.kanban.boardOnly();
    const out: MirrorItem[] = [];
    for (const n of notes) {
      const found = this.kanban.cardOf(n.id);
      const card = found
        ? { coluna: found.board.columns.find((c) => c.id === found.card.column)?.name ?? '', card: found.card, onWall: this.kanban.isOnWall(found.card, n.category) }
        : null;
      const dados = notaV1(n, card, boardOnly);
      out.push({ tipo: 'nota', id: n.id, hash: await hashOf(dados), dados });
    }
    const ctx = contextoV1(notes, this.settings.notesConfig().subjects, this.settings.pinnedTags());
    out.push({ tipo: 'contexto', id: CONTEXTO_NOTAS, hash: await hashOf(ctx), dados: ctx });
    return out;
  }

  private async mirror(rev: number): Promise<void> {
    if (rev === this.doneRev) return;
    try {
      const remote = await this.account.request<RemoteMirror>('/v1/eu/espelho');
      if (!remote.areas.includes('notas')) {
        this.doneRev = rev;
        return;
      }
      const local = await this.items();
      const put = local.filter((i) => remote.hashes[i.tipo]?.[i.id] !== i.hash);
      const ids = new Set(local.filter((i) => i.tipo === 'nota').map((i) => i.id));
      const drop = Object.keys(remote.hashes.nota ?? {})
        .filter((id) => !ids.has(id))
        .map((id) => ({ tipo: 'nota' as const, id }));
      const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // tirar não pesa: vai junto com o primeiro lote (ou sozinho, quando não há o que pôr)
      const batches = lots<MirrorItem | { tipo: 'nota'; id: string }>([...drop, ...put], (i) => ('dados' in i ? JSON.stringify(i.dados).length : 40));
      if (!batches.length && remote.rev !== rev) batches.push([]);
      for (const batch of batches) {
        await this.account.request('/v1/eu/espelho', {
          method: 'POST',
          body: { rev, fuso, poe: batch.filter((i): i is MirrorItem => 'dados' in i), tira: batch.filter((i) => !('dados' in i)) },
        });
      }
      this.doneRev = rev;
    } catch (err) {
      // a rev mudou no meio (a próxima sincronização refaz), a cota do dia acabou, sem rede: fica para depois
      if (!(err instanceof CloudError)) console.warn('o espelho da API não subiu', err);
    }
  }
}
