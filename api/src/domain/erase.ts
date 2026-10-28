import { HttpError } from '../errors';
import { Deps } from '../ports';
import { revokeAgenda } from './agenda';
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
/**
 * Os avisos de resposta entre outras pessoas nas fichas de uma conta que vai embora (um parâmetro, o id):
 * eles levam o código dela e o título da ficha, e a resposta que apontam sai junto. O resumo que não é
 * JSON não quebra a limpeza (o `json_extract` dele daria erro).
 */
const ANSWERS_ON =
  "SELECT id FROM atividades WHERE tipo = 'respondeu' AND " +
  "(CASE WHEN json_valid(resumo) THEN json_extract(resumo, '$.comentario') END) IN (SELECT id FROM comentarios WHERE dono_id = ?)";
/** Quantos apagados de cima (o lugar de um comentário que tinha respostas) a limpeza ainda olha, no máximo. */
const MAX_GONE_PARENTS = 200;

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

/**
 * Tira a marca de apagar. Fora da cota, como marcar: num dia sem cota, o "Não apagar" recusado deixaria a
 * conta (e o cofre) sair de vez na limpeza seguinte.
 */
export async function cancelErase(deps: Deps, userId: string): Promise<void> {
  await write(deps, [{ sql: 'UPDATE usuarios SET apagar_em = NULL WHERE id = ? AND apagar_em IS NOT NULL', params: [userId] }], 3, { ignoreBudget: true });
}

/** Apaga a conta e tudo dela (o cofre antes, se ela tiver um; sem cofre, o que sobrar lá depois, `sweepVault`). */
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
      '(SELECT COUNT(*) FROM api_chaves WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM oauth_codigos WHERE chave_id IN (SELECT id FROM api_chaves WHERE usuario_id = ?)) + ' +
      '(SELECT COUNT(*) FROM api_espelho WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM api_pedidos WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM notas WHERE dono_id = ?) + ' +
      `(SELECT COUNT(*) FROM nota_membros WHERE usuario_id = ? OR nota_id IN (${NOTES_OF})) + ` +
      // as anotações dos outros que mudam de versão, a agenda e o estado do espelho
      '(SELECT COUNT(*) FROM nota_membros WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM agenda_pedidos WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM agenda_google WHERE usuario_id = ?) + ' +
      '(SELECT COUNT(*) FROM api_espelho_estado WHERE usuario_id = ?) + ' +
      `(SELECT COUNT(*) FROM atividades WHERE id IN (${ANSWERS_ON})) AS n`,
    [id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id],
  );
  // o lugar de comentário apagado (de outra pessoa) que ficava só por causa de uma resposta dela: sai
  // depois, como quando a resposta sai sozinha (ver routes/comments.ts)
  const parents = await deps.db.all<{ resposta_a: string }>(
    'SELECT DISTINCT resposta_a FROM comentarios WHERE autor_id = ? AND resposta_a IS NOT NULL LIMIT ?',
    [id, MAX_GONE_PARENTS],
  );
  // a permissão do Google Agenda volta ao Google (antes de a apagar daqui, senão não há como)
  const agenda = await deps.db.first<{ refresh: string }>('SELECT refresh FROM agenda_google WHERE usuario_id = ?', [id]);
  if (agenda) await revokeAgenda(deps, agenda.refresh);
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
      // os avisos de resposta entre outras pessoas nas fichas dela (antes: eles se acham pelo comentário)
      { sql: `DELETE FROM atividades WHERE id IN (${ANSWERS_ON})`, params: [id] },
      // os comentários que a pessoa escreveu e os das fichas dela, com as reações deles (antes: elas se acham pelo comentário)
      { sql: `DELETE FROM comentario_reacoes WHERE autor_id = ? OR comentario_id IN (${COMMENTS_OF})`, params: [id, id, id] },
      { sql: 'DELETE FROM comentarios WHERE autor_id = ? OR dono_id = ?', params: [id, id] },
      { sql: 'DELETE FROM freios WHERE usuario_id = ?', params: [id] },
      // as chaves de API e os conectores (PLANO-API.md)
      { sql: 'DELETE FROM oauth_codigos WHERE chave_id IN (SELECT id FROM api_chaves WHERE usuario_id = ?)', params: [id] },
      { sql: 'DELETE FROM api_chaves WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM api_espelho WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM api_espelho_estado WHERE usuario_id = ?', params: [id] },
      { sql: 'DELETE FROM api_pedidos WHERE usuario_id = ?', params: [id] },
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
  await dropGoneParents(deps, parents.map((p) => p.resposta_a));
  if (!vault) await sweepVault(deps, id);
}

/**
 * Sem cofre, a conta sai na hora, mas o cofre ainda pode ter algo do id dela: a sessão de entrada (até 20
 * minutos, a de criar) com que a pessoa ainda criaria um cofre preso a uma conta que não existe mais, ou
 * um cofre criado entre a pergunta e o apagar. Com a conta já fora (ninguém entra mais no cofre com ela),
 * o cofre leva o que tiver dela. Se ele não responder, a conta já saiu: fica só a linha no log.
 */
async function sweepVault(deps: Deps, id: string): Promise<void> {
  if (!deps.vault) return;
  try {
    await deps.vault.erase(id);
  } catch (error) {
    console.error(`apagar a conta: o cofre não levou o que sobrou dela (${error instanceof Error ? error.message : 'erro'})`);
  }
}

/**
 * Os apagados de cima que ficaram sem resposta nenhuma saem, e os de cima deles também, enquanto não
 * sobra resposta (a mesma subida do apagar um comentário). A conta já saiu: um erro aqui só deixa um
 * lugar vazio na conversa, sem nada dela.
 */
async function dropGoneParents(deps: Deps, ids: string[]): Promise<void> {
  try {
    for (let up of ids) {
      for (let depth = 0; up && depth < MAX_GONE_PARENTS; depth++) {
        const p = await deps.db.first<{ id: string; apagado: number; resposta_a: string | null }>('SELECT id, apagado, resposta_a FROM comentarios WHERE id = ?', [up]);
        if (!p?.apagado || (await deps.db.first('SELECT 1 AS x FROM comentarios WHERE resposta_a = ? LIMIT 1', [p.id]))) break;
        await write(deps, [{ sql: 'DELETE FROM comentarios WHERE id = ?', params: [p.id] }], 2, { ignoreBudget: true });
        up = p.resposta_a ?? '';
      }
    }
  } catch (error) {
    console.error(`apagar a conta: o lugar de um comentário apagado ficou (${error instanceof Error ? error.message : 'erro'})`);
  }
}

/**
 * A limpeza diária: as contas cuja hora de sair passou, uma por vez (o cofre de uma que falha não
 * segura as outras; ela fica para amanhã).
 */
export async function eraseDue(deps: Deps): Promise<void> {
  const now = deps.now().toISOString();
  const due = await deps.db.all<{ id: string }>('SELECT id FROM usuarios WHERE apagar_em IS NOT NULL AND apagar_em <= ? ORDER BY apagar_em LIMIT 50', [now]);
  for (const { id } of due) {
    try {
      const vault = await hasVault(deps, id);
      // o "Não apagar" que chegou enquanto a limpeza andava (perguntar ao cofre leva tempo) ainda vale
      if (!(await deps.db.first('SELECT 1 AS x FROM usuarios WHERE id = ? AND apagar_em IS NOT NULL AND apagar_em <= ?', [id, now]))) continue;
      await eraseAccount(deps, id, vault);
    } catch (error) {
      console.error(`apagar a conta marcada falhou: ${error instanceof Error ? error.message : 'erro'}`);
    }
  }
}
