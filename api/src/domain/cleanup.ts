import { CLIENTE_SEM_USO_MS, DIAS_DA_RENOVACAO } from '../../../contrato/api-v1/oauth';
import { Deps } from '../ports';
import { eraseDue } from './erase';
import { dropLoose, finishHalfSent, recountStatements } from './image';
import { SCOPES_OF_AREA, TYPES_OF } from './mirror';
import { DAY_MS, utcDay } from './quota';

/**
 * A limpeza diária: sessões vencidas, atividades com mais de 90 dias, o uso de mais de 30 dias
 * atrás, os freios e os seguir desfeitos de mais de um dia (o "Desfazer" vale por 10 minutos), e as contas
 * marcadas para sair cuja hora passou (ver `domain/erase.ts`), e as imagens (ver `domain/image.ts`). Na Cloudflare roda pelo Cron Trigger; no Node, por um intervalo (ver `src/entry/`).
 */
/** Quem tem alguma chave viva que alcança uma área, por qualquer uma das permissões dela (um parâmetro: agora). */
const readers = (scopes: readonly string[]) =>
  `SELECT usuario_id FROM api_chaves WHERE expira_em > ? AND (${scopes.map((s) => `escopos LIKE '%"${s}"%'`).join(' OR ')})`;

export async function cleanup(deps: Deps): Promise<void> {
  if (deps.config.mode !== 'ligado') return;
  const now = deps.now();
  // Cada parte roda mesmo se a de antes falhou (as contas marcadas saem mesmo se a faxina falhar). Todo
  // erro vai para o log, e no fim a limpeza falha com eles: o Cron Trigger fica marcado como falho, em vez
  // de um erro de uma parte sumir atrás do da outra.
  const failed: unknown[] = [];
  const steps: [string, () => Promise<void>][] = [
    ['a faxina do dia', () => housekeeping(deps, now)],
    ['as contas marcadas', () => eraseDue(deps)],
    ['as imagens', () => images(deps, now)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.error(`limpeza: ${name} falhou`, error);
      failed.push(error);
    }
  }
  if (failed.length === 1) throw failed[0];
  if (failed.length > 1) throw new AggregateError(failed, `A limpeza falhou em ${failed.length} partes.`);
}

/**
 * As imagens (PLANO-IMAGENS.md): as que ficaram no meio do envio há mais de um dia (os bytes chegaram ou
 * não), as que nenhuma anotação usa há mais de 30 dias, e a conta de quanto cada um guarda refeita a
 * partir de `imagens`, depois das contas que saíram.
 */
async function images(deps: Deps, now: Date): Promise<void> {
  await finishHalfSent(deps, now);
  await dropLoose(deps, now);
  await deps.db.batch(recountStatements());
}

/** A faxina de cada dia, direto no banco e fora da cota (`write`): ela tem de rodar mesmo num dia sem cota. */
async function housekeeping(deps: Deps, now: Date): Promise<void> {
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
    // o espelho de cada área de quem não tem mais nenhuma chave viva que a lê (PLANO-API.md, 8.1); o
    // estado sai quando nenhuma área fica
    ...Object.entries(TYPES_OF).map(([area, types]) => ({
      sql: `DELETE FROM api_espelho WHERE tipo IN (${types.map(() => '?').join(', ')}) AND usuario_id NOT IN (${readers(SCOPES_OF_AREA[area]!)})`,
      params: [...types, now.toISOString()],
    })),
    {
      sql: `DELETE FROM api_espelho_estado WHERE ${Object.values(SCOPES_OF_AREA)
        .map((scopes) => `usuario_id NOT IN (${readers(scopes)})`)
        .join(' AND ')}`,
      params: Object.values(SCOPES_OF_AREA).map(() => now.toISOString()),
    },
    // os pedidos que ninguém aplicou (nem aprovou) a tempo; os resolvidos há mais de 30 dias
    {
      sql: "UPDATE api_pedidos SET estado = 'expirado', resolvido_em = ? WHERE estado IN ('pendente', 'aguardando-aprovacao') AND expira_em <= ?",
      params: [now.toISOString(), now.toISOString()],
    },
    { sql: 'DELETE FROM api_pedidos WHERE resolvido_em IS NOT NULL AND resolvido_em < ?', params: [new Date(now.getTime() - 30 * DAY_MS).toISOString()] },
    // o OAuth dos conectores: pedidos e códigos vencidos; clientes (registrados ou por documento) que nunca
    // foram autorizados em 24 horas; a autorização cujo código ninguém trocou em um dia; o conector sem renovar há 90 dias
    { sql: 'DELETE FROM oauth_pedidos WHERE expira_em < ?', params: [now.toISOString()] },
    { sql: 'DELETE FROM oauth_codigos WHERE expira_em < ?', params: [now.toISOString()] },
    {
      sql: 'DELETE FROM oauth_clientes WHERE usado_em IS NULL AND criado_em < ?',
      params: [new Date(now.getTime() - CLIENTE_SEM_USO_MS).toISOString()],
    },
    {
      sql: "DELETE FROM api_chaves WHERE origem = 'oauth' AND ((renovada_em IS NULL AND criada_em < ?) OR renovada_em < ?)",
      params: [new Date(now.getTime() - DAY_MS).toISOString(), new Date(now.getTime() - DIAS_DA_RENOVACAO * DAY_MS).toISOString()],
    },
  ]);
}
