import { newId } from './review';

/**
 * Este aparelho, para a pergunta do conflito dizer de onde veio cada versão ("Chrome no Windows").
 * Um número sorteado na primeira vez, guardado onde mora o estado da sincronização (ver
 * core/cloud-sync.ts), e o nome tirado do navegador.
 */
export interface DeviceTag {
  id: string;
  nome: string;
}

export const DEVICE_KEY = 'meu-mural:nuvem:aparelho';

/** "Chrome no Windows", "Safari no iPhone", ou só "Navegador" quando não dá para saber. */
export function deviceName(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /SamsungBrowser\//.test(ua)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
  return system ? `${browser} no ${system}` : browser;
}

/** Este aparelho (o número fica guardado em `kv` na primeira vez). */
export function thisDevice(kv: { getItem(key: string): string | null; setItem(key: string, value: string): void }): DeviceTag {
  let id = kv.getItem(DEVICE_KEY);
  if (!id || !/^[\w-]{4,64}$/.test(id)) {
    id = newId();
    kv.setItem(DEVICE_KEY, id);
  }
  return { id, nome: deviceName(typeof navigator !== 'undefined' ? navigator.userAgent : '') };
}

/** Um aparelho que veio guardado (só o que serve). */
export function sanitizeDevice(raw: unknown): DeviceTag | null {
  const r = raw as Record<string, unknown> | null;
  const id = typeof r?.['id'] === 'string' && /^[\w-]{4,64}$/.test(r['id']) ? r['id'] : null;
  const nome = typeof r?.['nome'] === 'string' ? r['nome'].trim().slice(0, 40) : '';
  return id ? { id, nome: nome || 'Navegador' } : null;
}
