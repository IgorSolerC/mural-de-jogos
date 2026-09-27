import { Injectable, inject } from '@angular/core';
import { PickedGame, fold } from './review';
import { CoverSource, Settings } from './settings';

export class LookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'rawg-key' | 'server',
  ) {
    super(message);
  }
}

const WIKI = 'https://en.wikipedia.org/w/api.php';

/** Capa vertical oficial da Steam: a arte da biblioteca, 600x900, com o título do jogo. */
function steamCoverUrl(appId: string): string {
  return `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

export function isSteamCover(url: string | null | undefined): boolean {
  return !!url && /steamstatic\.com\/.+\/library_600x900\.jpg$/.test(url);
}

/** Nem todo jogo da Steam tem a arte vertical: confere se a imagem existe antes de usar. */
function imageLoads(url: string, signal: AbortSignal, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      img.onload = img.onerror = null;
      resolve(ok);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    signal.addEventListener('abort', onAbort);
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

/** Tira "(video game)", "(2018 video game)" etc. do título da Wikipedia. */
function cleanWikiTitle(title: string): string {
  return title.replace(/\s*\([^)]*\bgame\b[^)]*\)\s*$/i, '').trim();
}

/** Monta a busca do CirrusSearch: só letras/números, curinga na última palavra. */
function wikiQuery(q: string): string {
  const words = q
    .replace(/[^\p{L}\p{N}\s':-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  const last = words.length - 1;
  if (words[last].length >= 2 && /[\p{L}\p{N}]$/u.test(words[last])) words[last] += '*';
  return `${words.join(' ')} hastemplate:"Infobox video game"`;
}

@Injectable({ providedIn: 'root' })
export class GameLookup {
  private readonly settings = inject(Settings);
  /** O que a busca da RAWG já contou: o jogo está na Steam? (id da RAWG → sim/não) */
  private readonly onSteam = new Map<string, boolean>();

  get usingRawg(): boolean {
    return this.settings.effectiveSource() === 'rawg';
  }

  async search(q: string, signal: AbortSignal, source: CoverSource = this.settings.effectiveSource()): Promise<PickedGame[]> {
    const query = q.trim();
    if (query.length < 2) return [];
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new LookupError('Sem internet agora.', 'offline');
    }
    const key = this.settings.rawgKey().trim();
    if (source === 'rawg' && key) return this.searchRawg(query, key, signal);
    return this.searchWikipedia(query, signal);
  }

  /** Procura o mesmo jogo na outra fonte e devolve a capa de lá (o jogo mais parecido pelo nome). */
  async findCover(game: PickedGame, source: CoverSource, signal: AbortSignal): Promise<PickedGame | null> {
    const hits = await this.search(game.name, signal, source);
    if (!hits.length) return null;
    const name = fold(game.name);
    const best =
      hits.find((h) => fold(h.name) === name && (!game.year || h.year === game.year)) ??
      hits.find((h) => fold(h.name) === name) ??
      hits[0];
    if (!best.coverUrl) return null;
    const found: PickedGame = { ...game, coverUrl: best.coverUrl, source: best.source, sourceId: best.sourceId, year: game.year ?? best.year };
    return found.source === 'rawg' ? this.withSteamCover(found, signal) : found;
  }

  /**
   * A imagem da RAWG é uma arte de fundo, sem o título. Se o jogo está na Steam, troca pela capa
   * vertical oficial de lá; senão devolve o jogo como veio.
   */
  async withSteamCover(game: PickedGame, signal: AbortSignal): Promise<PickedGame> {
    const key = this.settings.rawgKey().trim();
    if (game.source !== 'rawg' || !game.sourceId || !key || isSteamCover(game.coverUrl)) return game;
    if (this.onSteam.get(game.sourceId) === false) return game;
    try {
      const params = new URLSearchParams({ key });
      const data = await this.fetchJson(
        `https://api.rawg.io/api/games/${encodeURIComponent(game.sourceId)}/stores?${params}`,
        signal,
        true,
      );
      const urls: string[] = (data?.results ?? []).map((r: any) => String(r?.url ?? ''));
      const appId = urls.map((u) => u.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1]).find(Boolean);
      if (!appId) {
        this.onSteam.set(game.sourceId, false);
        return game;
      }
      const cover = steamCoverUrl(appId);
      return (await imageLoads(cover, signal)) ? { ...game, coverUrl: cover } : game;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // Sem a capa da Steam, a arte da RAWG serve.
      return game;
    }
  }

  private async searchWikipedia(q: string, signal: AbortSignal): Promise<PickedGame[]> {
    const search = wikiQuery(q);
    if (!search) return [];
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      generator: 'search',
      gsrsearch: search,
      gsrlimit: '10',
      prop: 'pageimages|description',
      piprop: 'thumbnail',
      pithumbsize: '420',
      pilicense: 'any',
    });
    const data = await this.fetchJson(`${WIKI}?${params}`, signal);
    const pages: any[] = data?.query?.pages ?? [];
    const needle = fold(q);
    return pages
      .map((p) => ({
        index: Number(p.index) || 99,
        game: {
          name: cleanWikiTitle(String(p.title ?? '')),
          coverUrl: typeof p.thumbnail?.source === 'string' ? p.thumbnail.source : null,
          source: 'wikipedia' as const,
          sourceId: String(p.pageid ?? ''),
          year: String(p.description ?? '').match(/\b(19|20)\d{2}\b/)?.[0],
        },
      }))
      .filter((x) => x.game.name)
      .sort((a, b) => {
        // Quem começa com o que foi digitado vem primeiro; depois a relevância da Wikipedia.
        const as = fold(a.game.name).startsWith(needle) ? 0 : 1;
        const bs = fold(b.game.name).startsWith(needle) ? 0 : 1;
        return as - bs || a.index - b.index;
      })
      .slice(0, 8)
      .map((x) => x.game);
  }

  private async searchRawg(q: string, key: string, signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({ key, search: q, page_size: '8', search_precise: 'true' });
    const data = await this.fetchJson(`https://api.rawg.io/api/games?${params}`, signal, true);
    const results: any[] = data?.results ?? [];
    for (const g of results) {
      if (g?.id && Array.isArray(g.stores)) this.onSteam.set(String(g.id), g.stores.some((s: any) => s?.store?.slug === 'steam'));
    }
    return results
      .filter((g) => g?.name)
      .map((g) => ({
        name: String(g.name),
        coverUrl:
          typeof g.background_image === 'string'
            ? g.background_image.replace('/media/games/', '/media/resize/640/-/games/')
            : null,
        source: 'rawg' as const,
        sourceId: String(g.id ?? ''),
        year: typeof g.released === 'string' ? g.released.slice(0, 4) : undefined,
      }));
  }

  private async fetchJson(url: string, signal: AbortSignal, rawg = false): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new LookupError('Não consegui falar com o catálogo de jogos.', 'offline');
    }
    if (rawg && (res.status === 401 || res.status === 403)) {
      throw new LookupError('A chave da RAWG foi recusada. Confira em Ajustes.', 'rawg-key');
    }
    if (!res.ok) throw new LookupError('O catálogo de jogos não respondeu.', 'server');
    return res.json();
  }
}
