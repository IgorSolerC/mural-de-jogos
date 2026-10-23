import { type ItemNaLista, type JeitoDoGrupo, SEM_JEITO } from '../../core/itens';
import { nomeDoItem } from './monograma';

/** Um texto para comparar sem maiúsculas nem acentos. */
export const simples = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Uma pasta da lista: as senhas de um grupo, já em ordem, e o jeito dele. A chave é o nome sem acento nem maiúscula ('' é Sem grupo). */
export interface Pasta {
  readonly chave: string;
  readonly nome: string;
  readonly jeito: JeitoDoGrupo;
  readonly itens: readonly ItemNaLista[];
}

/** A senha mudada por último de cada grupo (pela chave): é dela o nome e o jeito do grupo. */
function ultimaDeCadaGrupo(itens: readonly ItemNaLista[]): Map<string, NonNullable<ItemNaLista['item']>> {
  const ultimas = new Map<string, NonNullable<ItemNaLista['item']>>();
  for (const { item } of itens) {
    if (!item?.grupo) continue;
    const chave = simples(item.grupo);
    const vista = ultimas.get(chave);
    if (!vista || item.mudadoEm > vista.mudadoEm) ultimas.set(chave, item);
  }
  return ultimas;
}

/**
 * O ícone e a cor de cada grupo (pela chave). Vão em todas as senhas do grupo; se divergirem (vindo de
 * outro aparelho no meio de uma mudança), vale o da senha mudada por último, como o nome.
 */
export function jeitosDosGrupos(itens: readonly ItemNaLista[]): Map<string, JeitoDoGrupo> {
  return new Map([...ultimaDeCadaGrupo(itens)].map(([chave, item]) => [chave, { icone: item.grupoIcone, cor: item.grupoCor }]));
}

/**
 * Os grupos do cofre, em ordem alfabética, um por nome (Bancos e bancos são o mesmo grupo). Vale a
 * grafia da senha mudada por último, para que corrigir o nome numa senha já mostre o certo.
 */
export function gruposDoCofre(itens: readonly ItemNaLista[]): string[] {
  return [...ultimaDeCadaGrupo(itens).values()].map((i) => i.grupo).sort((a, b) => simples(a).localeCompare(simples(b), 'pt-BR'));
}

/**
 * As senhas em pastas, uma por grupo em ordem alfabética, e as sem grupo por último; dentro de cada
 * pasta, pelo nome. `grupos` é a lista de `gruposDoCofre` (de todas as senhas, não só das achadas),
 * para a pasta ter o mesmo nome com ou sem busca. Pasta vazia não aparece.
 */
export function emPastas(itens: readonly ItemNaLista[], grupos: readonly string[], jeitos: ReadonlyMap<string, JeitoDoGrupo> = new Map()): Pasta[] {
  const porNome = (a: ItemNaLista, b: ItemNaLista) => simples(nomeDoItem(a.item!)).localeCompare(simples(nomeDoItem(b.item!)), 'pt-BR');
  const pastas = [...grupos.map((nome) => ({ chave: simples(nome), nome })), { chave: '', nome: 'Sem grupo' }].map((p) => ({
    ...p,
    jeito: jeitos.get(p.chave) ?? SEM_JEITO,
    itens: itens.filter((i) => simples(i.item!.grupo) === p.chave).sort(porNome),
  }));
  return pastas.filter((p) => p.itens.length);
}
