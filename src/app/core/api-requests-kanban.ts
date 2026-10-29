import type { CartaoV1, ColunaV1 } from '../../../contrato/api-v1/kanban';
import {
  conferirOpKanban,
  type ApagarColunaV1,
  type CriarColunaV1,
  type EditarColunaV1,
  type MoverCartaoV1,
  type NoQuadroV1,
  type OpKanban,
} from '../../../contrato/api-v1/operacoes-kanban';
import { andList } from './api-keys';
import { quadroV1 } from './api-mirror-kanban';
import {
  BoardCategory,
  IMPORTANCE_LABEL,
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  MAX_COLUMNS,
  addColumn,
  belongs,
  cardsIn,
  dependsOn,
  doneChange,
  moveColumn,
  placeCard,
  redressCards,
  removeCard,
  removeColumn,
  setDeps,
  setImportance,
  setStatus,
  setWall,
  touch,
  updateColumn,
} from './kanban';
import { Review, fold, isDone, isNote, withDone } from './review';

/**
 * Os pedidos do Kanban aplicados pelo site (PLANO-API.md, 9.2; rodada 8), pelas mesmas funções da
 * tela (core/kanban.ts, pelo `KanbanStore`): pôr e mover cartões (com a coluna que finaliza
 * finalizando a nota, e a que não finaliza abrindo de novo, como no arrastar), tirar do quadro, e criar,
 * mudar e apagar colunas. Sem a pergunta das dependências abertas (não há tela para responder): o
 * resultado conta. Também a nota nova que já nasce numa coluna (`placeNewNote`).
 */

/** O que o aplicador usa do `KanbanStore` (um quadro de mentira nos testes). */
export interface KanbanBook {
  get(id: string): KanbanBoard | undefined;
  boardFor(label: string): KanbanBoard;
  update(id: string, change: (b: KanbanBoard, at: string) => KanbanBoard): void;
  boards(): readonly KanbanBoard[];
  categories(): readonly BoardCategory[];
  groupKanbanOnly(category: string | null | undefined): boolean;
}

/** O que o aplicador usa do `ReviewStore`. */
export interface NoteBook {
  get(id: string): Review | undefined;
  update(r: Review, before?: Review): void;
  notes(): readonly Review[];
  sharedIds(): ReadonlySet<string>;
}

export type KanbanResult = { cartao: CartaoV1 | null; aviso?: string } | { coluna: ColunaV1 | null } | { erro: string };

export interface KanbanApplied {
  estado: 'aplicado' | 'falhou';
  resultado: KanbanResult;
  /** Como estava (o Desfazer): o cartão e o lugar dele, ou a coluna; null no que não mudou nada e no criar. */
  antes: CardBefore | ColumnBefore | null;
  carimbo?: string;
  /** A versão da nota antes do carimbo (a coluna que finaliza mudou a nota). */
  desde?: string | null;
}

/** O cartão antes do pedido: onde estava (null: fora do quadro) e se a nota estava finalizada. */
export interface CardBefore {
  quadro: string;
  card: KanbanCard | null;
  index: number;
  done: boolean;
  /** O dia em que estava finalizada (o Desfazer de uma reaberta a finaliza nele, e não hoje). */
  doneAt?: string | null;
}

/** A coluna antes do pedido, o lugar dela e (no apagar) os cartões que estavam nela. */
export interface ColumnBefore {
  quadro: string;
  column: KanbanColumn;
  index: number;
  cards?: KanbanCard[];
}

const failed = (erro: string): KanbanApplied => ({ estado: 'falhou', resultado: { erro }, antes: null });
const names = (b: KanbanBoard) => b.columns.map((c) => c.name).join(', ');

/** O quadro pelo id: o guardado, ou o de sempre de um grupo em que ninguém mexeu. */
export function boardById(book: KanbanBook, id: string): KanbanBoard | undefined {
  return book.get(id) ?? book.categories().map((c) => book.boardFor(c.label)).find((b) => b.id === id);
}

