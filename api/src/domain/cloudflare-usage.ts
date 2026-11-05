import { Deps } from '../ports';
import { utcDay } from './quota';

/**
 * O uso oficial da conta na Cloudflare, lido na hora pela API de análise (PLANO-ADMIN-APIS.md, seção 8): os
 * limites do plano grátis são da conta inteira, então a consulta não filtra Worker nem banco. O token só tem
 * "Account Analytics: Read", nunca sai daqui, e o log só leva o HTTP.
 *
 * Só hoje e ontem, a mesma janela que a checagem diária já usa: a documentação não garante uma janela maior
 * no plano grátis. Os números chegam com alguns minutos de atraso.
 */

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;

/**
 * A dimensão de tempo, da mais agregada para a mais picada. A documentação só mostra `datetime`, que pica em
 * grupos demais: medido, ler 10 mil grupos gasta de 9 a 21 ms, acima dos 10 ms de CPU do plano grátis. Por
 * isso tenta as agregadas primeiro, e lembra da que funcionou enquanto a instância está de pé.
 */
const TIME_DIMENSIONS = ['date', 'datetimeHour', 'datetime'] as const;
/** 2 dias, 3 Workers e até 5 desfechos cabem aqui com folga por hora; o teto protege a CPU. */
const MAX_GROUPS = 3_000;

/** Os bancos da conta (os ids são públicos, estão nos wrangler.toml). */
const DATABASE_NAMES: Record<string, string> = {
  'c2c789d6-f0f3-4f37-b53a-f049aa02a530': 'mural',
  '40d84093-1785-4d43-859d-e454d0708003': 'mural-imagens',
  'ea30a419-28e2-4e9e-b2b3-23fc1757c3cc': 'cofre',
  'fb73759e-a2bd-4595-a3f2-253b8f73fccc': 'mural-api-teste',
};

export interface CloudflareKeys {
  token: string;
  account: string;
}

export function readCloudflareKeys(env: Record<string, unknown>): CloudflareKeys {
  const text = (key: string) => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  return { token: text('CF_ANALYTICS_TOKEN'), account: text('CF_ACCOUNT_ID') };
}

export interface CloudflareDay {
  dia: string;
  pedidos: number;
  erros: number;
  /** Os pedidos que a Cloudflare cortou por passar do limite (`exceededResources`). */
  cortados: number;
  linhasLidas: number;
  linhasGravadas: number;
}

export interface CloudflareReport {
  estado: 'ok' | 'sem-token' | 'fora';
  geradoEm: string;
  dias: CloudflareDay[];
  /** Cada Worker, só hoje. `cpuP99` em milissegundos. */
  workers: { nome: string; pedidos: number; erros: number; cortados: number; cpuP99: number | null }[];
  bancos: { nome: string; bytes: number }[];
}

const query = (dimension: string) => `query Uso($account: string!, $from: Date!, $to: Date!, $fromTime: Time!, $toTime: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: ${MAX_GROUPS}, filter: { datetime_geq: $fromTime, datetime_lt: $toTime }) {
        sum { requests errors }
        quantiles { cpuTimeP99 }
        dimensions { ${dimension} scriptName status }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: ${MAX_GROUPS}, filter: { date_geq: $from, date_leq: $to }) {
        sum { rowsRead rowsWritten }
        dimensions { date }
      }
      storage: d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $from, date_leq: $to }, orderBy: [date_DESC]) {
        max { databaseSizeBytes }
        dimensions { date databaseId }
      }
    }
  }
}`;

interface GraphQLAccount {
  workers?: { sum?: { requests?: number; errors?: number }; quantiles?: { cpuTimeP99?: number }; dimensions?: Record<string, string | undefined> }[];
  d1?: { sum?: { rowsRead?: number; rowsWritten?: number }; dimensions?: { date?: string } }[];
  storage?: { max?: { databaseSizeBytes?: number }; dimensions?: { date?: string; databaseId?: string } }[];
}

