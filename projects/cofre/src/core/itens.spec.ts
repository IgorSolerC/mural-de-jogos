import type { CofreAberto } from './abrir';
import { ApiCofre, ErroApi, type Gravacao } from './api';
import { criarCofre, ErroCofre, novaChaveDoMeio } from './crypto';
import { ErroConflito, type ItemNaLista, LIMITES, lerItem, salvarItem } from './itens';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';

/** Uma API que aceita toda gravação (ou responde o erro mandado) e anota o que recebeu. */
class ApiQueAceita extends ApiCofre {
  gravados: { id: string; versao: number; gravacao: Gravacao }[] = [];
  falha: ErroApi | null = null;
  override async salvarItem(id: string, _dados: string, versao: number, gravacao: Gravacao): Promise<{ contador: number }> {
    if (this.falha) throw this.falha;
    this.gravados.push({ id, versao, gravacao });
    return { contador: gravacao.contadorAnterior + 1 };
  }
}

async function cofreAberto(): Promise<CofreAberto> {
  const { chave } = await criarCofre(new Uint8Array(32).fill(1), novaChaveDoMeio(), USUARIO);
  return { usuario: USUARIO, chave, manifesto: { contador: 0, itens: {}, lixeira: {}, mudadoEm: new Date().toISOString(), aparelho: 'PC' }, contador: 0, recuperada: false, expiraEm: '', paradaMaxima: 600, aparelho: 'PC' };
}

const campos = (senha: string) => ({ titulo: 'Banco', usuario: 'igor', senha, url: '', descricao: '' });

describe('os itens do cofre', () => {
  it('lerItem: todos os campos opcionais, cortados no limite, e o que não é item é recusado', () => {
    expect(lerItem({})).toEqual({ titulo: '', usuario: '', senha: '', url: '', descricao: '', criadoEm: new Date(0).toISOString(), mudadoEm: new Date(0).toISOString(), historico: [] });
    const grande = lerItem({ titulo: 'x'.repeat(5000), senha: 7, historico: [{ senha: 'a', ate: 'ontem' }, null, { senha: '' }, 'b'] });
    expect(grande.titulo.length).toBe(LIMITES.titulo);
    expect(grande.senha).toBe('');
    expect(grande.historico).toEqual([{ senha: 'a', ate: new Date(0).toISOString() }]);
    for (const ruim of [null, 'texto', [1, 2], 3]) expect(() => lerItem(ruim)).toThrowError(ErroCofre);
  });

  it('salvar: novo na versão 1, mudado na versão + 1, com o manifesto e o contador que o aparelho viu', async () => {
    const api = new ApiQueAceita();
    const cofre = await cofreAberto();
    const novo = await salvarItem(api, cofre, campos('a'), null);
    expect([novo.versao, cofre.contador, cofre.manifesto.itens]).toEqual([1, 1, { [novo.id]: 1 }]);
    const mudado = await salvarItem(api, cofre, campos('b'), novo);
    expect([mudado.id, mudado.versao, cofre.contador]).toEqual([novo.id, 2, 2]);
    expect(api.gravados.map((g) => [g.versao, g.gravacao.contadorAnterior])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it('trocar a senha guarda a de antes no histórico, até 5, da mais nova para a mais velha', async () => {
    const api = new ApiQueAceita();
    const cofre = await cofreAberto();
    let item: ItemNaLista = await salvarItem(api, cofre, campos('s0'), null);
    for (let i = 1; i <= 7; i++) item = await salvarItem(api, cofre, campos(`s${i}`), item);
    expect(item.item!.senha).toBe('s7');
    expect(item.item!.historico.map((h) => h.senha)).toEqual(['s6', 's5', 's4', 's3', 's2']);
    // mudar outro campo, com a mesma senha, não mexe no histórico
    const mesmo = await salvarItem(api, cofre, { ...campos('s7'), titulo: 'Outro' }, item);
    expect(mesmo.item!.historico.map((h) => h.senha)).toEqual(['s6', 's5', 's4', 's3', 's2']);
    expect(mesmo.item!.criadoEm).toBe(item.item!.criadoEm);
  });

  it('o 409 de outro aparelho vira ErroConflito e nada muda aqui; outro 409 passa como é', async () => {
    const api = new ApiQueAceita();
    const cofre = await cofreAberto();
    api.falha = new ErroApi(409, 'conflito', 'Outro aparelho mudou o cofre.');
    await expectAsync(salvarItem(api, cofre, campos('a'), null)).toBeRejectedWith(jasmine.any(ErroConflito));
    expect([cofre.contador, cofre.manifesto.itens]).toEqual([0, {}]);
    api.falha = new ErroApi(409, 'cofre-cheio', 'O cofre chegou ao limite.');
    await expectAsync(salvarItem(api, cofre, campos('a'), null)).toBeRejectedWith(jasmine.any(ErroApi));
  });
});
