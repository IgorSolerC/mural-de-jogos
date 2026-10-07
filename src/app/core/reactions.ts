import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CloudAccount, CloudError } from './cloud-account';
import { Cloud } from './cloud-config';
import { normalizeCode } from './cloud-murals';
import { Follow } from './follow';
import { Kind } from './kinds';
import { Toasts } from '../ui/toast';
import { isEmoji } from './emoji';

/**
 * Reações às resenhas dos outros, como as do WhatsApp (ver `api/src/routes/reactions.ts`): uma por
 * pessoa por resenha, que dá para trocar ou tirar. Só reage quem segue o dono; todo mundo que vê o
 * mural vê as reações de cada ficha, e tocando nelas, quem reagiu com o quê.
 */
/** Uma das sete da fileira ('amei', 'fogo'…) ou qualquer emoji escolhido no "+" (o próprio emoji). */
export type ReactionId = string;

export interface ReactionKind {
  id: ReactionId;
  emoji: string;
  /** O nome para quem não vê o desenho (leitor de tela, dica do botão). */
  label: string;
}

/** Na ordem do seletor. A API tem a mesma lista de ids. */
export const REACTIONS: readonly ReactionKind[] = [
  { id: 'amei', emoji: '❤️', label: 'Amei' },
  { id: 'fogo', emoji: '🔥', label: 'Fogo' },
  { id: 'rindo', emoji: '😂', label: 'Rindo' },
  { id: 'uau', emoji: '😮', label: 'Surpresa' },
  { id: 'chorei', emoji: '😢', label: 'Chorei' },
  { id: 'hmm', emoji: '🤔', label: 'Dúvida' },
  { id: 'nao-curti', emoji: '👎', label: 'Não curti' },
];

const BY_ID = new Map(REACTIONS.map((r) => [r.id, r]));

/** A reação pelo id: uma das sete, ou o emoji escolhido no "+" (que é o próprio nome). */
export function reactionOf(id: ReactionId): ReactionKind {
  return BY_ID.get(id) ?? { id, emoji: id, label: id };
}

/** Uma das sete da fileira? */
export function isQuickReaction(id: ReactionId): boolean {
  return BY_ID.has(id);
}

export function isReaction(v: unknown): v is ReactionId {
  return typeof v === 'string' && (BY_ID.has(v) || isEmoji(v));
}

/** Uma pessoa que reagiu. */
export interface Reaction {
  codigo: string;
  nome: string;
  reacao: ReactionId;
  em: string;
}

/** A resenha que recebe a reação: o mural de quem (código) e qual ficha. */
export interface ReactionTarget {
  code: string;
  ref: string;
  /** Para o aviso que chega ao dono: "reagiu à sua ficha de Hades". */
  titulo: string;
  mural: Kind;
}

/** Quantas de cada, da mais dada para a menos (empate: a ordem do seletor, depois as do "+"). */
export function tally(list: readonly Reaction[]): { kind: ReactionKind; n: number }[] {
  const n = new Map<ReactionId, number>();
  for (const r of list) n.set(r.reacao, (n.get(r.reacao) ?? 0) + 1);
  const rank = (id: ReactionId) => {
    const i = REACTIONS.findIndex((k) => k.id === id);
    return i === -1 ? REACTIONS.length : i;
  };
  return [...n.keys()]
    .sort((a, b) => n.get(b)! - n.get(a)! || rank(a) - rank(b))
    .map((id) => ({ kind: reactionOf(id), n: n.get(id)! }));
}

