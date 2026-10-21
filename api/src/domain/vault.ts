import { Db } from '../ports';

/**
 * O que a API do Murall diz ao cofre de senhas (PLANO-COFRE.md, 16.13). O cofre é outro Worker, que
 * chama a classe `CofreRpc` (em `src/entry/worker.ts`) por service binding: ela não tem endereço
 * público, e só o Worker do cofre, ligado a ela no wrangler.toml dele, consegue chamar.
 *
 * Só o mínimo: o id e o código da conta, nunca o nome, o mural ou a sessão.
 */
export async function accountByGoogle(db: Db, sub: string): Promise<{ id: string; codigo: string } | null> {
  if (typeof sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(sub)) return null;
  return db.first<{ id: string; codigo: string }>('SELECT id, codigo FROM usuarios WHERE google_sub = ?', [sub]);
}
