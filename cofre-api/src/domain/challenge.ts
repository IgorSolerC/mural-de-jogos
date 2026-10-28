import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { Bytes, blob } from './bytes';
import { write } from './quota';

/** Os desafios do WebAuthn (seção 6.5): 32 bytes sorteados, uso único, valem 2 minutos. */
export type ChallengeKind = 'registro' | 'assinatura';

export const CHALLENGE_MS = 2 * 60_000;

/**
 * Quanto vale o desafio de confirmar de novo (`POST /api/cofre/confirmar`): a pessoa confirma antes e o
 * pedido sai depois, e no meio pode vir o registro de um aparelho novo (que tem o desafio dele, de 2
 * minutos).
 */
export const CONFIRM_CHALLENGE_MS = 5 * 60_000;

/** Um desafio novo para a conta (e o apagar dos vencidos dela, no mesmo lote). Contam 4 linhas. */
export function newChallenge(userId: string, kind: ChallengeKind, now: Date, ttlMs = CHALLENGE_MS): { id: string; challenge: Bytes; statements: Statement[] } {
  const id = crypto.randomUUID();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  return {
    id,
    challenge,
    statements: [
      { sql: 'DELETE FROM cofre_desafios WHERE usuario_id = ? AND expira_em <= ?', params: [userId, now.toISOString()] },
      {
        sql: 'INSERT INTO cofre_desafios (id, usuario_id, tipo, desafio, expira_em) VALUES (?, ?, ?, ?, ?)',
        params: [id, userId, kind, challenge, new Date(now.getTime() + ttlMs).toISOString()],
      },
    ],
  };
}

const invalidChallenge = () => new HttpError(400, 'desafio-invalido', 'O pedido da passkey venceu ou já foi usado. Tente de novo.');

/**
 * Tira o desafio do banco e devolve os bytes dele. Vale uma vez só: o DELETE é o que decide (dois
 * pedidos com o mesmo desafio ao mesmo tempo, só um apaga a linha). Vencido, de outra conta ou de outro
 * tipo, nem conta como usado: simplesmente não existe.
 */
export async function consumeChallenge(deps: Deps, id: unknown, userId: string, kind: ChallengeKind): Promise<Bytes> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw invalidChallenge();
  const now = deps.now().toISOString();
  const row = await deps.db.first<{ desafio: Uint8Array | ArrayBuffer | number[] }>(
    'SELECT desafio FROM cofre_desafios WHERE id = ? AND usuario_id = ? AND tipo = ? AND expira_em > ?',
    [id, userId, kind, now],
  );
  if (!row) throw invalidChallenge();
  const [deleted] = await write(deps, [{ sql: 'DELETE FROM cofre_desafios WHERE id = ?', params: [id] }], 2, { session: true });
  if (deleted?.changes !== 1) throw invalidChallenge();
  return blob(row.desafio);
}
