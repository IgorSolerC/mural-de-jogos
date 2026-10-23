import { HttpError } from '../errors';
import { Deps } from '../ports';
import { DAY_MS, write } from './quota';

/**
 * Apagar a conta (o `DELETE /v1/eu` e a limpeza diária). Com cofre de senhas, a conta não sai na hora
 * (ameaça 23 do PLANO-COFRE.md): quem roubou o token do Murall apagaria o cofre junto, ou o deixaria
 * para trás, preso ao id da conta que sumiu. Ela fica marcada para sair em `ERASE_DAYS` dias, com o
 * aviso no site e o Cancelar; na hora, só depois de a pessoa apagar o cofre lá dentro (o que pede o
 * cofre aberto). Quando a conta sai, o cofre vai antes: se ele falhar, a conta fica para a próxima vez.
 */

/** Quantos dias a conta com cofre espera para sair. */
export const ERASE_DAYS = 7;

/** Os comentários de uma conta que vai embora: os que ela escreveu e os das fichas dela (dois parâmetros, o id duas vezes). */
const COMMENTS_OF = 'SELECT id FROM comentarios WHERE autor_id = ? OR dono_id = ?';
/** As anotações compartilhadas de uma conta que vai embora (um parâmetro, o id). */
const NOTES_OF = 'SELECT id FROM notas WHERE dono_id = ?';

const vaultDown = () => new HttpError(503, 'cofre-indisponivel', 'Não consegui falar com o cofre de senhas agora. Tente apagar a conta daqui a pouco.');

/** A conta tem cofre? Sem o cofre ligado (nos testes, ou no Node), não. Sem resposta dele, 503: na dúvida, não apaga. */
export async function hasVault(deps: Deps, userId: string): Promise<boolean> {
  if (!deps.vault) return false;
  try {
    return (await deps.vault.has(userId)) === true;
  } catch {
    throw vaultDown();
  }
}

/** Marca a conta para sair daqui a `ERASE_DAYS` dias (pedir de novo não adia) e devolve quando. */
export async function scheduleErase(deps: Deps, userId: string): Promise<string> {
  const at = new Date(deps.now().getTime() + ERASE_DAYS * DAY_MS).toISOString();
  await write(deps, [{ sql: 'UPDATE usuarios SET apagar_em = COALESCE(apagar_em, ?) WHERE id = ?', params: [at, userId] }], 3, { ignoreBudget: true });
  const row = await deps.db.first<{ apagar_em: string | null }>('SELECT apagar_em FROM usuarios WHERE id = ?', [userId]);
  return row?.apagar_em ?? at;
}

/** Tira a marca de apagar. */
export async function cancelErase(deps: Deps, userId: string): Promise<void> {
  await write(deps, [{ sql: 'UPDATE usuarios SET apagar_em = NULL WHERE id = ? AND apagar_em IS NOT NULL', params: [userId] }], 3);
}

/** Apaga a conta e tudo dela (o cofre antes, se ela tiver um). */
export async function eraseAccount(deps: Deps, id: string, vault = false): Promise<void> {
  if (vault) {
    try {
      await deps.vault!.erase(id);
    } catch {
      throw vaultDown();
    }
  }
  const counts = await deps.db.first<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM sessoes WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM seguindo WHERE seguidor_id = ? OR seguido_id = ?) + ' +
      '(SELECT COUNT(*) FROM seguindo_desfeito WHERE seguidor_id = ? OR seguido_id = ?) + ' +
      '(SELECT COUNT(*) FROM atividades WHERE autor_id = ? OR alvo_id = ?) + ' +
      '(SELECT COUNT(*) FROM reacoes WHERE autor_id = ? OR dono_id = ?) + ' +
      '(SELECT COUNT(*) FROM comentarios WHERE autor_id = ? OR dono_id = ?) + ' +
      `(SELECT COUNT(*) FROM comentario_reacoes WHERE autor_id = ? OR comentario_id IN (${COMMENTS_OF})) + ` +
      '(SELECT COUNT(*) FROM freios WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM notas WHERE dono_id = ?) + ' +
      `(SELECT COUNT(*) FROM nota_membros WHERE usuario_id = ? OR nota_id IN (${NOTES_OF})) AS n`,
    [id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id],
  );
  await write(
    deps,
    [
      { sql: 'DELETE FROM sessoes WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM murais WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM murais_publicos WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM seguindo WHERE seguidor_id = ? OR seguido_id = ?', params: [id, id] },
      { sql: 'DELETE FROM seguindo_desfeito WHERE seguidor_id = ? OR seguido_id = ?', params: [id, id] },
      { sql: 'DELETE FROM atividades WHERE autor_id = ? OR alvo_id = ?', params: [id, id] },
      { sql: 'DELETE FROM reacoes WHERE autor_id = ? OR dono_id = ?', params: [id, id] },
      // os comentários que a pessoa escreveu e os das fichas dela, com as reações deles (antes: elas se acham pelo comentário)
      { sql: `DELETE FROM comentario_reacoes WHERE autor_id = ? OR comentario_id IN (${COMMENTS_OF})`, params: [id, id, id] },
      { sql: 'DELETE FROM comentarios WHERE autor_id = ? OR dono_id = ?', params: [id, id] },
      { sql: 'DELETE FROM freios WHERE usuario_id = ?', params: [id] },
      // a permissão do Google Agenda guardada (a do Google mesmo, a pessoa tira lá)
      { sql: 'DELETE FROM agenda_google WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM agenda_pedidos WHERE usuario_id = ?', params: [id] },
      // as anotações compartilhadas: as dela somem para todos; nas dos outros, ela sai (e eles veem a lista nova)
      { sql: 'UPDATE notas SET versao = versao + 1 WHERE id IN (SELECT nota_id FROM nota_membros WHERE usuario_id = ?)', params: [id] },
      { sql: `DELETE FROM atividades WHERE tipo = 'compartilhou' AND ref IN (${NOTES_OF})`, params: [id] },
      { sql: `DELETE FROM nota_membros WHERE usuario_id = ? OR nota_id IN (${NOTES_OF})`, params: [id, id] },
      { sql: 'DELETE FROM notas WHERE dono_id = ?', params: [id] },
      { sql: 'DELETE FROM usuarios WHERE id = ?', params: [id] },
    ],
    3 * ((counts?.n ?? 0) + 3),
    { ignoreBudget: true },
  );
}

/**
 * A limpeza diária: as contas cuja hora de sair passou, uma por vez (o cofre de uma que falha não
 * segura as outras; ela fica para amanhã).
 */
export async function eraseDue(deps: Deps): Promise<void> {
  const due = await deps.db.all<{ id: string }>('SELECT id FROM usuarios WHERE apagar_em IS NOT NULL AND apagar_em <= ? LIMIT 50', [deps.now().toISOString()]);
  for (const { id } of due) {
    try {
      await eraseAccount(deps, id, await hasVault(deps, id));
    } catch (error) {
      console.error(`apagar a conta marcada falhou: ${error instanceof Error ? error.message : 'erro'}`);
    }
  }
}
