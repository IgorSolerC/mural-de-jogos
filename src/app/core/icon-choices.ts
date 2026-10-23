import { CARTELA_DE_ICONES, ehIconeDaCartela, type IdDoIcone } from '../../../shared/cartela-de-icones';

/**
 * Os desenhos que a pessoa escolhe para um grupo das anotações (a orelha e a aba) e para uma coluna
 * do Kanban: a mesma cartela nos dois lugares, na mesma ordem, e a mesma das senhas do cofre. Ela mora
 * em `shared/cartela-de-icones.ts` (os ids, os nomes e os desenhos): toda escolha de ícone sai de lá.
 *
 * Os ids ficam guardados (nas configurações do mural e nos quadros), então nunca mudam de nome nem de
 * sentido; desenho novo entra no fim. Antes eram duas cartelas (35 dos grupos, 20 das colunas, com
 * cinco ids nas duas); a de agora é a soma, e todo id de antes continua valendo.
 */
export const ICON_CHOICES: readonly IdDoIcone[] = CARTELA_DE_ICONES.map((i) => i.id);
export type IconChoice = IdDoIcone;

/** O id é de um desenho da cartela? */
export function isIconChoice(id: unknown): id is IconChoice {
  return ehIconeDaCartela(id);
}
