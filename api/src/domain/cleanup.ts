import { Deps } from '../ports';
import { utcDay } from './quota';

const DAY = 86_400_000;

/**
 * A limpeza diária: sessões vencidas, atividades com mais de 90 dias e o uso de mais de 30 dias
 * atrás. Na Cloudflare roda pelo Cron Trigger; no Node, por um intervalo (ver `src/entry/`).
 */
export async function cleanup(deps: Deps): Promise<void> {
  if (deps.config.mode !== 'ligado') return;
  const now = deps.now();
  await deps.db.batch([
    { sql: 'DELETE FROM sessoes WHERE expira_em < ?', params: [now.toISOString()] },
    { sql: 'DELETE FROM atividades WHERE criado_em < ?', params: [new Date(now.getTime() - 90 * DAY).toISOString()] },
    { sql: 'DELETE FROM uso_diario WHERE dia < ?', params: [utcDay(new Date(now.getTime() - 30 * DAY))] },
  ]);
}
