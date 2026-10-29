import { Injectable, inject, signal } from '@angular/core';
import { andList } from './api-keys';
import { plural } from './text';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { NotaV1 } from '../../../contrato/api-v1/notas';
import {
  OPS_DE_NOTA,
  TEXTO_MAX,
  acrescentar,
  conferirOp,
  mexerNasTarefas,
  aplicarNaNotaV1,
  notaDoPedido,
  type AcrescentarV1,
  type CamposDaNota,
  type CriarNotaV1,
  type EditarNotaV1,
  type EstadoDoPedido,
  type OpNota,
  type TarefasV1,
} from '../../../contrato/api-v1/operacoes';
import { OPS_DE_GASTO } from '../../../contrato/api-v1/operacoes-gastos';
import { OPS_DO_KANBAN, type NoQuadroV1 } from '../../../contrato/api-v1/operacoes-kanban';
import { ColumnNames, KanbanResult, applyKanbanRequest, boardById, columnNames, kanbanTitle, kanbanWords, placeNewNote, undoKanban } from './api-requests-kanban';
import { KanbanStore } from './kanban-store';
import { ApiMirror } from './api-mirror';
import { type RequestStamps, SpendingResult, applySpendingRequest, onlyOwnSince, spendingTitle, spendingWords, undoSpending } from './api-requests-spending';
import { SpendingStore } from './spending-store';
import { BUILD } from './build';
import { CloudAccount } from './cloud-account';
import { DataKey, LocalData } from './local-data';
import { commonPairs } from './merge3';
import { cleanCategory, cleanSubject, sanitizeTags } from './note-labels';
import { relinkAfterRename } from './note-links';
import { Review, audienceFields, formatReviewDateLong, isNote, sanitizeReview, storedNote, todayISO, withDone, withPin } from './review';
import { ReviewStore } from './review-store';

/**
 * Os pedidos da API das AIs, pelo lado do site (PLANO-API.md, seção 9; os dos Gastos em
 * core/api-requests-spending.ts, os do Kanban em core/api-requests-kanban.ts). A nuvem nunca abre o mural:
 * cada escrita de uma AI vira um pedido, e o Murall aberto em algum aparelho logado na conta pega,
 * aplica pelas mesmas funções da tela (as lojas, as conferências de sempre), sincroniza como uma
 * edição comum e só então conclui o pedido na nuvem, com o resultado e a nota de antes (o Desfazer).
 *
 * O ciclo roda dentro da sincronização (core/cloud-sync.ts, na trava `meu-mural:sync`): depois de uma
 * rodada que deixou o aparelho igual à nuvem, `applyOpen` aplica os pendentes; uma rodada a mais sobe
 * o que mudou; `conclude` conta à nuvem. Quem avisa que há pedidos é o cabeçalho `Mural-Pedidos` do
 * mural, ou o relógio de 60 segundos (também com a aba escondida: decisão D2 do plano).
 *
 * Os aplicados e ainda não concluídos ficam guardados (`APPLIED_KEY`, no banco do mural, com o dono):
 * uma aba que fecha no meio não aplica de novo um "acrescentar" quando o pedido volta a ficar livre.
 */

/** Onde ficam os aplicados aqui e ainda não concluídos (sai na limpeza do navegador, com o banco). */
export const APPLIED_KEY: DataKey = 'meu-mural:api:aplicados';
/** Sem nenhum pedido novo há tanto tempo, a aba escondida para de conferir (volta ao aparecer). */
export const IDLE_MS = 2 * 60 * 60 * 1000;
/** O teto de cada JSON guardado num pedido concluído (o mesmo da API, `RESULT_MAX_CHARS`). */
const RESULT_MAX_CHARS = 64_000;

/** Um pedido como o site recebe (GET /v1/eu/pedidos). */
export interface SiteRequest {
  id: string;
  op: string;
  alvo: string;
  estado: EstadoDoPedido;
  criado_em: string;
  expira_em: string;
  resolvido_em: string | null;
  resultado?: unknown;
  dados: unknown;
  chave: { id: string; nome: string };
  antes?: unknown;
}

export type Concluded = 'aplicado' | 'conflito' | 'falhou';

/** O que a AI lê depois: a nota como ficou (null: apagada), ou o porquê de não ter entrado. */
export type RequestResult = { nota: NotaV1 | null; aviso?: string } | { erro: string; nota?: NotaV1 } | SpendingResult | KanbanResult;

/** Um pedido aplicado aqui, pronto para concluir na nuvem. */
export interface AppliedItem {
  id: string;
  /** A operação (das Anotações ou dos Gastos). */
  op: string;
  alvo: string;
  /** A chave que pediu (para o bilhete dizer quem, e o Ver abrir o histórico dela). */
  chave: string;
  chaveId: string;
  estado: Concluded;
  resultado: RequestResult;
  /** A anotação como era (guardada), para o Desfazer; null no criar e no que não mudou nada. */
  antes: unknown;
  /** Quando a anotação ficou carimbada pelo pedido (a próxima edição da AI não é "conflito" por causa dele). */
  carimbo?: string;
  /** A versão de antes do carimbo (null: o pedido criou): só a corrente de pedidos daqui passa sem conflito. */
  desde?: string | null;
}

