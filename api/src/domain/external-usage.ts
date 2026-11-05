import { Desfecho, OperacaoDe, ServicoContado, desfechoDoStatus } from '../../../contrato/uso-apis/contagem';
import { Deps, Statement } from '../ports';
import { usageToday, utcDay, write } from './quota';

/**
 * A contagem das chamadas a serviços externos (PLANO-ADMIN-APIS.md, seção 6). Quem chama só anota, na
 * memória; a gravação sai uma vez por janela. Assim, nenhuma busca espera o banco, e um script com a origem
 * falsa, que já gastaria a cota da RAWG, não consegue gastar também a cota de gravações de todo mundo: são
 * no máximo 4.320 janelas por dia e por instância, por maior que seja o ataque.
 *
 * Medido no plano grátis (PLANO-ADMIN-APIS.md, seção 22): o `waitUntil` aguenta 30 s depois da resposta, e
 * o que passa disso é cancelado e se perde. Os 20 s deixam folga para o banco, e não podem crescer.
 *
 * A contagem nunca atrapalha: uma falha ao gravar só vai para o log, e o que estava anotado continua na
 * memória para a próxima janela. Uma instância que morre perde até uma janela de conta: a tela diz que é
 * uma conta nossa, e o painel de cada serviço é quem manda de verdade.
 */

export const USAGE_WINDOW_MS = 20_000;
/** A partir daqui do dia, a contagem para: a cota de gravações é da sincronização de todo mundo. */
export const USAGE_BUDGET_SHARE = 0.5;
/** Quantas combinações ficam na memória esperando gravar: a lista não cresce sem fim num dia sem cota. */
const MAX_LINES = 200;
const MAX_FAILURES = 50;

type MedidoEm = 'worker' | 'navegador';

export interface ExternalCall {
  servico: string;
  operacao: string;
  desfecho: Desfecho;
  /** O HTTP de lá; null quando não houve resposta (rede ou prazo). */
  status: number | null;
  ms: number;
  medidoEm?: MedidoEm;
}

interface Line {
  dia: string;
  servico: string;
  operacao: string;
  medidoEm: MedidoEm;
  desfecho: Desfecho;
  pedidos: number;
  msTotal: number;
  msMax: number;
  ultimoEm: string;
}

interface FailureLine {
  em: string;
  servico: string;
  operacao: string;
  medidoEm: MedidoEm;
  desfecho: Desfecho;
  status: number | null;
  repeticoes: number;
}

/** O que mantém o trabalho vivo depois da resposta (o `waitUntil` do Worker). */
export type KeepAlive = (work: Promise<unknown>) => void;

const isFailure = (d: Desfecho) => d !== 'ok' && d !== 'nao-achou' && d !== 'cancelada';

export class UsageMeter {
  private lines = new Map<string, Line>();
  private failures = new Map<string, FailureLine>();
  private scheduled = false;

  /** `windowMs` zero grava na hora, ao fim do pedido (os testes). */
  constructor(private readonly windowMs = USAGE_WINDOW_MS) {}

  /** Há o que gravar? */
  get pending(): boolean {
    return this.lines.size > 0 || this.failures.size > 0;
  }

  note(call: ExternalCall, at: Date): void {
    const medidoEm = call.medidoEm ?? 'worker';
    const em = at.toISOString();
    const ms = Math.max(0, Math.round(call.ms));
    const key = [utcDay(at), call.servico, call.operacao, medidoEm, call.desfecho].join('|');
    const line = this.lines.get(key);
    if (line) {
      line.pedidos++;
      line.msTotal += ms;
      line.msMax = Math.max(line.msMax, ms);
      line.ultimoEm = em;
    } else if (this.lines.size < MAX_LINES) {
      this.lines.set(key, { dia: utcDay(at), servico: call.servico, operacao: call.operacao, medidoEm, desfecho: call.desfecho, pedidos: 1, msTotal: ms, msMax: ms, ultimoEm: em });
    }
    if (!isFailure(call.desfecho)) return;
    const failKey = [call.servico, call.operacao, medidoEm, call.desfecho, call.status ?? ''].join('|');
    const failure = this.failures.get(failKey);
    if (failure) {
      failure.repeticoes++;
      failure.em = em;
    } else if (this.failures.size < MAX_FAILURES) {
      this.failures.set(failKey, { em, servico: call.servico, operacao: call.operacao, medidoEm, desfecho: call.desfecho, status: call.status, repeticoes: 1 });
    }
  }

  /**
   * Marca a gravação da janela, se há o que gravar e nenhuma marcada. Com `windowMs` zero, devolve a própria
   * gravação, para quem chama esperar. Fora do Worker não há `keepAlive`, e o intervalo roda por conta própria.
   */
  schedule(deps: Deps, keepAlive?: KeepAlive): Promise<void> | undefined {
    if (!this.pending || this.scheduled) return undefined;
    if (this.windowMs === 0) return this.flush(deps);
    this.scheduled = true;
    keepAlive?.(new Promise((resolve) => setTimeout(resolve, this.windowMs)).then(() => this.flush(deps)));
    return undefined;
  }

