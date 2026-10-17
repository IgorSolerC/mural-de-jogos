import { Injectable, inject, signal } from '@angular/core';
import { CloudAccount } from './cloud-account';
import { normalizeCode } from './cloud-murals';
import { isEmoji } from './emoji';
import { PROFILE_MATERIALS, ProfileBackground, ProfileMaterial } from './profile';
import { LIGHT_STOCKS, STOCKS, Stock } from './review';

/**
 * Seguindo e Seguidores no perfil de alguém (ver `api/src/routes/follow.ts`): os números sempre, e as
 * listas quando a pessoa deixa (Ajustes › Amigos) ou é você. Cada pessoa da lista vem com o cartão
 * dela (a foto, o fundo do perfil, a linha curta e quantas fichas e murais tem), mandado pelo site
 * dela a cada envio do mural; quem ainda não mandou vem só com a foto, ou nem isso (fica a inicial).
 */
export interface PersonCard {
  emoji: string;
  cor: Stock;
  /** null: só veio a foto (de antes do cartão existir). */
  fundo: ProfileBackground | null;
  linha: string;
  fichas: number | null;
  murais: number | null;
}

export interface ListedPerson {
  codigo: string;
  nome: string;
  cartao: PersonCard | null;
}

export interface PeopleOf {
  seguindo: number;
  seguidores: number;
  /** A pessoa deixa ver quem são (senão, só os números). */
  listasVisiveis: boolean;
  /** Só quando pedidas, e se a pessoa deixa ou é você. */
  listas?: { seguindo: ListedPerson[]; seguidores: ListedPerson[] };
}

export type PeopleTab = 'seguindo' | 'seguidores';
/** Ajustes › Amigos: os outros veem as listas, ou só os números. */
export type PeoplePrivacy = 'listas' | 'numeros';

/** Pedidos há menos que isso não são feitos de novo. */
const FRESH_MS = 2 * 60_000;

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const isStock = (v: unknown): v is Stock => (STOCKS as readonly unknown[]).includes(v);

function background(raw: unknown): ProfileBackground | null {
  const b = raw as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  if (b['kind'] === 'material' && PROFILE_MATERIALS.some((m) => m.id === b['material'])) return { kind: 'material', material: b['material'] as ProfileMaterial };
  if (b['kind'] === 'cartolina' && isStock(b['stock'])) return { kind: 'cartolina', stock: b['stock'] };
  if (b['kind'] === 'link' && typeof b['url'] === 'string' && /^https:\/\/[^\s"'<>()\\]{3,600}$/.test(b['url'])) return { kind: 'link', url: b['url'] };
  return null;
}

function card(raw: unknown): PersonCard | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== 'object' || !isEmoji(c['emoji']) || !isStock(c['cor'])) return null;
  return {
    emoji: c['emoji'],
    cor: c['cor'],
    fundo: background(c['fundo']),
    linha: typeof c['linha'] === 'string' ? c['linha'].trim().slice(0, 60) : '',
    fichas: count(c['fichas']),
    murais: count(c['murais']),
  };
}

function people(raw: unknown): ListedPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: ListedPerson[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 300)) {
    const r = item as Record<string, unknown> | null;
    const codigo = typeof r?.['codigo'] === 'string' ? normalizeCode(r['codigo']) : null;
    const nome = typeof r?.['nome'] === 'string' ? r['nome'].trim().slice(0, 40) : '';
    if (!codigo || !nome || seen.has(codigo)) continue;
    seen.add(codigo);
    out.push({ codigo, nome, cartao: card(r?.['cartao']) });
  }
  return out;
}

/** O que veio da nuvem: só o que tem a forma certa passa. */
export function parsePeopleOf(raw: unknown): PeopleOf | null {
  const r = raw as Record<string, unknown> | null;
  const seguindo = count(r?.['seguindo']);
  const seguidores = count(r?.['seguidores']);
  if (seguindo === null || seguidores === null) return null;
  const lists = r?.['listas'] as Record<string, unknown> | undefined;
  return {
    seguindo,
    seguidores,
    listasVisiveis: r?.['listasVisiveis'] !== false,
    ...(lists && typeof lists === 'object' ? { listas: { seguindo: people(lists['seguindo']), seguidores: people(lists['seguidores']) } } : {}),
  };
}

