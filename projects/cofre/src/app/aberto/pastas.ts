import type { ItemNaLista } from '../../core/itens';
import { nomeDoItem } from './monograma';

/** Um texto para comparar sem maiúsculas nem acentos. */
export const simples = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Uma pasta da lista: as senhas de um grupo, já em ordem. A chave é o nome sem acento nem maiúscula ('' é Sem grupo). */
export interface Pasta {
  readonly chave: string;
  readonly nome: string;
  readonly itens: readonly ItemNaLista[];
}

/**
 * Os grupos do cofre, em ordem alfabética, um por nome (Bancos e bancos são o mesmo grupo). Vale a
 * grafia da senha mudada por último, para que corrigir o nome numa senha já mostre o certo.
 */
export function gruposDoCofre(itens: readonly ItemNaLista[]): string[] {
  const nomes = new Map<string, { nome: string; quando: string }>();
  for (const { item } of itens) {
    if (!item?.grupo) continue;
    const chave = simples(item.grupo);
    const visto = nomes.get(chave);
    if (!visto || item.mudadoEm > visto.quando) nomes.set(chave, { nome: item.grupo, quando: item.mudadoEm });
  }
  return [...nomes.values()].map((n) => n.nome).sort((a, b) => simples(a).localeCompare(simples(b), 'pt-BR'));
}

/**
 * As senhas em pastas, uma por grupo em ordem alfabética, e as sem grupo por último; dentro de cada
 * pasta, pelo nome. `grupos` é a lista de `gruposDoCofre` (de todas as senhas, não só das achadas),
 * para a pasta ter o mesmo nome com ou sem busca. Pasta vazia não aparece.
 */
export function emPastas(itens: readonly ItemNaLista[], grupos: readonly string[]): Pasta[] {
  const porNome = (a: ItemNaLista, b: ItemNaLista) => simples(nomeDoItem(a.item!)).localeCompare(simples(nomeDoItem(b.item!)), 'pt-BR');
  const pastas = [...grupos.map((nome) => ({ chave: simples(nome), nome })), { chave: '', nome: 'Sem grupo' }].map((p) => ({
    ...p,
    itens: itens.filter((i) => simples(i.item!.grupo) === p.chave).sort(porNome),
  }));
  return pastas.filter((p) => p.itens.length);
}
