import { Injectable, computed, effect, signal } from '@angular/core';

const KEY = 'mural-de-jogos:config:v1';

export type CoverSource = 'wikipedia' | 'rawg';

interface Stored {
  rawgKey: string;
  source: CoverSource;
}

function readStored(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const rawgKey = typeof raw.rawgKey === 'string' ? raw.rawgKey : '';
    // Quem já tinha colado uma chave antes desta opção existir continua na RAWG.
    const source: CoverSource = raw.source === 'wikipedia' || raw.source === 'rawg' ? raw.source : rawgKey ? 'rawg' : 'wikipedia';
    return { rawgKey, source };
  } catch {
    return { rawgKey: '', source: 'wikipedia' };
  }
}

@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly stored = readStored();
  readonly rawgKey = signal(this.stored.rawgKey);
  /** Onde a busca procura jogos e capas. RAWG só vale com chave. */
  readonly source = signal<CoverSource>(this.stored.source);
  readonly hasRawg = computed(() => this.rawgKey().trim().length > 0);
  readonly effectiveSource = computed<CoverSource>(() => (this.source() === 'rawg' && this.hasRawg() ? 'rawg' : 'wikipedia'));

  constructor() {
    effect(() => {
      const data: Stored = { rawgKey: this.rawgKey().trim(), source: this.source() };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
  }
}