/** O nome do grupo de um quadro (a grafia mais usada). */
function labelOf(book: KanbanBook, b: Pick<KanbanBoard, 'category'>): string {
  return book.categories().find((c) => c.key === b.category)?.label ?? b.category;
}

/** A coluna pelo id ou pelo nome (sem acento e caixa). */
function columnOf(b: KanbanBoard, ref: string): KanbanColumn | undefined {
  return b.columns.find((c) => c.id === ref) ?? b.columns.find((c) => fold(c.name) === fold(ref));
}

/** As notas que a API alcança (sem as compartilhadas), pelo id. */
function reachable(notes: NoteBook): Map<string, Review> {
  const shared = notes.sharedIds();
  return new Map(notes.notes().filter((n) => !shared.has(n.id)).map((n) => [n.id, n]));
}

/** O cartão de uma nota como a v1 mostra, no quadro de agora. */
function cardV1(book: KanbanBook, notes: NoteBook, boardId: string, note: string): CartaoV1 | null {
  const b = boardById(book, boardId);
  if (!b) return null;
  const label = labelOf(book, b);
  return quadroV1(b, label, book.groupKanbanOnly(label), reachable(notes)).cartoes.find((c) => c.nota === note) ?? null;
}

function columnV1(book: KanbanBook, notes: NoteBook, boardId: string, column: string): ColunaV1 | null {
  const b = boardById(book, boardId);
  if (!b) return null;
  const label = labelOf(book, b);
  return quadroV1(b, label, book.groupKanbanOnly(label), reachable(notes)).colunas.find((c) => c.id === column) ?? null;
}

/**
 * Onde `posicao` (o lugar entre os cartões que a v1 mostra na coluna) cai entre todos os da coluna:
 * antes do cartão que está ali agora; depois do último, embaixo. Sem `posicao` (e na coluna que se
 * arruma sozinha, que não tem lugar), em cima, como tudo o que chega sem lugar escolhido.
 */
function indexFor(b: KanbanBoard, col: KanbanColumn, note: string, posicao: number | undefined, notes: ReadonlyMap<string, Review>): number | undefined {
  if (posicao === undefined || col.sort?.length) return 0;
  const shown = cardsIn(b, col.id).filter((c) => c.note !== note && belongs(b, notes.get(c.note)));
  const before = shown[posicao]?.note;
  if (!before) return undefined;
  const i = cardsIn(b, col.id)
    .filter((c) => c.note !== note)
    .findIndex((c) => c.note === before);
  return i < 0 ? undefined : i;
}

/** Finaliza ou abre de novo a nota que chegou numa coluna (como `KanbanActions`); devolve a hora nova dela. */
function followDone(notes: NoteBook, before: KanbanBoard, note: string, from: string | null, to: string, now: string): string | undefined {
  const r = notes.get(note);
  if (!r) return undefined;
  const change = doneChange(before, from, to);
  if (change === 'finalizar' && !isDone(r)) notes.update(withDone(r, true, now), r);
  else if (change === 'abrir' && isDone(r)) notes.update(withDone(r, false, now), r);
  else return undefined;
  return notes.get(note)?.updatedAt;
}

/**
 * Aplica um pedido do Kanban e diz como foi. Tudo passa pelas conferências de sempre: a forma de novo
 * (`conferirOpKanban`, a mesma da API) e as funções de core/kanban.ts.
 */
