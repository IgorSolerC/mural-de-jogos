import { Injectable, inject, signal } from '@angular/core';
import { CloudAccount } from './cloud-account';
import { normalizeCode } from './cloud-murals';
import { isEmoji } from './emoji';
import { LIGHT_STOCKS, STOCKS, Stock } from './review';

/**
 * Os amigos de alguém, no perfil dele (ver `api/src/routes/follow.ts`): quem a pessoa segue e a segue
 * de volta, com a foto do perfil (o emoji na cartolina) quando ela já veio. É para seguir os amigos dos
 * amigos sem passar código de mão em mão: do perfil de um, um clique abre o do outro, ou já segue.
 */
export interface Friend {
  codigo: string;
  nome: string;
  /** null: a pessoa ainda não enviou o mural depois que a foto passou a ir junto (fica a inicial). */
  foto: { emoji: string; cor: Stock } | null;
}

/** Uma lista pedida há menos que isso não é pedida de novo. */
const FRESH_MS = 2 * 60_000;

/** O que veio da nuvem: só o que tem a forma certa passa. */
export function parseFriends(raw: unknown): Friend[] {
  const list = (raw as { amigos?: unknown } | null)?.amigos;
  if (!Array.isArray(list)) return [];
  const out: Friend[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 300)) {
    const r = item as Record<string, unknown> | null;
    const codigo = typeof r?.['codigo'] === 'string' ? normalizeCode(r['codigo']) : null;
    const nome = typeof r?.['nome'] === 'string' ? r['nome'].trim().slice(0, 40) : '';
    if (!codigo || !nome || seen.has(codigo)) continue;
    seen.add(codigo);
    const f = r?.['foto'] as Record<string, unknown> | undefined;
    const foto = f && isEmoji(f['emoji']) && (STOCKS as readonly unknown[]).includes(f['cor']) ? { emoji: f['emoji'] as string, cor: f['cor'] as Stock } : null;
    out.push({ codigo, nome, foto });
  }
  return out;
}

/**
 * A ordem no perfil de outra pessoa: primeiro quem eu ainda não sigo (é ali que dá para fazer amigos
 * novos), depois quem eu já sigo, e eu por último. Dentro de cada grupo, a ordem da nuvem (os mais
 * novos primeiro). Sem saber quem eu sigo (`following` null), fica a ordem da nuvem.
 */
export function orderFriends(list: readonly Friend[], following: ReadonlySet<string> | null, me: string | null): Friend[] {
  if (!following) return [...list];
  const rank = (f: Friend) => (f.codigo === me ? 2 : following.has(f.codigo) ? 1 : 0);
  return list.map((f, i) => ({ f, i, r: rank(f) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.f);
}

/** Sem foto: a inicial numa cartolina clara, sempre a mesma para o mesmo código. */
export function initialStock(code: string): Stock {
  const pool = LIGHT_STOCKS.filter((s) => s !== 'branco' && s !== 'cinza');
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

@Injectable({ providedIn: 'root' })
export class Friends {
  private readonly account = inject(CloudAccount);

  /** Os amigos de cada código já pedido (sem a entrada: ainda não veio, ou a nuvem não respondeu). */
  private readonly byCode = signal<ReadonlyMap<string, readonly Friend[]>>(new Map());
  private readonly loadedAt = new Map<string, number>();
  private readonly loading = new Map<string, Promise<void>>();

  of(code: string): readonly Friend[] | undefined {
    return this.byCode().get(code);
  }

  /** Pede (ou confere de novo) os amigos de quem tem esse código. Sem rede ou sem nuvem: fica sem, sem barulho. */
  load(code: string, force = false): Promise<void> {
    const pending = this.loading.get(code);
    if (pending) return pending;
    if (!force && Date.now() - (this.loadedAt.get(code) ?? 0) < FRESH_MS) return Promise.resolve();
    const job = (async () => {
      try {
        const list = parseFriends(await this.account.request<unknown>(`/v1/murais/${code}/amigos`));
        this.loadedAt.set(code, Date.now());
        this.byCode.update((all) => new Map(all).set(code, list));
      } catch {
        // a parte dos amigos só não aparece
      } finally {
        this.loading.delete(code);
      }
    })();
    this.loading.set(code, job);
    return job;
  }
}
