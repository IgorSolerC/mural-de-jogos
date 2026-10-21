import { Statement } from '../ports';

/** O que entra no histórico de 90 dias (8.5). Nunca dado do cofre: só o que aconteceu, quando e onde. */
export type EventKind =
  | 'cofre-criado'
  | 'aberto'
  | 'aberto-com-codigo'
  | 'erro-senha'
  | 'passkey-usada'
  | 'codigo-usado'
  | 'aparelho-posto'
  | 'aparelho-tirado'
  | 'senha-trocada'
  | 'codigo-trocado'
  | 'todos-trancados';

/** Uma linha do histórico (conta 3 linhas na cota: a linha, a chave e o índice). */
export function eventStatement(userId: string, kind: EventKind, now: Date, device: string | null, country: string | null): Statement {
  return {
    sql: 'INSERT INTO cofre_eventos (usuario_id, tipo, em, aparelho, pais) VALUES (?, ?, ?, ?, ?)',
    params: [userId, kind, now.toISOString(), device, country],
  };
}
