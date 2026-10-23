/**
 * As cores do selo de cada senha (o quadradinho com a letra ou o ícone): as cartolinas do Murall, mais o
 * vermelho, o cinza e o preto (as mesmas cartolinas do Murall). Sem escolha, a cor sai do nome, só entre
 * as seis primeiras (sempre a mesma para a mesma senha; as outras entraram depois, no fim, para nenhuma
 * mudar); escolhida, vai dentro do item cifrado.
 */
export const CORES_DO_SELO = [
  { id: 'amarelo', label: 'Amarelo' },
  { id: 'azul', label: 'Azul' },
  { id: 'verde', label: 'Verde' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'laranja', label: 'Laranja' },
  { id: 'lilas', label: 'Lilás' },
  { id: 'vermelho', label: 'Vermelho', sorteavel: false },
  { id: 'cinza', label: 'Cinza', sorteavel: false },
  { id: 'preto', label: 'Preto', sorteavel: false },
] as const;
export type CorDoSelo = (typeof CORES_DO_SELO)[number]['id'];

/** O id é de uma cor do selo? */
export function ehCorDoSelo(id: unknown): id is CorDoSelo {
  return CORES_DO_SELO.some((c) => c.id === id);
}
