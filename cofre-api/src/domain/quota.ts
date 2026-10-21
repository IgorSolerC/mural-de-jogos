import { HttpError } from '../errors';
import { Deps, Statement, StatementResult } from '../ports';

/**
 * A cota própria de gravações, como a da API do Murall (`api/src/domain/quota.ts`): o D1 grátis
 * permite 100 mil linhas gravadas por dia na conta inteira, e o cofre para bem antes
 * (`COTA_LINHAS_DIA`), com uma resposta que a página entende, em vez de deixar o D1 começar a falhar.
 * Quem chama diz quantas linhas espera mudar, já contando os índices.
 */

/** O dia UTC (`2026-10-21`): a virada é à meia-noite UTC, 21h em Brasília. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Um dia, em milissegundos. */
export const DAY_MS = 86_400_000;

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

/** Recusa se o cofre não está aceitando gravações agora. */
export function assertWritable(deps: Deps): void {
  if (deps.config.mode === 'desligado') throw offline();
  if (deps.config.mode === 'so-leitura') throw readOnly();
}

export function offline(): HttpError {
  return new HttpError(503, 'cofre-desligado', 'O cofre está desligado agora.');
}

export function readOnly(): HttpError {
  return new HttpError(503, 'cofre-so-leitura', 'O cofre está só para leitura agora: dá para abrir e ver, não para mudar.');
}

/**
 * Grava `statements` de uma vez, contando `estimatedRows` na cota do dia. Se a cota não comporta,
 * nada é gravado. A própria anotação do uso entra no mesmo lote (e conta uma linha).
 */
export async function write(deps: Deps, statements: Statement[], estimatedRows: number): Promise<StatementResult[]> {
  assertWritable(deps);
  const cost = Math.max(0, Math.ceil(estimatedRows)) + 1;
  const usage = await usageToday(deps);
  if (usage.rowsWritten + cost > deps.config.dailyRowBudget) {
    throw new HttpError(503, 'cota-diaria', 'O cofre chegou ao limite de gravações de hoje. Tente de novo depois das 21h (meia-noite UTC).');
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
