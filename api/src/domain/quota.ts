import { HttpError } from '../errors';
import { Deps, Statement, StatementResult } from '../ports';

/**
 * A cota própria de gravações. O plano gratuito do D1 permite 100 mil linhas gravadas por dia; a API
 * para bem antes (`COTA_LINHAS_DIA`, 60 mil no wrangler.toml), com uma resposta que o site entende,
 * em vez de deixar o D1 começar a falhar. Leituras não passam por aqui: elas são baratas e limitadas
 * pelos índices.
 *
 * A conta é uma estimativa feita antes de gravar (quem chama diz quantas linhas espera mudar, já
 * contando os índices). O uso real de cada dia é conferido pela verificação diária, na análise da
 * Cloudflare.
 */

/** O dia UTC (`2026-10-06`): a virada é à meia-noite UTC, 21h em Brasília. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface Usage {
  day: string;
  rowsWritten: number;
  writes: number;
}

export async function usageToday(deps: Deps): Promise<Usage> {
  const day = utcDay(deps.now());
  const row = await deps.db.first<{ linhas_gravadas: number; gravacoes: number }>(
    'SELECT linhas_gravadas, gravacoes FROM uso_diario WHERE dia = ?',
    [day],
  );
  return { day, rowsWritten: row?.linhas_gravadas ?? 0, writes: row?.gravacoes ?? 0 };
}

/** Recusa se a nuvem não está aceitando gravações agora. */
export function assertWritable(deps: Deps): void {
  if (deps.config.mode === 'desligado') throw offline();
  if (deps.config.mode === 'so-leitura') {
    throw new HttpError(503, 'nuvem-so-leitura', 'A nuvem está só para leitura agora. O seu mural continua salvo neste aparelho.');
  }
}

export function offline(): HttpError {
  return new HttpError(503, 'nuvem-desligada', 'A nuvem está desligada agora. O seu mural continua salvo neste aparelho.');
}

/**
 * Grava `statements` de uma vez, contando `estimatedRows` na cota do dia. Se a cota não comporta,
 * nada é gravado. A própria anotação do uso entra no mesmo lote (e conta uma linha).
 */
export async function write(
  deps: Deps,
  statements: Statement[],
  estimatedRows: number,
  options: { ignoreBudget?: boolean } = {},
): Promise<StatementResult[]> {
  assertWritable(deps);
  const cost = Math.max(0, Math.ceil(estimatedRows)) + 1;
  const usage = await usageToday(deps);
  // `ignoreBudget`: só para apagar a conta, que não pode esperar o dia virar (o uso é anotado do mesmo jeito)
  if (!options.ignoreBudget && usage.rowsWritten + cost > deps.config.dailyRowBudget) {
    throw new HttpError(
      503,
      'cota-diaria',
      'A nuvem chegou ao limite de hoje. O seu mural continua salvo neste aparelho e sobe depois das 21h (meia-noite UTC).',
    );
  }
  const results = await deps.db.batch([
    ...statements,
    {
      sql:
        'INSERT INTO uso_diario (dia, linhas_gravadas, gravacoes) VALUES (?, ?, 1) ' +
        'ON CONFLICT (dia) DO UPDATE SET linhas_gravadas = linhas_gravadas + excluded.linhas_gravadas, gravacoes = gravacoes + 1',
      params: [usage.day, cost],
    },
  ]);
  return results.slice(0, statements.length);
}
