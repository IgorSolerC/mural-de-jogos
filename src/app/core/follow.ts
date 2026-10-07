import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Cloud } from './cloud-config';
import { CloudAccount } from './cloud-account';
import { cloudColleagueId, normalizeCode, recodedColleague } from './cloud-murals';
import { ColleagueStore } from './colleague-store';
import { Kind, isKind } from './kinds';
import { Mural } from './mural';
import { FriendKinds, Settings } from './settings';
import type { ReactionId } from './reactions';
import { isEmoji } from './emoji';

const REACTION_IDS: readonly string[] = ['amei', 'fogo', 'rindo', 'uau', 'chorei', 'hmm', 'nao-curti'];

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
  /** A mesma enquanto eu seguir a pessoa, mesmo se ela trocar o código (ver `api/src/routes/follow.ts`). */
  chave?: string;
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
  | { tipo: 'resenha'; em: string; pessoa: Person; ref: string; titulo: string; mural: Kind; silenciado: boolean }
  /** Alguém reagiu à minha resenha `ref` (ver core/reactions.ts). */
  | { tipo: 'reagiu'; em: string; pessoa: Person; ref: string; titulo: string; mural: Kind; silenciado: boolean; reacao: ReactionId };

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
    else if (r['tipo'] === 'resenha' || r['tipo'] === 'reagiu') {
      const ref = typeof r['ref'] === 'string' && /^[\w-]{4,64}$/.test(r['ref']) ? r['ref'] : null;
      const titulo = text(r['titulo'], 120);
      if (!ref || !titulo) continue;
      const base = { em, pessoa, ref, titulo, mural: isKind(r['mural']) ? r['mural'] : 'jogos', silenciado: r['silenciado'] === true } as const;
      if (r['tipo'] === 'resenha') out.push({ tipo: 'resenha', ...base });
      else if (typeof r['reacao'] === 'string' && (REACTION_IDS.includes(r['reacao']) || isEmoji(r['reacao']))) out.push({ tipo: 'reagiu', ...base, reacao: r['reacao'] as ReactionId });
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
        const chave = typeof o['chave'] === 'string' && /^[\w-]{1,64}$/.test(o['chave']) ? { chave: o['chave'] } : {};
        return p
          ? { ...p, ...chave, desde: iso(o['desde']) ?? '', silenciado: o['silenciado'] === true, rev: typeof o['rev'] === 'number' ? o['rev'] : null, meSegue: o['meSegue'] === true }
          : null;
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

/** Um item do correio, para lembrar que foi visto (ver `Follow.seenKeys`). */
export function feedKey(i: FeedItem): string {
  return `${i.tipo}:${i.pessoa.codigo}:${i.tipo === 'seguiu' ? '' : i.ref}:${i.em}`;
}

/** Ainda não visto: depois do visto, e não marcado à parte neste aparelho. */
export function isUnseen(i: FeedItem, seenAt: string | null, seenKeys: ReadonlySet<string> = new Set()): boolean {
  return (!seenAt || i.em > seenAt) && !seenKeys.has(feedKey(i));
}

/** Quantos contam no número: os ainda não vistos, menos os de quem foi silenciado. */
export function unseenCount(items: readonly FeedItem[], seenAt: string | null, seenKeys: ReadonlySet<string> = new Set()): number {
  return items.filter((i) => isUnseen(i, seenAt, seenKeys) && !(i.tipo !== 'seguiu' && i.silenciado)).length;
}

/**
 * O que marcar como visto ao mostrar `shown` (no separado, só o mural aberto). O visto da nuvem é uma
 * data só: ela anda, da mais velha para a mais nova, enquanto tudo estiver visto (de antes ou agora), e
 * para antes do primeiro não visto que ficou de fora (de outro mural). Os mostrados de depois dessa data
 * ficam vistos à parte (`keys`). null: não há nada novo na tela.
 */
export function seenUntil(
  all: readonly FeedItem[],
  shown: readonly FeedItem[],
  seenAt: string | null,
  seenKeys: ReadonlySet<string>,
): { until: string | null; keys: string[] } | null {
  const fresh = shown.filter((i) => isUnseen(i, seenAt, seenKeys));
  if (!fresh.length) return null;
  const shownKeys = new Set(shown.map(feedKey));
  let until = seenAt;
  const later = all.filter((i) => !seenAt || i.em > seenAt).sort((a, b) => a.em.localeCompare(b.em));
  for (const i of later) {
    const key = feedKey(i);
    if (shownKeys.has(key) || seenKeys.has(key)) {
      until = i.em;
      continue;
    }
    // o primeiro que ficou de fora: a data para antes dele (mesmo se outro tiver o mesmo instante)
    if (until !== null && until >= i.em) until = new Date(Date.parse(i.em) - 1).toISOString();
    break;
  }
  if (until !== null && seenAt !== null && until < seenAt) until = seenAt;
  return { until, keys: fresh.filter((i) => until === null || i.em > until).map(feedKey) };
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
  /** Os itens vistos depois de `vistasEm` (no separado, ver `seenUntil`). */
  vistos?: unknown;
  /** A hora da nuvem na última conferência (para perguntar "algo depois disso?" com o feed vazio). */
  agora: string | null;
  /** Quem eu sigo e quem me segue, da última vez: a tela já abre certa e a nuvem só confirma. */
  pessoas?: unknown;
}

function readCache(): Cache | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Partial<Cache> | null;
    return raw && typeof raw.conta === 'string'
      ? { conta: raw.conta, itens: raw.itens, vistasEm: iso(raw.vistasEm), vistos: raw.vistos, agora: iso(raw.agora), pessoas: raw.pessoas }
      : null;
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
  private readonly colleagues = inject(ColleagueStore);

  /** A nuvem ligada e alguém logado: só assim existe seguir e correio. */
  readonly available = computed(() => !!this.cloud.config() && this.account.signedIn());
  /** De quem é o que está na memória (o id da conta, ou o código nas contas antigas). */
  private readonly owner = computed(() => {
    const a = this.account.account();
    return a ? (a.id ?? a.codigo) : null;
  });

  readonly items = signal<FeedItem[]>([]);
  readonly seenAt = signal<string | null>(null);
  /**
   * Itens vistos aqui depois de `seenAt`: no separado, o visto não pode passar de uma novidade de
   * outro mural que ainda não apareceu, então o que foi mostrado além dela fica marcado um a um.
   */
  readonly seenKeys = signal<ReadonlySet<string>>(new Set());
  readonly people = signal<People | null>(null);
  /** O que aparece em Amigos: tudo, ou só o do mural aberto (Ajustes › Mural › Novidades dos amigos). */
  readonly visible = computed(() => visibleFeed(this.items(), this.settings.friendKinds(), this.mural.kind()));
  readonly unseen = computed(() => unseenCount(this.visible(), this.seenAt(), this.seenKeys()));
  readonly followingCodes = computed(() => new Set(this.people()?.seguindo.map((p) => p.codigo) ?? []));

  /**
   * Eu sigo essa pessoa? null enquanto não se sabe (primeira abertura neste aparelho, antes da nuvem
   * responder): a tela mostra "esperando", nunca um "Seguir" que já não vale.
   */
  isFollowing(code: string): boolean | null {
    return this.people() ? this.followingCodes().has(code) : null;
  }
  /** A última conferência deu erro (sem rede, nuvem fora): o correio mostra o guardado. */
  readonly offline = signal(false);

  private serverNow: string | null = null;
  /** Muda a cada alteração feita aqui: uma lista da nuvem pedida antes dela chega velha e é descartada. */
  private peopleVersion = 0;
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
          this.seenKeys.set(new Set(Array.isArray(cache.vistos) ? cache.vistos.filter((k): k is string => typeof k === 'string') : []));
          this.serverNow = cache.agora;
          // quem eu sigo já vem do que ficou guardado: os botões abrem certos e a nuvem só confirma
          if (cache.pessoas !== undefined) this.people.set(parsePeople(cache.pessoas));
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
      // o visto da nuvem nunca volta atrás do daqui (o pedido de visto pode não ter chegado lá)
      const cloudSeen = iso(body.vistasEm);
      const local = this.seenAt();
      const seen = local && (!cloudSeen || local > cloudSeen) ? local : cloudSeen;
      this.seenAt.set(seen);
      this.seenKeys.update((keys) => this.pruneKeys(keys, seen));
      this.save();
    } catch {
      this.offline.set(true);
    }
  }

  /**
   * Abriu o correio: o que está na tela conta como visto (neste e nos outros aparelhos). No separado,
   * só o do mural aberto: uma novidade de outro mural que ainda não apareceu continua nova.
   */
  async markSeen(): Promise<void> {
    const before = this.seenAt();
    const step = seenUntil(this.items(), this.visible(), before, this.seenKeys());
    if (!step) return;
    this.seenAt.set(step.until);
    this.seenKeys.update((keys) => this.pruneKeys(new Set([...keys, ...step.keys]), step.until));
    this.save();
    if (step.until === null || (before && before >= step.until)) return;
    try {
      await this.account.request('/v1/eu/notificacoes/vistas', { method: 'POST', body: { ate: step.until } });
    } catch {
      /* fica visto aqui; o outro aparelho vê o número até a próxima vez */
    }
  }

  /** Só os vistos à parte que ainda estão depois do visto e no correio. */
  private pruneKeys(keys: ReadonlySet<string>, seenAt: string | null): ReadonlySet<string> {
    const live = new Set(this.items().filter((i) => !seenAt || i.em > seenAt).map(feedKey));
    return new Set([...keys].filter((k) => live.has(k)));
  }

  async loadPeople(): Promise<People> {
    const version = this.peopleVersion;
    const owner = this.owner();
    const people = parsePeople(await this.account.request<unknown>('/v1/eu/pessoas'));
    // trocou de conta enquanto a resposta vinha: a lista é da outra conta, e não entra aqui
    if (owner !== this.owner()) return this.people() ?? { seguindo: [], seguidores: [] };
    // mudou algo aqui enquanto a resposta vinha: a lista que chegou é de antes, fica a daqui
    if (version !== this.peopleVersion) return this.people() ?? people;
    const before = this.people();
    this.people.set(people);
    if (before) void this.followCodeChanges(before, people);
    this.save();
    return people;
  }

  /**
   * Segue pelo código (digitado de qualquer jeito). Devolve a pessoa. A tela muda assim que a nuvem
   * confirma; as listas completas se acertam por trás, sem segurar o botão.
   */
  async follow(input: string): Promise<Person> {
    const code = normalizeCode(input);
    if (!code) throw new Error('Esse código não existe. Confira: ele tem 8 letras e números.');
    if (code === this.account.account()?.codigo) throw new Error('Esse é o seu código. Siga o de outra pessoa.');
    const res = await this.account.request<{ pessoa?: unknown; desde?: unknown; silenciado?: unknown }>('/v1/seguindo', { method: 'POST', body: { codigo: code } });
    const p = person(res?.pessoa) ?? { codigo: code, nome: 'Alguém' };
    this.changePeople((list) => {
      if (list.seguindo.some((f) => f.codigo === p.codigo)) return list;
      const followsMe = list.seguidores.some((f) => f.codigo === p.codigo);
      return {
        seguindo: [{ ...p, desde: iso(res?.desde) ?? new Date().toISOString(), silenciado: res?.silenciado === true, rev: null, meSegue: followsMe }, ...list.seguindo],
        seguidores: list.seguidores.map((f) => (f.codigo === p.codigo ? { ...f, euSigo: true } : f)),
      };
    });
    this.items.update((list) => list.map((i) => (i.tipo === 'seguiu' && i.pessoa.codigo === p.codigo ? { ...i, euSigo: true } : i)));
    this.save();
    this.refreshLater();
    return p;
  }

  async unfollow(code: string): Promise<void> {
    await this.account.request(`/v1/seguindo/${code}`, { method: 'DELETE' });
    this.changePeople((list) => ({
      seguindo: list.seguindo.filter((f) => f.codigo !== code),
      seguidores: list.seguidores.map((f) => (f.codigo === code ? { ...f, euSigo: false } : f)),
    }));
    this.items.update((list) => list.map((i) => (i.tipo === 'seguiu' && i.pessoa.codigo === code ? { ...i, euSigo: false } : i)));
    this.save();
    this.refreshLater();
  }

  async mute(code: string, muted: boolean): Promise<void> {
    await this.account.request(`/v1/seguindo/${code}`, { method: 'PATCH', body: { silenciado: muted } });
    // o número muda na hora, sem esperar a nuvem
    this.changePeople((list) => ({ ...list, seguindo: list.seguindo.map((f) => (f.codigo === code ? { ...f, silenciado: muted } : f)) }));
    this.items.update((list) => list.map((i) => (i.tipo !== 'seguiu' && i.pessoa.codigo === code ? { ...i, silenciado: muted } : i)));
    this.save();
  }

  async removeFollower(code: string): Promise<void> {
    await this.account.request(`/v1/eu/seguidores/${code}`, { method: 'DELETE' });
    this.changePeople((list) => ({
      seguindo: list.seguindo.map((f) => (f.codigo === code ? { ...f, meSegue: false } : f)),
      seguidores: list.seguidores.filter((f) => f.codigo !== code),
    }));
    this.save();
    this.refreshLater();
  }

  /**
   * Quem eu sigo trocou o código (a mesma chave, outro código): o mural dela guardado aqui passa para o
   * código novo, em vez de o Comparar ficar com dois — o do código antigo nunca mais se atualizaria.
   */
  private async followCodeChanges(before: People, after: People): Promise<void> {
    const old = new Map(before.seguindo.filter((p) => p.chave).map((p) => [p.chave!, p.codigo]));
    await this.colleagues.ready;
    for (const p of after.seguindo) {
      const was = p.chave ? old.get(p.chave) : undefined;
      if (!was || was === p.codigo) continue;
      const saved = this.colleagues.colleagues().find((c) => c.id === cloudColleagueId(was));
      if (saved) await this.colleagues.move(saved.id, recodedColleague(saved, p.codigo)).catch(() => undefined);
    }
  }

  /** Aplica uma mudança confirmada pela nuvem nas listas daqui (e invalida as que estão a caminho). */
  private changePeople(fn: (list: People) => People): void {
    this.peopleVersion++;
    this.people.update((list) => fn(list ?? { seguindo: [], seguidores: [] }));
  }

  /** As listas e o correio completos, por trás: a tela já mudou. */
  private refreshLater(): void {
    void this.loadPeople().catch(() => undefined);
    void this.check(true);
  }

  private reset(dropCache: boolean): void {
    // uma lista de pessoas pedida antes de trocar de conta chega velha
    this.peopleVersion++;
    this.items.set([]);
    this.seenAt.set(null);
    this.seenKeys.set(new Set());
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
    const cache: Cache = {
      conta: owner,
      itens: this.items(),
      vistasEm: this.seenAt(),
      vistos: [...this.seenKeys()],
      agora: this.serverNow,
      pessoas: this.people() ?? undefined,
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* sem armazenamento: confere a nuvem a cada abertura */
    }
  }
}