/** O que a aplicação precisa saber do mural: a anotação de agora, o vocabulário, a hora. */
export interface ApplyContext {
  now: string;
  today: string;
  /** As edições que vieram de pedidos aplicados aqui (ver `RequestStamps`): não contam como mudança de outra pessoa. */
  stamps: RequestStamps;
  v1(r: Review): NotaV1;
  /** Põe a nota nova no quadro do grupo dela (o `kanban` de `nota.criar`); devolve o aviso, se houver. */
  place?(r: Review, k: NoQuadroV1): string | null;
}

/** O nome como já existe no mural (sem ligar para caixa e acento), ou o novo, limpo. */
function spelled(existing: Iterable<string | undefined>, raw: string, clean: (s: string) => string): string {
  const want = dobra(raw);
  for (const e of existing) if (e && dobra(e) === want) return e;
  return clean(raw);
}

/** Grupo, assunto e tags com a grafia que o mural já usa (a AI escreve "trabalho", o mural tem "Trabalho"). */
function labels(notes: readonly Review[], c: CamposDaNota): Partial<Pick<Review, 'category' | 'subject' | 'tags'>> & { clear: ('category' | 'subject')[] } {
  const out: Partial<Pick<Review, 'category' | 'subject' | 'tags'>> & { clear: ('category' | 'subject')[] } = { clear: [] };
  if (c.grupo !== undefined) {
    const v = c.grupo ? spelled(notes.map((n) => n.category), c.grupo, cleanCategory) : '';
    if (v) out.category = v;
    else out.clear.push('category');
  }
  if (c.assunto !== undefined) {
    const v = c.assunto ? spelled(notes.map((n) => n.subject), c.assunto, cleanSubject) : '';
    if (v) out.subject = v;
    else out.clear.push('subject');
  }
  if (c.tags !== undefined) {
    const known = notes.flatMap((n) => n.tags ?? []);
    out.tags = sanitizeTags(c.tags.map((t) => spelled(known, t, (s) => s)));
  }
  return out;
}

/** Quem vê, como o editor grava (Público vai para o Feed, como o Pregar da tela). */
function seenAs(v: 'privada' | 'publica', prev: Review | null, now: string): Pick<Review, 'private' | 'quiet' | 'publishedAt'> {
  return audienceFields(v === 'publica' ? 'publicar' : 'privada', prev, now);
}

/** A anotação com os campos do pedido (sem carimbar a hora: quem chama carimba). */
function withFields(r: Review, c: CamposDaNota, notes: readonly Review[], now: string): Review {
  const { clear, ...l } = labels(notes, c);
  const next: Review = { ...r, ...l };
  for (const k of clear) delete next[k];
  if (l.tags && !l.tags.length) delete next.tags;
  if (c.titulo !== undefined) next.game = { ...next.game, name: c.titulo };
  if (c.capa !== undefined) next.game = { ...next.game, coverUrl: c.capa };
  if (c.texto !== undefined) next.text = c.texto;
  if (c.data !== undefined) next.completedAt = c.data;
  if (c.visibilidade !== undefined) {
    delete next.private;
    delete next.quiet;
    delete next.publishedAt;
    Object.assign(next, seenAs(c.visibilidade, r, now));
  }
  return next;
}

const failed = (erro: string, nota?: NotaV1) => ({ estado: 'falhou' as const, resultado: nota ? { erro, nota } : { erro } });

/**
 * Aplica um pedido nas Anotações, pelas lojas, e diz como foi. Tudo passa pelas conferências de
 * sempre: a forma de novo (`conferirOp`, a mesma da API), e a anotação por `sanitizeReview`. A
 * compartilhada nunca é mexida pela API (ela não está no espelho).
 */
