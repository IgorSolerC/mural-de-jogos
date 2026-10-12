import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CloudAccount, CloudError } from './cloud-account';
import { Cloud } from './cloud-config';
import { normalizeCode } from './cloud-murals';
import { isEmoji } from './emoji';
import { Follow, dayLabel, localDayOf } from './follow';
import { ReactionId, isReaction } from './reaction-kinds';
import { Reaction, ReactionTarget } from './reactions';
import { STOCKS, Stock } from './review';
import { Toasts } from '../ui/toast';

/**
 * Comentários nas fichas publicadas e as reações a cada comentário (ver `api/src/routes/comments.ts`).
 *
 * Quem vê o mural lê os comentários; comenta quem segue o dono, ou só quem o dono segue, se ele
 * escolheu assim em Ajustes › Amigos (o dono sempre comenta nas próprias fichas). O texto leva as
 * mesmas marcas de formatação das resenhas, até `COMMENT_MAX` caracteres, e é sempre desenhado pelo
 * `app-rich-text` (nunca HTML).
 */

/** O tamanho de um comentário, contado como o campo conta (`String.length`); a API confere igual. */
export const COMMENT_MAX = 500;

/** Quem comenta nas publicações de alguém: quem segue a pessoa, ou só quem ela segue. */
export type CommentsFrom = 'seguidores' | 'seguidos';

/** A ficha comentada: o mural de quem (código) e qual ficha. O título e o mural vão no aviso ao dono. */
export type CommentTarget = ReactionTarget;

export interface CommentAuthor {
  codigo: string;
  nome: string;
  /** A "foto" do perfil (o emoji na cartolina); null: fica a inicial. */
  foto: { emoji: string; cor: Stock } | null;
}

export interface Comment {
  id: string;
  autor: CommentAuthor;
  texto: string;
  em: string;
  reacoes: Reaction[];
}

/** Os comentários de uma ficha, do mais antigo para o mais novo. */
export interface Thread {
  comentarios: Comment[];
  /** A nuvem devolve só os mais novos: há outros, mais antigos, que não vieram. */
  maisAntigos: boolean;
  quem: CommentsFrom;
  /** Quem perguntou pode comentar ali (e reagir aos comentários). */
  pode: boolean;
}

/** Quantos comentários cada ficha de um mural tem. */
export interface CommentCounts {
  contagem: ReadonlyMap<string, number>;
  quem: CommentsFrom;
  pode: boolean;
}

const REF = /^[\w-]{4,64}$/;
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const isStock = (v: unknown): v is Stock => (STOCKS as readonly unknown[]).includes(v);
const fromOf = (v: unknown): CommentsFrom => (v === 'seguidos' ? 'seguidos' : 'seguidores');

function author(raw: unknown): CommentAuthor | null {
  const a = raw as Record<string, unknown> | null;
  const codigo = typeof a?.['codigo'] === 'string' ? normalizeCode(a['codigo']) : null;
  const nome = typeof a?.['nome'] === 'string' ? a['nome'].trim().slice(0, 40) : '';
  if (!codigo || !nome) return null;
  const f = a?.['foto'] as Record<string, unknown> | null | undefined;
  return { codigo, nome, foto: f && isEmoji(f['emoji']) && isStock(f['cor']) ? { emoji: f['emoji'], cor: f['cor'] } : null };
}

function reactions(raw: unknown): Reaction[] {
  if (!Array.isArray(raw)) return [];
  const out: Reaction[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 500)) {
    const r = item as Record<string, unknown> | null;
    const codigo = typeof r?.['codigo'] === 'string' ? normalizeCode(r['codigo']) : null;
    const nome = typeof r?.['nome'] === 'string' ? r['nome'].trim().slice(0, 40) : '';
    const em = typeof r?.['em'] === 'string' && Number.isFinite(Date.parse(r['em'])) ? r['em'] : null;
    // uma reação por pessoa: a repetida fica de fora
    if (!codigo || !nome || !em || !isReaction(r?.['reacao']) || seen.has(codigo)) continue;
    seen.add(codigo);
    out.push({ codigo, nome, reacao: r['reacao'], em });
  }
  return out;
}

