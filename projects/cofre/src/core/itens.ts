/**
 * Os itens do cofre aberto (seções 6.2, 6.3 e 16.5 do PLANO-COFRE.md, decisão 11), sem tela.
 *
 * Um item tem Título, User, Senha, URL e Descrição, todos opcionais, o grupo (a pasta da lista, seção
 * 17.16), mais as datas e as últimas 5 senhas: tudo dentro do cifrado (o servidor não vê nem o grupo).
 * Ao ler, os itens que o servidor manda são conferidos contra o manifesto (faltou, sobrou, repetiu ou
 * mudou a versão: erro, e nada aparece). Toda gravação manda o item
 * e o manifesto novo, com o contador que este aparelho viu; se outro aparelho gravou antes, a API
 * responde 409 e nada muda (`ErroConflito`): quem chama relê os itens e faz de novo.
 *
 * A lixeira guarda o item por 30 dias; depois a limpeza do servidor apaga os dados e deixa uma lápide
 * (id e versão), que a página tira do manifesto (`limparLapides`).
 */
import { type ApiCofre, ErroApi } from './api';
import type { CofreAberto } from './abrir';
import { deBase64url, paraBase64url } from './bytes';
import { cifrarItem, cifrarManifesto, conferirItens, decifrarItem, decifrarManifesto, ErroCofre, type Manifesto, novoId } from './crypto';

/** O que a pessoa guarda (decisão 11): todos os campos são opcionais (texto vazio). */
export interface Item {
  readonly titulo: string;
  readonly usuario: string;
  readonly senha: string;
  readonly url: string;
  readonly descricao: string;
  /** O grupo (a pasta da lista); vazio: sem grupo. Os itens de antes do grupo não têm o campo. */
  readonly grupo: string;
  readonly criadoEm: string;
  readonly mudadoEm: string;
  /** As últimas senhas trocadas (até 5), da mais nova para a mais velha. */
  readonly historico: readonly { readonly senha: string; readonly ate: string }[];
}

/** O que cabe em cada campo (o item inteiro ainda tem de caber nos 16 kB do servidor). */
export const LIMITES = { titulo: 200, usuario: 320, senha: 1000, url: 2000, descricao: 8000, grupo: 60 } as const;
const HISTORICO = 5;

/** Os campos que a pessoa escreve (sem o grupo, o item fica sem grupo). */
export type CamposDoItem = Pick<Item, 'titulo' | 'usuario' | 'senha' | 'url' | 'descricao'> & { readonly grupo?: string };

/** O nome de um grupo como fica guardado: sem espaços nas pontas nem repetidos ("Sem grupo" é sem grupo). */
export function nomeDoGrupo(texto: string): string {
  const nome = texto.replace(/\s+/g, ' ').trim().slice(0, LIMITES.grupo);
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === 'sem grupo' ? '' : nome;
}

/** Um item como a lista mostra. */
export interface ItemNaLista {
  readonly id: string;
  readonly versao: number;
  readonly naLixeira: boolean;
  /** Desde quando está na lixeira (ISO), para contar os 30 dias. */
  readonly naLixeiraDesde: string | null;
  /** null: a lápide, um item que passou de 30 dias na lixeira (os dados já foram apagados). */
  readonly item: Item | null;
}

/** Outro aparelho gravou antes: nada mudou; releia os itens e faça de novo. */
export class ErroConflito extends Error {
  constructor() {
    super('Outro aparelho mudou o cofre enquanto você mexia. Os itens foram lidos de novo; tente outra vez.');
    this.name = 'ErroConflito';
  }
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const data = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date(0).toISOString());

/** Confere e limpa um item vindo de dentro do cifrado (só formato: o conteúdo é da pessoa). */
export function lerItem(bruto: unknown): Item {
  const i = (bruto ?? {}) as Record<string, unknown>;
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) throw new ErroCofre('formato', 'item inválido');
  const historico = Array.isArray(i['historico'])
    ? (i['historico'] as unknown[])
        .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
        .map((h) => ({ senha: texto(h['senha'], LIMITES.senha), ate: data(h['ate']) }))
        .filter((h) => h.senha)
        .slice(0, HISTORICO)
    : [];
  return {
    titulo: texto(i['titulo'], LIMITES.titulo),
    usuario: texto(i['usuario'], LIMITES.usuario),
    senha: texto(i['senha'], LIMITES.senha),
    url: texto(i['url'], LIMITES.url),
    descricao: texto(i['descricao'], LIMITES.descricao),
    grupo: nomeDoGrupo(texto(i['grupo'], LIMITES.grupo * 2)),
    criadoEm: data(i['criadoEm']),
    mudadoEm: data(i['mudadoEm']),
    historico,
  };
}

function bytes(t: string, oQue: string) {
  const b = deBase64url(t);
  if (!b) throw new ErroCofre('formato', `${oQue}: formato inválido`);
  return b;
}

/**
 * Lê os itens: o manifesto de agora (decifrado de novo, com o contador que a API diz) e cada item
 * conferido contra ele e decifrado. Atualiza o manifesto e o contador do cofre aberto.
 */