/**
 * A ordem no Seguindo/Seguidores de outra pessoa: primeiro quem eu ainda não sigo (é ali que dá para
 * fazer amigos novos), depois quem eu já sigo, e eu por último; dentro de cada grupo, a da nuvem (os
 * mais novos primeiro). Sem saber quem eu sigo (`following` null), fica a ordem da nuvem.
 */
export function orderPeople(list: readonly ListedPerson[], following: ReadonlySet<string> | null, me: string | null): ListedPerson[] {
  if (!following) return [...list];
  const rank = (p: ListedPerson) => (p.codigo === me ? 2 : following.has(p.codigo) ? 1 : 0);
  return list.map((p, i) => ({ p, i, r: rank(p) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.p);
}

/** Sem foto: a inicial numa cartolina clara, sempre a mesma para o mesmo código. */
export function initialStock(code: string): Stock {
  const pool = LIGHT_STOCKS.filter((s) => s !== 'branco' && s !== 'cinza');
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

/** A foto da pessoa meio torta, de −4 a +4 graus, sempre igual pelo código dela (foto do perfil e dos comentários). */
export function photoTilt(code: string): number {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 9) - 4;
}

@Injectable({ providedIn: 'root' })
export class ProfilePeople {
  private readonly account = inject(CloudAccount);

  /** O que já veio de cada código (sem a entrada: ainda não veio, ou a nuvem não respondeu). */
  private readonly byCode = signal<ReadonlyMap<string, PeopleOf>>(new Map());
  private readonly loadedAt = new Map<string, { at: number; lists: boolean }>();
  private readonly loading = new Map<string, Promise<void>>();

  /** A sua escolha em Ajustes › Amigos (null: ainda não se sabe). */
  readonly privacy = signal<PeoplePrivacy | null>(null);

  of(code: string): PeopleOf | undefined {
    return this.byCode().get(code);
  }

  /**
   * Pede os números de quem tem esse código, e as listas com `lists`. Sem rede ou sem nuvem: fica sem,
   * sem barulho (o perfil só não mostra). `force` pede de novo mesmo se acabou de vir.
   */
  load(code: string, lists = false, force = false): Promise<void> {
    const key = `${code}:${lists}`;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const last = this.loadedAt.get(code);
    if (!force && last && Date.now() - last.at < FRESH_MS && (last.lists || !lists)) return Promise.resolve();
    const job = (async () => {
      try {
        const data = parsePeopleOf(await this.account.request<unknown>(`/v1/murais/${code}/pessoas${lists ? '?listas=1' : ''}`));
        if (!data) return;
        // pediu as listas e elas não vieram (a pessoa mostra só os números): conta como pedidas
        this.loadedAt.set(code, { at: Date.now(), lists });
        this.byCode.update((all) => {
          const before = all.get(code);
          // os números sem as listas não apagam as listas que já vieram
          return new Map(all).set(code, !lists && before?.listas ? { ...data, listas: before.listas } : data);
        });
      } catch {
        /* sem os números */
      } finally {
        this.loading.delete(key);
      }
    })();
    this.loading.set(key, job);
    return job;
  }

  /** A sua escolha, de Ajustes › Amigos. */
  async loadPrivacy(): Promise<void> {
    try {
      const me = await this.account.request<{ pessoas?: unknown }>('/v1/eu');
      this.privacy.set(me?.pessoas === 'numeros' ? 'numeros' : 'listas');
    } catch {
      /* fica como estava */
    }
  }

  /** Troca a escolha na nuvem (a tela muda na hora; se a nuvem recusar, volta e o erro sobe). */
  async setPrivacy(value: PeoplePrivacy): Promise<void> {
    const before = this.privacy();
    this.privacy.set(value);
    try {
      await this.account.request('/v1/eu', { method: 'PATCH', body: { pessoas: value } });
      const code = this.account.account()?.codigo;
      if (code) this.byCode.update((all) => {
        const mine = all.get(code);
        return mine ? new Map(all).set(code, { ...mine, listasVisiveis: value === 'listas' }) : all;
      });
    } catch (err) {
      this.privacy.set(before);
      throw err;
    }
  }
}
