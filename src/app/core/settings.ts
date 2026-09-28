import { Injectable, computed, effect, signal } from '@angular/core';

const KEY = 'mural-de-jogos:config:v1';

export type CoverSource = 'wikipedia' | 'rawg';

interface Stored {
  rawgKey: string;
  /** Chave do TMDB (a "API key" curta ou o "token de leitura" longo): filmes e séries em português. */
  tmdbKey: string;
  source: CoverSource;
  /** As etiquetas de fita que separam o mural em grupos. Escondidas, as fichas correm juntas (bom para print). */
  groupLabels: boolean;
}

function readStored(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const rawgKey = typeof raw.rawgKey === 'string' ? raw.rawgKey : '';
    const tmdbKey = typeof raw.tmdbKey === 'string' ? raw.tmdbKey : '';
    // Quem já tinha colado uma chave antes desta opção existir continua na RAWG.
    const source: CoverSource = raw.source === 'wikipedia' || raw.source === 'rawg' ? raw.source : rawgKey ? 'rawg' : 'wikipedia';
    const groupLabels = raw.groupLabels !== false;
    return { rawgKey, tmdbKey, source, groupLabels };
  } catch {
    return { rawgKey: '', tmdbKey: '', source: 'wikipedia', groupLabels: true };
  }
}

@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly stored = readStored();
  readonly rawgKey = signal(this.stored.rawgKey);
  readonly tmdbKey = signal(this.stored.tmdbKey);
  /** Onde a busca de jogos procura jogos e capas. RAWG só vale com chave. */
  readonly source = signal<CoverSource>(this.stored.source);
  readonly hasRawg = computed(() => this.rawgKey().trim().length > 0);
  /** Com a chave do TMDB, filmes e séries vêm de lá (em português); sem ela, da Wikipedia. */
  readonly hasTmdb = computed(() => this.tmdbKey().trim().length > 0);
  readonly groupLabels = signal(this.stored.groupLabels);
  readonly effectiveSource = computed<CoverSource>(() => (this.source() === 'rawg' && this.hasRawg() ? 'rawg' : 'wikipedia'));

  constructor() {
    effect(() => {
      const data: Stored = {
        rawgKey: this.rawgKey().trim(),
        tmdbKey: this.tmdbKey().trim(),
        source: this.source(),
        groupLabels: this.groupLabels(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
  }
}
