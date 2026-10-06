import { Injectable, isDevMode, signal } from '@angular/core';

/**
 * A nuvem é opcional e tem um interruptor fora do código: `public/cloud.json`. Com `"ativo": false`
 * o site nem mostra o login e funciona só neste navegador, como sempre. Esse arquivo fica no GitHub
 * Pages, então dá para desligar a nuvem mesmo sem acesso à Cloudflare.
 *
 * No `ng serve` (modo de desenvolvimento) a nuvem vale mesmo desligada no arquivo, para testar antes
 * de ligar para todo mundo.
 */
export interface CloudConfig {
  /** O endereço da API, sem barra no fim. */
  api: string;
  /** O Client ID do login com Google (público). */
  googleClientId: string;
}

/** Lê o `cloud.json`; devolve null quando a nuvem está desligada ou o arquivo não serve. */
export function parseCloudConfig(data: unknown, devMode: boolean): CloudConfig | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  if (raw['ativo'] !== true && !devMode) return null;
  const api = typeof raw['api'] === 'string' ? raw['api'].trim().replace(/\/+$/, '') : '';
  const clientId = typeof raw['googleClientId'] === 'string' ? raw['googleClientId'].trim() : '';
  const okApi = /^https:\/\/[^\s/]+$/.test(api) || (devMode && /^http:\/\/localhost(:\d+)?$/.test(api));
  if (!okApi || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) return null;
  return { api, googleClientId: clientId };
}

@Injectable({ providedIn: 'root' })
export class Cloud {
  /** null: a nuvem está desligada (ou o arquivo ainda está chegando). */
  readonly config = signal<CloudConfig | null>(null);
  /** Resolve quando o `cloud.json` foi lido (ou falhou). */
  readonly ready: Promise<void> = this.load();

  private async load(): Promise<void> {
    try {
      const res = await fetch('cloud.json', { cache: 'no-cache' });
      if (res.ok) this.config.set(parseCloudConfig(await res.json(), isDevMode()));
    } catch {
      /* sem o arquivo (offline na primeira visita): a nuvem fica de fora desta vez */
    }
  }
}
