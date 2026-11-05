import { Deps } from '../ports';

/**
 * O admin (PLANO-ADMIN-APIS.md, seção 9): só leitura, e a trava de verdade é em `routes/admin.ts`. A lista
 * é de ids, não de códigos: o código é público e dá para trocar, e quem ficasse com o antigo viraria admin.
 */
export function isAdmin(deps: Deps, userId: string): boolean {
  return deps.config.adminUsers.includes(userId);
}
