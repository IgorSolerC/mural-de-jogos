import { type Item, type ItemNaLista, lerItem } from '../../core/itens';
import { emPastas, gruposDoCofre } from './pastas';

let n = 0;
const na = (campos: Partial<Item>): ItemNaLista => ({ id: `i${++n}`, versao: 1, naLixeira: false, naLixeiraDesde: null, item: lerItem(campos) });

describe('as pastas da lista', () => {
  it('os grupos: um por nome, sem diferença de maiúscula nem acento, com a grafia da senha mudada por último', () => {
    const itens = [
      na({ titulo: 'a', grupo: 'Escritorio', mudadoEm: '2026-10-01T00:00:00.000Z' }),
      na({ titulo: 'b', grupo: 'Escritório', mudadoEm: '2026-10-20T00:00:00.000Z' }),
      na({ titulo: 'c', grupo: 'casa' }),
      na({ titulo: 'd', grupo: 'Bancos' }),
      na({ titulo: 'e' }),
    ];
    expect(gruposDoCofre(itens)).toEqual(['Bancos', 'casa', 'Escritório']);
  });

  it('em pastas: os grupos em ordem, Sem grupo por último, as senhas pelo nome, pasta vazia de fora', () => {
    const itens = [na({ titulo: 'Zeta', grupo: 'Casa' }), na({ titulo: 'Alfa', grupo: 'casa' }), na({ titulo: 'Solta' }), na({ titulo: 'Pix', grupo: 'Bancos' })];
    const grupos = [...gruposDoCofre(itens), 'Vazio'];
    const pastas = emPastas(itens, grupos);
    expect(pastas.map((p) => [p.nome, p.itens.map((i) => i.item!.titulo)])).toEqual([
      ['Bancos', ['Pix']],
      ['Casa', ['Alfa', 'Zeta']],
      ['Sem grupo', ['Solta']],
    ]);
    expect(pastas.map((p) => p.chave)).toEqual(['bancos', 'casa', '']);
  });

  it('sem nenhum grupo, uma pasta só com tudo', () => {
    const pastas = emPastas([na({ titulo: 'B' }), na({ titulo: 'a' })], []);
    expect(pastas.length).toBe(1);
    expect(pastas[0]!.itens.map((i) => i.item!.titulo)).toEqual(['a', 'B']);
  });
});
