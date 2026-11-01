/**
 * Os itens do cofre aberto (seções 6.2, 6.3 e 16.5 do PLANO-COFRE.md, decisão 11), sem tela.
 *
 * Um item tem Título, User, Senha, URL e Descrição, todos opcionais, o ícone, o grupo (a pasta da lista,
 * seção 17.16) com o ícone e a cor dele, mais as datas e as últimas 5 senhas: tudo dentro do cifrado (o
 * servidor não vê nem o grupo). O User e a Senha são a primeira entrada; o item pode ter outras (outra
 * conta, o PIN de outro cartão, a senha reserva, uma pergunta de segurança), cada uma com um nome, e
 * qualquer entrada pode pedir a passkey de novo para mostrar a senha (seção 17.18). As outras ficam num
 * campo à parte (`outras`), então o User e a Senha continuam onde sempre estiveram. O jeito do grupo (ícone e cor) vai copiado em cada senha dele, como o nome
 * (seção 17.17): não há outro lugar cifrado para ele, e mudá-lo grava as senhas do grupo.
 * Ao ler, os itens que o servidor manda são conferidos contra o manifesto (faltou, sobrou, repetiu ou
 * mudou a versão: erro, e nada aparece). Toda gravação manda o item
 * e o manifesto novo, com o contador que este aparelho viu; se outro aparelho gravou antes, a API
 * responde 409 e nada muda (`ErroConflito`): quem chama relê os itens e faz de novo.
 *
 * Uma senha que apareceu em vazamentos fica marcada na entrada dela (`Vazamento`, seção 17.24), dentro do
 * cifrado como o resto, com o resumo da senha conferida: trocar a senha tira a marca sozinho (ao ler e ao
 * salvar, só vale a marca cujo resumo bate com a senha de agora). Fora isso, ela só sai pelo "Tirar o aviso"
 * (`mudarVazamentos`); "Não avisar mais desta senha" a deixa calada (`calada`) até a senha mudar.
 *
 * A lixeira guarda o item por 30 dias; depois a limpeza do servidor apaga os dados e deixa uma lápide
 * (id e versão), que a página tira do manifesto (`limparLapides`).
 */
import { ehCorDaCartela, ehIconeDaCartela, type IdDaCor, type IdDoIcone } from '../../../../shared/cartela-de-icones';
import { type ApiCofre, ErroApi } from './api';
import { type CorDoSelo, ehCorDoSelo } from './selo';
import type { CofreAberto } from './abrir';
import { deBase64url, paraBase64url } from './bytes';
import { cifrarItem, cifrarManifesto, conferirItens, decifrarItem, decifrarManifesto, ErroCofre, type Manifesto, novoId } from './crypto';
import { RESUMO, resumoDaSenha } from './vazadas';

/** O que a pessoa guarda (decisão 11): todos os campos são opcionais (texto vazio). */
export interface Item {
  readonly titulo: string;
  readonly usuario: string;
  readonly senha: string;
  readonly url: string;
  readonly descricao: string;
  /** O ícone da cartela do site (shared/cartela-de-icones.ts); vazio: a letra do nome. */
  readonly icone: IdDoIcone | '';
  /** A cor do selo (as cartolinas, core/selo.ts); vazio: a que sai do nome. */
  readonly cor: CorDoSelo | '';
  /** O grupo (a pasta da lista); vazio: sem grupo. Os itens de antes do grupo não têm o campo. */
  readonly grupo: string;
  /** O ícone e a cor do grupo (iguais em todas as senhas dele); vazios: a pasta e o manilha liso. */
  readonly grupoIcone: IdDoIcone | '';
  readonly grupoCor: IdDaCor | '';
  /** O nome da primeira entrada (o User e a Senha); vazio: sem nome. */
  readonly rotulo: string;
  /** A senha da primeira entrada pede a passkey de novo para aparecer. */
  readonly protegida: boolean;
  /** A senha da primeira entrada apareceu em vazamentos (ausente: não apareceu, ou não foi conferida). */
  readonly vazada?: Vazamento;
  /** As outras entradas, depois da primeira (até `MAX_ENTRADAS` ao todo). */
  readonly outras: readonly Entrada[];
  readonly criadoEm: string;
  readonly mudadoEm: string;
  /** As últimas senhas trocadas da primeira entrada (até 5), da mais nova para a mais velha. */
  readonly historico: readonly SenhaDeAntes[];
}

/** Uma entrada do item: um User e uma Senha com nome ("Conta do trabalho", "Senha reserva"). */
export interface Entrada {
  readonly rotulo: string;
  readonly usuario: string;
  readonly senha: string;
  /** Pede a passkey (ou a senha mestra) de novo para mostrar ou copiar a senha. */
  readonly protegida: boolean;
  /** A senha apareceu em vazamentos (ausente: não apareceu, ou não foi conferida). */
  readonly vazada?: Vazamento;
}

