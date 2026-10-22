import { Db, Deps } from '../ports';

/**
 * O que a API do Murall diz ao cofre de senhas (PLANO-COFRE.md, 16.13). O cofre é outro Worker, que
 * chama a classe `CofreRpc` (em `src/entry/worker.ts`) por service binding: ela não tem endereço
 * público, e só o Worker do cofre, ligado a ela no wrangler.toml dele, consegue chamar.
 *
 * Só o mínimo: o id e o código da conta, nunca o nome, o mural ou a sessão.
 */
/**
 * O caminho de volta (16.13): o Murall pergunta ao cofre se a conta pode usá-lo (se o código está em
 * COFRE_CODIGOS), para mostrar a aba "Cofre" nas Anotações só a quem pode. Nunca diz se a conta já tem
 * cofre nem nada de dentro dele. Se o cofre não responder, a aba some: o /v1/eu nunca quebra por isso.
 */
export async function vaultAllowed(deps: Deps, code: string): Promise<boolean> {
  if (!deps.vault) return false;
  try {
    return (await deps.vault.canUse(code)) === true;
  } catch {
    return false;
  }
}

export async function accountByGoogle(db: Db, sub: string): Promise<{ id: string; codigo: string } | null> {
  if (typeof sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(sub)) return null;
  return db.first<{ id: string; codigo: string }>('SELECT id, codigo FROM usuarios WHERE google_sub = ?', [sub]);
}
