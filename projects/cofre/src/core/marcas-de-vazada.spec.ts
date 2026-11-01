import type { CofreAberto } from './abrir';
import { ApiCofre, type Gravacao, type ItensDaApi } from './api';
import { paraBase64url } from './bytes';
import { cifrarItem, cifrarManifesto, criarCofre, novaChaveDoMeio } from './crypto';
import { avisoDeVazada, entradasDo, type ItemNaLista, lerItem, lerItens, mudarGrupo, mudarVazamentos, salvarItem, type Vazamento, vezesVazada } from './itens';
import { resumoDaSenha } from './vazadas';

const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const EM = '2026-11-01T12:00:00.000Z';

/** Uma API de mentira que guarda os itens como o servidor (cifrados, com o manifesto e o contador). */
class ApiNaMemoria extends ApiCofre {
  contador = 0;
  manifesto = '';
  gravacoes = 0;
  readonly guardados = new Map<string, { versao: number; dados: string }>();
  override async salvarItem(id: string, dados: string, versao: number, g: Gravacao): Promise<{ contador: number }> {
    this.guardados.set(id, { versao, dados });
    this.manifesto = g.manifesto;
    this.gravacoes++;
    return { contador: ++this.contador };
  }
  override async itens(): Promise<ItensDaApi> {
    return { contador: this.contador, manifesto: this.manifesto, itens: [...this.guardados].map(([id, i]) => ({ id, ...i, mudadoEm: EM, naLixeiraDesde: null })) };
  }
}

async function cofreAberto(): Promise<CofreAberto> {
  const { chave } = await criarCofre(new Uint8Array(32).fill(1), novaChaveDoMeio(), USUARIO);
  return { usuario: USUARIO, chave, manifesto: { contador: 0, itens: {}, lixeira: {}, mudadoEm: EM, aparelho: 'PC' }, contador: 0, recuperada: false, expiraEm: '', paradaMaxima: 600, aparelho: 'PC' };
}

const campos = (senha: string, reserva = 's2') => ({ titulo: 'Banco', usuario: 'igor', senha, url: '', descricao: '', outras: [{ rotulo: 'Reserva', usuario: '', senha: reserva, protegida: false }] });
const marca = async (senha: string, extra: Partial<Vazamento> = {}): Promise<Vazamento> => ({ resumo: await resumoDaSenha(senha), vezes: 42, em: EM, ...extra });
/** Como uma conferência que achou todas as senhas (1 vez cada): a marca que já existe fica. */
const achouTodas = (e: { vazada?: Vazamento }, resumo: string): Vazamento => e.vazada ?? { resumo, vezes: 1, em: EM };

