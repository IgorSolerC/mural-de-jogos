import { Injectable, inject } from '@angular/core';
import type { AgendaDoMesV1, LembreteV1 } from '../../../contrato/api-v1/calendario';
import type { ContextoFichasV1, DesejoV1, FichaV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { ContextoGastosV1, LancamentoV1, MesV1 } from '../../../contrato/api-v1/gastos';
import type { QuadroV1 } from '../../../contrato/api-v1/kanban';
import { CONTEXTO_NOTAS, ESPELHO_POR_ENVIO, type ContextoNotasV1, type GrupoV1, type NotaV1, type TipoDoEspelho } from '../../../contrato/api-v1/notas';
import { calendarMirror } from './api-mirror-calendar';
import { muralsMirror } from './api-mirror-murals';
import { kanbanMirror } from './api-mirror-kanban';
import { spendingMirror } from './api-mirror-spending';
import { lookKey } from './category-looks';
import { CalendarStore } from './calendar-store';
import { CloudAccount, CloudError } from './cloud-account';
import { KanbanCard, boardCategories } from './kanban';
import { KanbanStore } from './kanban-store';
import { Review, shownToOthers } from './review';
import { ReviewStore } from './review-store';
import { checkCount } from './rich-text';
import { Settings } from './settings';
import { todayISO } from './dates';
import { SpendingStore } from './spending-store';
import { nameCollator } from './text';

/**
 * O espelho da API das AIs, pelo lado do site (PLANO-API.md, seção 8): depois de cada sincronização
 * que deixou o aparelho igual à nuvem, o site traduz as anotações e os gastos para o formato público v1
 * e manda à nuvem só o que mudou (a nuvem guarda as impressões do que já tem). A API lê dali, sem abrir
 * o mural. Só para a conta que pode usar a API, e só as áreas que alguma chave dela lê (as Anotações,
 * os Gastos, o Kanban, o Calendário, a Wishlist, o Pra depois e as fichas; ver core/api-mirror-spending.ts,
 * core/api-mirror-kanban.ts, core/api-mirror-calendar.ts e core/api-mirror-murals.ts).
 *
 * Nada fica no navegador: o "o que já foi" mora na nuvem, e o resto vive na memória desta aba.
 */

/** O teto de um envio, em caracteres (a API aceita até 640 mil; a CPU de 10 ms do Worker pede menos). */
const LOT_MAX_CHARS = 480_000;

export interface MirrorItem {
  tipo: TipoDoEspelho;
  id: string;
  hash: string;
  dados: NotaV1 | ContextoNotasV1 | LancamentoV1 | MesV1 | ContextoGastosV1 | QuadroV1 | LembreteV1 | AgendaDoMesV1 | DesejoV1 | PraDepoisV1 | FichaV1 | ContextoFichasV1;
}

/** As áreas que este site sabe espelhar, e os tipos que se tiram quando somem daqui. */
const AREAS = ['notas', 'gastos', 'kanban', 'calendario', 'desejos', 'pra-depois', 'fichas'] as const;
const DROPPABLE: Record<(typeof AREAS)[number], readonly TipoDoEspelho[]> = {
  notas: ['nota'],
  gastos: ['lancamento', 'visao'],
  kanban: ['quadro'],
  calendario: ['lembrete', 'agenda'],
  desejos: ['desejo'],
  'pra-depois': ['pra-depois'],
  fichas: ['ficha'],
};

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
  private readonly spending = inject(SpendingStore);
  private readonly calendar = inject(CalendarStore);
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

  /**
   * Os itens das áreas pedidas no formato v1, com as impressões: nas Anotações, as notas da conta (as
   * compartilhadas não) e o contexto; nos Gastos, os lançamentos, as visões dos meses e o contexto; no
   * Kanban, o quadro de cada grupo com nota; no Calendário, os lembretes e a agenda de cada mês da janela;
   * nos murais de resenhas, os desejos, os pra depois, as fichas e o que cada mural tem.
   */
  async items(areas: readonly string[] = ['notas']): Promise<MirrorItem[]> {
    const out: MirrorItem[] = [];
    if (areas.includes('notas')) out.push(...(await this.noteItems()));
    if (areas.includes('gastos')) {
      for (const i of spendingMirror(this.spending.state(), todayISO())) out.push({ ...i, hash: await hashOf(i.dados) });
    }
    if (areas.includes('kanban')) {
      const shared = this.store.sharedIds();
      const notes = new Map(this.store.notes().filter((n) => !shared.has(n.id)).map((n) => [n.id, n]));
      const src = { categories: this.kanban.categories(), boardFor: (l: string) => this.kanban.boardFor(l), kanbanOnly: (l: string) => this.kanban.groupKanbanOnly(l) };
      for (const q of kanbanMirror(src, notes)) out.push({ tipo: 'quadro', id: q.id, hash: await hashOf(q), dados: q });
    }
    if (areas.includes('calendario')) {
      for (const i of calendarMirror(this.calendar.state(), todayISO())) out.push({ ...i, hash: await hashOf(i.dados) });
    }
    if (areas.some((a) => a === 'desejos' || a === 'pra-depois' || a === 'fichas')) {
      const murals = { wishes: this.store.wishes(), drafts: this.store.drafts(), reviews: this.store.reviews(), boardOnly: this.kanban.boardOnly() };
      for (const i of muralsMirror(murals, areas)) out.push({ ...i, hash: await hashOf(i.dados) });
    }
    return out;
  }

  private async noteItems(): Promise<MirrorItem[]> {
    const shared = this.store.sharedIds();
    const notes = this.store.notes().filter((n) => !shared.has(n.id));
    const boardOnly = this.kanban.boardOnly();
    const out: MirrorItem[] = [];
    for (const n of notes) {
      const dados = this.notaOf(n, boardOnly);
      out.push({ tipo: 'nota', id: n.id, hash: await hashOf(dados), dados });
    }
    const ctx = contextoV1(notes, this.settings.notesConfig().subjects, this.settings.pinnedTags());
    out.push({ tipo: 'contexto', id: CONTEXTO_NOTAS, hash: await hashOf(ctx), dados: ctx });
    return out;
  }

  /** Uma anotação no formato v1, com o cartão do Kanban (também o resultado de um pedido aplicado). */
  notaOf(n: Review, boardOnly: ReadonlySet<string> = this.kanban.boardOnly()): NotaV1 {
    const found = this.kanban.cardOf(n.id);
    const card = found
      ? { coluna: found.board.columns.find((c) => c.id === found.card.column)?.name ?? '', card: found.card, onWall: this.kanban.isOnWall(found.card, n.category) }
      : null;
    return notaV1(n, card, boardOnly);
  }

  private async mirror(rev: number): Promise<void> {
    if (rev === this.doneRev) return;
    try {
      const remote = await this.account.request<RemoteMirror>('/v1/eu/espelho');
      const areas = AREAS.filter((a) => remote.areas.includes(a));
      if (!areas.length) {
        this.doneRev = rev;
        return;
      }
      const local = await this.items(areas);
      const put = local.filter((i) => remote.hashes[i.tipo]?.[i.id] !== i.hash);
      // o que está lá e sumiu daqui (a nota apagada, o lançamento apagado, o mês que saiu da janela, o
      // quadro do grupo que ficou sem nota, o lembrete apagado)
      const drop = areas.flatMap((a) =>
        DROPPABLE[a].flatMap((tipo) => {
          const ids = new Set(local.filter((i) => i.tipo === tipo).map((i) => i.id));
          return Object.keys(remote.hashes[tipo] ?? {})
            .filter((id) => !ids.has(id))
            .map((id) => ({ tipo, id }));
        }),
      );
      const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // tirar não pesa: vai junto com o primeiro lote (ou sozinho, quando não há o que pôr)
      const batches = lots<MirrorItem | { tipo: TipoDoEspelho; id: string }>([...drop, ...put], (i) => ('dados' in i ? JSON.stringify(i.dados).length : 40));
      if (!batches.length && remote.rev !== rev) batches.push([]);
      for (const batch of batches) {
        try {
          await this.account.request('/v1/eu/espelho', {
            method: 'POST',
            body: { rev, fuso, poe: batch.filter((i): i is MirrorItem => 'dados' in i), tira: batch.filter((i) => !('dados' in i)) },
          });
        } catch (err) {
          // um lote que a nuvem não aceita (um item fora da forma) não prende os outros: os lotes vão
          // sempre na mesma ordem, e um só travava o espelho inteiro para sempre. Ele tenta de novo na
          // próxima rev; o resto (sem rede, rev atrasada, a cota do dia) para aqui
          if (!(err instanceof CloudError && err.status === 400)) throw err;
          console.warn('o espelho da API recusou um lote', err.message);
        }
      }
      this.doneRev = rev;
    } catch (err) {
      // a rev mudou no meio (a próxima sincronização refaz), a cota do dia acabou, sem rede: fica para depois
      if (!(err instanceof CloudError)) console.warn('o espelho da API não subiu', err);
    }
  }
}