/**
 * A marca de uma senha que apareceu na base de vazamentos (17.24). Fica até a senha mudar (o resumo deixa
 * de bater) ou até "Tirar o aviso"; uma conferência nova que ache de novo a põe de volta.
 */
export interface Vazamento {
  /** O começo do SHA-1 da senha conferida (`RESUMO` caracteres, core/vazadas.ts). */
  readonly resumo: string;
  /** Quantas vezes ela aparecia na base quando foi achada. */
  readonly vezes: number;
  /** Quando a conferência achou (ISO). */
  readonly em: string;
  /** "Não avisar mais desta senha": a marca fica, sem aviso, até a senha mudar. */
  readonly calada?: true;
}

/** Uma senha de antes; `protegida` se a entrada dela pedia a passkey (continua pedindo no histórico). */
export interface SenhaDeAntes {
  readonly senha: string;
  readonly ate: string;
  readonly protegida?: boolean;
}

/** Quantas entradas um item pode ter, contando a primeira. */
export const MAX_ENTRADAS = 10;

/** O que cabe em cada campo (o item inteiro ainda tem de caber nos 16 kB do servidor). */
export const LIMITES = { titulo: 200, usuario: 320, senha: 1000, url: 2000, descricao: 8000, grupo: 60, rotulo: 80 } as const;
const HISTORICO = 5;

/** Os campos que a pessoa escreve (sem o grupo, o item fica sem grupo; sem o ícone, com a letra). */
export type CamposDoItem = Pick<Item, 'titulo' | 'usuario' | 'senha' | 'url' | 'descricao'> &
  Partial<Pick<Item, 'grupo' | 'icone' | 'cor' | 'grupoIcone' | 'grupoCor' | 'rotulo' | 'protegida' | 'outras'>>;

export const ENTRADA_VAZIA: Entrada = { rotulo: '', usuario: '', senha: '', protegida: false };

/** Todas as entradas do item, a primeira (o User e a Senha) na frente. */
export function entradasDo(item: Pick<Item, 'rotulo' | 'usuario' | 'senha' | 'protegida' | 'vazada' | 'outras'>): Entrada[] {
  return [{ rotulo: item.rotulo, usuario: item.usuario, senha: item.senha, protegida: item.protegida, ...(item.vazada ? { vazada: item.vazada } : {}) }, ...item.outras];
}

/** Os campos de um item com estas entradas: a primeira vai para o User e a Senha, as outras para `outras`. */
export function comEntradas(entradas: readonly Entrada[]): Pick<Item, 'rotulo' | 'usuario' | 'senha' | 'protegida' | 'vazada' | 'outras'> {
  const [primeira = ENTRADA_VAZIA, ...outras] = entradas;
  return { rotulo: primeira.rotulo, usuario: primeira.usuario, senha: primeira.senha, protegida: primeira.protegida, ...(primeira.vazada ? { vazada: primeira.vazada } : {}), outras };
}

/** A marca que avisa (a calada, por escolha da pessoa, não avisa). */
export function avisoDeVazada(e: Pick<Entrada, 'vazada'>): Vazamento | null {
  return e.vazada && !e.vazada.calada ? e.vazada : null;
}

/** Quantas vezes a senha mais vazada do item apareceu (só as marcas que avisam; 0: nenhuma). */
export function vezesVazada(item: Item | null | undefined): number {
  return item ? Math.max(0, ...entradasDo(item).map((e) => avisoDeVazada(e)?.vezes ?? 0)) : 0;
}

/** Uma entrada sem nada escrito (marcar "pede a passkey" sozinho não conta). */
export function entradaVazia(e: Entrada): boolean {
  return !e.rotulo.trim() && !e.usuario.trim() && !e.senha;
}

/** O nome de uma entrada na tela: o que a pessoa escreveu, ou "Senha 2". */
export function nomeDaEntrada(e: Pick<Entrada, 'rotulo'>, n: number): string {
  return e.rotulo.trim() || `Senha ${n + 1}`;
}

/** Alguma senha do item pede a passkey (a da primeira, a de outra entrada ou uma de antes). */
export function temProtegida(item: Pick<Item, 'protegida' | 'outras' | 'historico'>): boolean {
  return item.protegida || item.outras.some((e) => e.protegida) || item.historico.some((h) => h.protegida === true);
}

