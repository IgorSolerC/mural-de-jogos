import { type Item, type ItemNaLista, lerItem } from '../../core/itens';
import { contarPorGrupo, emPastas, gruposDoCofre, jeitosDosGrupos, vezesVazada } from './pastas';

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

  it('o ícone e a cor de cada grupo: os da senha mudada por último, e a pasta leva o dela', () => {
    const itens = [
      na({ titulo: 'a', grupo: 'Casa', grupoIcone: 'predio', grupoCor: 'azul', mudadoEm: '2026-10-01T00:00:00.000Z' }),
      na({ titulo: 'b', grupo: 'casa', grupoIcone: 'foguete', grupoCor: 'vermelho', mudadoEm: '2026-10-20T00:00:00.000Z' }),
      na({ titulo: 'c', grupo: 'Bancos' }),
    ];
    const jeitos = jeitosDosGrupos(itens);
    expect(jeitos.get('casa')).toEqual({ icone: 'foguete', cor: 'vermelho' });
    expect(jeitos.get('bancos')).toEqual({ icone: '', cor: '' });
    expect(emPastas(itens, gruposDoCofre(itens), jeitos).map((p) => [p.nome, p.jeito.icone])).toEqual([
      ['Bancos', ''],
      ['casa', 'foguete'],
    ]);
  });

  it('sem nenhum grupo, uma pasta só com tudo', () => {
    const pastas = emPastas([na({ titulo: 'B' }), na({ titulo: 'a' })], []);
    expect(pastas.length).toBe(1);
    expect(pastas[0]!.itens.map((i) => i.item!.titulo)).toEqual(['a', 'B']);
  });

  it('a conta de cada grupo, sem diferença de maiúscula nem acento ("" é Sem grupo)', () => {
    const itens = [na({ grupo: 'Escritório' }), na({ grupo: 'escritorio' }), na({ grupo: 'Casa' }), na({}), na({})];
    expect([...contarPorGrupo(itens)].sort()).toEqual([
      ['', 2],
      ['casa', 1],
      ['escritorio', 2],
    ]);
  });

  it('vezes vazada: a maior das entradas, 0 sem conferência', () => {
    const vazadas = new Map([['a', [0, 12, 3]]]);
    expect(vezesVazada(vazadas, 'a')).toBe(12);
    expect(vezesVazada(vazadas, 'b')).toBe(0);
  });
});
