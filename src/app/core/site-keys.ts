import { Injectable, inject, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { writeJson } from './storage';

/** O que a nuvem disse da última vez (para a primeira busca de uma visita não esperar a resposta). */
const CACHE_KEY = 'mural-de-jogos:chaves-do-site:v1';
const ASK_TIMEOUT_MS = 4_000;

export type SiteCatalog = 'rawg' | 'tmdb';

function readCache(): { rawg: boolean; tmdb: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {};
    return { rawg: raw.rawg === true, tmdb: raw.tmdb === true };
  } catch {
    return { rawg: false, tmdb: false };
  }
}

/**
 * As chaves do site na busca: a RAWG (jogos) e o TMDB (filmes e séries) com chaves que ficam na nuvem
 * (secrets do Worker, ver api/src/routes/catalog.ts), para ninguém precisar trazer a sua. O navegador
 * nunca vê a chave: pede à API, que repassa. Sem a nuvem, sem o secret ou com a chave no limite, a
 * busca volta para a Wikipedia, como antes.
 *
 * Quem colou a própria chave em Ajustes continua indo direto ao catálogo (ver core/game-lookup.ts).
 */
@Injectable({ providedIn: 'root' })
export class SiteKeys {
  private readonly cloud = inject(Cloud);
  private readonly cached = readCache();
  readonly rawg = signal(this.cached.rawg);
  readonly tmdb = signal(this.cached.tmdb);
  /** Resolve quando a nuvem respondeu (ou não deu para perguntar). */
  readonly ready: Promise<void> = this.ask();

  /** O endereço da busca do site naquele catálogo, ou null se não dá para usar agora. */
  base(which: SiteCatalog): string | null {
    const api = this.cloud.config()?.api;
    return api && this[which]() ? `${api}/v1/catalogo/${which}` : null;
  }

  /** A chave do site parou de servir (recusada, no limite, sem secret): até recarregar, a busca não usa mais. */
  drop(which: SiteCatalog): void {
    this[which].set(false);
  }

  private async ask(): Promise<void> {
    await this.cloud.ready;
    const api = this.cloud.config()?.api;
    if (!api) {
      this.rawg.set(false);
      this.tmdb.set(false);
      return;
    }
    try {
      const res = await fetch(`${api}/v1/catalogo`, { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Record<string, unknown>;
      this.rawg.set(data['rawg'] === true);
      this.tmdb.set(data['tmdb'] === true);
      writeJson(CACHE_KEY, { rawg: this.rawg(), tmdb: this.tmdb() });
    } catch {
      // sem resposta (offline, nuvem fora): fica o que ela disse da última vez; se falhar, a busca volta sozinha
    }
  }
}