export function applyNoteRequest(
  store: ReviewStore,
  req: Pick<SiteRequest, 'op' | 'alvo' | 'dados'>,
  ctx: ApplyContext,
): Omit<AppliedItem, 'id' | 'chave' | 'chaveId' | 'op' | 'alvo'> {
  const op = req.op as OpNota;
  const checked = conferirOp(op, req.dados);
  if (!checked.ok) return { ...failed(`${checked.erro} (campo ${checked.campo})`), antes: null };
  const shared = store.sharedIds();
  const mine = (id: string) => {
    const r = store.get(id);
    return r && isNote(r) && !shared.has(id) ? r : undefined;
  };
  const notes = store.notes().filter((n) => !shared.has(n.id));
  const now = ctx.now;

  if (op === 'nota.criar') {
    // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): o mesmo id, nada de novo
    const there = mine(req.alvo);
    if (there) return { estado: 'aplicado', resultado: { nota: ctx.v1(there) }, antes: null };
    const d = checked.dados as CriarNotaV1;
    const { clear: _c, ...l } = labels(notes, d);
    const note = sanitizeReview(
      {
        id: req.alvo,
        kind: 'anotacoes',
        game: { name: d.titulo, coverUrl: d.capa ?? null, source: 'manual' },
        text: d.texto ?? '',
        completedAt: d.data === undefined ? ctx.today : d.data,
        ...l,
        ...(d.fixada ? { noteRank: 'fixada' } : {}),
        // nasce privada: só a chave com `publicar` diz outra coisa (o padrão do grupo é da tela)
        ...seenAs(d.visibilidade ?? 'privada', null, now),
        createdAt: now,
        updatedAt: now,
      },
      BUILD,
    );
    if (!note || note.id !== req.alvo) return { ...failed('A nota não pôde ser criada.'), antes: null };
    store.add(note);
    // já no quadro do grupo, na coluna pedida (como o "Nova nota" de dentro de uma coluna)
    const aviso = d.kanban && ctx.place ? ctx.place(store.get(note.id) ?? note, d.kanban) : null;
    const born = store.get(note.id) ?? note;
    return { estado: 'aplicado', resultado: { nota: ctx.v1(born), ...(aviso ? { aviso } : {}) }, antes: null, carimbo: born.updatedAt, desde: null };
  }

  const before = mine(req.alvo);
  if (!before) return { ...failed('A nota não existe mais (foi apagada, ou virou compartilhada).'), antes: null };
  const antes = storedNote(before);
  /** Grava a anotação mudada (com a hora de agora), e o resultado. */
  const save = (next: Review) => {
    // pelas conferências de sempre, como se viesse do armazenamento (uma data no futuro volta para hoje)
    const stamped = sanitizeReview({ ...next, updatedAt: now }, BUILD) ?? { ...next, updatedAt: now };
    store.update(stamped, before);
    const after = store.get(before.id) ?? stamped;
    return { estado: 'aplicado' as const, resultado: { nota: ctx.v1(after) }, antes, carimbo: after.updatedAt, desde: before.updatedAt };
  };
  /** Nada a mudar (já finalizada, já fixada): aplicado, sem carimbo nem antes. */
  const same = () => ({ estado: 'aplicado' as const, resultado: { nota: ctx.v1(before) }, antes: null });

  switch (op) {
    case 'nota.editar': {
      const e = checked.dados as EditarNotaV1;
      // a nota mudou depois que a AI leu (e não só por pedidos aplicados aqui desde a versão dela): a pessoa venceu
      if (!onlyOwnSince(before.id, before.updatedAt, e.versao, ctx.stamps)) {
        return {
          estado: 'conflito',
          resultado: { erro: 'A nota mudou depois que você a leu. Leia de novo e mande a versao nova.', nota: ctx.v1(before) },
          antes: null,
        };
      }
      const { versao: _v, ...campos } = e;
      const next = withFields(before, campos, notes, now);
      if (campos.titulo !== undefined && campos.titulo !== before.game.name) {
        // os [[links]] das outras anotações (e das resenhas) seguem o título novo, como no editor
        const others = store.reviews().filter((r) => !isNote(r));
        const relinked = relinkAfterRename(notes, before, campos.titulo, now, others);
        const out = save(next);
        for (const n of relinked) store.update(n);
        return out;
      }
      return save(next);
    }
    case 'nota.acrescentar': {
      const a = checked.dados as AcrescentarV1;
      const text = acrescentar(before.text, a.texto, a.onde);
      if (text.length > TEXTO_MAX) return { ...failed(`A nota passaria de ${TEXTO_MAX} letras.`, ctx.v1(before)), antes: null };
      return save({ ...before, text });
    }
    case 'nota.tarefas': {
      const r = mexerNasTarefas(before.text, checked.dados as TarefasV1);
      if (!r.ok) return { ...failed(r.erro, ctx.v1(before)), antes: null };
      return r.texto === before.text ? same() : save({ ...before, text: r.texto });
    }
    case 'nota.finalizar':
      // sem a pergunta das notas ligadas (não há tela para responder)
      return before.doneAt ? same() : save(withDone(before, true, now));
    case 'nota.reabrir':
      return before.doneAt ? save(withDone(before, false, now)) : same();
    case 'nota.fixar':
    case 'nota.desafixar': {
      const pin = op === 'nota.fixar';
      return (before.noteRank === 'fixada') === pin ? same() : save(withPin(before, pin, now));
    }
    case 'nota.apagar':
      // apagar sempre tem volta: a nota fica em Versões guardadas (Ajustes › Backup) antes de sair
      store.keepVersions([before], 'api', false);
      store.remove(before.id);
      return { estado: 'aplicado', resultado: { nota: null }, antes };
    default:
      return { ...failed('Este site não sabe aplicar esse pedido.'), antes: null };
  }
}

const overMax = (v: unknown) => v !== undefined && v !== null && JSON.stringify(v).length > RESULT_MAX_CHARS;

