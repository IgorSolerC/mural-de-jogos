import { Injectable, computed, effect, signal } from '@angular/core';

const KEY = 'mural-de-jogos:config:v1';

export type CoverSource = 'wikipedia' | 'rawg';

/**
 * Como as notas aparecem: Livre (com uma casa, como foram dadas), Arredondado (para a metade ou o
 * inteiro mais perto: 9,2 → 9; 8,4 → 8,5) ou Inteiros (8,4 → 8; 8,5 → 9). Só a exibição: a nota
 * guardada, a média e a ordem do mural não mudam.
 */
export type ScoreDisplay = 'livre' | 'metade' | 'inteiro';
export const SCORE_DISPLAYS: readonly ScoreDisplay[] = ['livre', 'metade', 'inteiro'];

interface Stored {
  rawgKey: string;
  /** Chave do TMDB (a "API key" curta ou o "token de leitura" longo): filmes e séries em português. */
  tmdbKey: string;
  source: CoverSource;
  /** As etiquetas de fita que separam o mural em grupos. Escondidas, as fichas correm juntas (bom para print). */
  groupLabels: boolean;
  /** Sem spoilers: as fichas do mural escondem notas, veredito, bônus e texto, para mostrar o mural a outros. */
  noSpoilers: boolean;
  scoreDisplay: ScoreDisplay;
}

function readStored(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const rawgKey = typeof raw.rawgKey === 'string' ? raw.rawgKey : '';
    const tmdbKey = typeof raw.tmdbKey === 'string' ? raw.tmdbKey : '';
    // Quem já tinha colado uma chave antes desta opção existir continua na RAWG.
    const source: CoverSource = raw.source === 'wikipedia' || raw.source === 'rawg' ? raw.source : rawgKey ? 'rawg' : 'wikipedia';
    const groupLabels = raw.groupLabels !== false;
    const noSpoilers = raw.noSpoilers === true;
    const scoreDisplay: ScoreDisplay = SCORE_DISPLAYS.includes(raw.scoreDisplay) ? raw.scoreDisplay : 'livre';
    return { rawgKey, tmdbKey, source, groupLabels, noSpoilers, scoreDisplay };
  } catch {
    return { rawgKey: '', tmdbKey: '', source: 'wikipedia', groupLabels: true, noSpoilers: false, scoreDisplay: 'livre' };
  }
}

/**
 * O jeito de mostrar as notas, lido já ao carregar: `formatScore` usa em toda parte, mesmo nas telas
 * que não pedem os Ajustes.
 */
export const scoreDisplay = signal<ScoreDisplay>(readStored().scoreDisplay);

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
  /** Notas viram "?", bônus viram adesivos meio a meio e o texto vira embaralhado, do mesmo tamanho. */
  readonly noSpoilers = signal(this.stored.noSpoilers);
  readonly scoreDisplay = scoreDisplay;
  readonly effectiveSource = computed<CoverSource>(() => (this.source() === 'rawg' && this.hasRawg() ? 'rawg' : 'wikipedia'));

  constructor() {
    effect(() => {
      const data: Stored = {
        rawgKey: this.rawgKey().trim(),
        tmdbKey: this.tmdbKey().trim(),
        source: this.source(),
        groupLabels: this.groupLabels(),
        noSpoilers: this.noSpoilers(),
        scoreDisplay: this.scoreDisplay(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
  }
}