/** "2 Amei e 1 Fogo". */
export function spokenReactions(list: readonly Reaction[]): string {
  const parts = tally(list).map((t) => `${t.n} ${t.kind.label}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : (parts[0] ?? '');
}

/** O que veio da nuvem: ref → quem reagiu. Só passa o que tem a forma certa. */
export function parseReactions(raw: unknown): Map<string, Reaction[]> {
  const out = new Map<string, Reaction[]>();
  const all = (raw as Record<string, unknown> | null)?.['reacoes'];
  if (!all || typeof all !== 'object') return out;
  for (const [ref, list] of Object.entries(all as Record<string, unknown>)) {
    if (!/^[\w-]{4,64}$/.test(ref) || !Array.isArray(list)) continue;
    const people: Reaction[] = [];
    for (const item of list.slice(0, 500)) {
      const r = item as Record<string, unknown> | null;
      const codigo = typeof r?.['codigo'] === 'string' ? normalizeCode(r['codigo']) : null;
      const nome = typeof r?.['nome'] === 'string' ? r['nome'].trim().slice(0, 40) : '';
      const em = typeof r?.['em'] === 'string' && Number.isFinite(Date.parse(r['em'])) ? r['em'] : null;
      if (!codigo || !nome || !em || !isReaction(r?.['reacao'])) continue;
      people.push({ codigo, nome, reacao: r['reacao'], em });
    }
    if (people.length) out.set(ref, people);
  }
  return out;
}

/** Um mural cujas reações chegaram há menos que isso não é pedido de novo. */
const FRESH_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class Reactions {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly follow = inject(Follow);
  private readonly toasts = inject(Toasts);

  /** Código do dono → (id da resenha → quem reagiu). */
  private readonly byOwner = signal<ReadonlyMap<string, ReadonlyMap<string, readonly Reaction[]>>>(new Map());
  private readonly loadedAt = new Map<string, number>();
  private readonly loading = new Map<string, Promise<void>>();

  /** O meu código, com a nuvem ligada e a conta aberta. */
  readonly myCode = computed(() => (this.cloud.config() && this.account.signedIn() ? (this.account.account()?.codigo ?? null) : null));

  constructor() {
    // as reações às minhas fichas: ao entrar, e de novo quando chega um aviso de reação no correio
    const lastNote = computed(() => this.follow.items().find((i) => i.tipo === 'reagiu')?.em ?? '');
    effect(() => {
      const mine = this.myCode();
      lastNote();
      if (mine) untracked(() => void this.load(mine, true));
    });
  }

  /** Quem reagiu à ficha `ref` do mural de `code` (vazio enquanto não chegou). */
  of(code: string, ref: string): readonly Reaction[] {
    return this.byOwner().get(code)?.get(ref) ?? [];
  }

  /** A minha reação à ficha, se dei uma. */
  mineOn(code: string, ref: string): ReactionId | null {
    const me = this.myCode();
    return (me && this.of(code, ref).find((r) => r.codigo === me)?.reacao) || null;
  }

  /** Posso reagir às fichas de `code`? Com a conta aberta, seguindo a pessoa, e não sendo eu. */
  canReact(code: string): boolean {
    const me = this.myCode();
    return !!me && me !== code && (this.follow.people()?.seguindo ?? []).some((p) => p.codigo === code);
  }

  /** Busca as reações do mural de `code` (de novo só depois de um minuto, a não ser com `force`). */
  load(code: string, force = false): Promise<void> {
    const pending = this.loading.get(code);
    if (pending) return pending;
    if (!force && Date.now() - (this.loadedAt.get(code) ?? 0) < FRESH_MS) return Promise.resolve();
    const job = (async () => {
      try {
        const map = parseReactions(await this.account.request<unknown>(`/v1/murais/${code}/reacoes`));
        this.loadedAt.set(code, Date.now());
        this.byOwner.update((all) => new Map(all).set(code, map));
      } catch {
        // sem rede ou sem nuvem: as fichas ficam sem as reações, sem barulho
      } finally {
        this.loading.delete(code);
      }
    })();
    this.loading.set(code, job);
    return job;
  }

  /**
   * Reage (ou troca, ou tira com `null`). A ficha muda na hora; se a nuvem recusar, volta como era e
   * o bilhete diz por quê.
   */
  async react(target: ReactionTarget, reaction: ReactionId | null): Promise<void> {
    const me = this.myCode();
    const name = this.account.account()?.nome ?? 'Você';
    if (!me) return;
    const before = this.of(target.code, target.ref);
    const others = before.filter((r) => r.codigo !== me);
    this.set(target.code, target.ref, reaction ? [{ codigo: me, nome: name, reacao: reaction, em: new Date().toISOString() }, ...others] : others);
    try {
      const path = `/v1/murais/${target.code}/reacoes/${encodeURIComponent(target.ref)}`;
      if (reaction) await this.account.request(path, { method: 'PUT', body: { reacao: reaction, titulo: target.titulo, mural: target.mural } });
      else await this.account.request(path, { method: 'DELETE' });
    } catch (err) {
      this.set(target.code, target.ref, before);
      this.toasts.show(err instanceof CloudError ? err.message : 'Não deu para reagir agora. Tente de novo.');
    }
  }

  private set(code: string, ref: string, list: readonly Reaction[]): void {
    this.byOwner.update((all) => {
      const next = new Map(all);
      const refs = new Map(next.get(code) ?? []);
      if (list.length) refs.set(ref, list);
      else refs.delete(ref);
      next.set(code, refs);
      return next;
    });
  }
}