/**
 * O que cabe num pedido concluído (a nuvem recusa o lote inteiro com um só grande demais, e o lote
 * ficava preso aqui para sempre, até o prazo do pedido passar e outro aparelho aplicar de novo): sem o
 * texto da nota no resultado, e sem o `antes` que passa do teto (a coluna apagada com centenas de
 * cartões; aí o pedido fica sem Desfazer, e a nota apagada continua em Versões guardadas).
 */
export function fits(item: AppliedItem): AppliedItem {
  let out = item;
  const r = out.resultado as { nota?: NotaV1 | null };
  if (overMax(out.resultado) && r.nota) out = { ...out, resultado: { ...out.resultado, nota: { ...r.nota, texto: '' } } as RequestResult };
  if (overMax(out.antes)) out = { ...out, antes: null };
  return out;
}

/** O que basta para desfazer: o pedido, o que ele fez e a nota de antes. */
export type UndoTarget = Pick<AppliedItem, 'id' | 'alvo'> & { op: string; antes?: unknown; resultado?: unknown };

/** Dá para desfazer? Só o que entrou e mudou algo (o "criar", o "lançar", a coluna nova, ou o que tem o de antes). */
export function undoable(t: { estado: string; op: string; antes?: unknown }): boolean {
  return t.estado === 'aplicado' && (t.op === 'nota.criar' || t.op === 'gasto.lancar' || t.op === 'coluna.criar' || (t.antes !== null && t.antes !== undefined));
}

const FIELD_WORDS: Record<string, string> = {
  titulo: 'o título',
  texto: 'o texto',
  grupo: 'o grupo',
  assunto: 'o assunto',
  tags: 'as tags',
  data: 'a data',
  capa: 'a capa',
  visibilidade: 'quem vê',
};

/**
 * O pedido em palavras: "Mudar o título e o texto de “Reunião”" (esperando) ou "mudou o título e o
 * texto de “Reunião”" (no histórico, `past`). `title` é o nome da nota, já resolvido; `cols`, os nomes
 * das colunas de um pedido do Kanban.
 */
export function requestWords(op: string, dados: unknown, title: string, past = false, cols: ColumnNames = { target: null, of: () => null }): string {
  const spending = spendingWords(op, dados, title, past);
  if (spending) return spending;
  const kanban = kanbanWords(op, dados, title, past, cols);
  if (kanban) return kanban;
  const t = `“${title}”`;
  const d = (dados ?? {}) as Record<string, unknown>;
  const v = (now: string, then: string) => (past ? then : now);
  switch (op) {
    case 'nota.criar':
      return `${v('Criar', 'criou')} a nota ${t}`;
    case 'nota.editar': {
      const fields = Object.keys(FIELD_WORDS).filter((k) => d[k] !== undefined);
      return fields.length ? `${v('Mudar', 'mudou')} ${andList(fields.map((k) => FIELD_WORDS[k]!))} de ${t}` : `${v('Mudar', 'mudou')} ${t}`;
    }
    case 'nota.acrescentar':
      return `${v('Acrescentar', 'acrescentou')} um trecho ${d['onde'] === 'inicio' ? 'no começo' : 'no fim'} de ${t}`;
    case 'nota.tarefas': {
      const n = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0);
      const parts = [
        ...(n('marcar') ? [`${v('marcar', 'marcou')} ${plural(n('marcar'), 'tarefa', 'tarefas')}`] : []),
        ...(n('desmarcar') ? [`${v('desmarcar', 'desmarcou')} ${plural(n('desmarcar'), 'tarefa', 'tarefas')}`] : []),
        ...(n('novas') ? [`${v('acrescentar', 'acrescentou')} ${plural(n('novas'), 'tarefa', 'tarefas')}`] : []),
      ];
      const said = `${andList(parts)} em ${t}`;
      return past ? said : said.charAt(0).toUpperCase() + said.slice(1);
    }
    case 'nota.finalizar':
      return `${v('Finalizar', 'finalizou')} ${t}`;
    case 'nota.reabrir':
      return `${v('Abrir de novo', 'abriu de novo')} ${t}`;
    case 'nota.fixar':
      return `${v('Fixar', 'fixou')} ${t} no topo`;
    case 'nota.desafixar':
      return `${v('Desafixar', 'desafixou')} ${t}`;
    case 'nota.apagar':
      return `${v('Apagar', 'apagou')} ${t}`;
    default:
      return v('Um pedido que este site ainda não conhece', 'fez um pedido que este site ainda não conhece');
  }
}

/** Uma linha da diferença entre dois textos: igual, entrou, saiu, ou o pedaço igual que ficou de fora. */
export interface DiffRow {
  kind: 'same' | 'add' | 'del' | 'gap';
  text: string;
}

/**
 * O que muda no texto, linha por linha (a maior subsequência comum, a mesma da junção): as linhas que
 * saem e as que entram, com `context` linhas iguais em volta; o resto igual vira um "⋯ N linhas" só.
 * Passando de `max` linhas, o fim vira um aviso de quantas faltam.
 */
