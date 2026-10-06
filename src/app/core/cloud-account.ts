import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { OWNER_NAME_MAX, Settings } from './settings';

/**
 * A conta na nuvem: entrar com o Google, sair e apagar. A sessão é um token da nossa API (não o do
 * Google), guardado neste navegador. "Apagar o save" não mexe nela (ver `erase-save.ts`).
 */
export const SESSION_KEY = 'meu-mural:nuvem:sessao';
export const ACCOUNT_KEY = 'meu-mural:nuvem:conta';

export interface CloudAccountInfo {
  /** O id interno da conta (não muda nunca, ao contrário do código). Contas de antes dele não têm até o próximo /v1/eu. */
  id?: string;
  /** `K7QF-M2XA`. */
  codigo: string;
  nome: string;
}

/** Um erro da nuvem, com a mensagem pronta para mostrar (a API já responde em português). */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** O nome como a API guarda: sem invisíveis, espaços juntos, até 40 caracteres. */
export function cleanName(input: string): string | null {
  const name = Array.from(input.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim())
    .slice(0, OWNER_NAME_MAX)
    .join('')
    .trim();
  return name || null;
}

/** "Chrome no Windows": para a pessoa reconhecer o aparelho numa lista de sessões. */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  const system = /Android/.test(ua)
    ? 'Android'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua)
        ? 'iPad'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return system ? `${browser} no ${system}` : browser;
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function readAccount(): CloudAccountInfo | null {
  const raw = readJson<Partial<CloudAccountInfo>>(ACCOUNT_KEY);
  if (!raw || typeof raw.codigo !== 'string' || typeof raw.nome !== 'string') return null;
  return { ...(typeof raw.id === 'string' ? { id: raw.id } : {}), codigo: raw.codigo, nome: raw.nome };
}

function readToken(): string | null {
  try {
    const token = localStorage.getItem(SESSION_KEY);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class CloudAccount {
  private readonly cloud = inject(Cloud);
  private readonly settings = inject(Settings);
  private readonly token = signal<string | null>(readToken());
  readonly account = signal<CloudAccountInfo | null>(readAccount());
  readonly signedIn = computed(() => this.token() !== null && this.account() !== null);

  constructor() {
    // Ao abrir, confere a sessão e traz o código e o nome de lá.
    void this.cloud.ready.then(() => {
      if (this.signedIn() && this.cloud.config()) this.refresh().catch(() => undefined);
    });
    // O nome público acompanha o "Seu nome" de Ajustes, um instante depois de parar de digitar.
    effect((onCleanup) => {
      const name = cleanName(this.settings.ownerName());
      const account = this.account();
      if (!this.token() || !account || !name || name === account.nome) return;
      const timer = setTimeout(() => this.rename(name).catch(() => undefined), 1500);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Chama a API e devolve a resposta crua (o mural vem em bytes). Erro vira CloudError com a
   * mensagem da nuvem; uma sessão recusada (401) sai da conta neste navegador.
   */
  async requestRaw(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
    await this.cloud.ready;
    const config = this.cloud.config();
    if (!config) throw new CloudError('A nuvem não está disponível agora.', 'sem-nuvem', 0);
    const headers: Record<string, string> = { ...init.headers };
    const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
    if (init.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(config.api + path, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
      });
    } catch {
      throw new CloudError('Sem conexão com a nuvem agora. Tente de novo daqui a pouco.', 'sem-rede', 0);
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { erro?: string; mensagem?: string } | null;
      if (res.status === 401 && data?.erro === 'sessao-invalida') this.forget();
      throw new CloudError(data?.mensagem ?? `A nuvem respondeu com um erro (${res.status}).`, data?.erro ?? 'erro', res.status);
    }
    return res;
  }

  /** Chama a API e lê a resposta JSON. */
  async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await this.requestRaw(path, init);
    return (await res.json().catch(() => null)) as T;
  }

  /** Entra com o `credential` do botão do Google. A conta nova leva o "Seu nome" daqui. */
  async signIn(credential: string): Promise<{ nova: boolean }> {
    const name = cleanName(this.settings.ownerName());
    const res = await this.request<{ token: string; conta: CloudAccountInfo & { nova: boolean } }>('/v1/auth/google', {
      method: 'POST',
      body: { credential, ...(name ? { nome: name } : {}), aparelho: deviceLabel(navigator.userAgent) },
    });
    this.remember(res.token, { ...(res.conta.id ? { id: res.conta.id } : {}), codigo: res.conta.codigo, nome: res.conta.nome });
    // numa conta que já existia, o nome dela vale aqui também
    this.settings.ownerName.set(res.conta.nome);
    return { nova: res.conta.nova };
  }

  async refresh(): Promise<void> {
    const me = await this.request<CloudAccountInfo>('/v1/eu');
    this.setAccount({ ...(me.id ? { id: me.id } : {}), codigo: me.codigo, nome: me.nome });
  }

  async rename(name: string): Promise<void> {
    const res = await this.request<{ nome: string }>('/v1/eu', { method: 'PATCH', body: { nome: name } });
    const account = this.account();
    if (account) this.setAccount({ ...account, nome: res.nome });
  }

  /** Sorteia um código novo: o antigo para de abrir o mural. */
  async newCode(): Promise<string> {
    const res = await this.request<{ codigo: string }>('/v1/eu/codigo', { method: 'POST' });
    const account = this.account();
    if (account) this.setAccount({ ...account, codigo: res.codigo });
    return res.codigo;
  }

  /** Sai neste navegador. Mesmo sem internet a sessão local vai embora (a da nuvem vence sozinha). */
  async signOut(): Promise<void> {
    try {
      await this.request('/v1/auth/sair', { method: 'POST' });
    } catch {
      /* sai daqui de qualquer jeito */
    } finally {
      this.forget();
    }
  }

  async signOutEverywhere(): Promise<void> {
    await this.request('/v1/auth/sair-de-todos', { method: 'POST' });
    this.forget();
  }

  async deleteAccount(): Promise<void> {
    await this.request('/v1/eu', { method: 'DELETE' });
    this.forget();
  }

  private remember(token: string, account: CloudAccountInfo): void {
    this.token.set(token);
    this.setAccount(account);
    try {
      localStorage.setItem(SESSION_KEY, token);
    } catch {
      /* sem armazenamento: a sessão vale até recarregar */
    }
  }

  private setAccount(account: CloudAccountInfo): void {
    this.account.set(account);
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    } catch {
      /* idem */
    }
  }

  /** Esquece a sessão neste navegador (sem avisar a nuvem). */
  forget(): void {
    this.token.set(null);
    this.account.set(null);
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* nada guardado */
    }
  }
}
