import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { write } from './quota';

/**
 * A carência do aparelho (PLANO-COFRE.md, 17.23): o aparelho que abriu o cofre com o Google e a passkey
 * abre de novo, por 24 horas, só com a senha mestra.
 *
 * Ao abrir com a passkey, a página sorteia um token e uma chave G, sela a chave do meio M com G e manda o
 * envelope e o token junto da prova da senha; aqui ficam só o hash do token e o envelope. Para abrir pela
 * carência, o aparelho manda o token: o servidor confere o prazo, os erros e se a carência está ligada, e
 * devolve o envelope com uma sessão de entrada que já tem a marca do segundo fator. G nunca sai do
 * aparelho: quem levar o banco não abre o envelope, e quem levar o aparelho ainda depende do servidor
 * (que corta pelo prazo, pelos erros, pelo desligar, pelo "Trancar todos" e pelo congelar).
 *
 * Abrir pela carência não renova o prazo: só o Google e a passkey de novo.
 */
export const GRACE_MS = 24 * 3_600_000;
/** Erros de senha pela carência até ela parar de valer (o aparelho volta a pedir o Google e a passkey). */
export const GRACE_MAX_ERRORS = 3;
/** Quantas carências uma conta tem ao mesmo tempo (uma por aparelho; a mais velha sai). */
export const MAX_GRACES = 10;

/** O token do aparelho: 32 bytes em base64url, como os das sessões. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A carência acabou (prazo, erros, desligada, encerrada): a página esquece o que guardou e pede o Google. */
export const graceEnded = () => new HttpError(401, 'carencia-invalida', 'A carência deste aparelho acabou. Entre com o Google e a passkey.');

/** As carências de uma conta saem todas (desligar, trancar todos, congelar, tirar um aparelho). */
export function dropGracesStatement(userId: string): Statement {
  return { sql: 'DELETE FROM cofre_carencias WHERE usuario_id = ?', params: [userId] };
}

/**
 * A pessoa saiu do Murall ("Sair" ou "Sair de todos os aparelhos", pela `MuralRpc`): a carência de todos
 * os aparelhos da conta acaba, porque sair da conta não deixa nada que abra o cofre (a regra do CLAUDE.md).
 * O Murall não sabe que aparelho é qual no cofre (outra origem, outro token), então saem todas. Grava como
 * sessão: vale também no modo só leitura, como trancar.
 */
export async function endGraces(deps: Deps, userId: string): Promise<void> {
  await write(deps, [dropGracesStatement(userId)], 15, { session: true });
}

/** A condição, em SQL, de uma carência que ainda vale (o id e a hora de agora vêm nos parâmetros). */
export const GRACE_VALID = 'EXISTS (SELECT 1 FROM cofre_carencias WHERE id = ? AND expira_em > ? AND erros < ' + GRACE_MAX_ERRORS + ')';

export interface NewGrace {
  id: string;
  hash: string;
  envelope: Uint8Array;
}

/**
 * Grava a carência nova deste aparelho: tira as vencidas da conta, a que o aparelho tinha antes (pelo hash
 * do token de antes) e as mais velhas além do limite, e põe a nova (conta 5 linhas: a linha e 4 índices).
 */
export function graceStatements(userId: string, code: string, grace: NewGrace, previousHash: string | null, device: string | null, now: Date): Statement[] {
  const at = now.toISOString();
  return [
    { sql: 'DELETE FROM cofre_carencias WHERE usuario_id = ? AND (expira_em <= ? OR hash = ?)', params: [userId, at, previousHash ?? ''] },
    {
      sql: 'DELETE FROM cofre_carencias WHERE usuario_id = ? AND id NOT IN (SELECT id FROM cofre_carencias WHERE usuario_id = ? ORDER BY criada_em DESC LIMIT ?)',
      params: [userId, userId, MAX_GRACES - 1],
    },
    {
      sql: 'INSERT INTO cofre_carencias (id, usuario_id, hash, codigo, envelope, aparelho, criada_em, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [grace.id, userId, grace.hash, code, grace.envelope, device, at, new Date(now.getTime() + GRACE_MS).toISOString()],
    },
  ];
}