/** O jeito de um grupo: o ícone e a cor. */
export interface JeitoDoGrupo {
  readonly icone: IdDoIcone | '';
  readonly cor: IdDaCor | '';
}
export const SEM_JEITO: JeitoDoGrupo = { icone: '', cor: '' };

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
const rotulo = (v: unknown) => texto(v, LIMITES.rotulo * 2).replace(/\s+/g, ' ').trim().slice(0, LIMITES.rotulo);

const data = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date(0).toISOString());
const RESUMO_OK = new RegExp(`^[0-9A-F]{${RESUMO}}$`);

/** A marca de vazada guardada, se estiver no formato (senão, a entrada fica sem: a próxima conferência acha de novo). */
function lerVazamento(bruto: unknown): Vazamento | undefined {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return undefined;
  const v = bruto as Record<string, unknown>;
  const vezes = v['vezes'];
  if (typeof v['resumo'] !== 'string' || !RESUMO_OK.test(v['resumo']) || typeof vezes !== 'number' || !Number.isSafeInteger(vezes) || vezes < 1) return undefined;
  return { resumo: v['resumo'], vezes, em: data(v['em']), ...(v['calada'] === true ? { calada: true as const } : {}) };
}

function lerEntrada(bruto: unknown): Entrada | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const e = bruto as Record<string, unknown>;
  const vazada = lerVazamento(e['vazada']);
  const entrada = { rotulo: rotulo(e['rotulo']), usuario: texto(e['usuario'], LIMITES.usuario), senha: texto(e['senha'], LIMITES.senha), protegida: e['protegida'] === true, ...(vazada ? { vazada } : {}) };
  return entradaVazia(entrada) ? null : entrada;
}