/** Junta a resposta por dia e por Worker. O dia sai dos 10 primeiros caracteres de qualquer dimensão de tempo. */
export function reportFrom(account: GraphQLAccount, dimension: string, now: Date): CloudflareReport {
  const today = utcDay(now);
  const yesterday = utcDay(new Date(now.getTime() - DAY_MS));
  const days = new Map<string, CloudflareDay>([today, yesterday].map((dia) => [dia, { dia, pedidos: 0, erros: 0, cortados: 0, linhasLidas: 0, linhasGravadas: 0 }]));
  const workers = new Map<string, CloudflareReport['workers'][number]>();
  for (const g of account.workers ?? []) {
    const day = days.get((g.dimensions?.[dimension] ?? '').slice(0, 10));
    if (!day) continue;
    const requests = g.sum?.requests ?? 0;
    const errors = g.sum?.errors ?? 0;
    const cut = g.dimensions?.['status'] === 'exceededResources' ? requests : 0;
    day.pedidos += requests;
    day.erros += errors;
    day.cortados += cut;
    if (day.dia !== today) continue;
    const name = g.dimensions?.['scriptName'] ?? '?';
    const worker = workers.get(name) ?? { nome: name, pedidos: 0, erros: 0, cortados: 0, cpuP99: null };
    worker.pedidos += requests;
    worker.erros += errors;
    worker.cortados += cut;
    const cpu = g.quantiles?.cpuTimeP99;
    // em microssegundos; o quantil não se soma: fica o pior dos grupos
    if (typeof cpu === 'number') worker.cpuP99 = Math.max(worker.cpuP99 ?? 0, cpu / 1000);
    workers.set(name, worker);
  }
  for (const g of account.d1 ?? []) {
    const day = days.get(g.dimensions?.date ?? '');
    if (!day) continue;
    day.linhasLidas += g.sum?.rowsRead ?? 0;
    day.linhasGravadas += g.sum?.rowsWritten ?? 0;
  }
  // a resposta vem do dia mais novo para o mais velho: fica o primeiro de cada banco
  const bancos = new Map<string, number>();
  for (const g of account.storage ?? []) {
    const id = g.dimensions?.databaseId;
    const bytes = g.max?.databaseSizeBytes;
    if (id && typeof bytes === 'number' && !bancos.has(id)) bancos.set(id, bytes);
  }
  return {
    estado: 'ok',
    geradoEm: now.toISOString(),
    dias: [...days.values()],
    workers: [...workers.values()].sort((a, b) => b.pedidos - a.pedidos),
    bancos: [...bancos.entries()].map(([id, bytes]) => ({ nome: DATABASE_NAMES[id] ?? id.slice(0, 8), bytes })).sort((a, b) => b.bytes - a.bytes),
  };
}

const empty = (estado: 'sem-token' | 'fora', now: Date): CloudflareReport => ({ estado, geradoEm: now.toISOString(), dias: [], workers: [], bancos: [] });

/** Quem lê, com a resposta guardada 5 min por instância: abrir a tela de novo não gasta outro pedido. */
export function cloudflareReader(deps: Deps): (fresh: boolean) => Promise<CloudflareReport> {
  const KEEP_MS = 5 * 60_000;
  /** O "Atualizar" passa por cima, no máximo uma vez por minuto. */
  const FRESH_AFTER_MS = 60_000;
  let cached: { at: number; report: CloudflareReport } | null = null;
  let dimension = 0;

  return async (fresh) => {
    const now = deps.now();
    const { token, account } = deps.cloudflare?.keys ?? { token: '', account: '' };
    if (!token || !account) return empty('sem-token', now);
    if (cached) {
      const age = now.getTime() - cached.at;
      if (age < (fresh ? FRESH_AFTER_MS : KEEP_MS)) return cached.report;
    }
    const upstream = deps.cloudflare?.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));
    const variables = { account, from: utcDay(new Date(now.getTime() - DAY_MS)), to: utcDay(now), fromTime: `${utcDay(new Date(now.getTime() - DAY_MS))}T00:00:00Z`, toTime: now.toISOString() };
    for (; dimension < TIME_DIMENSIONS.length; dimension++) {
      const name = TIME_DIMENSIONS[dimension]!;
      let body: { data?: { viewer?: { accounts?: GraphQLAccount[] } } | null; errors?: unknown[] | null };
      try {
        const res = await upstream(GRAPHQL_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query(name), variables }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          deps.log?.(`uso das APIs: a Cloudflare respondeu ${res.status}`);
          return empty('fora', now);
        }
        body = (await res.json()) as typeof body;
      } catch (error) {
        deps.log?.(`uso das APIs: a Cloudflare não respondeu (${error instanceof Error ? error.name : 'erro'})`);
        return empty('fora', now);
      }
      const data = body.data?.viewer?.accounts?.[0];
      if (!body.errors?.length && data) {
        const report = reportFrom(data, name, now);
        cached = { at: now.getTime(), report };
        return report;
      }
      // esta dimensão não existe nesta consulta (ou a conta não apareceu): tenta a seguinte
      const first = body.errors?.[0] as { message?: unknown } | undefined;
      deps.log?.(`uso das APIs: a Cloudflare recusou a consulta por ${name} (${String(first?.message ?? 'sem a conta na resposta').slice(0, 160)})`);
    }
    dimension = 0;
    return empty('fora', now);
  };
}