export function textDiff(before: string, after: string, context = 1, max = 40): DiffRow[] {
  const a = before ? before.replace(/\r\n?/g, '\n').split('\n') : [];
  const b = after ? after.replace(/\r\n?/g, '\n').split('\n') : [];
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...commonPairs(a, b), [a.length, b.length] as [number, number]]) {
    while (i < pi) rows.push({ kind: 'del', text: a[i++]! });
    while (j < pj) rows.push({ kind: 'add', text: b[j++]! });
    if (pi < a.length) rows.push({ kind: 'same', text: a[pi]! });
    i = pi + 1;
    j = pj + 1;
  }
  // só o igual perto de uma mudança fica; o resto vira um aviso de quantas linhas
  const near = rows.map((r, k) => r.kind !== 'same' || rows.slice(Math.max(0, k - context), k + context + 1).some((x) => x.kind !== 'same'));
  const out: DiffRow[] = [];
  let skipped = 0;
  rows.forEach((r, k) => {
    if (near[k]) {
      if (skipped) out.push({ kind: 'gap', text: plural(skipped, 'linha igual', 'linhas iguais') });
      skipped = 0;
      out.push(r);
    } else skipped++;
  });
  if (skipped && out.length) out.push({ kind: 'gap', text: plural(skipped, 'linha igual', 'linhas iguais') });
  if (out.length > max) {
    const rest = out.length - max;
    return [...out.slice(0, max), { kind: 'gap', text: `e mais ${plural(rest, 'linha', 'linhas')}` }];
  }
  return out;
}

/** Um campo da nota que muda com o pedido: o nome dele, como está e como fica (null: sem). */
export interface FieldChange {
  label: string;
  before: string | null;
  after: string;
}

/** Os campos (fora o texto) que mudam de `before` para `after`; na nota nova, os que vêm preenchidos. */
export function fieldChanges(before: NotaV1 | null, after: NotaV1): FieldChange[] {
  const show: [string, (n: NotaV1) => string | null][] = [
    ['Título', (n) => n.titulo],
    ['Grupo', (n) => n.grupo],
    ['Assunto', (n) => n.assunto],
    ['Tags', (n) => (n.tags.length ? n.tags.join(', ') : null)],
    ['Data', (n) => (n.data ? formatReviewDateLong(n.data) : null)],
    ['Quem vê', (n) => (n.visibilidade === 'publica' ? 'Pública' : 'Privada')],
    ['No topo', (n) => (n.fixada ? 'Fixada' : null)],
    ['Situação', (n) => (n.finalizada_em ? 'Finalizada' : 'Aberta')],
    ['Capa', (n) => (n.capa ? 'Com capa' : null)],
  ];
  const out: FieldChange[] = [];
  for (const [label, read] of show) {
    const now = read(after);
    if (!before) {
      // a nota nova: o título já está na frase; a situação e quem vê só quando fogem do comum
      if (label === 'Título' || label === 'Situação' || (label === 'Quem vê' && now === 'Privada') || now === null) continue;
      out.push({ label, before: null, after: now });
      continue;
    }
    const was = read(before);
    if (was !== now) out.push({ label, before: was, after: now ?? 'sem' });
  }
  return out;
}

/** Os que esperam aprovação numa frase: "Claude quer mudar 2 anotações", ou "3 pedidos esperam você aprovar". */
export function waitingWords(open: readonly Pick<SiteRequest, 'estado' | 'op' | 'chave'>[], counted = 0): string | null {
  const waiting = open.filter((r) => r.estado === 'aguardando-aprovacao');
  const n = waiting.length || counted;
  if (!n) return null;
  const keys = new Set(waiting.map((r) => r.chave.nome));
  const what = waiting.length && waiting.every((r) => r.op === 'nota.criar') ? 'criar' : 'mudar';
  return keys.size === 1 ? `${[...keys][0]} quer ${what} ${plural(n, 'anotação', 'anotações')}` : `${plural(n, 'pedido espera', 'pedidos esperam')} você aprovar`;
}

/** Os que acabaram de entrar numa frase: "3 pedidos de Claude entraram", "2 entraram; 1 não". */
export function appliedWords(items: readonly Pick<AppliedItem, 'estado' | 'chave'>[]): string {
  const keys = new Set(items.map((i) => i.chave));
  const who = keys.size === 1 ? ` de ${[...keys][0]}` : '';
  const ok = items.filter((i) => i.estado === 'aplicado').length;
  const not = items.length - ok;
  if (!ok) return `${plural(not, 'pedido', 'pedidos')}${who} não ${not === 1 ? 'entrou' : 'entraram'}`;
  return `${plural(ok, 'pedido', 'pedidos')}${who} ${ok === 1 ? 'entrou' : 'entraram'}${not ? `; ${not} não` : ''}`;
}