export async function lerItens(api: ApiCofre, cofre: CofreAberto): Promise<ItemNaLista[]> {
  const resposta = await api.itens();
  const manifesto = await decifrarManifesto(cofre.chave, cofre.usuario, resposta.contador, bytes(resposta.manifesto, 'manifesto'));
  conferirItens(
    manifesto,
    resposta.itens.map((i) => ({ id: i.id, versao: i.versao, naLixeira: i.naLixeiraDesde !== null })),
  );
  const lista: ItemNaLista[] = [];
  for (const i of resposta.itens) {
    // só uma lápide pode vir sem dados, e só na lixeira
    if (i.dados === null && i.naLixeiraDesde === null) throw new ErroCofre('manifesto', 'item sem dados fora da lixeira');
    const item = i.dados === null ? null : lerItem(await decifrarItem(cofre.chave, cofre.usuario, i.id, i.versao, bytes(i.dados, 'item')));
    lista.push({ id: i.id, versao: i.versao, naLixeira: i.naLixeiraDesde !== null, naLixeiraDesde: i.naLixeiraDesde, item });
  }
  cofre.manifesto = manifesto;
  cofre.contador = resposta.contador;
  return lista;
}

/** O manifesto da próxima gravação: o de agora com a mudança, o contador + 1, quando e onde. */
function proximoManifesto(cofre: CofreAberto, mudar: (itens: Record<string, number>, lixeira: Record<string, number>) => void): Manifesto {
  const itens = { ...cofre.manifesto.itens };
  const lixeira = { ...cofre.manifesto.lixeira };
  mudar(itens, lixeira);
  return { contador: cofre.contador + 1, itens, lixeira, mudadoEm: new Date().toISOString(), aparelho: cofre.aparelho };
}

/** Grava com o manifesto novo; 409 vira `ErroConflito`. Dando certo, o cofre aberto passa ao manifesto novo. */
async function gravar(cofre: CofreAberto, manifesto: Manifesto, pedido: (gravacao: { manifesto: string; contadorAnterior: number }) => Promise<{ contador: number }>): Promise<void> {
  const selado = paraBase64url(await cifrarManifesto(cofre.chave, cofre.usuario, manifesto));
  try {
    await pedido({ manifesto: selado, contadorAnterior: cofre.contador });
  } catch (e) {
    if (e instanceof ErroApi && e.status === 409 && e.codigo === 'conflito') throw new ErroConflito();
    throw e;
  }
  cofre.manifesto = manifesto;
  cofre.contador = manifesto.contador;
}

/**
 * Salva um item: novo (`anterior` null, versão 1) ou mudado (a versão + 1). Trocar a senha guarda a de
 * antes no histórico. Devolve o item como ficou na lista.
 */
export async function salvarItem(api: ApiCofre, cofre: CofreAberto, campos: CamposDoItem, anterior: ItemNaLista | null): Promise<ItemNaLista> {
  const agora = new Date().toISOString();
  const velho = anterior?.item ?? null;
  const historico = velho && velho.senha && velho.senha !== campos.senha ? [{ senha: velho.senha, ate: agora }, ...velho.historico].slice(0, HISTORICO) : (velho?.historico ?? []);
  const item = lerItem({ ...campos, criadoEm: velho?.criadoEm ?? agora, mudadoEm: agora, historico });
  const id = anterior?.id ?? novoId();
  const versao = anterior ? anterior.versao + 1 : 1;
  const dados = paraBase64url(await cifrarItem(cofre.chave, cofre.usuario, id, versao, item));
  const manifesto = proximoManifesto(cofre, (itens, lixeira) => {
    itens[id] = versao;
    delete lixeira[id];
  });
  await gravar(cofre, manifesto, (g) => api.salvarItem(id, dados, versao, g));
  return { id, versao, naLixeira: false, naLixeiraDesde: null, item };
}

/** Põe na lixeira (a versão não muda). */
export async function paraALixeira(api: ApiCofre, cofre: CofreAberto, alvo: ItemNaLista): Promise<ItemNaLista> {
  const manifesto = proximoManifesto(cofre, (itens, lixeira) => {
    delete itens[alvo.id];
    lixeira[alvo.id] = alvo.versao;
  });
  await gravar(cofre, manifesto, (g) => api.paraALixeira(alvo.id, g));
  return { ...alvo, naLixeira: true, naLixeiraDesde: new Date().toISOString() };
}

/** Tira da lixeira. */
export async function restaurar(api: ApiCofre, cofre: CofreAberto, alvo: ItemNaLista): Promise<ItemNaLista> {
  if (!alvo.item) throw new ErroCofre('formato', 'este item já foi apagado');
  const manifesto = proximoManifesto(cofre, (itens, lixeira) => {
    delete lixeira[alvo.id];
    itens[alvo.id] = alvo.versao;
  });
  await gravar(cofre, manifesto, (g) => api.restaurar(alvo.id, g));
  return { ...alvo, naLixeira: false, naLixeiraDesde: null };
}

/** Apaga de vez um item da lixeira (ou a lápide de um que a limpeza já esvaziou). */
export async function apagarDeVez(api: ApiCofre, cofre: CofreAberto, alvo: ItemNaLista): Promise<void> {
  const manifesto = proximoManifesto(cofre, (_itens, lixeira) => {
    delete lixeira[alvo.id];
  });
  await gravar(cofre, manifesto, (g) => api.apagarDeVez(alvo.id, g));
}

/** Tira as lápides (os dados já apagados pela limpeza): devolve a lista sem elas. */
export async function limparLapides(api: ApiCofre, cofre: CofreAberto, lista: readonly ItemNaLista[]): Promise<ItemNaLista[]> {
  for (const lapide of lista.filter((i) => i.item === null)) await apagarDeVez(api, cofre, lapide);
  return lista.filter((i) => i.item !== null);
}