/** Um comentário que veio da nuvem; null se não tem a forma certa. */
export function parseComment(raw: unknown): Comment | null {
  const k = raw as Record<string, unknown> | null;
  const id = typeof k?.['id'] === 'string' && ID.test(k['id']) ? k['id'] : null;
  const autor = author(k?.['autor']);
  const texto = typeof k?.['texto'] === 'string' ? k['texto'].slice(0, COMMENT_MAX) : '';
  const em = typeof k?.['em'] === 'string' && Number.isFinite(Date.parse(k['em'])) ? k['em'] : null;
  return id && autor && texto.trim() && em ? { id, autor, texto, em, reacoes: reactions(k?.['reacoes']) } : null;
}

/** Os comentários de uma ficha, como vieram da nuvem: só o que tem a forma certa passa, cada um uma vez. */
export function parseThread(raw: unknown): Thread {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r['comentarios']) ? r['comentarios'] : [];
  const seen = new Set<string>();
  const comentarios: Comment[] = [];
  for (const item of list.slice(0, 400)) {
    const k = parseComment(item);
    if (!k || seen.has(k.id)) continue;
    seen.add(k.id);
    comentarios.push(k);
  }
  return { comentarios, maisAntigos: r['maisAntigos'] === true, quem: fromOf(r['quem']), pode: r['pode'] === true };
}

/** A contagem por ficha de um mural, como veio da nuvem. */
export function parseCounts(raw: unknown): CommentCounts {
  const r = (raw ?? {}) as Record<string, unknown>;
  const contagem = new Map<string, number>();
  const all = r['contagem'];
  if (all && typeof all === 'object' && !Array.isArray(all)) {
    for (const [ref, n] of Object.entries(all as Record<string, unknown>)) {
      if (REF.test(ref) && typeof n === 'number' && Number.isInteger(n) && n > 0) contagem.set(ref, n);
    }
  }
  return { contagem, quem: fromOf(r['quem']), pode: r['pode'] === true };
}

/** Um trecho da ficha para citar; `n` muda a cada pedido, para o mesmo trecho poder ser citado de novo. */
export interface QuoteRequest {
  text: string;
  n: number;
}

/** "1 comentário", "3 comentários". */
export function spokenComments(n: number): string {
  return n === 1 ? '1 comentário' : `${n} comentários`;
}

