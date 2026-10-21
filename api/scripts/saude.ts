/**
 * A checagem diária da nuvem (roda no GitHub Actions, `.github/workflows/saude.yml`).
 *
 * 1. A API responde? `GET /v1/status`, e a cota própria de gravações do dia. Com COFRE_URL, também a
 *    API do cofre de senhas (`GET /api/status`, PLANO-COFRE.md 16.7).
 * 2. Com o token de leitura da Cloudflare: quanto do plano gratuito foi usado ontem e hoje (pedidos
 *    aos Workers, linhas lidas e gravadas no D1, tamanho de cada banco). Os limites de pedidos e de
 *    linhas valem para a conta toda, então o Murall e o cofre somam; o de tamanho é por banco.
 *
 * Termina com erro (e o GitHub manda e-mail) se a API não responde ou se algum número passou de 70%
 * do gratuito. Nada aqui grava em lugar nenhum: o token só precisa de "Account Analytics: Read".
 *
 * Variáveis: CF_ANALYTICS_TOKEN e CF_ACCOUNT_ID (sem elas, só a API é conferida), API_URL,
 * D1_DATABASE_ID e WORKER_NAME (os padrões são os de produção), e COFRE_URL (vazio: o cofre ainda
 * não está no ar; o id do D1 dele vem de cofre-api/wrangler.toml).
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** O plano Workers Free (por dia UTC, menos o tamanho do banco). */
export const FREE = {
  workerRequests: 100_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
  d1DatabaseBytes: 500 * 1024 * 1024,
} as const;

/** A partir daqui, avisa. */
export const ALERT = 0.7;

export interface Status {
  modo: string;
  dia: string;
  linhasGravadas: number;
  cotaLinhas: number;
}

export interface DayUsage {
  day: string;
  workerRequests: number;
  workerErrors: number;
  d1RowsRead: number;
  d1RowsWritten: number;
}

export interface Usage {
  days: DayUsage[];
  /** O tamanho de cada banco (null: a Cloudflare não disse). */
  databases: { name: string; bytes: number | null }[];
}

/** Uma API conferida: o que o status dela respondeu, ou o erro. */
export interface Checked {
  name: string;
  status: Status | null;
  error: string | null;
}