export function applyKanbanRequest(book: KanbanBook, notes: NoteBook, req: { op: string; alvo: string; dados: unknown }, now: string): KanbanApplied {
  const op = req.op as OpKanban;
  const checked = conferirOpKanban(op, req.dados);
  if (!checked.ok) return failed(`${checked.erro} (campo ${checked.campo})`);
  const quadro = (checked.dados as { quadro: string }).quadro;
  const b = boardById(book, quadro);
  if (!b) return failed('O quadro não existe mais (o grupo dele ficou sem nota).');
  const known = reachable(notes);

  switch (op) {
    case 'cartao.mover': {
      const d = checked.dados as MoverCartaoV1;
      const note = req.alvo;
      const r = known.get(note);
      if (!r || !isNote(r)) return failed('A nota não existe mais (foi apagada, ou virou compartilhada).');
      if (!belongs(b, r)) return failed(`A nota agora é ${r.category?.trim() ? `do grupo ${r.category.trim()}` : 'sem grupo'}: ela só entra no quadro do grupo dela.`);
      const cur = b.cards.find((c) => c.note === note) ?? null;
      const col = d.coluna ? columnOf(b, d.coluna) : cur ? b.columns.find((c) => c.id === cur.column) : b.columns[0];
      if (!col) return failed(`A coluna não existe mais. As colunas do quadro são: ${names(b)}.`);
      const index = cur ? cardsIn(b, cur.column).findIndex((c) => c.note === note) : -1;
      const moves = !cur || col.id !== cur.column || d.posicao !== undefined;
      const at = indexFor(b, col, note, d.posicao, known);
      // as dependências que existem e não fazem roda (por qualquer quadro)
      const deps = d.depende_de?.filter((x) => x !== note && known.has(x) && !dependsOn(book.boards(), x, note));
      const left = d.depende_de?.filter((x) => !deps?.includes(x)) ?? [];
      const wall = d.no_mural === undefined ? undefined : d.no_mural === null || d.no_mural === !book.groupKanbanOnly(r.category) ? null : d.no_mural;
      book.update(b.id, (x, when) => {
        let y = moves ? placeCard(x, note, col.id, when, at) : x;
        if (d.importancia !== undefined) y = setImportance(y, note, d.importancia, when);
        if (d.status !== undefined) y = setStatus(y, note, d.status ?? '', when);
        if (deps) y = setDeps(y, note, deps, when);
        if (wall !== undefined) y = setWall(y, note, wall ?? undefined, when);
        return y;
      });
      const carimbo = followDone(notes, b, note, cur?.column ?? null, col.id, now);
      const aviso = left.length ? `Ficaram de fora das dependências (não existem, ou fariam uma roda): ${left.join(', ')}.` : undefined;
      return {
        estado: 'aplicado',
        resultado: { cartao: cardV1(book, notes, b.id, note), ...(aviso ? { aviso } : {}) },
        antes: { quadro: b.id, card: cur, index, done: isDone(r), doneAt: r.doneAt ?? null },
        ...(carimbo ? { carimbo, desde: r.updatedAt } : {}),
      };
    }
    case 'cartao.tirar': {
      const cur = b.cards.find((c) => c.note === req.alvo);
      if (!cur) return { estado: 'aplicado', resultado: { cartao: null }, antes: null };
      const index = cardsIn(b, cur.column).findIndex((c) => c.note === req.alvo);
      book.update(b.id, (x, when) => removeCard(x, req.alvo, when));
      return { estado: 'aplicado', resultado: { cartao: null }, antes: { quadro: b.id, card: cur, index, done: !!known.get(req.alvo)?.doneAt, doneAt: known.get(req.alvo)?.doneAt ?? null } };
    }
    case 'coluna.criar': {
      const d = checked.dados as CriarColunaV1;
      // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): a mesma coluna
      if (b.columns.some((c) => c.id === req.alvo)) return { estado: 'aplicado', resultado: { coluna: columnV1(book, notes, b.id, req.alvo) }, antes: null };
      const taken = b.columns.find((c) => fold(c.name) === fold(d.nome));
      if (taken) return failed(`O quadro já tem a coluna “${taken.name}”.`);
      if (b.columns.length >= MAX_COLUMNS) return failed(`Um quadro tem até ${MAX_COLUMNS} colunas.`);
      const after = d.depois_de ? columnOf(b, d.depois_de)?.id : undefined;
      book.update(b.id, (x, when) => {
        const made = addColumn(x, d.nome, when, after, req.alvo);
        return d.finaliza || d.pula ? updateColumn(made.board, made.id, { finishes: !!d.finaliza, ...(d.pula ? { skip: true as const } : {}) }, when) : made.board;
      });
      return { estado: 'aplicado', resultado: { coluna: columnV1(book, notes, b.id, req.alvo) }, antes: null };
    }
    case 'coluna.editar': {
      const d = checked.dados as EditarColunaV1;
      const col = b.columns.find((c) => c.id === req.alvo);
      if (!col) return failed(`A coluna não existe mais. As colunas do quadro são: ${names(b)}.`);
      if (d.nome !== undefined && b.columns.some((c) => c.id !== col.id && fold(c.name) === fold(d.nome!))) return failed(`O quadro já tem uma coluna “${d.nome}”.`);
      const index = b.columns.indexOf(col);
      book.update(b.id, (x, when) => {
        const patch: Partial<KanbanColumn> = {
          ...(d.nome !== undefined ? { name: d.nome } : {}),
          ...(d.finaliza !== undefined ? { finishes: d.finaliza } : {}),
          ...(d.pula !== undefined ? { skip: d.pula ? (true as const) : undefined } : {}),
        };
        const y = Object.keys(patch).length ? updateColumn(x, col.id, patch, when) : x;
        return d.posicao !== undefined && d.posicao !== index ? moveColumn(y, col.id, d.posicao, when) : y;
      });
      return { estado: 'aplicado', resultado: { coluna: columnV1(book, notes, b.id, col.id) }, antes: { quadro: b.id, column: col, index } };
    }
    case 'coluna.apagar': {
      const d = checked.dados as ApagarColunaV1;
      const col = b.columns.find((c) => c.id === req.alvo);
      if (!col) return failed('A coluna já não existe.');
      if (b.columns.length <= 1) return failed('Esta é a única coluna do quadro: um quadro nunca fica sem coluna.');
      const i = b.columns.indexOf(col);
      const neighbor = (b.columns[i - 1] ?? b.columns[i + 1])!.id;
      const into = d.para === null ? null : d.para !== undefined ? (columnOf(b, d.para)?.id ?? neighbor) : neighbor;
      const cards = cardsIn(b, col.id);
      book.update(b.id, (x, when) => removeColumn(x, col.id, into === col.id ? neighbor : into, when));
      return { estado: 'aplicado', resultado: { coluna: null }, antes: { quadro: b.id, column: col, index: i, cards } };
    }
  }
}

