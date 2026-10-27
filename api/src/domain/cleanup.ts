import { Deps } from '../ports';
import { eraseDue } from './erase';
import { DAY_MS, utcDay } from './quota';

/**
 * A limpeza diária: sessões vencidas, atividades com mais de 90 dias, o uso de mais de 30 dias
 * atrás, os freios e os seguir desfeitos de mais de um dia (o "Desfazer" vale por 10 minutos), e as contas
 * marcadas para sair cuja hora passou (ver `domain/erase.ts`). Na Cloudflare roda pelo Cron Trigger; no Node, por um intervalo (ver `src/entry/`).
 */
/** Quem tem alguma chave viva que lê o espelho (um parâmetro: agora). */
const READERS = `SELECT usuario_id FROM api_chaves WHERE expira_em > ? AND escopos LIKE '%"notas:ler"%'`;

export async function cleanup(deps: Deps): Promise<void> {
  if (deps.config.mode !== 'ligado') return;
  const now = deps.now();
  // direto no banco, fora da cota (`write`): a limpeza tem de rodar mesmo num dia sem cota
  await deps.db.batch([
    { sql: 'DELETE FROM sessoes WHERE expira_em < ?', params: [now.toISOString()] },
    { sql: 'DELETE FROM atividades WHERE criado_em < ?', params: [new Date(now.getTime() - 90 * DAY_MS).toISOString()] },
    { sql: 'DELETE FROM uso_diario WHERE dia < ?', params: [utcDay(new Date(now.getTime() - 30 * DAY_MS))] },
    { sql: 'DELETE FROM seguindo_desfeito WHERE desfeito_em < ?', params: [new Date(now.getTime() - DAY_MS).toISOString()] },
    { sql: 'DELETE FROM freios WHERE criado_em < ?', params: [new Date(now.getTime() - DAY_MS).toISOString()] },
    // os pedidos para ligar o Google Agenda que ninguém terminou (valem 15 minutos)
    { sql: 'DELETE FROM agenda_pedidos WHERE criado_em < ?', params: [new Date(now.getTime() - DAY_MS).toISOString()] },
    // as chaves de API vencidas há mais de 30 dias (até lá, a lista mostra "venceu", para a pessoa entender)
    { sql: 'DELETE FROM api_chaves WHERE expira_em < ?', params: [new Date(now.getTime() - 30 * DAY_MS).toISOString()] },
    // o espelho de quem não tem mais nenhuma chave viva que lê as Anotações (PLANO-API.md, 8.1)
    { sql: `DELETE FROM api_espelho WHERE usuario_id NOT IN (${READERS})`, params: [now.toISOString()] },
    { sql: `DELETE FROM api_espelho_estado WHERE usuario_id NOT IN (${READERS})`, params: [now.toISOString()] },
    // os pedidos que ninguém aplicou (nem aprovou) a tempo; os resolvidos há mais de 30 dias
    {
      sql: "UPDATE api_pedidos SET estado = 'expirado', resolvido_em = ? WHERE estado IN ('pendente', 'aguardando-aprovacao') AND expira_em <= ?",
      params: [now.toISOString(), now.toISOString()],
    },
    { sql: 'DELETE FROM api_pedidos WHERE resolvido_em IS NOT NULL AND resolvido_em < ?', params: [new Date(now.getTime() - 30 * DAY_MS).toISOString()] },
  ]);
  await eraseDue(deps);
}