/** É um pedido do Kanban (o cartão ou a coluna)? */
export function isKanbanOp(op: string): boolean {
  return op.startsWith('cartao.') || op.startsWith('coluna.');
}

interface AppliedRecord {
  conta: string;
  itens: AppliedItem[];
}

@Injectable({ providedIn: 'root' })
export class ApiRequests {
  private readonly account = inject(CloudAccount);
  private readonly store = inject(ReviewStore);
  private readonly mirror = inject(ApiMirror);
  private readonly data = inject(LocalData);
  private readonly spending = inject(SpendingStore);
  private readonly kanban = inject(KanbanStore);

  /** Os pedidos abertos que a nuvem contou na última conversa: pendentes (para aplicar) e para aprovar. */
  readonly counts = signal({ pendentes: 0, aprovar: 0 });
  /** Os abertos da última lista (os que esperam aprovação vão para a folha Pedidos). */
  readonly open = signal<readonly SiteRequest[]>([]);
  /** Os concluídos da última rodada que entraram aqui (o bilhete "3 pedidos entraram"). */
  readonly lastApplied = signal<{ itens: readonly AppliedItem[]; at: number } | null>(null);
  /** A última vez que algo pediu atenção (um pedido novo, a aba à mostra). */
  private lastSeen = Date.now();
  /** Pede uma rodada de sincronização já (um pedido aprovado aqui é aplicado na hora; ver core/cloud-sync.ts). */
  readonly wake = signal(0);

  /** O cabeçalho do mural (`Mural-Pedidos`, `Mural-Pedidos-Aprovar`): sem ele, nada esperando. */
  noteHeads(headers: Headers): void {
    const n = (h: string) => Math.max(0, Number(headers.get(h)) || 0);
    const counts = { pendentes: n('Mural-Pedidos'), aprovar: n('Mural-Pedidos-Aprovar') };
    if (counts.pendentes || counts.aprovar) this.lastSeen = Date.now();
    // chegou (ou saiu) pedido para aprovar: a lista vem, para o bilhete dizer de quem e quantos
    const changed = counts.aprovar !== this.counts().aprovar;
    this.counts.set(counts);
    if (changed && this.account.account()?.api) void this.list();
  }

  /** O relógio de 60 s confere agora? Só com a API liberada, e na aba escondida só até 2 h sem nada novo. */
  watching(visible: boolean, now = Date.now()): boolean {
    if (!this.account.account()?.api) return false;
    if (visible) this.lastSeen = now;
    return now - this.lastSeen < IDLE_MS;
  }

  /** Confere a lista na nuvem (o relógio). Devolve se há pendentes para aplicar. Nunca falha. */
  async peek(): Promise<boolean> {
    if (!this.account.account()?.api) return false;
    const list = await this.list();
    return list !== null && this.due(list).length > 0;
  }

  /**
   * Aplica os pendentes (dentro da trava da sincronização, depois de uma rodada que deixou o aparelho
   * igual à nuvem). Devolve se algum entrou: aí a sincronização roda mais uma vez antes de `conclude`.
   * Nunca falha (sem rede, a próxima rodada tenta de novo).
   */
  async applyOpen(device: string): Promise<boolean> {
    if (!this.account.account()?.api || !this.counts().pendentes) return false;
    const list = await this.list();
    if (!list) return false;
    let any = false;
    for (const req of this.due(list)) {
      try {
        // só um aparelho por vez (2 minutos); outro já pegou: fica com ele
        await this.account.request(`/v1/eu/pedidos/${req.id}/pegar`, { method: 'POST', body: { aparelho: device } });
      } catch {
        // e os de depois também (a próxima rodada tenta de novo): pular este e aplicar o seguinte trocava a
        // ordem de chegada ("marcar a tarefa" antes de "acrescentar a tarefa")
        break;
      }
      const items = this.readItems();
      const stamps: RequestStamps = new Map(items.filter((i) => i.carimbo).map((i) => [`${i.alvo}@${i.carimbo}`, i.desde ?? null]));
      const now = new Date().toISOString();
      const out = req.op.startsWith('nota.')
        ? applyNoteRequest(this.store, req, {
            now,
            today: todayISO(),
            stamps,
            v1: (r) => this.mirror.notaOf(r),
            place: (r, k) => placeNewNote(this.kanban, this.store, r, k, now),
          })
        : isKanbanOp(req.op)
          ? applyKanbanRequest(this.kanban, this.store, req, now)
          : applySpendingRequest(this.spending, req, { now, today: todayISO(), stamps });
      this.writeItems([...items, fits({ id: req.id, op: req.op, alvo: req.alvo, chave: req.chave.nome, chaveId: req.chave.id, ...out })]);
      any = true;
    }
    return any;
  }