/**
 * A nota nova que já nasce no quadro (o `kanban` de `nota.criar`): na coluna pedida (pelo id ou pelo
 * nome; sem ela, ou se ela não existe, na primeira), com a importância e o status. Na coluna que
 * finaliza, ela nasce finalizada. Devolve o aviso, se a coluna não existia.
 */
export function placeNewNote(book: KanbanBook, notes: NoteBook, note: Review, k: NoQuadroV1, now: string): string | null {
  const category = note.category?.trim();
  if (!category) return 'A nota não tem grupo, então não entrou em nenhum quadro.';
  const b = book.boardFor(category);
  const col = (k.coluna ? columnOf(b, k.coluna) : undefined) ?? b.columns[0]!;
  book.update(b.id, (x, when) => {
    let y = placeCard(x, note.id, col.id, when, 0);
    if (k.importancia !== undefined) y = setImportance(y, note.id, k.importancia, when);
    if (k.status) y = setStatus(y, note.id, k.status, when);
    return y;
  });
  followDone(notes, b, note.id, null, col.id, now);
  return k.coluna && col.id !== k.coluna && fold(col.name) !== fold(k.coluna) ? `A coluna “${k.coluna}” não existe; a nota entrou em ${col.name}.` : null;
}

/** Desfaz um pedido do Kanban aplicado: o cartão volta ao lugar (e a nota, ao check de antes); a coluna, ao que era. */
export function undoKanban(book: KanbanBook, notes: NoteBook, t: { op: string; alvo: string; antes?: unknown }, now: string): void {
  if (t.op === 'coluna.criar') {
    const b = [...book.boards()].find((x) => x.columns.some((c) => c.id === t.alvo));
    if (!b || b.columns.length <= 1) return;
    const i = b.columns.findIndex((c) => c.id === t.alvo);
    const neighbor = (b.columns[i - 1] ?? b.columns[i + 1])!.id;
    book.update(b.id, (x, when) => removeColumn(x, t.alvo, neighbor, when));
    return;
  }
  if (t.op === 'cartao.mover' || t.op === 'cartao.tirar') {
    const was = t.antes as CardBefore | null | undefined;
    if (!was) return;
    const b = boardById(book, was.quadro);
    if (!b) return;
    const note = t.alvo;
    if (!was.card) book.update(b.id, (x, when) => removeCard(x, note, when));
    else {
      const back = was.card;
      book.update(b.id, (x, when) => {
        if (!x.columns.some((c) => c.id === back.column)) return x;
        const placed = placeCard(x, note, back.column, when, Math.max(0, was.index));
        // tudo como era (a importância, o status, as dependências, o mural), e o visual vestido de novo pela coluna
        return redressCards({ ...placed, cards: placed.cards.map((c) => (c.note === note ? { ...back, at: when } : c)) }, [note]);
      });
    }
    const r = notes.get(note);
    if (r && isNote(r) && isDone(r) !== was.done) {
      // finalizada de novo no dia de antes (o `antes` volta da nuvem: só uma data de verdade vale)
      const at = typeof was.doneAt === 'string' && Number.isFinite(Date.parse(was.doneAt)) ? was.doneAt : null;
      notes.update(was.done && at ? { ...withDone(r, true, now), doneAt: at } : withDone(r, was.done, now), r);
    }
    return;
  }
  const was = t.antes as ColumnBefore | null | undefined;
  if (!was) return;
  const b = boardById(book, was.quadro);
  if (!b) return;
  if (t.op === 'coluna.editar') {
    const { id, name, finishes, skip } = was.column;
    book.update(b.id, (x, when) => {
      if (!x.columns.some((c) => c.id === id)) return x;
      return moveColumn(updateColumn(x, id, { name, finishes, skip }, when), id, was.index, when);
    });
    return;
  }
  if (t.op === 'coluna.apagar') {
    book.update(b.id, (x, when) => {
      if (x.columns.some((c) => c.id === was.column.id)) return x;
      const columns = [...x.columns];
      columns.splice(Math.min(was.index, columns.length), 0, was.column);
      let y = touch(x, { columns }, when);
      // os cartões dela voltam (os que saíram do quadro também), cada um como era
      for (const card of was.cards ?? []) {
        y = placeCard(y, card.note, was.column.id, when);
        y = { ...y, cards: y.cards.map((c) => (c.note === card.note ? { ...card, at: when } : c)) };
      }
      return redressCards(y, (was.cards ?? []).map((c) => c.note));
    });
  }
}

