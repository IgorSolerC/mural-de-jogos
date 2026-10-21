import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { currentPepper } from '../secrets';
import { hex, hmac, utf8 } from './bytes';
import { utcDay } from './quota';

/**
 * Os freios (9.3 e 16.6): cada tentativa fica anotada na tabela `freios`, pela conta ou pelo IP, e
 * continua contando mesmo quando dá errado. O freio nunca tranca para sempre: ele só faz esperar.
 *
 * O IP nunca é guardado em claro: vira um HMAC com uma chave do dia, derivada da pimenta (um secret
 * fora do banco). Quem levar o banco não consegue voltar dele para o IP, e o mesmo IP em dias
 * diferentes vira chaves diferentes.
 */
export type BrakeAction = 'entrar' | 'desafio' | 'erro-senha' | 'recuperar';

/** O limite de cada ação: quantas vezes numa janela de tempo, por IP (antes do login) e por conta. */
export const LIMITS: Record<BrakeAction, { ip?: number; account: number; windowMs: number }> = {
  // 30 entradas por hora por IP (16.6), e por conta
  entrar: { ip: 30, account: 30, windowMs: 3_600_000 },
  // 30 desafios de passkey por hora por conta (9.3)
  desafio: { account: 30, windowMs: 3_600_000 },
  // os erros de senha têm o freio próprio (password-brake.ts); aqui só a contagem do dia
  'erro-senha': { account: 20, windowMs: 86_400_000 },
  // o código de recuperação tem 128 bits (adivinhar é impossível), mas 10 tentativas por dia bastam
  recuperar: { account: 10, windowMs: 86_400_000 },
};

/** A chave do freio de um IP: `ip:` + HMAC(chave do dia, IP). */
export async function ipKey(deps: Deps, ip: string): Promise<string> {
  const pepper = currentPepper(deps.secrets);
  const dayKey = await hmac(pepper.key, utf8(`cofre-v1 ip ${utcDay(deps.now())}`));
  return `ip:${hex(await hmac(dayKey, utf8(ip))).slice(0, 32)}`;
}

export function accountKey(userId: string): string {
  return `conta:${userId}`;
}

/** Quantas vezes `key` fez `action` dentro da janela. */
export async function countRecent(deps: Deps, key: string, action: BrakeAction): Promise<number> {
  const since = new Date(deps.now().getTime() - LIMITS[action].windowMs).toISOString();
  const row = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM freios WHERE chave = ? AND acao = ? AND criado_em > ?', [key, action, since]);
  return row?.n ?? 0;
}

/** Recusa (429) se `key` já chegou ao limite. */
export async function assertUnderLimit(deps: Deps, key: string, action: BrakeAction, limit: number): Promise<void> {
  if ((await countRecent(deps, key, action)) >= limit) {
    throw new HttpError(429, 'muitas-tentativas', 'Muitas tentativas seguidas. Espere um pouco e tente de novo.');
  }
}

/** A anotação de mais uma vez (conta 2 linhas na cota: a linha e o índice). */
export function brakeStatement(key: string, action: BrakeAction, now: Date): Statement {
  return { sql: 'INSERT INTO freios (chave, acao, criado_em) VALUES (?, ?, ?)', params: [key, action, now.toISOString()] };
}