  /** Grava o que está anotado. Nunca lança: o que não deu para gravar fica para a próxima janela. */
  async flush(deps: Deps): Promise<void> {
    this.scheduled = false;
    if (!this.pending) return;
    const lines = this.lines;
    const failures = this.failures;
    this.lines = new Map();
    this.failures = new Map();
    try {
      // cada leitura aqui é uma por janela: não pesa
      const usage = deps.config.mode === 'ligado' ? await usageToday(deps) : null;
      if (!usage || usage.rowsWritten >= deps.config.dailyRowBudget * USAGE_BUDGET_SHARE) {
        this.restore(lines, failures);
        return;
      }
      await write(deps, [...[...lines.values()].map(lineStatement), ...[...failures.values()].map(failureStatement)], lines.size + failures.size * 2);
    } catch (error) {
      this.restore(lines, failures);
      deps.log?.(`uso das APIs: não deu para gravar (${error instanceof Error ? error.name : 'erro'})`);
    }
  }

  /** Devolve à memória o que não foi gravado, somando com o que chegou no meio. */
  private restore(lines: Map<string, Line>, failures: Map<string, FailureLine>): void {
    for (const [key, line] of lines) {
      const now = this.lines.get(key);
      if (now) {
        now.pedidos += line.pedidos;
        now.msTotal += line.msTotal;
        now.msMax = Math.max(now.msMax, line.msMax);
        if (line.ultimoEm > now.ultimoEm) now.ultimoEm = line.ultimoEm;
      } else if (this.lines.size < MAX_LINES) {
        this.lines.set(key, line);
      }
    }
    for (const [key, failure] of failures) {
      const now = this.failures.get(key);
      if (now) {
        now.repeticoes += failure.repeticoes;
        if (failure.em > now.em) now.em = failure.em;
      } else if (this.failures.size < MAX_FAILURES) {
        this.failures.set(key, failure);
      }
    }
  }
}

const lineStatement = (l: Line): Statement => ({
  sql:
    'INSERT INTO uso_apis (dia, servico, operacao, medido_em, desfecho, pedidos, ms_total, ms_max, ultimo_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT (dia, servico, operacao, medido_em, desfecho) DO UPDATE SET pedidos = pedidos + excluded.pedidos, ms_total = ms_total + excluded.ms_total, ' +
    'ms_max = max(ms_max, excluded.ms_max), ultimo_em = max(ultimo_em, excluded.ultimo_em)',
  params: [l.dia, l.servico, l.operacao, l.medidoEm, l.desfecho, l.pedidos, l.msTotal, l.msMax, l.ultimoEm],
});

const failureStatement = (f: FailureLine): Statement => ({
  sql: 'INSERT INTO uso_apis_falhas (em, servico, operacao, medido_em, desfecho, status, repeticoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
  params: [f.em, f.servico, f.operacao, f.medidoEm, f.desfecho, f.status, f.repeticoes],
});

/** O motivo do 403 da Agenda: o Google usa o mesmo número para "falta permissão" e "passou do limite". */
const LIMIT_REASON = /rateLimit|quota|limit/i;

/**
 * Faz a chamada e anota como ela terminou. Sem medidor (os testes que não olham a conta), só faz a chamada.
 *
 * Com `keepAlive`, a anotação sobrevive à desistência de quem pediu: quando um catálogo cai, o site desiste
 * antes do Worker (5 s contra 8 s), e a Cloudflare cancela o pedido; sem isto, justamente as quedas não
 * seriam contadas. O serviço e a operação só aceitam as das listas fechadas.
 */
export function measured<S extends ServicoContado>(
  deps: Deps,
  servico: S,
  operacao: OperacaoDe<S>,
  run: () => Promise<Response>,
  options: { keepAlive?: KeepAlive | undefined; limitIn403?: boolean } = {},
): Promise<Response> {
  const meter = deps.meter;
  if (!meter) return run();
  const started = Date.now();
  const finish = (desfecho: Desfecho, status: number | null) => meter.note({ servico, operacao, desfecho, status, ms: Date.now() - started }, deps.now());
  const done = run().then(
    async (res) => {
      let desfecho = desfechoDoStatus(res.status);
      if (options.limitIn403 && res.status === 403) {
        const body = await res
          .clone()
          .text()
          .catch(() => '');
        if (LIMIT_REASON.test(body)) desfecho = 'limite';
      }
      finish(desfecho, res.status);
      return res;
    },
    (error: unknown) => {
      finish(error instanceof Error && error.name === 'TimeoutError' ? 'prazo' : 'fora', null);
      throw error;
    },
  );
  const { keepAlive } = options;
  if (keepAlive) {
    const settled = () => void meter.schedule(deps, keepAlive);
    keepAlive(done.then(settled, settled));
  }
  return done;
}
