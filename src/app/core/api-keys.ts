import { Injectable, inject, signal } from '@angular/core';
import { AREAS_DA_API, ESCOPOS, type Aprovacao } from '../../../contrato/api-v1/escopos';
import { CloudAccount } from './cloud-account';
import { MONTHS_LONG } from './dates';

/**
 * As chaves de API da conta (PLANO-API.md, seção 5), na parte Acessos dos Ajustes: a lista, criar,
 * mudar e apagar, pela sessão do site. Nada daqui fica no navegador: o segredo de uma chave nova só
 * existe na resposta de criar e na folha que o mostra, e a lista vem da nuvem a cada vez.
 */

export interface ApiKeyInfo {
  id: string;
  nome: string;
  origem: 'manual' | 'oauth' | 'cli';
  escopos: string[];
  /** Os grupos das Anotações que ela alcança; null = todos. */
  grupos: string[] | null;
  aprovacao: Aprovacao;
  criadaEm: string;
  expiraEm: string;
  usadaEm: string | null;
}

/** O que se escolhe ao criar (a validade, em dias, só ao criar). */
export interface ApiKeyInput {
  nome: string;
  escopos: string[];
  grupos: string[] | null;
  aprovacao: Aprovacao;
  validade?: number;
}

/** "a, b e c". */
export function andList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

/** O que a chave pode, por área, em palavras: ["Anotações: ver, criar e mudar", "Gastos: ver"]. */
export function scopeSummary(scopes: readonly string[]): string[] {
  const set = new Set(scopes);
  return AREAS_DA_API.flatMap((area) => {
    const verbs = ESCOPOS.filter((e) => e.area === area.id && set.has(e.id)).map((e) => e.verbo);
    if (!verbs.length) return [];
    // o especial não leva o nome da área: "Mudar quem vê"
    return area.id === 'especial' ? [verbs.map((v) => v[0]!.toUpperCase() + v.slice(1)).join(', ')] : [`${area.nome}: ${andList(verbs)}`];
  });
}

/** "3 de novembro" (com o ano, se não for o deste). */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const year = d.getFullYear() === now.getFullYear() ? '' : ` de ${d.getFullYear()}`;
  return `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}${year}`;
}

export function expired(key: Pick<ApiKeyInfo, 'expiraEm'>, now = new Date()): boolean {
  return Date.parse(key.expiraEm) <= now.getTime();
}

/** "Vale até 25 de janeiro" / "Venceu em 3 de novembro". */
export function validityLabel(key: Pick<ApiKeyInfo, 'expiraEm'>, now = new Date()): string {
  return expired(key, now) ? `Venceu em ${dayLabel(key.expiraEm, now)}` : `Vale até ${dayLabel(key.expiraEm, now)}`;
}

/** "Nunca usada" / "Usada agora há pouco" / "Usada há 3 horas" / "Usada ontem" / "Usada em 2 de outubro". */
export function usedLabel(key: Pick<ApiKeyInfo, 'usadaEm'>, now = new Date()): string {
  if (!key.usadaEm) return 'Nunca usada';
  const ms = now.getTime() - Date.parse(key.usadaEm);
  const hours = Math.floor(ms / 3_600_000);
  // o uso é anotado no máximo uma vez por hora: "agora há pouco" cobre essa hora
  if (hours < 1) return 'Usada agora há pouco';
  if (hours < 24) return `Usada há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  if (hours < 48) return 'Usada ontem';
  return `Usada em ${dayLabel(key.usadaEm, now)}`;
}

/** A aprovação numa frase curta da lista. */
export function approvalLabel(a: Aprovacao): string {
  return a === 'tudo' ? 'Espera você aprovar tudo' : a === 'mudancas' ? 'Espera você aprovar o que muda ou apaga' : 'Não espera aprovação';
}

/** Onde a chave alcança nas Anotações e no Kanban (só quando ela mexe neles). */
export function groupsLabel(key: Pick<ApiKeyInfo, 'grupos' | 'escopos'>): string | null {
  if (!key.escopos.some((s) => s.startsWith('notas:') || s.startsWith('kanban:'))) return null;
  return key.grupos?.length ? `Só ${key.grupos.length === 1 ? 'no grupo' : 'nos grupos'} ${andList(key.grupos)}` : 'Em todos os grupos';
}

@Injectable({ providedIn: 'root' })
export class ApiKeys {
  private readonly account = inject(CloudAccount);
  /** A lista, como veio da nuvem; null antes de carregar. */
  readonly list = signal<ApiKeyInfo[] | null>(null);

  async load(): Promise<ApiKeyInfo[]> {
    const res = await this.account.request<{ disponivel: boolean; chaves: ApiKeyInfo[] }>('/v1/eu/chaves');
    this.list.set(res.chaves);
    return res.chaves;
  }

  /** Cria e devolve a chave com o segredo, que só existe nesta resposta. */
  async create(input: ApiKeyInput): Promise<{ chave: ApiKeyInfo; segredo: string }> {
    const res = await this.account.request<{ chave: ApiKeyInfo; segredo: string }>('/v1/eu/chaves', { method: 'POST', body: input });
    this.list.update((l) => [res.chave, ...(l ?? [])]);
    return res;
  }

  async update(id: string, input: Omit<ApiKeyInput, 'validade'>): Promise<ApiKeyInfo> {
    const res = await this.account.request<{ chave: ApiKeyInfo }>(`/v1/eu/chaves/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
    this.list.update((l) => (l ?? []).map((k) => (k.id === id ? res.chave : k)));
    return res.chave;
  }

  async remove(id: string): Promise<void> {
    await this.account.request(`/v1/eu/chaves/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.list.update((l) => (l ?? []).filter((k) => k.id !== id));
  }

  /** "Cortar todos os acessos". */
  async removeAll(): Promise<void> {
    await this.account.request('/v1/eu/chaves', { method: 'DELETE' });
    this.list.set([]);
  }
}
