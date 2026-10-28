import { HttpError } from '../errors';
import { Deps } from '../ports';
import { Bytes, blob, fromBase64url, sameBytes } from './bytes';
import { consumeChallenge } from './challenge';
import { eventStatement } from './events';
import { proofHash } from './proofs';
import { write } from './quota';
import { Session } from './session';
import { AssertionInput, WebAuthnError, verifyAssertion } from './webauthn';

/**
 * Confirmar de novo, no servidor, quem está com o cofre aberto, antes do que pode trancar o dono fora ou
 * apagar o cofre: trocar a senha, pôr e tirar aparelhos, gerar um código de recuperação novo e apagar o
 * cofre (decisão do usuário numa revisão, 28/10). Só o token da sessão do cofre (roubado) não basta mais:
 * o pedido traz em `confirmar` uma de duas provas.
 *
 * - **A passkey**: `{ desafio, assinatura }`, uma assinatura nova de uma passkey do cofre, com a
 *   verificação do usuário, sobre o desafio de `POST /api/cofre/confirmar` (uso único, 5 minutos). Vale
 *   para todo aparelho, com PRF ou no modo servidor: aqui só a assinatura conta.
 * - **A senha mestra**: `{ kAuth }`, a mesma prova de abrir. É a saída de quem não tem passkey à mão (o
 *   cofre aberto pelo código de recuperação, com o aparelho perdido): sem ela, essa pessoa não poria um
 *   aparelho novo nem geraria o código novo, e ficaria trancada fora na próxima vez.
 *
 * Os erros da senha aqui contam num freio da sessão (`MAX_PASSWORD_ERRORS` por cofre aberto), e não no
 * freio de abrir: senão, quem tem só o token gastaria os 20 erros do dia e o dono não abriria o cofre.
 * Cada erro entra no histórico como "Senha errada". Nenhuma recusa daqui é 401, que tranca a página.
 */

/** Quantos erros da senha mestra cada cofre aberto pode ter ao confirmar de novo. */
export const MAX_PASSWORD_ERRORS = 5;

const missing = () =>
  new HttpError(403, 'falta-confirmar', 'Confirme de novo com a passkey ou com a senha mestra. Se a página não pediu, recarregue-a e abra o cofre de novo.');
const invalid = (detail: string) => new HttpError(400, 'pedido-invalido', `confirmar: ${detail}.`);

/** A chave do freio da senha deste cofre aberto, na tabela `freios`. */
export function sessionKey(session: Pick<Session, 'hash'>): string {
  return `sessao:${session.hash}`;
}

/**
 * Confere uma assinatura de uma passkey da conta sobre `challenge` (os bytes do desafio já gasto) e sobe o
 * contador dela. Devolve o id da passkey; o que não confere é 400 `passkey-invalida`.
 */
export async function verifyPasskey(deps: Deps, userId: string, challenge: Bytes, raw: unknown): Promise<string> {
  const { config } = deps;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const assertion: AssertionInput = {
    id: r['id'] as string,
    clientDataJSON: r['clientDataJSON'] as string,
    authenticatorData: r['authenticatorData'] as string,
    signature: r['signature'] as string,
  };
  const rejected = (detail: string) => new HttpError(400, 'passkey-invalida', `A passkey não foi aceita (${detail}).`);
  if (typeof assertion.id !== 'string' || assertion.id.length > 1400) throw rejected('outra passkey');
  const credential = await deps.db.first<{ id: string; chave_publica: Uint8Array | ArrayBuffer | number[]; contador_assinatura: number }>(
    'SELECT id, chave_publica, contador_assinatura FROM cofre_credenciais WHERE id = ? AND usuario_id = ?',
    [assertion.id, userId],
  );
  if (!credential) throw rejected('esta passkey não é do seu cofre');
  let signCount: number;
  try {
    ({ signCount } = await verifyAssertion(assertion, {
      challenge,
      origin: config.origin,
      rpId: config.rpId,
      credentialId: credential.id,
      publicKey: blob(credential.chave_publica),
      storedSignCount: credential.contador_assinatura,
    }));
  } catch (e) {
    if (e instanceof WebAuthnError) throw rejected(e.message);
    throw e;
  }
  // o contador só sobe: a conferência acima leu o guardado antes, e duas assinaturas ao mesmo tempo
  // (5 e 6 sobre 4) passariam as duas, com a última a gravar podendo pôr 5 depois de 6. Gravado à parte
  // e com a condição no banco, a que chega depois de uma maior é recusada como a que não sobe.
  const [counted] = await write(
    deps,
    [
      {
        sql: 'UPDATE cofre_credenciais SET contador_assinatura = ?, usado_em = ? WHERE id = ? AND (contador_assinatura < ? OR (? = 0 AND contador_assinatura = 0))',
        params: [signCount, deps.now().toISOString(), credential.id, signCount, signCount],
      },
    ],
    2,
    { session: true },
  );
  if (counted?.changes !== 1) throw rejected('o contador da passkey voltou (pode ser uma cópia)');
  return credential.id;
}

