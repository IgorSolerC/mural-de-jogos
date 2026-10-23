import type { CofreAberto } from './abrir';
import { ApiCofre, ErroApi, type Gravacao } from './api';
import { criarCofre, ErroCofre, novaChaveDoMeio } from './crypto';
import { comEntradas, entradasDo, ErroConflito, type ItemNaLista, LIMITES, lerItem, MAX_ENTRADAS, mudarGrupo, nomeDaEntrada, nomeDoGrupo, salvarItem, temProtegida } from './itens';

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
    expect(lerItem({})).toEqual({ titulo: '', usuario: '', senha: '', url: '', descricao: '', icone: '', cor: '', grupo: '', grupoIcone: '', grupoCor: '', rotulo: '', protegida: false, outras: [], criadoEm: new Date(0).toISOString(), mudadoEm: new Date(0).toISOString(), historico: [] });
    const grande = lerItem({ titulo: 'x'.repeat(5000), senha: 7, historico: [{ senha: 'a', ate: 'ontem' }, null, { senha: '' }, 'b'] });
    expect(grande.titulo.length).toBe(LIMITES.titulo);
    expect(grande.senha).toBe('');
    expect(grande.historico).toEqual([{ senha: 'a', ate: new Date(0).toISOString() }]);
    for (const ruim of [null, 'texto', [1, 2], 3]) expect(() => lerItem(ruim)).toThrowError(ErroCofre);
  });

  it('o grupo: os itens de antes ficam sem grupo; o nome sem espaços sobrando e cortado no limite', () => {
    expect(lerItem({ titulo: 'Antigo' }).grupo).toBe('');
    expect(lerItem({ grupo: '  Bancos   do  Brasil ' }).grupo).toBe('Bancos do Brasil');
    expect(lerItem({ grupo: 'g'.repeat(500) }).grupo.length).toBe(LIMITES.grupo);
    expect(lerItem({ grupo: 42 }).grupo).toBe('');
    expect(nomeDoGrupo('\t Casa \n')).toBe('Casa');
    expect(nomeDoGrupo('sem  GRUPO')).toBe('');
  });

  it('o ícone e o jeito do grupo: só os da cartela do site, e o jeito só com um grupo', () => {
    expect(lerItem({ icone: 'foguete', grupo: 'Casa', grupoIcone: 'predio', grupoCor: 'azul' })).toEqual(
      jasmine.objectContaining({ icone: 'foguete', grupo: 'Casa', grupoIcone: 'predio', grupoCor: 'azul' }),
    );
    expect(lerItem({ icone: 'nave', grupo: 'Casa', grupoIcone: 'casinha', grupoCor: 'marrom' })).toEqual(jasmine.objectContaining({ icone: '', grupoIcone: '', grupoCor: '' }));
    expect(lerItem({ icone: 'foguete', grupoIcone: 'predio', grupoCor: 'azul' })).toEqual(jasmine.objectContaining({ icone: 'foguete', grupoIcone: '', grupoCor: '' }));
    // a cor do selo: só as cartolinas
    expect(lerItem({ cor: 'lilas' }).cor).toBe('lilas');
    expect(lerItem({ cor: 'vermelho' }).cor).toBe('vermelho');
    expect(lerItem({ cor: 'marrom' }).cor).toBe('');
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

  it('mudar o grupo de várias: uma gravação por senha, sem mexer na senha nem no histórico; as da lixeira ficam', async () => {
    const api = new ApiQueAceita();
    const cofre = await cofreAberto();
    let a: ItemNaLista = await salvarItem(api, cofre, { ...campos('s0'), grupo: 'Casa' }, null);
    a = await salvarItem(api, cofre, { ...campos('s1'), grupo: 'Casa' }, a);
    const b = await salvarItem(api, cofre, { ...campos('x'), grupo: 'Casa' }, null);
    const naLixeira: ItemNaLista = { ...b, naLixeira: true, naLixeiraDesde: new Date().toISOString() };
    const vistos: string[] = [];
    const salvos = await mudarGrupo(api, cofre, [a, naLixeira], 'Lar', undefined, (s) => vistos.push(s.id));
    expect(salvos.map((s) => [s.id, s.versao, s.item!.grupo, s.item!.senha])).toEqual([[a.id, 3, 'Lar', 's1']]);
    expect(salvos[0]!.item!.historico.map((h) => h.senha)).toEqual(['s0']);
    expect(vistos).toEqual([a.id]);
    // o jeito vai junto, e o ícone da senha fica
    const comIcone = await salvarItem(api, cofre, { ...campos('s1'), icone: 'chip', grupo: 'Lar' }, salvos[0]!);
    const vestida = (await mudarGrupo(api, cofre, [comIcone], 'Lar', { icone: 'predio', cor: 'azul' }))[0]!.item!;
    expect([vestida.icone, vestida.grupoIcone, vestida.grupoCor]).toEqual(['chip', 'predio', 'azul']);
    // apagar o grupo é mudar para vazio, e o jeito sai junto
    const solta = (await mudarGrupo(api, cofre, [{ ...comIcone, versao: comIcone.versao + 1, item: vestida }], ''))[0]!.item!;
    expect([solta.grupo, solta.grupoIcone, solta.grupoCor, solta.icone]).toEqual(['', '', '', 'chip']);
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

  it('várias entradas: os itens de antes têm uma só; as vazias saem, o nome é limpo, cabem 10 ao todo', () => {
    const antigo = lerItem({ titulo: 'Banco', usuario: 'igor', senha: 's' });
    expect(entradasDo(antigo)).toEqual([{ rotulo: '', usuario: 'igor', senha: 's', protegida: false }]);
    expect(temProtegida(antigo)).toBeFalse();
    const varias = lerItem({
      usuario: 'pessoal',
      senha: 'p',
      rotulo: '  Conta   pessoal ',
      protegida: 'sim',
      outras: [
        { rotulo: 'Trabalho', usuario: 'trab', senha: 't', protegida: true },
        { rotulo: '', usuario: '', senha: '', protegida: true },
        'lixo',
        null,
        { rotulo: 'r'.repeat(500), senha: 7 },
      ],
    });
    expect(varias.rotulo).toBe('Conta pessoal');
    // só true vale: "sim" não protege
    expect(varias.protegida).toBeFalse();
    expect(varias.outras.length).toBe(2);
    expect(varias.outras[0]).toEqual({ rotulo: 'Trabalho', usuario: 'trab', senha: 't', protegida: true });
    expect(varias.outras[1]!.rotulo.length).toBe(LIMITES.rotulo);
    expect(varias.outras[1]!.senha).toBe('');
    expect(temProtegida(varias)).toBeTrue();
    const muitas = lerItem({ outras: Array.from({ length: 30 }, (_, i) => ({ senha: `s${i}` })) });
    expect(entradasDo(muitas).length).toBe(MAX_ENTRADAS);
    // ida e volta: a primeira vira o User e a Senha
    expect(comEntradas(entradasDo(varias))).toEqual({ rotulo: varias.rotulo, usuario: 'pessoal', senha: 'p', protegida: false, outras: varias.outras });
    expect(comEntradas([])).toEqual({ rotulo: '', usuario: '', senha: '', protegida: false, outras: [] });
    expect([nomeDaEntrada({ rotulo: ' ' }, 1), nomeDaEntrada({ rotulo: 'Reserva' }, 1)]).toEqual(['Senha 2', 'Reserva']);
  });

  it('a senha de antes de uma entrada protegida continua pedindo a passkey no histórico', async () => {
    const api = new ApiQueAceita();
    const cofre = await cofreAberto();
    const outras = [{ rotulo: 'Reserva', usuario: '', senha: 'r', protegida: true }];
    let item: ItemNaLista = await salvarItem(api, cofre, { ...campos('p0'), protegida: true, outras }, null);
    item = await salvarItem(api, cofre, { ...campos('p1'), protegida: false, outras }, item);
    expect(item.item!.historico).toEqual([jasmine.objectContaining({ senha: 'p0', protegida: true })]);
    expect(item.item!.outras).toEqual(outras);
    // a primeira saiu (tirada na edição): a segunda vira a primeira, e a de antes vai protegida para o histórico
    item = await salvarItem(api, cofre, { ...campos('r'), rotulo: 'Reserva', protegida: true, outras: [] }, item);
    expect(item.item!.historico.map((h) => [h.senha, h.protegida === true])).toEqual([
      ['p1', false],
      ['p0', true],
    ]);
    expect(temProtegida({ ...item.item!, protegida: false })).toBeTrue();
    // mudar o grupo de várias leva as entradas junto
    const mudada = (await mudarGrupo(api, cofre, [{ ...item, item: { ...item.item!, outras } }], 'Casa'))[0]!.item!;
    expect([mudada.grupo, mudada.rotulo, mudada.protegida, mudada.outras]).toEqual(['Casa', 'Reserva', true, outras]);
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
