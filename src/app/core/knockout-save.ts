import { Kind, isKind } from './kinds';
import { DUEL_OPTIONS, DuelOption, Slot } from './tournament';

const KEY = 'mural-de-jogos:mata-mata:v1';

/** Um mata-mata em andamento (ou acabado, até começar outro), um por mural. Fica só neste navegador. */
export interface SavedKnockout {
  /** `ME` ou o id do colega. */
  owner: string;
  option: DuelOption;
  slots: Slot[];
  picks: string[];
  /** O sorteio de cada rodada depois da primeira (ver `ensureDraws`); os torneios antigos não têm. */
  draws?: (string[] | null)[];
  /** As notas ficam escondidas nos duelos. */
  masked: boolean;
  startedAt: string;
}

function readAll(): Partial<Record<Kind, SavedKnockout>> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const out: Partial<Record<Kind, SavedKnockout>> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw as Record<string, Partial<Record<keyof SavedKnockout, unknown>> | null>)) {
      if (!isKind(k) || !v || typeof v !== 'object') continue;
      if (typeof v.owner !== 'string' || !Array.isArray(v.slots) || !Array.isArray(v.picks)) continue;
      if (!v.slots.every((s: unknown) => s === null || typeof s === 'string')) continue;
      if (!v.picks.every((s: unknown) => typeof s === 'string')) continue;
      out[k] = {
        owner: v.owner,
        option: (DUEL_OPTIONS as readonly unknown[]).includes(v.option) ? (v.option as DuelOption) : 'todos',
        slots: v.slots,
        picks: v.picks,
        draws: Array.isArray(v.draws)
          ? v.draws.map((d: unknown) => (Array.isArray(d) && d.every((x) => typeof x === 'string') ? (d as string[]) : null))
          : [],
        masked: v.masked !== false,
        startedAt: typeof v.startedAt === 'string' ? v.startedAt : new Date().toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadKnockout(kind: Kind): SavedKnockout | null {
  return readAll()[kind] ?? null;
}

export function saveKnockout(kind: Kind, game: SavedKnockout | null): void {
  try {
    const all = readAll();
    if (game) all[kind] = game;
    else delete all[kind];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: o torneio vale até recarregar */
  }
}