/**
 * Exige a confirmação de agora em `body.confirmar` (veja acima). Quem chama confere o resto do pedido
 * antes: a confirmação é gasta aqui (o desafio, ou uma tentativa da senha), e o que falhar depois pede
 * outra.
 */
export async function reconfirm(deps: Deps, session: Session, body: Record<string, unknown>, country: string | null): Promise<void> {
  const raw = body['confirmar'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw missing();
  const proof = raw as Record<string, unknown>;
  if (proof['assinatura'] !== undefined) {
    const challenge = await consumeChallenge(deps, proof['desafio'], session.userId, 'assinatura');
    await verifyPasskey(deps, session.userId, challenge, proof['assinatura']);
    await write(deps, [eventStatement(session.userId, 'passkey-usada', deps.now(), session.device, country)], 3, { session: true });
    return;
  }
  if (proof['kAuth'] === undefined) throw missing();
  const kAuth = typeof proof['kAuth'] === 'string' ? fromBase64url(proof['kAuth']) : null;
  if (!kAuth || kAuth.length !== 32) throw invalid('a prova da senha tem o formato ou o tamanho errado');
  await passwordAttempt(deps, session, kAuth, country);
}

/**
 * Uma tentativa da senha mestra: conta como erro antes de conferir, na mesma gravação que olha o limite
 * (tentativas ao mesmo tempo não passam juntas do freio), e quem acerta desfaz a conta.
 */
async function passwordAttempt(deps: Deps, session: Session, kAuth: Bytes, country: string | null): Promise<void> {
  const key = sessionKey(session);
  const now = deps.now();
  const at = now.toISOString();
  const tooMany = () =>
    new HttpError(429, 'confirmar-limite', `A senha mestra errou ${MAX_PASSWORD_ERRORS} vezes neste cofre aberto. Tranque e abra o cofre de novo, ou confirme com a passkey.`);
  const counted = await deps.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM freios WHERE chave = ? AND acao = 'confirmar-senha'", [key]);
  if ((counted?.n ?? 0) >= MAX_PASSWORD_ERRORS) throw tooMany();
  const [added] = await write(
    deps,
    [
      {
        sql: "INSERT INTO freios (chave, acao, criado_em) SELECT ?, 'confirmar-senha', ? WHERE (SELECT COUNT(*) FROM freios WHERE chave = ? AND acao = 'confirmar-senha') < ?",
        params: [key, at, key, MAX_PASSWORD_ERRORS],
      },
    ],
    2,
    { session: true },
  );
  if (added?.changes !== 1) throw tooMany();
  const account = await deps.db.first<{ auth_hash: Uint8Array | ArrayBuffer | number[]; auth_pimenta: number }>(
    'SELECT auth_hash, auth_pimenta FROM cofre_contas WHERE usuario_id = ?',
    [session.userId],
  );
  const ok = account !== null && sameBytes((await proofHash(deps, 'auth', kAuth, account.auth_pimenta)).hash, blob(account.auth_hash));
  if (!ok) {
    await write(deps, [eventStatement(session.userId, 'erro-senha', now, session.device, country)], 3, { session: true });
    throw new HttpError(403, 'senha-errada', 'A senha mestra não confere.');
  }
  await write(
    deps,
    [
      {
        sql: "DELETE FROM freios WHERE rowid = (SELECT rowid FROM freios WHERE chave = ? AND acao = 'confirmar-senha' AND criado_em = ? LIMIT 1)",
        params: [key, at],
      },
    ],
    2,
    { session: true },
  );
}
