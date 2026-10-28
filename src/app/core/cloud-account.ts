import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { MONTHS_LONG } from './dates';
import { OWNER_NAME_MAX, Settings } from './settings';
import { readJson, readText, removeKey, writeJson, writeText } from './storage';

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
  /** Pode usar o cofre de senhas (o código está na lista do cofre)? Vem do /v1/eu; só mostra a aba do cofre. */
  cofre?: boolean;
  /** Pode usar a API das AIs (o código está em API_CODIGOS)? Vem do /v1/eu; só mostra a parte Acessos dos Ajustes. */
  api?: boolean;
  /**
   * A conta está marcada para sair nesta hora (ISO): ela tem cofre de senhas, e apagar espera 7 dias, com
   * o aviso no topo e o Cancelar (ver `deleteAccount`).
   */
  apagarEm?: string;
}

/** O dia em que a conta marcada sai, como o aviso diz: "30 de outubro". */
export function eraseDayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'daqui a 7 dias' : `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

/** Um erro da nuvem, com a mensagem pronta para mostrar (a API já responde em português). */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** O corpo inteiro da resposta de erro (um 409 pode trazer a versão de agora). */
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

/** O nome como a API guarda: sem invisíveis, espaços juntos, até 40 caracteres. */
export function cleanName(input: string): string | null {
  // os espaços (o tab e a quebra também) viram um espaço antes de os invisíveis saírem: "Ana\tMaria" é "Ana Maria"
  const name = Array.from(
    input
      .replace(/\s+/g, ' ')
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
      .replace(/ {2,}/g, ' ')
      .trim(),
  )
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

/** A conta guardada neste navegador, se está inteira (sem ela, ninguém está nele). */
export function readAccount(): CloudAccountInfo | null {
  const raw = readJson<Partial<CloudAccountInfo>>(ACCOUNT_KEY);
  if (!raw || typeof raw.codigo !== 'string' || typeof raw.nome !== 'string') return null;
  return {
    ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
    codigo: raw.codigo,
    nome: raw.nome,
    ...(raw.cofre === true ? { cofre: true } : {}),
    ...(raw.api === true ? { api: true } : {}),
    ...(typeof raw.apagarEm === 'string' ? { apagarEm: raw.apagarEm } : {}),
  };
}

/** A sessão guardada neste navegador, se tem o formato de uma (sem ela, ninguém está nele). */
export function readToken(): string | null {
  const token = readText(SESSION_KEY);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
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
      // só a sessão que foi recusada sai: a resposta atrasada de um pedido feito antes de entrar (sem
      // token) ou com a sessão de antes não derruba a que acabou de entrar
      if (res.status === 401 && data?.erro === 'sessao-invalida' && token !== null && this.token() === token) this.forget();
      throw new CloudError(data?.mensagem ?? `A nuvem respondeu com um erro (${res.status}).`, data?.erro ?? 'erro', res.status, data);
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
    // o resto da conta (o cofre, a API, a marca de apagar) vem do /v1/eu: sem isso, só ao recarregar
    this.refresh().catch(() => undefined);
    return { nova: res.conta.nova };
  }

  async refresh(): Promise<void> {
    const token = this.token();
    const me = await this.request<CloudAccountInfo>('/v1/eu');
    // saiu (ou trocou de conta) enquanto a resposta vinha: a conta não volta para o navegador
    if (!token || this.token() !== token) return;
    const before = this.account()?.nome;
    this.setAccount({
      ...(me.id ? { id: me.id } : {}),
      codigo: me.codigo,
      nome: me.nome,
      ...(me.cofre === true ? { cofre: true } : {}),
      ...(me.api === true ? { api: true } : {}),
      ...(typeof me.apagarEm === 'string' ? { apagarEm: me.apagarEm } : {}),
    });
    // O nome mudou na nuvem (em outro aparelho) e aqui ninguém mexeu desde a última vez: o "Seu nome"
    // passa a ser o novo. Sem isso, o efeito que acompanha o "Seu nome" mandaria o velho de volta.
    // Um nome trocado aqui e ainda não enviado (sem rede) continua valendo e sobe.
    if (before !== undefined && me.nome !== before && cleanName(this.settings.ownerName()) === before) {
      this.settings.ownerName.set(me.nome);
    }
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

  /** Troca o código por um escolhido (`ABCD-1234`). Se já é de outra pessoa, a nuvem recusa com `codigo-em-uso` e nada muda. */
  async chooseCode(code: string): Promise<string> {
    const res = await this.request<{ codigo: string }>('/v1/eu/codigo', { method: 'PUT', body: { codigo: code } });
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

  /** Sai de todos os aparelhos; com `keys`, corta também as chaves de API e os conectores. */
  async signOutEverywhere(keys = false): Promise<void> {
    await this.request('/v1/auth/sair-de-todos', { method: 'POST', ...(keys ? { body: { chaves: true } } : {}) });
    this.forget();
  }

  /**
   * Apaga a conta. Sem cofre de senhas, ela sai na hora e a sessão daqui vai junto (devolve null). Com
   * cofre, a nuvem só marca a conta para sair em 7 dias: a sessão continua, com o aviso e o Cancelar
   * (devolve quando ela sai).
   */
  async deleteAccount(): Promise<string | null> {
    const res = await this.request<{ apagarEm?: unknown } | null>('/v1/eu', { method: 'DELETE' });
    if (typeof res?.apagarEm === 'string') {
      // marcada para sair em 7 dias (não apagada): mesmo que a sessão daqui tenha caído no meio
      const account = this.account();
      if (account) this.setAccount({ ...account, apagarEm: res.apagarEm });
      return res.apagarEm;
    }
    this.forget();
    return null;
  }

  /** Desmarca o apagar da conta (a que tem cofre e esperava os 7 dias). */
  async cancelDelete(): Promise<void> {
    await this.request('/v1/eu/cancelar-apagar', { method: 'POST' });
    const account = this.account();
    if (account) {
      const { apagarEm: _, ...rest } = account;
      this.setAccount(rest);
    }
  }

  private remember(token: string, account: CloudAccountInfo): void {
    this.token.set(token);
    this.setAccount(account);
    writeText(SESSION_KEY, token);
  }

  private setAccount(account: CloudAccountInfo): void {
    this.account.set(account);
    writeJson(ACCOUNT_KEY, account);
  }

  /** Esquece a sessão neste navegador (sem avisar a nuvem). */
  forget(): void {
    this.token.set(null);
    this.account.set(null);
    removeKey(SESSION_KEY);
    removeKey(ACCOUNT_KEY);
  }
}
