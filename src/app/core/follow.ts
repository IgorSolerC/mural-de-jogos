import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Cloud } from './cloud-config';
import { CloudAccount } from './cloud-account';
import { normalizeCode } from './cloud-murals';
import { Kind, isKind } from './kinds';
import { Mural } from './mural';
import { FriendKinds, Settings } from './settings';

/**
 * Seguir pessoas pelo código e o correio (ver `api/src/routes/follow.ts`).
 *
 * Não é um feed: é a aba Amigos no topo, com um número só quando chegou algo. Ela
 * confere a nuvem ao abrir o site e depois a cada 15 minutos com a aba à vista; quando não há nada
 * novo, a nuvem responde 204, sem corpo. O que chegou fica guardado neste navegador (o número aparece
 * na hora ao abrir, sem esperar a nuvem).
 */
export interface Person {
  codigo: string;
  nome: string;
}

export interface FollowedPerson extends Person {
  desde: string;
  /** Continua no correio, mas não conta no número do envelope. */
  silenciado: boolean;
  /** A versão do mural público (null: ainda não publicou). */
  rev: number | null;
  meSegue: boolean;
}

export interface Follower extends Person {
  desde: string;
  euSigo: boolean;
}

export interface People {
  seguindo: FollowedPerson[];
  seguidores: Follower[];
}

export type FeedItem =
  | { tipo: 'seguiu'; em: string; pessoa: Person; euSigo: boolean }
  | { tipo: 'resenha'; em: string; pessoa: Person; ref: string; titulo: string; mural: Kind; silenciado: boolean };

/** Ver de novo a cada 15 minutos, com a aba à vista. */
export const CHECK_EVERY_MS = 15 * 60_000;
const CACHE_KEY = 'meu-mural:correio';

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

function person(raw: unknown): Person | null {
  const p = raw as Record<string, unknown> | null;
  const codigo = typeof p?.['codigo'] === 'string' ? normalizeCode(p['codigo']) : null;
  const nome = text(p?.['nome'], 40);
  return codigo && nome ? { codigo, nome } : null;
}

/** O que veio da nuvem (ou do cache): só o que tem a forma certa passa. */
export function parseFeed(raw: unknown): FeedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const item of raw.slice(0, 100)) {
    const r = item as Record<string, unknown>;
    const em = iso(r?.['em']);
    const pessoa = person(r?.['pessoa']);
    if (!em || !pessoa) continue;
    if (r['tipo'] === 'seguiu') out.push({ tipo: 'seguiu', em, pessoa, euSigo: r['euSigo'] === true });
    else if (r['tipo'] === 'resenha') {
      const ref = typeof r['ref'] === 'string' && /^[\w-]{4,64}$/.test(r['ref']) ? r['ref'] : null;
      const titulo = text(r['titulo'], 120);
      if (!ref || !titulo) continue;
      out.push({ tipo: 'resenha', em, pessoa, ref, titulo, mural: isKind(r['mural']) ? r['mural'] : 'jogos', silenciado: r['silenciado'] === true });
    }
  }
  return out.sort((a, b) => b.em.localeCompare(a.em));
}

export function parsePeople(raw: unknown): People {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    seguindo: list(r['seguindo'])
      .map((x) => {
        const p = person(x);
        const o = x as Record<string, unknown>;
        return p ? { ...p, desde: iso(o['desde']) ?? '', silenciado: o['silenciado'] === true, rev: typeof o['rev'] === 'number' ? o['rev'] : null, meSegue: o['meSegue'] === true } : null;
      })
      .filter((x): x is FollowedPerson => x !== null),
    seguidores: list(r['seguidores'])
      .map((x) => {
        const p = person(x);
        const o = x as Record<string, unknown>;
        return p ? { ...p, desde: iso(o['desde']) ?? '', euSigo: o['euSigo'] === true } : null;
      })
      .filter((x): x is Follower => x !== null),
  };
}

/**
 * O que aparece: tudo (misturado) ou só as resenhas do mural aberto (separado). Quem começou a seguir
 * aparece sempre: não é de mural nenhum.
 */
