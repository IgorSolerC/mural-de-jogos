import { Injectable, inject, signal } from '@angular/core';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { NotaV1 } from '../../../contrato/api-v1/notas';
import {
  OPS_DE_NOTA,
  TEXTO_MAX,
  acrescentar,
  conferirOp,
  mexerNasTarefas,
  type AcrescentarV1,
  type CamposDaNota,
  type CriarNotaV1,
  type EditarNotaV1,
  type EstadoDoPedido,
  type OpNota,
  type TarefasV1,
} from '../../../contrato/api-v1/operacoes';
import { ApiMirror } from './api-mirror';
import { BUILD } from './build';
import { CloudAccount } from './cloud-account';
import { DataKey, LocalData } from './local-data';
import { cleanCategory, cleanSubject, sanitizeTags } from './note-labels';
import { relinkAfterRename } from './note-links';
import { Review, audienceFields, isNote, sanitizeReview, storedNote, todayISO, withDone, withPin } from './review';
import { ReviewStore } from './review-store';

/**
 * Os pedidos da API das AIs, pelo lado do site (PLANO-API.md, seção 9). A nuvem nunca abre o mural:
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
export type RequestResult = { nota: NotaV1 | null } | { erro: string; nota?: NotaV1 };

/** Um pedido aplicado aqui, pronto para concluir na nuvem. */
export interface AppliedItem {
  id: string;
  op: OpNota;
  alvo: string;
  /** O nome da chave que pediu (para o bilhete dizer quem). */
  chave: string;
  estado: Concluded;
  resultado: RequestResult;
  /** A anotação como era (guardada), para o Desfazer; null no criar e no que não mudou nada. */
  antes: unknown;
  /** Quando a anotação ficou carimbada pelo pedido (a próxima edição da AI não é "conflito" por causa dele). */
  carimbo?: string;
}

/** O que a aplicação precisa saber do mural: a anotação de agora, o vocabulário, a hora. */
export interface ApplyContext {
  now: string;
  today: string;
  /** As edições que vieram de pedidos aplicados aqui (`id@updatedAt`): não contam como mudança de outra pessoa. */
  stamps: ReadonlySet<string>;
  v1(r: Review): NotaV1;
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
): Omit<AppliedItem, 'id' | 'chave' | 'op' | 'alvo'> {
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
    const born = store.get(note.id) ?? note;
    return { estado: 'aplicado', resultado: { nota: ctx.v1(born) }, antes: null, carimbo: born.updatedAt };
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
    return { estado: 'aplicado' as const, resultado: { nota: ctx.v1(after) }, antes, carimbo: after.updatedAt };
  };
  /** Nada a mudar (já finalizada, já fixada): aplicado, sem carimbo nem antes. */
  const same = () => ({ estado: 'aplicado' as const, resultado: { nota: ctx.v1(before) }, antes: null });

  switch (op) {
    case 'nota.editar': {
      const e = checked.dados as EditarNotaV1;
      // a nota mudou depois que a AI leu (e não por um pedido dela aplicado aqui): a pessoa venceu
      if (before.updatedAt !== e.versao && !ctx.stamps.has(`${before.id}@${before.updatedAt}`)) {
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

/** O que cabe num pedido concluído: sem o texto da nota no resultado, se ele passar do teto. */
function fits(item: AppliedItem): AppliedItem {
  const r = item.resultado as { nota?: NotaV1 | null };
  if (JSON.stringify(item.resultado).length <= RESULT_MAX_CHARS || !r.nota) return item;
  return { ...item, resultado: { ...item.resultado, nota: { ...r.nota, texto: '' } } as RequestResult };
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

  /** Os pedidos abertos que a nuvem contou na última conversa: pendentes (para aplicar) e para aprovar. */
  readonly counts = signal({ pendentes: 0, aprovar: 0 });
  /** Os abertos da última lista (os que esperam aprovação vão para a folha Pedidos). */
  readonly open = signal<readonly SiteRequest[]>([]);
  /** Os concluídos da última rodada que entraram aqui (o bilhete "3 pedidos entraram"). */
  readonly lastApplied = signal<{ itens: readonly AppliedItem[]; at: number } | null>(null);
  /** A última vez que algo pediu atenção (um pedido novo, a aba à mostra). */
  private lastSeen = Date.now();

  /** O cabeçalho do mural (`Mural-Pedidos`, `Mural-Pedidos-Aprovar`): sem ele, nada esperando. */
  noteHeads(headers: Headers): void {
    const n = (h: string) => Math.max(0, Number(headers.get(h)) || 0);
    const counts = { pendentes: n('Mural-Pedidos'), aprovar: n('Mural-Pedidos-Aprovar') };
    if (counts.pendentes || counts.aprovar) this.lastSeen = Date.now();
    this.counts.set(counts);
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
        continue;
      }
      const items = this.readItems();
      const stamps = new Set(items.filter((i) => i.carimbo).map((i) => `${i.alvo}@${i.carimbo}`));
      const now = new Date().toISOString();
      const out = applyNoteRequest(this.store, req, { now, today: todayISO(), stamps, v1: (r) => this.mirror.notaOf(r) });
      this.writeItems([...items, fits({ id: req.id, op: req.op as OpNota, alvo: req.alvo, chave: req.chave.nome, ...out })]);
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

  /** Os pendentes que este site sabe aplicar e que ainda não entraram aqui, na ordem de chegada. */
  private due(list: readonly SiteRequest[]): SiteRequest[] {
    const done = new Set(this.readItems().map((i) => i.id));
    return list.filter((r) => r.estado === 'pendente' && !done.has(r.id) && (OPS_DE_NOTA as readonly string[]).includes(r.op));
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
