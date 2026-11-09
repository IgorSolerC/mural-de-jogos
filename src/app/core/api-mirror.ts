import { Injectable, inject } from '@angular/core';
import { NoteFolders } from './note-folders';
import { FolderTree, NO_FOLDERS, NoteFolder } from './folders';
import type { AgendaDoMesV1, LembreteV1 } from '../../../contrato/api-v1/calendario';
import type { ContextoFichasV1, DesejoV1, FichaV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import type { BaralhoV1, CartaV1, ContextoEstudosV1 } from '../../../contrato/api-v1/estudos';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { ContextoGastosV1, LancamentoV1, MesV1 } from '../../../contrato/api-v1/gastos';
import type { QuadroV1 } from '../../../contrato/api-v1/kanban';
import { CONTEXTO_NOTAS, ESPELHO_POR_ENVIO, notaParaOEspelho, type ContextoNotasV1, type GrupoV1, type IndiceDasPastas, type NotaNoEspelhoV1, type PastaNoIndiceV1, type NotaV1, type PastaDesfeitaV1, type PastaV1, type TipoDoEspelho } from '../../../contrato/api-v1/notas';
import { calendarMirror } from './api-mirror-calendar';
import { muralsMirror } from './api-mirror-murals';
import { kanbanMirror } from './api-mirror-kanban';
import { spendingMirror } from './api-mirror-spending';
import { studyMirror } from './api-mirror-study';
import { studyDay } from './fsrs';
import type { StudyState } from './study';
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
import { StudyStore } from './study-store';
import { nameCollator } from './text';

/**
 * O espelho da API das AIs, pelo lado do site (PLANO-API.md, seção 8): depois de cada sincronização
 * que deixou o aparelho igual à nuvem, o site traduz as anotações e os gastos para o formato público v1
 * e manda à nuvem só o que mudou (a nuvem guarda as impressões do que já tem). A API lê dali, sem abrir
 * o mural. Só para a conta que pode usar a API, e só as áreas que alguma chave dela lê (as Anotações,
 * os Gastos, o Kanban, o Calendário, a Wishlist, o Pra depois, as fichas e os Estudos; ver
 * core/api-mirror-spending.ts, core/api-mirror-kanban.ts, core/api-mirror-calendar.ts, core/api-mirror-murals.ts e
 * core/api-mirror-study.ts).
 *
 * Nada fica no navegador: o "o que já foi" mora na nuvem, e o resto vive na memória desta aba.
 */

/** O teto de um envio, em caracteres (a API aceita até 640 mil; a CPU de 10 ms do Worker pede menos). */
const LOT_MAX_CHARS = 480_000;

export interface MirrorItem {
  tipo: TipoDoEspelho;
  id: string;
  hash: string;
  dados: NotaNoEspelhoV1 | ContextoNotasV1 | LancamentoV1 | MesV1 | ContextoGastosV1 | QuadroV1 | LembreteV1 | AgendaDoMesV1 | DesejoV1 | PraDepoisV1 | FichaV1 | ContextoFichasV1 | CartaV1 | BaralhoV1 | ContextoEstudosV1;
}

/** As áreas que este site sabe espelhar, e os tipos que se tiram quando somem daqui. */
const AREAS = ['notas', 'gastos', 'kanban', 'calendario', 'desejos', 'pra-depois', 'fichas', 'estudos'] as const;
const DROPPABLE: Record<(typeof AREAS)[number], readonly TipoDoEspelho[]> = {
  notas: ['nota'],
  gastos: ['lancamento', 'visao'],
  kanban: ['quadro'],
  calendario: ['lembrete', 'agenda'],
  desejos: ['desejo'],
  'pra-depois': ['pra-depois'],
  fichas: ['ficha'],
  estudos: ['carta', 'baralho'],
};

/** O cartão da nota no Kanban, como a v1 mostra. */
export interface CardView {
  coluna: string;
  card: Pick<KanbanCard, 'importance' | 'status'>;
  onWall: boolean;
}

/** A anotação no formato público v1 (o "quem vê" é o de verdade: só no Kanban também é privada). */
export function notaV1(r: Review, card: CardView | null, boardOnly: ReadonlySet<string>, tree: FolderTree = NO_FOLDERS): NotaV1 {
  const tasks = checkCount(r.text);
  const path = tree.path(tree.of(r));
  return {
    id: r.id,
    titulo: r.game.name,
    texto: r.text,
    grupo: r.category?.trim() || null,
    pasta: path.length ? { id: path.at(-1)!.id, caminho: path.map((f) => f.name) } : null,
    // o assunto de antes é a pasta de cima (PLANO-PASTAS.md, P13)
    assunto: path[0]?.name ?? null,
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
 * As pastas de um grupo (a chave), todas, de cima para baixo e de A a Z em cada nível, cada uma com a de
 * cima e quantas notas tem (com as de dentro). A API monta o caminho de cada nota por aqui.
 */
function pastasDoGrupo(tree: FolderTree, group: string, notes: readonly Review[]): PastaV1[] {
  const counts = new Map<string, number>();
  for (const n of notes) for (const f of tree.path(tree.of(n))) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
  const out: PastaV1[] = [];
  const walk = (parent: string | null) => {
    for (const f of tree.kids(group, parent) as readonly NoteFolder[]) {
      out.push({ id: f.id, nome: f.name, pai: parent, notas: counts.get(f.id) ?? 0 });
      walk(f.id);
    }
  };
  walk(null);
  return out;
}

/**
 * O vocabulário das Anotações: os grupos (na ordem das abas, com as pastas de cada um), as tags de cada
 * grupo e as fixas. É o que a AI usa em vez de inventar nomes.
 */
export function contextoV1(notes: readonly Review[], tree: FolderTree, pinned: readonly string[]): ContextoNotasV1 {
  const byGroup = new Map<string, Review[]>();
  for (const n of notes) {
    const g = n.category?.trim();
    if (!g) continue;
    const k = lookKey(g);
    byGroup.set(k, [...(byGroup.get(k) ?? []), n]);
  }
  const grupos: GrupoV1[] = boardCategories(notes).map((c) => {
    const mine = byGroup.get(lookKey(c.label)) ?? [];
    const pastas = pastasDoGrupo(tree, lookKey(c.label), mine);
    // os assuntos de antes: os nomes das pastas de cima
    return { nome: c.label, notas: c.notes, pastas, assuntos: pastas.filter((p) => p.pai === null).map((p) => p.nome), tags: tagCounts(mine) };
  });
  const loose = notes.filter((n) => !n.category?.trim());
  const loosePastas = pastasDoGrupo(tree, '', loose);
  const desfeitas = desfeitasDasNotas(tree, notes);
  return {
    grupos,
    sem_grupo: { notas: loose.length, tags: tagCounts(loose), ...(loosePastas.length ? { pastas: loosePastas } : {}) },
    tags_fixas: [...pinned],
    ...(desfeitas.length ? { desfeitas } : {}),
  };
}

/**
 * O id de pasta que o espelho guarda na nota: o escrito nela, mesmo que a pasta tenha sido desfeita ou
 * juntada em outra (o contexto diz para onde ela leva). Assim desfazer uma pasta com 300 notas regrava uma
 * linha, o contexto, e não as 300 (PLANO-PASTAS.md, seção 6). A pasta que não está nas suas configurações,
 * ou é de outro grupo, fica de fora: a nota está na raiz, pela regra da leitura (`FolderTree.of`).
 */
export function storedFolderOf(tree: FolderTree, r: Pick<Review, 'folder' | 'category'>): string | null {
  const f = r.folder ? tree.index.get(r.folder) : undefined;
  return f && f.group === lookKey(r.category ?? '') ? f.id : null;
}

/**
 * As pastas do seu Murall como a API as lê do contexto (`indiceDasPastas`): para o site mostrar a prévia de um
 * pedido com a mesma regra da API (`pastaDoPedido`). O grupo vai pela chave, que a comparação (`dobra`) lê igual.
 */
export function indiceDaArvore(tree: FolderTree): IndiceDasPastas {
  const vivas = new Map<string, PastaNoIndiceV1>();
  const desfeitas = new Map<string, string | null>();
  for (const f of tree.all) {
    if (f.gone) desfeitas.set(f.id, tree.resolve(f.id, f.group));
    else vivas.set(f.id, { nome: f.name, pai: tree.parentOf(f.id), grupo: f.group || null });
  }
  return { vivas, desfeitas };
}

/** As pastas desfeitas que alguma nota ainda guarda, cada uma com a viva que vale (em ordem de id: a impressão não muda à toa). */
function desfeitasDasNotas(tree: FolderTree, notes: readonly Review[]): PastaDesfeitaV1[] {
  const out = new Map<string, string | null>();
  for (const n of notes) {
    const id = storedFolderOf(tree, n);
    if (id && tree.index.get(id)!.gone && !out.has(id)) out.set(id, tree.of(n));
  }
  return [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, viva]) => ({ id, viva }));
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
  private readonly folders = inject(NoteFolders);
  private readonly spending = inject(SpendingStore);
  private readonly calendar = inject(CalendarStore);
  private readonly study = inject(StudyStore);
  /**
   * Os Estudos do último espelho, com as impressões: as filas pedem uma volta em todas as cartas por
   * baralho, e a maior parte das sincronizações não mexe nos Estudos (nem nas anotações, nem no dia).
   */
  private studyMemo: { state: StudyState; notes: readonly Review[]; shared: ReadonlySet<string>; day: string; items: MirrorItem[] } | null = null;
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
   * nos murais de resenhas, os desejos, os pra depois, as fichas e o que cada mural tem; nos Estudos, as
   * cartas, os baralhos e o contexto, com as filas de hoje e de amanhã.
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
    if (areas.includes('estudos')) out.push(...(await this.studyItems()));
    return out;
  }

  /** Os Estudos em v1 (ver core/api-mirror-study.ts), refeitos só quando eles, as anotações ou o dia mudam. */
  private async studyItems(): Promise<MirrorItem[]> {
    const state = this.study.view();
    const all = this.store.notes();
    const shared = this.store.sharedIds();
    const now = new Date();
    const day = studyDay(now);
    const m = this.studyMemo;
    if (m && m.state === state && m.notes === all && m.shared === shared && m.day === day) return m.items;
    const notes = new Map(all.filter((n) => !shared.has(n.id)).map((n) => [n.id, n]));
    const items: MirrorItem[] = [];
    for (const i of studyMirror(state, notes, now)) items.push({ ...i, hash: await hashOf(i.dados) });
    this.studyMemo = { state, notes: all, shared, day, items };
    return items;
  }

  private async noteItems(): Promise<MirrorItem[]> {
    const shared = this.store.sharedIds();
    const notes = this.store.notes().filter((n) => !shared.has(n.id));
    const boardOnly = this.kanban.boardOnly();
    const out: MirrorItem[] = [];
    // no espelho, a pasta vai só pelo id guardado na nota (o caminho e as desfeitas moram no contexto):
    // renomear, mover, desfazer ou juntar uma pasta não regrava as notas
    const tree = this.folders.tree();
    for (const n of notes) {
      const dados = notaParaOEspelho(this.notaOf(n, boardOnly), storedFolderOf(tree, n));
      out.push({ tipo: 'nota', id: n.id, hash: await hashOf(dados), dados });
    }
    const ctx = contextoV1(notes, tree, this.settings.pinnedTags());
    out.push({ tipo: 'contexto', id: CONTEXTO_NOTAS, hash: await hashOf(ctx), dados: ctx });
    return out;
  }

  /** Uma anotação no formato v1, com o cartão do Kanban (também o resultado de um pedido aplicado). */
  notaOf(n: Review, boardOnly: ReadonlySet<string> = this.kanban.boardOnly()): NotaV1 {
    const found = this.kanban.cardOf(n.id);
    const card = found
      ? { coluna: found.board.columns.find((c) => c.id === found.card.column)?.name ?? '', card: found.card, onWall: this.kanban.isOnWall(found.card, n.category) }
      : null;
    return notaV1(n, card, boardOnly, this.folders.tree());
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
