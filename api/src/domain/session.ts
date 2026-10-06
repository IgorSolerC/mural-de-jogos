import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { write } from './quota';

const DAY = 86_400_000;
/** Uma sessão vale 90 dias, renovados enquanto a pessoa usa. */
export const SESSION_DAYS = 90;
/** Logins guardados por conta: um novo além disso tira o usado há mais tempo. */
export const MAX_SESSIONS = 10;

export interface Session {
  hash: string;
  userId: string;
  usedAt: string;
}

/** Token aleatório de 32 bytes em base64url: vai para o site; no banco fica só o hash. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** As gravações que criam uma sessão (e tiram as mais antigas além de MAX_SESSIONS). */
export function sessionStatements(hash: string, userId: string, device: string | null, now: Date): Statement[] {
  const at = now.toISOString();
  return [
    {
      sql: 'INSERT INTO sessoes (hash, usuario_id, criada_em, usada_em, expira_em, aparelho) VALUES (?, ?, ?, ?, ?, ?)',
      params: [hash, userId, at, at, new Date(now.getTime() + SESSION_DAYS * DAY).toISOString(), device],
    },
    {
      sql:
        'DELETE FROM sessoes WHERE usuario_id = ? AND hash IN ' +
        '(SELECT hash FROM sessoes WHERE usuario_id = ? ORDER BY usada_em DESC, criada_em DESC LIMIT -1 OFFSET ?)',
      params: [userId, userId, MAX_SESSIONS],
    },
  ];
}

const invalid = () => new HttpError(401, 'sessao-invalida', 'Sua sessão acabou. Entre de novo para usar a nuvem.');

/**
 * Quem está chamando, pelo `Authorization: Bearer <token>`. Uma sessão usada há mais de um dia é
 * renovada (mais 90 dias), no máximo uma gravação por dia por aparelho; se a cota do dia acabou,
 * a renovação fica para depois sem atrapalhar.
 */
export async function authenticate(deps: Deps, header: string | undefined): Promise<Session> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  if (!match) throw invalid();
  const hash = await hashToken(match[1]!);
  const row = await deps.db.first<{ usuario_id: string; usada_em: string; expira_em: string }>(
    'SELECT usuario_id, usada_em, expira_em FROM sessoes WHERE hash = ?',
    [hash],
  );
  const now = deps.now();
  if (!row || Date.parse(row.expira_em) <= now.getTime()) throw invalid();
  if (now.getTime() - Date.parse(row.usada_em) > DAY && deps.config.mode === 'ligado') {
    try {
      await write(
        deps,
        [
          {
            sql: 'UPDATE sessoes SET usada_em = ?, expira_em = ? WHERE hash = ?',
            params: [now.toISOString(), new Date(now.getTime() + SESSION_DAYS * DAY).toISOString(), hash],
          },
        ],
        2,
      );
    } catch {
      /* sem cota hoje: a sessão continua valendo até a data que já tinha */
    }
  }
  return { hash, userId: row.usuario_id, usedAt: row.usada_em };
}