/** "hoje às 10:23", "ontem às 16:12", "3 de outubro": a hora só importa enquanto a conversa está quente. */
export function commentWhen(iso: string, now = new Date()): string {
  const day = dayLabel(localDayOf(iso), now);
  if (day !== 'hoje' && day !== 'ontem') return day;
  return `${day} às ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Um pedaço de linha menor que isso não diz nada: a citação para na linha de antes. */
const MIN_QUOTE = 12;

/**
 * Um trecho selecionado na ficha, como citação: cada linha com "> " na frente, os espaços juntos e as
 * linhas em branco de fora, cortado com reticências para caber em `room` caracteres. '' se não há o
 * que citar, ou se não cabe nem o começo.
 */
export function quoteOf(selection: string, room = COMMENT_MAX): string {
  const lines = selection
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!lines.length) return '';
  let out = '';
  for (const line of lines) {
    const next = `${out ? '\n' : ''}> ${line}`;
    if (out.length + next.length <= room) {
      out += next;
      continue;
    }
    // a linha que não coube entra até onde der, com as reticências; um toco dela, não
    const cut = next.slice(0, Math.max(0, room - out.length - 1)).trimEnd();
    if (cut.length >= MIN_QUOTE) out += `${cut}…`;
    else if (out && out.length < room) out += '…';
    break;
  }
  return out;
}

/**
 * O rascunho com a citação de `selection` no fim, pronta para a pessoa escrever na linha de baixo (a
 * primeira linha sem ">" já está fora da citação). null se não há o que citar ou não sobra lugar no
 * comentário.
 */
export function withQuote(draft: string, selection: string, max = COMMENT_MAX): string | null {
  const before = draft.trimEnd();
  const lead = before ? `${before}\n\n` : '';
  const tail = '\n';
  const quote = quoteOf(selection, max - lead.length - tail.length);
  return quote ? lead + quote + tail : null;
}

/** Uma ficha cujos comentários chegaram há menos que isso não é pedida de novo. */
const FRESH_MS = 60_000;
/** A conversa aberta confere de novo depois disso (alguém pode ter respondido). */
const THREAD_FRESH_MS = 15_000;

const keyOf = (code: string, ref: string) => `${code}/${ref}`;

@Injectable({ providedIn: 'root' })
export class Comments {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly follow = inject(Follow);
  private readonly toasts = inject(Toasts);

  /** Código do dono → a contagem do mural dele. */
  private readonly counts = signal<ReadonlyMap<string, CommentCounts>>(new Map());
  private readonly countsAt = new Map<string, number>();
  private readonly countsLoading = new Map<string, Promise<void>>();

  /** "código/ficha" → os comentários dela. */
  private readonly threads = signal<ReadonlyMap<string, Thread>>(new Map());
  private readonly threadsAt = new Map<string, number>();
  private readonly threadsLoading = new Map<string, Promise<void>>();
  /** As fichas cuja conversa não veio (sem rede, nuvem fora). */
  private readonly failed = signal<ReadonlySet<string>>(new Set());

  /** A nuvem ligada: sem ela não há comentário nenhum. */
  readonly available = computed(() => !!this.cloud.config());
  /** O meu código, com a nuvem ligada e a conta aberta. */
  readonly myCode = computed(() => (this.cloud.config() && this.account.signedIn() ? (this.account.account()?.codigo ?? null) : null));

  /**
   * A ficha que deve abrir já com os comentários à mostra (o remendo da ficha, o "Comentar" do Feed):
   * quem pede guarda aqui, e a leitura, ao abrir essa ficha, pega (ver ReviewReader).
   */
  private wanted: string | null = null;

  /** A sua escolha em Ajustes › Amigos (null: ainda não se sabe). */
  readonly from = signal<CommentsFrom | null>(null);

  /** O rascunho de cada ficha, enquanto o site está aberto: fechar a leitura não joga fora o que foi escrito. */
  private readonly drafts = new Map<string, string>();

  constructor() {
    // os comentários nas minhas fichas: ao entrar, e de novo quando chega um aviso de comentário no correio
    const lastNote = computed(() => this.follow.items().find((i) => i.tipo === 'comentou')?.em ?? '');
    effect(() => {
      const mine = this.myCode();
      lastNote();
      if (mine) untracked(() => void this.loadCounts(mine, true));
    });
  }

  /** Quantos comentários a ficha `ref` do mural de `code` tem (0 enquanto não chegou). */
  countOf(code: string, ref: string): number {
    const counted = this.counts().get(code)?.contagem.get(ref) ?? 0;
    const thread = this.threads().get(keyOf(code, ref));
    // a conversa que veio inteira é a conta certa (um comentário de agora já está nela); cortada, vale a maior
    if (!thread) return counted;
    return thread.maisAntigos ? Math.max(counted, thread.comentarios.length) : thread.comentarios.length;
  }

  /** Os comentários da ficha, se já vieram. */
  thread(code: string, ref: string): Thread | undefined {
    return this.threads().get(keyOf(code, ref));
  }

  /** A conversa da ficha não veio (e não há uma de antes para mostrar). */
  hasFailed(code: string, ref: string): boolean {
    return this.failed().has(keyOf(code, ref));
  }

  /** O comentário que a pessoa estava escrevendo nessa ficha ('' se nenhum). */
  draftOf(target: Pick<CommentTarget, 'code' | 'ref'>): string {
    return this.drafts.get(keyOf(target.code, target.ref)) ?? '';
  }

  setDraft(target: Pick<CommentTarget, 'code' | 'ref'>, text: string): void {
    const key = keyOf(target.code, target.ref);
    if (text.trim()) this.drafts.set(key, text);
    else this.drafts.delete(key);
  }

  /** A próxima leitura de `ref` abre com os comentários. */
  want(ref: string): void {
    this.wanted = ref;
  }

  /** A leitura abriu `ref`: era para abrir com os comentários? (Vale uma vez.) */
  take(ref: string): boolean {
    const yes = this.wanted === ref;
    this.wanted = null;
    return yes;
  }

  /** Busca a contagem do mural de `code` (de novo só depois de um minuto, a não ser com `force`). */
  loadCounts(code: string, force = false): Promise<void> {
    if (!this.available()) return Promise.resolve();
    const pending = this.countsLoading.get(code);
    if (pending) return pending;
    if (!force && Date.now() - (this.countsAt.get(code) ?? 0) < FRESH_MS) return Promise.resolve();
    const job = (async () => {
      try {
        const data = parseCounts(await this.account.request<unknown>(`/v1/murais/${code}/comentarios`));
        this.countsAt.set(code, Date.now());
        this.counts.update((all) => new Map(all).set(code, data));
      } catch {
        // sem rede ou sem nuvem: as fichas ficam sem o número, sem barulho
      } finally {
        this.countsLoading.delete(code);
      }
    })();
    this.countsLoading.set(code, job);
    return job;
  }

  /** Busca os comentários da ficha (de novo só depois de uns segundos, a não ser com `force`). */
  loadThread(target: Pick<CommentTarget, 'code' | 'ref'>, force = false): Promise<void> {
    if (!this.available()) return Promise.resolve();
    const key = keyOf(target.code, target.ref);
    const pending = this.threadsLoading.get(key);
    if (pending) return pending;
    if (!force && Date.now() - (this.threadsAt.get(key) ?? 0) < THREAD_FRESH_MS) return Promise.resolve();
    const job = (async () => {
      try {
        const data = parseThread(await this.account.request<unknown>(`/v1/murais/${target.code}/comentarios/${encodeURIComponent(target.ref)}`));
        this.threadsAt.set(key, Date.now());
        this.setThread(key, data);
        this.setFailed(key, false);
      } catch {
        // a conversa de antes, se há uma, continua na tela
        this.setFailed(key, !this.threads().has(key));
      } finally {
        this.threadsLoading.delete(key);
      }
    })();
    this.threadsLoading.set(key, job);
    return job;
  }

  /**
   * Publica o comentário. Só entra na conversa quando a nuvem confirma (o texto volta limpo de lá); se
   * ela recusar, o erro sobe com a mensagem pronta, e quem chamou mantém o rascunho.
   */
  async post(target: CommentTarget, text: string): Promise<Comment> {
    const res = await this.account.request<{ comentario?: unknown }>(`/v1/murais/${target.code}/comentarios/${encodeURIComponent(target.ref)}`, {
      method: 'POST',
      body: { texto: text, titulo: target.titulo, mural: target.mural },
    });
    const made = parseComment(res?.comentario);
    if (!made) throw new CloudError('A nuvem respondeu de um jeito estranho. Confira se o comentário entrou.', 'resposta-estranha', 0);
    const key = keyOf(target.code, target.ref);
    this.changeThread(key, (t) => ({ ...t, comentarios: [...t.comentarios.filter((k) => k.id !== made.id), made] }));
    return made;
  }

  /** Apaga um comentário (o seu, ou qualquer um da sua ficha). Some na hora; se a nuvem recusar, volta. */
  async remove(target: Pick<CommentTarget, 'code' | 'ref'>, id: string): Promise<boolean> {
    const key = keyOf(target.code, target.ref);
    const before = this.threads().get(key);
    this.changeThread(key, (t) => ({ ...t, comentarios: t.comentarios.filter((k) => k.id !== id) }));
    try {
      await this.account.request(`/v1/comentarios/${id}`, { method: 'DELETE' });
      return true;
    } catch (err) {
      // já não existia lá: fica apagado aqui também
      if (err instanceof CloudError && err.status === 404) return true;
      if (before) this.setThread(key, before);
      this.toasts.show(err instanceof CloudError ? err.message : 'Não deu para apagar agora. Tente de novo.');
      return false;
    }
  }

  /** A minha reação a um comentário, se dei uma. */
  mineOn(comment: Comment): ReactionId | null {
    const me = this.myCode();
    return (me && comment.reacoes.find((r) => r.codigo === me)?.reacao) || null;
  }

  /**
   * Reage a um comentário (ou troca, ou tira com `null`). Muda na hora; se a nuvem recusar, volta como
   * era e o bilhete diz por quê.
   */
  async react(target: Pick<CommentTarget, 'code' | 'ref'>, id: string, reaction: ReactionId | null): Promise<void> {
    const me = this.myCode();
    if (!me) return;
    const key = keyOf(target.code, target.ref);
    const before = this.threads().get(key);
    const name = this.account.account()?.nome ?? 'Você';
    this.changeThread(key, (t) => ({
      ...t,
      comentarios: t.comentarios.map((k) => {
        if (k.id !== id) return k;
        const others = k.reacoes.filter((r) => r.codigo !== me);
        return { ...k, reacoes: reaction ? [{ codigo: me, nome: name, reacao: reaction, em: new Date().toISOString() }, ...others] : others };
      }),
    }));
    try {
      if (reaction) await this.account.request(`/v1/comentarios/${id}/reacao`, { method: 'PUT', body: { reacao: reaction } });
      else await this.account.request(`/v1/comentarios/${id}/reacao`, { method: 'DELETE' });
    } catch (err) {
      if (before) this.setThread(key, before);
      this.toasts.show(err instanceof CloudError ? err.message : 'Não deu para reagir agora. Tente de novo.');
    }
  }

  /** A sua escolha de quem comenta, de Ajustes › Amigos. */
  async loadFrom(): Promise<void> {
    try {
      const me = await this.account.request<{ comentarios?: unknown }>('/v1/eu');
      this.from.set(fromOf(me?.comentarios));
    } catch {
      /* fica como estava */
    }
  }

  /** Troca a escolha na nuvem (a tela muda na hora; se a nuvem recusar, volta e o erro sobe). */
  async setFrom(value: CommentsFrom): Promise<void> {
    const before = this.from();
    this.from.set(value);
    try {
      await this.account.request('/v1/eu', { method: 'PATCH', body: { comentarios: value } });
      // a conversa das minhas fichas já aberta passa a dizer a regra nova
      const mine = this.myCode();
      if (mine) {
        this.threads.update((all) => new Map([...all].map(([k, t]) => [k, k.startsWith(`${mine}/`) ? { ...t, quem: value } : t])));
        this.counts.update((all) => {
          const c = all.get(mine);
          return c ? new Map(all).set(mine, { ...c, quem: value }) : all;
        });
      }
    } catch (err) {
      this.from.set(before);
      throw err;
    }
  }

  private changeThread(key: string, fn: (t: Thread) => Thread): void {
    const t = this.threads().get(key);
    // sem a conversa aqui ainda (comentou antes de ela chegar): começa de uma vazia
    this.setThread(key, fn(t ?? { comentarios: [], maisAntigos: false, quem: 'seguidores', pode: true }));
  }

  private setThread(key: string, thread: Thread): void {
    this.threads.update((all) => new Map(all).set(key, thread));
  }

  private setFailed(key: string, failed: boolean): void {
    if (this.failed().has(key) === failed) return;
    this.failed.update((all) => {
      const next = new Set(all);
      if (failed) next.add(key);
      else next.delete(key);
      return next;
    });
  }
}
