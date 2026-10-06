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

/**
 * Um aviso urgente, sem esperar uma versão nova do site: o campo `aviso` do `cloud.json`, que vale
 * mesmo com a nuvem desligada (manutenção, a nuvem fora do ar). Aparece na faixa do topo, com um X, e
 * fechado não volta; trocar o `id` faz ele aparecer de novo para todo mundo.
 *
 *     "aviso": { "id": "manutencao-1", "texto": "A nuvem fica fora do ar hoje às 22h.", "ate": "2026-10-20" }
 */
export interface CloudNotice {
  id: string;
  text: string;
  /** Até quando aparece (AAAA-MM-DD, inclusive). */
  until?: string;
}

const NOTICE_MAX = 240;

/** Lê o `aviso` do `cloud.json`; devolve null quando não há (ou não serve). */
export function parseCloudNotice(data: unknown): CloudNotice | null {
  if (!data || typeof data !== 'object') return null;
  const raw = (data as Record<string, unknown>)['aviso'];
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;
  const id = typeof n['id'] === 'string' ? n['id'].trim() : '';
  const text = typeof n['texto'] === 'string' ? n['texto'].trim() : '';
  const until = n['ate'];
  if (!/^[\w-]{1,60}$/.test(id) || !text || text.length > NOTICE_MAX) return null;
  if (until !== undefined && (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until))) return null;
  return until ? { id, text, until } : { id, text };
}

@Injectable({ providedIn: 'root' })
export class Cloud {
  /** null: a nuvem está desligada (ou o arquivo ainda está chegando). */
  readonly config = signal<CloudConfig | null>(null);
  /** O aviso urgente do `cloud.json`, com a nuvem ligada ou não. */
  readonly notice = signal<CloudNotice | null>(null);
  /** Resolve quando o `cloud.json` foi lido (ou falhou). */
  readonly ready: Promise<void> = this.load();

  private async load(): Promise<void> {
    try {
      const res = await fetch('cloud.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data: unknown = await res.json();
      this.config.set(parseCloudConfig(data, isDevMode()));
      this.notice.set(parseCloudNotice(data));
    } catch {
      /* sem o arquivo (offline na primeira visita): a nuvem fica de fora desta vez */
    }
  }
}