export function visibleFeed(items: readonly FeedItem[], mode: FriendKinds, kind: Kind): FeedItem[] {
  return mode === 'misturado' ? [...items] : items.filter((i) => i.tipo === 'seguiu' || i.mural === kind);
}

/** Quantos contam no número: os de depois do visto, menos os de quem foi silenciado. */
export function unseenCount(items: readonly FeedItem[], seenAt: string | null): number {
  return items.filter((i) => (!seenAt || i.em > seenAt) && !(i.tipo === 'resenha' && i.silenciado)).length;
}

/** O dia local (AAAA-MM-DD) de um instante. */
export function localDayOf(isoText: string): string {
  const d = new Date(isoText);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "hoje", "ontem" ou "3 de outubro". */
export function dayLabel(day: string, now = new Date()): string {
  const today = localDayOf(now.toISOString());
  const yesterday = localDayOf(new Date(now.getTime() - 86_400_000).toISOString());
  if (day === today) return 'hoje';
  if (day === yesterday) return 'ontem';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', ...(y !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

interface Cache {
  conta: string;
  itens: unknown;
  vistasEm: string | null;
  /** A hora da nuvem na última conferência (para perguntar "algo depois disso?" com o feed vazio). */
  agora: string | null;
}

function readCache(): Cache | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Partial<Cache> | null;
    return raw && typeof raw.conta === 'string' ? { conta: raw.conta, itens: raw.itens, vistasEm: iso(raw.vistasEm), agora: iso(raw.agora) } : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Follow {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly settings = inject(Settings);
  private readonly mural = inject(Mural);

  /** A nuvem ligada e alguém logado: só assim existe seguir e correio. */
  readonly available = computed(() => !!this.cloud.config() && this.account.signedIn());
  /** De quem é o que está na memória (o id da conta, ou o código nas contas antigas). */
  private readonly owner = computed(() => {
    const a = this.account.account();
    return a ? (a.id ?? a.codigo) : null;
  });

  readonly items = signal<FeedItem[]>([]);
  readonly seenAt = signal<string | null>(null);
  readonly people = signal<People | null>(null);
  /** O que aparece em Amigos: tudo, ou só o do mural aberto (Ajustes › Mural › Novidades dos amigos). */
  readonly visible = computed(() => visibleFeed(this.items(), this.settings.friendKinds(), this.mural.kind()));
  readonly unseen = computed(() => unseenCount(this.visible(), this.seenAt()));
  readonly followingCodes = computed(() => new Set(this.people()?.seguindo.map((p) => p.codigo) ?? []));
  /** A última conferência deu erro (sem rede, nuvem fora): o correio mostra o guardado. */
  readonly offline = signal(false);

  private serverNow: string | null = null;
  private checkedAt = 0;
  private checking: Promise<void> | null = null;

  constructor() {
    // trocar de conta (ou sair) troca o correio inteiro
    effect(() => {
      const owner = this.owner();
      const on = this.available();
      untracked(() => {
        if (!owner || !on) {
          this.reset(owner === null);
          return;
        }
        const cache = readCache();
        if (cache?.conta === owner) {
          this.items.set(parseFeed(cache.itens));
          this.seenAt.set(cache.vistasEm);
          this.serverNow = cache.agora;
        } else this.reset(true);
        void this.check();
        void this.loadPeople().catch(() => undefined);
      });
    });
    if (typeof document !== 'undefined') {
      const tick = () => {
        if (document.visibilityState === 'visible' && Date.now() - this.checkedAt >= CHECK_EVERY_MS) void this.check();
      };
      document.addEventListener('visibilitychange', tick);
      const timer = setInterval(tick, 60_000);
      inject(DestroyRef).onDestroy(() => {
        document.removeEventListener('visibilitychange', tick);
        clearInterval(timer);
      });
    }
  }

  /**
   * Pergunta à nuvem se chegou algo depois do mais novo que já está aqui. `full` busca tudo de novo
   * (ao abrir o correio: pega também o "visto" feito em outro aparelho).
   */
  check(full = false): Promise<void> {
    if (!this.available()) return Promise.resolve();
    if (this.checking) return this.checking;
    this.checking = this.doCheck(full).finally(() => (this.checking = null));
    return this.checking;
  }

  private async doCheck(full: boolean): Promise<void> {
    this.checkedAt = Date.now();
    const owner = this.owner();
    const cursor = full ? null : (this.items()[0]?.em ?? this.serverNow);
    try {
      const res = await this.account.requestRaw(`/v1/eu/notificacoes${cursor ? `?depois=${encodeURIComponent(cursor)}` : ''}`);
      if (this.owner() !== owner) return;
      this.offline.set(false);
      this.serverNow = iso(res.headers.get('Mural-Agora')) ?? this.serverNow;
      if (res.status === 204) {
        this.save();
        return;
      }
      const body = (await res.json()) as { itens?: unknown; vistasEm?: unknown };
      this.items.set(parseFeed(body.itens));
      this.seenAt.set(iso(body.vistasEm));
      this.save();
    } catch {
      this.offline.set(true);
    }
  }

  /** Abriu o correio: tudo o que está aqui conta como visto (neste e nos outros aparelhos). */
  async markSeen(): Promise<void> {
    // separado: só até o mais novo deste mural (o dos outros murais que chegou depois continua novo)
    const newest = this.visible()[0]?.em;
    if (!newest || (this.seenAt() && this.seenAt()! >= newest)) return;
    this.seenAt.set(newest);
    this.save();
    try {
      await this.account.request('/v1/eu/notificacoes/vistas', { method: 'POST', body: { ate: newest } });
    } catch {
      /* fica visto aqui; o outro aparelho vê o número até a próxima vez */
    }
  }

  async loadPeople(): Promise<People> {
    const people = parsePeople(await this.account.request<unknown>('/v1/eu/pessoas'));
    this.people.set(people);
    return people;
  }

  /** Segue pelo código (digitado de qualquer jeito). Devolve a pessoa. */
  async follow(input: string): Promise<Person> {
    const code = normalizeCode(input);
    if (!code) throw new Error('Esse código não existe. Confira: ele tem 8 letras e números.');
    if (code === this.account.account()?.codigo) throw new Error('Esse é o seu código. Siga o de outra pessoa.');
    const res = await this.account.request<{ pessoa?: unknown }>('/v1/seguindo', { method: 'POST', body: { codigo: code } });
    const p = person(res?.pessoa) ?? { codigo: code, nome: 'Alguém' };
    await this.afterChange();
    return p;
  }

  async unfollow(code: string): Promise<void> {
    await this.account.request(`/v1/seguindo/${code}`, { method: 'DELETE' });
    await this.afterChange();
  }

  async mute(code: string, muted: boolean): Promise<void> {
    await this.account.request(`/v1/seguindo/${code}`, { method: 'PATCH', body: { silenciado: muted } });
    // o número muda na hora, sem esperar a nuvem
    this.items.update((list) => list.map((i) => (i.tipo === 'resenha' && i.pessoa.codigo === code ? { ...i, silenciado: muted } : i)));
    this.save();
    await this.loadPeople().catch(() => undefined);
  }

  async removeFollower(code: string): Promise<void> {
    await this.account.request(`/v1/eu/seguidores/${code}`, { method: 'DELETE' });
    await this.afterChange();
  }

  private async afterChange(): Promise<void> {
    await Promise.all([this.loadPeople().catch(() => undefined), this.check(true)]);
  }

  private reset(dropCache: boolean): void {
    this.items.set([]);
    this.seenAt.set(null);
    this.people.set(null);
    this.serverNow = null;
    if (dropCache) {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* nada guardado */
      }
    }
  }

  private save(): void {
    const owner = this.owner();
    if (!owner) return;
    const cache: Cache = { conta: owner, itens: this.items(), vistasEm: this.seenAt(), agora: this.serverNow };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* sem armazenamento: confere a nuvem a cada abertura */
    }
  }
}