/** Confere e limpa um item vindo de dentro do cifrado (só formato: o conteúdo é da pessoa). */
export function lerItem(bruto: unknown): Item {
  const i = (bruto ?? {}) as Record<string, unknown>;
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) throw new ErroCofre('formato', 'item inválido');
  const historico = Array.isArray(i['historico'])
    ? (i['historico'] as unknown[])
        .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
        .map((h) => ({ senha: texto(h['senha'], LIMITES.senha), ate: data(h['ate']), ...(h['protegida'] === true ? { protegida: true } : {}) }))
        .filter((h) => h.senha)
        .slice(0, HISTORICO)
    : [];
  const grupo = nomeDoGrupo(texto(i['grupo'], LIMITES.grupo * 2));
  const vazada = lerVazamento(i['vazada']);
  return {
    titulo: texto(i['titulo'], LIMITES.titulo),
    usuario: texto(i['usuario'], LIMITES.usuario),
    senha: texto(i['senha'], LIMITES.senha),
    url: texto(i['url'], LIMITES.url),
    descricao: texto(i['descricao'], LIMITES.descricao),
    icone: ehIconeDaCartela(i['icone']) ? i['icone'] : '',
    cor: ehCorDoSelo(i['cor']) ? i['cor'] : '',
    grupo,
    // o jeito só vale com um grupo
    grupoIcone: grupo && ehIconeDaCartela(i['grupoIcone']) ? i['grupoIcone'] : '',
    grupoCor: grupo && ehCorDaCartela(i['grupoCor']) ? i['grupoCor'] : '',
    rotulo: rotulo(i['rotulo']),
    protegida: i['protegida'] === true,
    ...(vazada ? { vazada } : {}),
    // as vazias saem; os itens de antes não têm o campo
    outras: Array.isArray(i['outras'])
      ? (i['outras'] as unknown[])
          .map(lerEntrada)
          .filter((e): e is Entrada => e !== null)
          .slice(0, MAX_ENTRADAS - 1)
      : [],
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
    const item = i.dados === null ? null : await soMarcasQueBatem(lerItem(await decifrarItem(cofre.chave, cofre.usuario, i.id, i.versao, bytes(i.dados, 'item'))));
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
 * As marcas de vazada de um item, cada uma na entrada cuja senha de agora tem o resumo dela (`marcas`: as
 * que valiam, pelo resumo). A senha trocada perde a marca; duas entradas com a mesma senha têm a mesma.
 */
async function comMarcas(item: Item, marcas: ReadonlyMap<string, Vazamento>): Promise<Item> {
  if (!marcas.size && !entradasDo(item).some((e) => e.vazada)) return item;
  return marcasPor(item, (_e, resumo) => marcas.get(resumo));
}

/**
 * O item com a marca de cada entrada que `mudar` devolver (ela recebe a entrada, com a marca de agora, e o
 * resumo da senha dela; a entrada sem senha fica sem marca).
 */
async function marcasPor(item: Item, mudar: (entrada: Entrada, resumo: string) => Vazamento | undefined): Promise<Item> {
  const novas = await Promise.all(
    entradasDo(item).map(async (e) => {
      const { vazada: _, ...semMarca } = e;
      const marca = e.senha ? mudar(e, await resumoDaSenha(e.senha)) : undefined;
      return marca ? { ...semMarca, vazada: marca } : semMarca;
    }),
  );
  // a marca da primeira entrada que saiu não pode ficar do item de antes
  return lerItem({ ...item, vazada: undefined, ...comEntradas(novas) });
}

/** As marcas de um item, pelo resumo guardado em cada uma. */
function marcasDo(item: Item | null): Map<string, Vazamento> {
  return new Map(item ? entradasDo(item).flatMap((e) => (e.vazada ? [[e.vazada.resumo, e.vazada] as const] : [])) : []);
}

/** Só as marcas que batem com a senha de agora (uma marca que ficou de uma senha trocada não engana o aviso). */
function soMarcasQueBatem(item: Item): Promise<Item> {
  return comMarcas(item, marcasDo(item));
}

/** Cifra e grava o item (na versão seguinte à de `anterior`, ou na 1 se for novo), com o manifesto novo. */
async function gravarItem(api: ApiCofre, cofre: CofreAberto, item: Item, anterior: ItemNaLista | null): Promise<ItemNaLista> {
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

/**
 * Salva um item: novo (`anterior` null, versão 1) ou mudado (a versão + 1). Trocar a senha guarda a de
 * antes no histórico. As marcas de vazada vêm do item de antes, pelo resumo: a senha que continua igual
 * continua marcada, e a trocada fica sem (o que a edição traz nos campos não conta). Devolve o item como
 * ficou na lista.
 */
export async function salvarItem(api: ApiCofre, cofre: CofreAberto, campos: CamposDoItem, anterior: ItemNaLista | null): Promise<ItemNaLista> {
  const agora = new Date().toISOString();
  const velho = anterior?.item ?? null;
  const historico =
    velho && velho.senha && velho.senha !== campos.senha
      ? [{ senha: velho.senha, ate: agora, ...(velho.protegida ? { protegida: true } : {}) }, ...velho.historico].slice(0, HISTORICO)
      : (velho?.historico ?? []);
  const item = await comMarcas(lerItem({ ...campos, criadoEm: velho?.criadoEm ?? agora, mudadoEm: agora, historico }), marcasDo(velho));
  return gravarItem(api, cofre, item, anterior);
}

/**
 * Muda só as marcas de vazada de um item (a conferência que achou, "Tirar o aviso", "Não avisar mais",
 * "Voltar a avisar"), sem mexer no resto nem no "mudado em" dele: `mudar` recebe cada entrada com senha e
 * o resumo dela, e devolve a marca que ela fica tendo (ou nenhuma). Sem mudança, não grava e devolve null.
 * Só os itens do cofre: gravar um da lixeira o tiraria de lá.
 */
export async function mudarVazamentos(
  api: ApiCofre,
  cofre: CofreAberto,
  alvo: ItemNaLista,
  mudar: (entrada: Entrada, resumo: string) => Vazamento | undefined,
): Promise<ItemNaLista | null> {
  if (alvo.naLixeira || !alvo.item) return null;
  const item = await marcasPor(alvo.item, mudar);
  if (JSON.stringify(item) === JSON.stringify(alvo.item)) return null;
  return gravarItem(api, cofre, item, alvo);
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

/**
 * Muda o grupo de várias senhas de uma vez (renomear: o nome novo; apagar o grupo: vazio; o ícone e a
 * cor: o mesmo nome com o jeito novo), uma gravação por senha, na ordem. Só as que estão no cofre: as da lixeira ficam como estão (gravar uma delas a
 * tiraria da lixeira). Um conflito no meio para tudo, com as anteriores já gravadas: fazer de novo
 * continua de onde parou. `aCada` recebe cada uma assim que fica gravada.
 */
export async function mudarGrupo(
  api: ApiCofre,
  cofre: CofreAberto,
  alvos: readonly ItemNaLista[],
  grupo: string,
  jeito: JeitoDoGrupo = SEM_JEITO,
  aCada?: (salvo: ItemNaLista) => void,
): Promise<ItemNaLista[]> {
  const salvos: ItemNaLista[] = [];
  for (const alvo of alvos) {
    if (alvo.naLixeira || !alvo.item) continue;
    const { titulo, usuario, senha, url, descricao, icone, cor, rotulo, protegida, outras } = alvo.item;
    const salvo = await salvarItem(api, cofre, { titulo, usuario, senha, url, descricao, icone, cor, rotulo, protegida, outras, grupo, grupoIcone: jeito.icone, grupoCor: jeito.cor }, alvo);
    salvos.push(salvo);
    aCada?.(salvo);
  }
  return salvos;
}