/** O título que a pessoa reconhece: o da nota (cartão) ou o do grupo do quadro (coluna). */
export function kanbanTitle(book: KanbanBook, notes: NoteBook, t: { op: string; alvo: string; dados: unknown; resultado?: unknown }): string {
  if (t.op.startsWith('cartao.')) return notes.get(t.alvo)?.game.name ?? (t.resultado as { cartao?: CartaoV1 | null } | null)?.cartao?.titulo ?? 'uma nota que não existe mais';
  const quadro = (t.dados as { quadro?: string } | null)?.quadro;
  const b = quadro ? boardById(book, quadro) : undefined;
  return b ? labelOf(book, b) : 'um quadro que não existe mais';
}

/** Os nomes das colunas de um pedido, para as frases (a do alvo também pelo `antes`, se ela sumiu). */
export function columnNames(book: KanbanBook, t: { op: string; alvo: string; dados: unknown; antes?: unknown }): ColumnNames {
  const quadro = (t.dados as { quadro?: string } | null)?.quadro;
  const b = quadro ? boardById(book, quadro) : undefined;
  const of = (ref: string) => (b ? (columnOf(b, ref)?.name ?? null) : null);
  return { target: t.op.startsWith('coluna.') ? (of(t.alvo) ?? (t.antes as ColumnBefore | null | undefined)?.column?.name ?? null) : null, of };
}