describe('as marcas de senha vazada (17.24)', () => {
  it('o resumo é o começo do SHA-1 da senha, em maiúsculas (12 caracteres)', async () => {
    expect(await resumoDaSenha('password')).toBe('5BAA61E4C9B9');
  });

  it('lerItem: só a marca no formato fica (o resumo, as vezes, a data e o calada); sem marca, o item não ganha o campo', async () => {
    const boa = await marca('s1');
    expect(lerItem({ senha: 's1', vazada: boa }).vazada).toEqual(boa);
    expect(lerItem({ senha: 's1', vazada: { ...boa, calada: true } }).vazada).toEqual({ ...boa, calada: true });
    for (const ruim of [{ ...boa, resumo: 'ABC' }, { ...boa, resumo: boa.resumo.toLowerCase() }, { ...boa, vezes: 0 }, { ...boa, vezes: 1.5 }, { ...boa, vezes: '3' }, 'vazada', [boa]]) {
      expect(lerItem({ senha: 's1', vazada: ruim }).vazada).withContext(JSON.stringify(ruim)).toBeUndefined();
    }
    expect('vazada' in lerItem({ senha: 's1' })).toBeFalse();
    expect(lerItem({ senha: 's1', outras: [{ senha: 's2', vazada: await marca('s2') }] }).outras[0]!.vazada).toEqual(await marca('s2'));
  });

  it('avisa só a que não foi calada; vezesVazada é a maior das que avisam', async () => {
    const item = lerItem({
      senha: 's1',
      vazada: await marca('s1', { vezes: 9 }),
      outras: [
        { senha: 's2', vazada: await marca('s2', { vezes: 500, calada: true }) },
        { senha: 's3', vazada: await marca('s3', { vezes: 12 }) },
      ],
    });
    expect(entradasDo(item).map((e) => avisoDeVazada(e)?.vezes ?? null)).toEqual([9, null, 12]);
    expect(vezesVazada(item)).toBe(12);
    expect(vezesVazada(lerItem({ senha: 's1' }))).toBe(0);
    expect(vezesVazada(null)).toBe(0);
  });

  it('a conferência marca a entrada que vazou sem mexer no resto nem no "mudado em"; sem mudança, não grava', async () => {
    const api = new ApiNaMemoria();
    const cofre = await cofreAberto();
    const salvo = await salvarItem(api, cofre, campos('s1'), null);
    const achadas = new Map([[await resumoDaSenha('s2'), 7]]);
    const marcar = (e: { vazada?: Vazamento }, resumo: string) => e.vazada ?? (achadas.has(resumo) ? { resumo, vezes: achadas.get(resumo)!, em: EM } : undefined);
    const marcado = (await mudarVazamentos(api, cofre, salvo, marcar))!;
    expect(marcado.versao).toBe(2);
    expect(marcado.item!.vazada).toBeUndefined();
    expect(marcado.item!.outras[0]!.vazada).toEqual({ resumo: await resumoDaSenha('s2'), vezes: 7, em: EM });
    expect({ ...marcado.item!, outras: [] }).toEqual({ ...salvo.item!, outras: [] });
    // de novo: a marca já está lá, nada a gravar
    expect(await mudarVazamentos(api, cofre, marcado, marcar)).toBeNull();
    expect(api.gravacoes).toBe(2);
    // a lixeira fica como está (gravar a tiraria de lá)
    expect(await mudarVazamentos(api, cofre, { ...marcado, naLixeira: true }, () => undefined)).toBeNull();
  });

  it('salvar com a mesma senha mantém a marca; trocar a senha tira só a dela; a marca anda com a senha, não com o lugar', async () => {
    const api = new ApiNaMemoria();
    const cofre = await cofreAberto();
    let item: ItemNaLista = await salvarItem(api, cofre, campos('s1'), null);
    item = (await mudarVazamentos(api, cofre, item, achouTodas))!;
    // mudar o título (a edição não traz as marcas nos campos): as duas continuam
    item = await salvarItem(api, cofre, { ...campos('s1'), titulo: 'Outro' }, item);
    expect([item.item!.vazada?.vezes, item.item!.outras[0]!.vazada?.vezes]).toEqual([1, 1]);
    // trocar a senha da reserva: só ela perde a marca
    item = await salvarItem(api, cofre, campos('s1', 'nova'), item);
    expect(item.item!.vazada?.vezes).toBe(1);
    expect(item.item!.outras[0]!.vazada).toBeUndefined();
    // a senha que muda de entrada leva a marca junto
    item = await salvarItem(api, cofre, campos('nova', 's1'), item);
    expect(item.item!.vazada).toBeUndefined();
    expect(item.item!.outras[0]!.vazada?.resumo).toBe(await resumoDaSenha('s1'));
    // uma marca que venha nos campos não conta: só a do item de antes
    const forjado = await salvarItem(api, cofre, { ...campos('nova', 's1'), vazada: await marca('nova') } as Parameters<typeof salvarItem>[2], item);
    expect(forjado.item!.vazada).toBeUndefined();
    // renomear o grupo grava as senhas, e as marcas ficam
    const [noGrupo] = await mudarGrupo(api, cofre, [forjado], 'Bancos');
    expect(noGrupo!.item!.outras[0]!.vazada?.resumo).toBe(await resumoDaSenha('s1'));
  });

  it('"Tirar o aviso" apaga a marca; "Não avisar mais" a deixa calada (até a senha mudar)', async () => {
    const api = new ApiNaMemoria();
    const cofre = await cofreAberto();
    let item: ItemNaLista = await salvarItem(api, cofre, campos('s1'), null);
    item = (await mudarVazamentos(api, cofre, item, achouTodas))!;
    const resumo = await resumoDaSenha('s1');
    const calado = (await mudarVazamentos(api, cofre, item, (e, r) => (e.vazada && r === resumo ? { ...e.vazada, calada: true } : e.vazada)))!;
    expect(calado.item!.vazada?.calada).toBeTrue();
    expect(avisoDeVazada(entradasDo(calado.item!)[0]!)).toBeNull();
    // a outra entrada continua avisando
    expect(avisoDeVazada(entradasDo(calado.item!)[1]!)).not.toBeNull();
    // uma conferência nova não desfaz o "não avisar mais"
    expect(await mudarVazamentos(api, cofre, calado, achouTodas)).toBeNull();
    // trocada a senha, a marca calada sai; a nova volta a poder avisar
    const trocada = await salvarItem(api, cofre, campos('outra'), calado);
    expect(trocada.item!.vazada).toBeUndefined();
    const deNovo = (await mudarVazamentos(api, cofre, trocada, achouTodas))!;
    expect(avisoDeVazada(entradasDo(deNovo.item!)[0]!)).not.toBeNull();
    // tirar o aviso: a marca some (uma conferência nova que ache põe de volta)
    const daOutra = await resumoDaSenha('outra');
    const tirado = (await mudarVazamentos(api, cofre, deNovo, (e, r) => (r === daOutra ? undefined : e.vazada)))!;
    expect(tirado.item!.vazada).toBeUndefined();
    expect(tirado.item!.outras[0]!.vazada).toBeDefined();
  });

  it('ao ler, a marca que não bate com a senha de agora não vale (uma aba de antes desta versão, ou um item mexido)', async () => {
    const api = new ApiNaMemoria();
    const cofre = await cofreAberto();
    const id = '3f2b8c1e-0000-4000-8000-000000000001';
    const item = lerItem({ titulo: 'Banco', senha: 'trocada', vazada: await marca('s1'), outras: [{ senha: 's2', vazada: await marca('s2') }] });
    api.guardados.set(id, { versao: 1, dados: paraBase64url(await cifrarItem(cofre.chave, USUARIO, id, 1, item)) });
    api.contador = 1;
    api.manifesto = paraBase64url(await cifrarManifesto(cofre.chave, USUARIO, { contador: 1, itens: { [id]: 1 }, lixeira: {}, mudadoEm: EM, aparelho: 'PC' }));
    const [lido] = await lerItens(api, cofre);
    expect(lido!.item!.vazada).toBeUndefined();
    expect(lido!.item!.outras[0]!.vazada).toEqual(await marca('s2'));
  });
});