  /**
   * Conta à nuvem como foi cada pedido aplicado aqui. Só depois de uma rodada de sincronização que
   * valeu (o que eles mudaram já está na nuvem). Nunca falha: o que não foi fica para a próxima.
   */
  async conclude(): Promise<void> {
    const items = this.readItems();
    if (!items.length) return;
    const done: AppliedItem[] = [];
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50);
      try {
        await this.account.request('/v1/eu/pedidos/concluir', {
          method: 'POST',
          body: { itens: batch.map(({ id, estado, resultado, antes }) => ({ id, estado, resultado, antes })) },
        });
      } catch {
        break;
      }
      // o que não estava mais pendente (recusado, expirado) também sai daqui: a nuvem já decidiu
      done.push(...batch);
    }
    if (!done.length) return;
    const gone = new Set(done.map((d) => d.id));
    this.writeItems(this.readItems().filter((i) => !gone.has(i.id)));
    this.counts.update((c) => ({ ...c, pendentes: 0 }));
    this.open.update((l) => l.filter((r) => !gone.has(r.id)));
    this.lastApplied.set({ itens: done, at: Date.now() });
  }

  // ===== A pessoa decide (a folha Pedidos) e volta atrás (o Histórico) =====

  /** Aprova um pedido que esperava: ele vira pendente e este aparelho aplica na hora. */
  async approve(id: string): Promise<void> {
    await this.account.request(`/v1/eu/pedidos/${id}/aprovar`, { method: 'POST' });
    this.open.update((l) => l.map((r) => (r.id === id ? { ...r, estado: 'pendente' as const } : r)));
    this.counts.update((c) => ({ pendentes: c.pendentes + 1, aprovar: Math.max(0, c.aprovar - 1) }));
    this.wake.update((n) => n + 1);
  }

  /** Recusa um pedido aberto (a AI vê que foi recusado). */
  async refuse(id: string): Promise<void> {
    await this.account.request(`/v1/eu/pedidos/${id}/recusar`, { method: 'POST' });
    this.open.update((l) => l.filter((r) => r.id !== id));
    this.counts.update((c) => ({ ...c, aprovar: Math.max(0, c.aprovar - 1) }));
  }

  /** Confere de novo os abertos (a folha Pedidos, ao abrir). Null sem rede. */
  refresh(): Promise<SiteRequest[] | null> {
    return this.list();
  }

  /** Os resolvidos de uma chave, do mais novo para o mais velho (até 100). */
  async history(keyId: string): Promise<SiteRequest[]> {
    const { itens } = await this.account.request<{ itens: SiteRequest[] }>(`/v1/eu/pedidos?estado=historico&chave=${encodeURIComponent(keyId)}`);
    return itens;
  }

  /**
   * Desfaz um pedido aplicado: a nota de antes volta como uma edição nova (carimbada agora, para valer
   * nos outros aparelhos); o "criar" desfeito apaga a nota. O que estava no lugar, se mudou depois do
   * pedido, fica em Versões guardadas. A nuvem anota primeiro: sem rede, nada muda aqui.
   */
  async undo(t: UndoTarget): Promise<void> {
    await this.account.request(`/v1/eu/pedidos/${t.id}/desfazer`, { method: 'POST' });
    if (isKanbanOp(t.op)) {
      undoKanban(this.kanban, this.store, t, new Date().toISOString());
      return;
    }
    if (!t.op.startsWith('nota.')) {
      undoSpending(this.spending, t);
      return;
    }
    const shared = this.store.sharedIds();
    const found = this.store.get(t.alvo);
    const cur = found && isNote(found) && !shared.has(found.id) ? found : undefined;
    const after = (t.resultado as { nota?: NotaV1 | null } | null | undefined)?.nota;
    // mexida depois do pedido (por você, ou por outro pedido): a de agora não se perde
    if (cur && cur.updatedAt !== after?.versao) this.store.keepVersions([cur], 'api', false);
    if (t.op === 'nota.criar') {
      if (cur) this.store.remove(cur.id);
      return;
    }
    const before = sanitizeReview(t.antes, BUILD);
    if (!before) return;
    const now = new Date().toISOString();
    const back = { ...before, updatedAt: now };
    if (!cur) {
      this.store.restore(back);
      return;
    }
    // o título de antes volta, e os [[links]] das outras anotações (e das resenhas) voltam junto, como no
    // editor: sem isso, os que o pedido levou para o título novo ficavam apontando para nada
    const relinked =
      cur.game.name !== before.game.name
        ? relinkAfterRename(
            this.store.notes().filter((n) => !shared.has(n.id)),
            cur,
            before.game.name,
            now,
            this.store.reviews().filter((r) => !isNote(r)),
          )
        : [];
    this.store.update(back);
    for (const n of relinked) this.store.update(n);
  }

  /** O título que a pessoa reconhece: o do pedido, o de agora, o de depois, o de antes. */
  titleOf(t: Pick<SiteRequest, 'op' | 'alvo' | 'dados'> & { resultado?: unknown; antes?: unknown }): string {
    if (isKanbanOp(t.op)) return kanbanTitle(this.kanban, this.store, t);
    if (!t.op.startsWith('nota.')) return spendingTitle(this.spending, t);
    if (t.op === 'nota.criar') return (t.dados as { titulo?: string } | null)?.titulo ?? 'uma nota';
    return (
      this.store.get(t.alvo)?.game.name ??
      (t.resultado as { nota?: NotaV1 | null } | null | undefined)?.nota?.titulo ??
      (t.antes as Review | null | undefined)?.game?.name ??
      'uma nota que não existe mais'
    );
  }

  /** A nota agora e como fica se o pedido entrar (null: não existe / sai do mural), para a folha mostrar o que muda. */
  preview(r: Pick<SiteRequest, 'op' | 'alvo' | 'dados'>): { before: NotaV1 | null; after: NotaV1 | null } {
    // os dos Gastos não mostram a nota: a frase diz o que muda
    if (!r.op.startsWith('nota.')) return { before: null, after: null };
    const now = new Date().toISOString();
    const checked = conferirOp(r.op as OpNota, r.dados);
    if (!checked.ok) return { before: null, after: null };
    if (r.op === 'nota.criar') return { before: null, after: notaDoPedido(r.alvo, checked.dados as CriarNotaV1, now) };
    const cur = this.store.get(r.alvo);
    if (!cur || !isNote(cur)) return { before: null, after: null };
    const before = this.mirror.notaOf(cur);
    return { before, after: aplicarNaNotaV1(before, r.op as OpNota, checked.dados, now) };
  }

  /** Os nomes das colunas de um pedido do Kanban (para as frases da folha e do histórico). */
  columnNames(t: Pick<SiteRequest, 'op' | 'alvo' | 'dados'> & { antes?: unknown }): ColumnNames {
    return columnNames(this.kanban, t);
  }

  /** Os pendentes que este site sabe aplicar e que ainda não entraram aqui, na ordem de chegada. */
  private due(list: readonly SiteRequest[]): SiteRequest[] {
    const done = new Set(this.readItems().map((i) => i.id));
    const known: readonly string[] = [...OPS_DE_NOTA, ...OPS_DE_GASTO, ...OPS_DO_KANBAN];
    return list.filter((r) => r.estado === 'pendente' && !done.has(r.id) && known.includes(r.op));
  }

  /**
   * O pedido dos Gastos cujo alvo já não existe aqui (o lançamento, o envelope, a pessoa apagados):
   * aprovado, ele não entra. Lançar e criar não têm alvo para sumir.
   */
  spendingGone(r: Pick<SiteRequest, 'op' | 'alvo'> & { dados?: unknown }): boolean {
    if (isKanbanOp(r.op)) return this.kanbanGone(r);
    if (r.op === 'gasto.editar' || r.op === 'gasto.apagar') return !this.spending.get(r.alvo);
    if (r.op === 'envelope.editar') return !this.spending.category(r.alvo);
    if (r.op === 'pessoa.editar') return !this.spending.person(r.alvo);
    return false;
  }

  /** O pedido do Kanban cujo quadro, nota (cartão) ou coluna já não existe aqui. Criar coluna só precisa do quadro. */
  private kanbanGone(r: Pick<SiteRequest, 'op' | 'alvo'> & { dados?: unknown }): boolean {
    const quadro = (r.dados as { quadro?: string } | null | undefined)?.quadro;
    const b = quadro ? boardById(this.kanban, quadro) : undefined;
    if (!b) return true;
    if (r.op.startsWith('cartao.')) return !this.store.get(r.alvo);
    if (r.op === 'coluna.editar' || r.op === 'coluna.apagar') return !b.columns.some((c) => c.id === r.alvo);
    return false;
  }

  /** Os abertos na nuvem (atualiza a contagem e a lista); null sem rede. */
  private async list(): Promise<SiteRequest[] | null> {
    try {
      const { itens } = await this.account.request<{ itens: SiteRequest[] }>('/v1/eu/pedidos');
      const counts = { pendentes: itens.filter((r) => r.estado === 'pendente').length, aprovar: itens.filter((r) => r.estado === 'aguardando-aprovacao').length };
      if (counts.pendentes || counts.aprovar) this.lastSeen = Date.now();
      this.counts.set(counts);
      this.open.set(itens);
      return itens;
    } catch {
      return null;
    }
  }

  /** Os aplicados guardados, só se são desta conta (o de outra conta nunca vale aqui). */
  private readItems(): AppliedItem[] {
    const conta = this.account.account()?.id;
    try {
      const rec = JSON.parse(this.data.getItem(APPLIED_KEY) ?? 'null') as AppliedRecord | null;
      return conta && rec && rec.conta === conta && Array.isArray(rec.itens) ? rec.itens : [];
    } catch {
      return [];
    }
  }

  private writeItems(itens: readonly AppliedItem[]): void {
    const conta = this.account.account()?.id;
    if (!conta) return;
    // a trava da limpeza (`storageFrozen`) é conferida por `LocalData.setItem`
    void Promise.resolve(this.data.setItem(APPLIED_KEY, JSON.stringify({ conta, itens }))).catch(() => undefined);
  }
}