/** Os nomes das colunas para as frases: a do pedido (o alvo, nas colunas) e uma qualquer pelo id. */
export interface ColumnNames {
  target: string | null;
  of(ref: string): string | null;
}

/**
 * O pedido em palavras: "Levar “Relatório” para Feito" (esperando) ou "levou “Relatório” para Feito"
 * (no histórico, `past`). `title` é o da nota (cartão) ou o do quadro (coluna). Null: não é do Kanban.
 */
export function kanbanWords(op: string, dados: unknown, title: string, past: boolean, cols: ColumnNames): string | null {
  const d = (dados ?? {}) as Record<string, unknown>;
  const v = (now: string, then: string) => (past ? then : now);
  const t = `“${title}”`;
  switch (op) {
    case 'cartao.mover': {
      const fields = [
        ...(d['importancia'] !== undefined ? [d['importancia'] ? `a importância (${IMPORTANCE_LABEL[d['importancia'] as keyof typeof IMPORTANCE_LABEL] ?? d['importancia']})` : 'a importância'] : []),
        ...(d['status'] !== undefined ? [d['status'] ? `o status (“${d['status']}”)` : 'o status'] : []),
        ...(d['depende_de'] !== undefined ? ['as dependências'] : []),
        ...(d['no_mural'] !== undefined ? ['onde ela aparece'] : []),
      ];
      const to = typeof d['coluna'] === 'string' ? (cols.of(d['coluna']) ?? 'outra coluna') : null;
      if (to) return `${v('Levar', 'levou')} ${t} para ${to}${fields.length ? ` e ${v('mudar', 'mudou')} ${andList(fields)}` : ''}`;
      if (!fields.length) return `${v('Mudar', 'mudou')} o lugar de ${t} na coluna`;
      return `${v('Mudar', 'mudou')} ${andList(fields)} de ${t} no quadro`;
    }
    case 'cartao.tirar':
      return `${v('Tirar', 'tirou')} ${t} do quadro`;
    case 'coluna.criar':
      return `${v('Criar', 'criou')} a coluna “${String(d['nome'] ?? '')}” no quadro ${title}`;
    case 'coluna.editar': {
      const name = cols.target ?? 'uma coluna';
      const fields = [
        ...(d['nome'] !== undefined ? [`o nome (para “${String(d['nome'])}”)`] : []),
        ...(d['finaliza'] !== undefined ? [d['finaliza'] ? 'para finalizar as notas que chegam' : 'para não finalizar mais'] : []),
        ...(d['pula'] !== undefined ? [d['pula'] ? 'para a seta pular' : 'para a seta parar nela'] : []),
        ...(d['posicao'] !== undefined ? ['o lugar'] : []),
      ];
      return `${v('Mudar', 'mudou')} a coluna “${name}” do quadro ${title}: ${andList(fields)}`;
    }
    case 'coluna.apagar': {
      const name = cols.target ?? 'uma coluna';
      const to = d['para'] === null ? 'os cartões dela saem do quadro' : typeof d['para'] === 'string' ? `os cartões dela vão para ${cols.of(d['para']) ?? 'outra coluna'}` : null;
      return `${v('Apagar', 'apagou')} a coluna “${name}” do quadro ${title}${to ? ` (${to})` : ''}`;
    }
    default:
      return null;
  }
}
