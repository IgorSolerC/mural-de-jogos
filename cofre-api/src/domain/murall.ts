import { Db, Statement } from '../ports';

/**
 * O que o cofre diz ao Murall quando a pessoa pede para apagar a conta de lá (ameaça 23 do plano, 8.6).
 * O cofre mora no id da conta do Murall: apagada a conta, a mesma pessoa entraria de novo numa conta
 * nova, e o cofre ficaria para trás, sem como abrir. Por isso o Murall pergunta antes (`temCofre` da
 * `MuralRpc`): com cofre, a conta só sai depois de 7 dias com aviso, ou na hora depois de a pessoa
 * apagar o cofre lá dentro (o que pede o cofre aberto). Quando a conta sai, o cofre vai junto
 * (`apagarCofre`).
 */

/** As tabelas com o que é de uma conta, na ordem em que saem (a conta por último). */
export const VAULT_TABLES = ['cofre_itens', 'cofre_carencias', 'cofre_envelopes', 'cofre_credenciais', 'cofre_desafios', 'cofre_freio_senha', 'cofre_eventos', 'cofre_sessoes', 'cofre_contas'] as const;

/** A conta tem cofre? Nada de dentro dele, nem quando ou onde foi aberto. */
export async function hasVault(db: Db, userId: string): Promise<boolean> {
  return (await db.first('SELECT 1 AS um FROM cofre_contas WHERE usuario_id = ?', [userId])) !== null;
}

/** As gravações que tiram tudo o que é da conta no cofre. */
export function eraseVaultStatements(userId: string): Statement[] {
  return VAULT_TABLES.map((t) => ({ sql: `DELETE FROM ${t} WHERE usuario_id = ?`, params: [userId] }));
}
