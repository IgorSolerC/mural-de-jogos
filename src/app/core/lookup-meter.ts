import { DestroyRef, Injectable, inject } from '@angular/core';
import { Desfecho, OperacaoDe, ServicoContado, desfechoDoStatus } from '../../../contrato/uso-apis/contagem';
import { CloudAccount, CloudError } from './cloud-account';

/**
 * A conta das chamadas que saem direto do navegador (PLANO-ADMIN-APIS.md, seção 7), que o Worker não vê. Só
 * totais: sem o que foi buscado, sem endereço, sem id, e a tabela da nuvem não tem coluna de conta.
 *
 * Nada fica guardado: é só memória, então a regra do logout vale sem nada a fazer aqui (a limpeza recarrega a
 * página), e fechar a aba sem mandar perde a conta. Por isso a tela diz "aproximada". Só quem está logado conta, e
 * trocar de conta zera: o que veio antes não vai junto.
 */

/** A cada quanto manda, se há o que mandar. */
export const SEND_EVERY_MS = 5 * 60_000;
/** Ao esconder a aba, manda o que tem, mas não mais que isto de uma vez (a API aceita 30 envios por hora). */
export const SEND_HIDDEN_AFTER_MS = 2 * 60_000;
/** Quantas combinações ficam na memória; a conta não cresce sem fim com a nuvem fora. */
const MAX_LINES = 40;
/** O teto de uma linha na API. */
const MAX_REQUESTS = 1_000;

interface Where {
  servico: ServicoContado;
  operacao: string;
}

function at<S extends ServicoContado>(servico: S, operacao: OperacaoDe<S>): Where {
  return { servico, operacao };
}

/**
 * De qual serviço é um endereço, numa tabela fechada. O da própria API não conta (o Worker já contou) e o
 * desconhecido também não. Com a chave própria, é um serviço à parte: nunca entra na cota do site.
 */
export function whereOf(url: string): Where | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  switch (host) {
    case 'en.wikipedia.org':
    case 'pt.wikipedia.org':
      return at('wikipedia', 'geral');
    case 'openlibrary.org':
      return at('open-library', 'geral');
    case 'kitsu.io':
      return at('kitsu', 'geral');
    case 'graphql.anilist.co':
      return at('anilist', 'geral');
    case 'itunes.apple.com':
      return at('itunes', 'geral');
    case 'api.rawg.io':
      return at('chave-propria', 'rawg');
    case 'api.themoviedb.org':
      return at('chave-propria', 'tmdb');
    default:
      return null;
  }
}

/** Como uma resposta terminou. O iTunes bloqueia o excesso com 403, e não com 429 (relato do fórum da Apple). */
export function outcomeOf(where: Where, status: number): Desfecho {
  if (where.servico === 'itunes' && status === 403) return 'limite';
  return desfechoDoStatus(status);
}

/** Como uma chamada sem resposta terminou: desistir de digitar não é falha de ninguém. */
export function failureOf(error: unknown, signal: AbortSignal): Desfecho {
  const name = (error as Error | undefined)?.name;
  if (name === 'TimeoutError') return 'prazo';
  // a chave própria recusada sem CORS (o `LookupError` da busca, que já conferiu que a RAWG está de pé)
  if ((error as { kind?: unknown } | undefined)?.kind === 'rawg-key') return 'recusada';
  return signal.aborted || name === 'AbortError' ? 'cancelada' : 'fora';
}

interface Line {
  servico: string;
  operacao: string;
  desfecho: Desfecho;
  status: number | null;
  pedidos: number;
  msTotal: number;
  msMax: number;
}

@Injectable({ providedIn: 'root' })
export class LookupMeter {
  private readonly account = inject(CloudAccount);
  private lines = new Map<string, Line>();
  /** De quem é o que está na memória. */
  private owner: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      const onHide = () => {
        if (document.visibilityState === 'hidden' && Date.now() - this.lastSent >= SEND_HIDDEN_AFTER_MS) this.send(true);
      };
      document.addEventListener('visibilitychange', onHide);
      inject(DestroyRef).onDestroy(() => {
        document.removeEventListener('visibilitychange', onHide);
        this.stopTimer();
      });
    }
  }

  /**
   * Faz a chamada e anota como ela terminou. `signal` é o de quem pediu: abortado, foi a pessoa que continuou
   * digitando. A contagem nunca atrapalha: nada aqui é esperado nem lança, além do erro da própria chamada.
   */
  async track(url: string, signal: AbortSignal, run: () => Promise<Response>): Promise<Response> {
    const where = whereOf(url);
    if (!where) return run();
    const started = performance.now();
    const ms = () => performance.now() - started;
    try {
      const res = await run();
      this.note(where, outcomeOf(where, res.status), res.status, ms());
      return res;
    } catch (error) {
      // sem internet no aparelho, o problema não é do catálogo
      if (typeof navigator === 'undefined' || navigator.onLine !== false) this.note(where, failureOf(error, signal), null, ms());
      throw error;
    }
  }

  /** De quem é a sessão agora; sem sessão, ninguém. */
  private currentOwner(): string | null {
    if (!this.account.signedIn()) return null;
    const account = this.account.account();
    return account?.id ?? account?.codigo ?? null;
  }

  private note(where: Where, desfecho: Desfecho, status: number | null, ms: number): void {
    const owner = this.currentOwner();
    // trocou de conta: o de antes não vai junto
    if (owner !== this.owner) {
      this.lines.clear();
      this.owner = owner;
    }
    if (!owner) return;
    this.add({ servico: where.servico, operacao: where.operacao, desfecho, status, pedidos: 1, msTotal: ms, msMax: ms });
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.send(false);
      }, SEND_EVERY_MS);
    }
  }

  private add(line: Line): void {
    const key = [line.servico, line.operacao, line.desfecho, line.status ?? ''].join('|');
    const now = this.lines.get(key);
    if (now) {
      now.pedidos = Math.min(MAX_REQUESTS, now.pedidos + line.pedidos);
      now.msTotal += line.msTotal;
      now.msMax = Math.max(now.msMax, line.msMax);
    } else if (this.lines.size < MAX_LINES) {
      this.lines.set(key, { ...line });
    }
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Manda o que há. `keepalive`: a aba pode estar indo embora. */
  send(keepalive: boolean): void {
    if (!this.lines.size) return;
    const owner = this.currentOwner();
    if (!owner || owner !== this.owner) {
      this.lines.clear();
      this.stopTimer();
      return;
    }
    const batch = [...this.lines.values()].map((l) => ({ ...l, msTotal: Math.round(l.msTotal), msMax: Math.round(l.msMax) }));
    this.lines.clear();
    this.stopTimer();
    this.lastSent = Date.now();
    this.account.request('/v1/uso/navegador', { method: 'POST', body: { linhas: batch }, keepalive }).catch((error: unknown) => {
      // recusada, não adianta tentar de novo; sem rede ou com a nuvem fora, vai junto na próxima vez
      if (error instanceof CloudError && error.status >= 400 && error.status < 500) return;
      if (this.currentOwner() !== owner) return;
      for (const line of batch) this.add(line);
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.send(false);
        }, SEND_EVERY_MS);
      }
    });
  }
}