export interface Report {
  /** Algum motivo para o e-mail: a checagem falha. */
  problems: string[];
  /** Vale saber, mas não falha (a nuvem desligada de propósito, por exemplo). */
  notes: string[];
  /** A tabela para o resumo da execução. */
  lines: string[];
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1).replace('.', ',')}%`;
const int = (n: number) => n.toLocaleString('pt-BR');

/** Lê o que veio de `/v1/status`; null se não é o que a API manda. */
export function parseStatus(data: unknown): Status | null {
  if (!data || typeof data !== 'object') return null;
  const s = data as Record<string, unknown>;
  if (typeof s['modo'] !== 'string' || typeof s['dia'] !== 'string') return null;
  if (typeof s['linhasGravadas'] !== 'number' || typeof s['cotaLinhas'] !== 'number') return null;
  return { modo: s['modo'], dia: s['dia'], linhasGravadas: s['linhasGravadas'], cotaLinhas: s['cotaLinhas'] };
}

export function evaluate(apis: Checked[], usage: Usage | null, usageError: string | null): Report {
  const problems: string[] = [];
  const notes: string[] = [];
  const lines: string[] = [];

  for (const { name, status, error } of apis) {
    if (!status) {
      problems.push(`A API ${name} não respondeu direito: ${error ?? 'resposta inesperada'}.`);
      continue;
    }
    lines.push(`| Modo da API ${name} | ${status.modo} | |`);
    if (status.modo !== 'ligado') notes.push(`A API ${name} está em modo "${status.modo}".`);
    if (status.cotaLinhas > 0) {
      lines.push(`| Cota própria de gravações ${name} (${status.dia}) | ${int(status.linhasGravadas)} de ${int(status.cotaLinhas)} | ${pct(status.linhasGravadas, status.cotaLinhas)} |`);
      if (status.linhasGravadas >= status.cotaLinhas * ALERT) {
        problems.push(`As gravações de hoje na API ${name} já passaram de ${ALERT * 100}% da cota própria (${int(status.linhasGravadas)} de ${int(status.cotaLinhas)}).`);
      }
    } else {
      notes.push(`A cota própria da API ${name} está zerada: ela não grava nada.`);
    }
  }

  if (usage) {
    for (const d of usage.days) {
      const rows: [string, number, number][] = [
        ['Pedidos aos Workers', d.workerRequests, FREE.workerRequests],
        ['Linhas lidas no D1', d.d1RowsRead, FREE.d1RowsRead],
        ['Linhas gravadas no D1', d.d1RowsWritten, FREE.d1RowsWritten],
      ];
      for (const [label, used, free] of rows) {
        lines.push(`| ${label} (${d.day}) | ${int(used)} de ${int(free)} | ${pct(used, free)} |`);
        if (used >= free * ALERT) problems.push(`${label} em ${d.day}: ${int(used)}, ${pct(used, free)} do gratuito.`);
      }
      if (d.workerRequests > 0 && d.workerErrors / d.workerRequests > 0.05 && d.workerErrors >= 20) {
        problems.push(`O Worker falhou em ${int(d.workerErrors)} de ${int(d.workerRequests)} pedidos em ${d.day}.`);
      }
    }
    for (const { name, bytes } of usage.databases) {
      if (bytes === null) continue;
      const mb = (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
      lines.push(`| Tamanho do banco ${name} | ${mb} MB de 500 MB | ${pct(bytes, FREE.d1DatabaseBytes)} |`);
      if (bytes >= FREE.d1DatabaseBytes * ALERT) problems.push(`O banco ${name} já tem ${mb} MB, ${pct(bytes, FREE.d1DatabaseBytes)} do gratuito.`);
    }
  } else if (usageError) {
    problems.push(`Não consegui ler o uso na Cloudflare: ${usageError}.`);
  } else {
    notes.push('Sem CF_ANALYTICS_TOKEN: só a API foi conferida, não o uso do plano gratuito.');
  }

  return { problems, notes, lines };
}

/** AAAA-MM-DD em UTC, `back` dias atrás. */
export function utcDay(now: Date, back = 0): string {
  return new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

const QUERY = `query Uso($account: string!, $script: string!, $db: string!, $from: Date!, $to: Date!, $fromTime: Time!, $toTime: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: 10000, filter: { scriptName: $script, datetime_geq: $fromTime, datetime_lt: $toTime }) {
        sum { requests errors }
        dimensions { datetime }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { databaseId: $db, date_geq: $from, date_leq: $to }) {
        sum { rowsRead rowsWritten }
        dimensions { date }
      }
      storage: d1StorageAdaptiveGroups(limit: 1, filter: { databaseId: $db, date_geq: $from, date_leq: $to }, orderBy: [date_DESC]) {
        max { databaseSizeBytes }
        dimensions { date }
      }
    }
  }
}`;

interface GraphQLAccount {
  workers?: { sum?: { requests?: number; errors?: number }; dimensions?: { datetime?: string } }[];
  d1?: { sum?: { rowsRead?: number; rowsWritten?: number }; dimensions?: { date?: string } }[];
  storage?: { max?: { databaseSizeBytes?: number } }[];
}

/** Junta as respostas da Cloudflare por dia (os grupos podem vir picados), de um Worker e um banco. */
export function usageFrom(account: GraphQLAccount, days: string[], name: string): Usage {
  const byDay = new Map(days.map((day) => [day, { day, workerRequests: 0, workerErrors: 0, d1RowsRead: 0, d1RowsWritten: 0 }]));
  for (const g of account.workers ?? []) {
    const d = byDay.get((g.dimensions?.datetime ?? '').slice(0, 10));
    if (!d) continue;
    d.workerRequests += g.sum?.requests ?? 0;
    d.workerErrors += g.sum?.errors ?? 0;
  }
  for (const g of account.d1 ?? []) {
    const d = byDay.get(g.dimensions?.date ?? '');
    if (!d) continue;
    d.d1RowsRead += g.sum?.rowsRead ?? 0;
    d.d1RowsWritten += g.sum?.rowsWritten ?? 0;
  }
  const size = account.storage?.[0]?.max?.databaseSizeBytes;
  return { days: [...byDay.values()], databases: [{ name, bytes: typeof size === 'number' ? size : null }] };
}

/** O uso da conta: os pedidos e as linhas somados por dia (o limite é da conta), cada banco à parte. */
export function sumUsage(parts: Usage[]): Usage {
  const byDay = new Map<string, DayUsage>();
  for (const part of parts) {
    for (const d of part.days) {
      const sum = byDay.get(d.day) ?? { day: d.day, workerRequests: 0, workerErrors: 0, d1RowsRead: 0, d1RowsWritten: 0 };
      sum.workerRequests += d.workerRequests;
      sum.workerErrors += d.workerErrors;
      sum.d1RowsRead += d.d1RowsRead;
      sum.d1RowsWritten += d.d1RowsWritten;
      byDay.set(d.day, sum);
    }
  }
  return { days: [...byDay.values()], databases: parts.flatMap((p) => p.databases) };
}

/** O id do D1 no wrangler.toml (null se ainda é o de mentira, antes do `wrangler d1 create`). */
export function databaseIdOf(toml: string): string | null {
  const id = /^database_id = "([0-9a-f-]{36})"$/m.exec(toml)?.[1];
  return id && !/^[0-]+$/.test(id) ? id : null;
}

async function readStatus(url: string): Promise<{ status: Status | null; error: string | null }> {
  let last = 'sem resposta';
  // a primeira chamada do dia pode pegar o Worker frio: três tentativas
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) last = `HTTP ${res.status}`;
      else {
        const status = parseStatus(await res.json());
        return status ? { status, error: null } : { status: null, error: 'resposta sem os campos esperados' };
      }
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 5_000));
  }
  return { status: null, error: last };
}

async function readUsage(token: string, account: string, script: string, db: string, name: string, now: Date): Promise<Usage> {
  const days = [utcDay(now, 1), utcDay(now)];
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        account,
        script,
        db,
        from: days[0],
        to: days[1],
        fromTime: `${days[0]}T00:00:00Z`,
        toTime: now.toISOString(),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { viewer?: { accounts?: GraphQLAccount[] } }; errors?: { message?: string }[] | null };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message ?? '?').join('; '));
  const acc = body.data?.viewer?.accounts?.[0];
  if (!acc) throw new Error('a conta não apareceu na resposta (confira CF_ACCOUNT_ID e o token)');
  return usageFrom(acc, days, name);
}

async function main(): Promise<void> {
  const env = process.env;
  const api = (env['API_URL'] || 'https://mural-api.igorsoler.workers.dev').replace(/\/+$/, '');
  const cofre = (env['COFRE_URL'] ?? '').replace(/\/+$/, '');
  const token = env['CF_ANALYTICS_TOKEN'] ?? '';
  const account = env['CF_ACCOUNT_ID'] ?? '';
  const now = new Date();

  const apis: Checked[] = [{ name: 'do Murall', ...(await readStatus(`${api}/v1/status`)) }];
  if (cofre) apis.push({ name: 'do cofre', ...(await readStatus(`${cofre}/api/status`)) });

  const targets = [{ script: env['WORKER_NAME'] || 'mural-api', db: env['D1_DATABASE_ID'] || 'c2c789d6-f0f3-4f37-b53a-f049aa02a530', name: 'mural' }];
  const cofreDb = cofre ? databaseIdOf(readFileSync(new URL('../../cofre-api/wrangler.toml', import.meta.url), 'utf8')) : null;
  if (cofreDb) targets.push({ script: 'cofre-api', db: cofreDb, name: 'cofre' });
  let usage: Usage | null = null;
  let usageError: string | null = null;
  if (token && account) {
    try {
      usage = sumUsage(await Promise.all(targets.map((t) => readUsage(token, account, t.script, t.db, t.name, now))));
    } catch (e) {
      usageError = e instanceof Error ? e.message : String(e);
    }
  }

  const report = evaluate(apis, usage, usageError);
  if (cofre && !cofreDb) report.problems.push('O cofre está no ar, mas cofre-api/wrangler.toml ainda não tem o id do D1 dele.');
  const out = [
    `## Saúde da nuvem, ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    report.problems.length ? `**${report.problems.length === 1 ? 'Um problema' : `${report.problems.length} problemas`}:**` : '**Tudo certo.**',
    ...report.problems.map((p) => `- ${p}`),
    ...(report.notes.length ? ['', ...report.notes.map((n) => `- ${n}`)] : []),
    '',
    '| O quê | Uso | Do gratuito |',
    '| --- | --- | --- |',
    ...report.lines,
    '',
  ].join('\n');
  console.log(out);
  if (env['GITHUB_STEP_SUMMARY']) appendFileSync(env['GITHUB_STEP_SUMMARY'], out);
  if (report.problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
