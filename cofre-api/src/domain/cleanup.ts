import { Deps } from '../ports';
import { DAY_MS, utcDay } from './quota';

/** Quanto tempo um item fica na lixeira antes de os dados irem embora (16.5). */
export const TRASH_DAYS = 30;
/** Quanto tempo o histórico guarda (8.5). */
export const HISTORY_DAYS = 90;

/**
 * A limpeza diária (16.4), pelo Cron Trigger do Worker: sessões e desafios vencidos, o histórico de mais
 * de 90 dias, os freios e o uso de dias que já não contam, o freio da senha esquecido, e os itens com
 * mais de 30 dias na lixeira.
 *
 * O item da lixeira vira lápide: os dados cifrados são apagados, mas a linha fica com o id e a versão,
 * porque o manifesto cifrado ainda o lista e o servidor não pode mudar o manifesto. A página tira a
 * lápide no próximo salvamento (`DELETE /api/cofre/lixeira/:id`, ver `routes/items.ts`).
 *
 * Direto no banco, fora da cota: a limpeza tem de rodar mesmo num dia sem cota.
 */
export async function cleanup(deps: Deps): Promise<void> {
  if (deps.config.mode === 'desligado') return;
  const now = deps.now();
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  await deps.db.batch([
    { sql: 'DELETE FROM cofre_sessoes WHERE expira_em <= ?', params: [now.toISOString()] },
    { sql: 'DELETE FROM cofre_desafios WHERE expira_em <= ?', params: [now.toISOString()] },
    { sql: 'DELETE FROM cofre_eventos WHERE em < ?', params: [ago(HISTORY_DAYS)] },
    { sql: 'DELETE FROM freios WHERE criado_em < ?', params: [ago(2)] },
    { sql: 'DELETE FROM uso_diario WHERE dia < ?', params: [utcDay(new Date(ago(30)))] },
    // a espera do freio da senha que passou há mais de 2 dias (a mais longa é de 1 dia) não conta mais
    { sql: 'DELETE FROM cofre_freio_senha WHERE espera_ate < ?', params: [ago(2)] },
    { sql: 'UPDATE cofre_itens SET dados = ? WHERE na_lixeira_desde < ? AND length(dados) > 0', params: [new Uint8Array(0), ago(TRASH_DAYS)] },
  ]);
}
