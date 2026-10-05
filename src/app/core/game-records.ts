const KEY = 'mural-de-jogos:recordes:v1';

/**
 * Os recordes dos jogos de Extras, neste navegador: um número por jogo, mural, dono e variação
 * ("maior-ou-menor|jogos|eu|final" → 12). Não vão no backup: são da brincadeira, não do mural.
 */
function readAll(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function recordKey(...parts: string[]): string {
  return parts.join('|');
}

export function getRecord(key: string): number {
  return readAll()[key] ?? 0;
}

/** Guarda se for maior que o recorde; devolve se foi recorde novo. */
export function offerRecord(key: string, value: number): boolean {
  const all = readAll();
  if (value <= (all[key] ?? 0)) return false;
  all[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: o recorde vale até recarregar */
  }
  return true;
}
