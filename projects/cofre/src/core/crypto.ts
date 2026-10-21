/**
 * O núcleo de criptografia do cofre (seção 6 do PLANO-COFRE.md). Sem tela, sem rede, sem estado:
 * só funções que recebem bytes e devolvem bytes ou chaves.
 *
 * As chaves, em resumo:
 * - kSenha = Argon2id(senha mestra, sal), 32 bytes. Nunca sai do navegador.
 * - M, a "chave do meio": 32 bytes sorteados uma vez. Sai de um envelope, aberto pela passkey (com
 *   o segredo do PRF, ou com o S_i que o servidor guarda no modo servidor) ou pelo código de
 *   recuperação.
 * - VK, a chave do cofre: 32 bytes sorteados uma vez, guardados em V, que só abre com kSenha e M
 *   juntos. Fora deste arquivo, VK é só uma chave HKDF não exportável (`ChaveDoCofre`): os bytes
 *   dela nunca saem daqui.
 * - kAuth = HKDF(kSenha ‖ M), a prova que vai para o servidor; kRec = HKDF(código), a do código.
 * - Cada item e o manifesto têm a própria chave AES-256-GCM, derivada de VK.
 *
 * Regras que valem para o arquivo inteiro:
 * - Todo `CryptoKey` é criado não exportável.
 * - Todo `Uint8Array` com segredo criado aqui é zerado assim que deixa de servir. Os que esta
 *   função devolve (kSenha, M, kAuth) são de quem chamou, que zera depois de usar.
 * - Tudo o que é cifrado leva um AAD com o dono e o lugar (ver `aad`): o servidor não consegue
 *   trocar um envelope, um item ou um manifesto de lugar, nem entre contas.
 * - Nada aqui confia no servidor: os parâmetros do Argon2id e a versão passam por `conferirKdf`,
 *   e todo id passa por `conferirId` antes de entrar num AAD.
 *
 * MUDAR ESTE ARQUIVO SÓ COM APROVAÇÃO DO USUÁRIO (seção 14 do plano), e sempre com teste novo. Os
 * vetores em `crypto.spec.ts` ("abre o que a versão 1 selou") garantem que um cofre criado hoje
 * continua abrindo amanhã: se um deles falhar, a mudança quebrou os cofres que já existem.
 */
import { argon2id } from 'hash-wasm';
import { aleatorios, type Bytes, deUtf8, juntar, utf8, zerar } from './bytes';

/** A versão do formato. Uma versão desconhecida é recusada, nunca adivinhada. */
export const VERSAO_CRIPTO = 1;

/** Parâmetros do Argon2id: memória em KiB, passadas e paralelismo. */
export interface Kdf {
  readonly m: number;
  readonly t: number;
  readonly p: number;
}

/** O que o cofre usa ao criar, e o mínimo que ele aceita do servidor ao abrir (seção 6.4). */
export const KDF_PADRAO: Kdf = { m: 64 * 1024, t: 3, p: 1 };
/** Acima disto, o servidor estaria tentando travar o navegador; também é recusado. */
export const KDF_MAXIMO: Kdf = { m: 1024 * 1024, t: 16, p: 4 };

export const TAM_CHAVE = 32;
export const TAM_SAL = 16;
export const TAM_CODIGO = 16;
const TAM_IV = 12;
const TAM_TAG = 16;
/** Cabeçalho de todo selado: a versão (1 byte) e o IV. */
const CABECALHO = 1 + TAM_IV;
/** O que o selado soma ao texto: cabeçalho e a etiqueta do GCM. */
export const SOBRA_SELADO = CABECALHO + TAM_TAG;

/** Os itens e o manifesto são completados até um múltiplo disto, para o tamanho não contar nada. */
export const BLOCO = 512;
/** O maior item selado que o servidor aceita (seção 9.3). */
export const ITEM_MAXIMO = 16 * 1024;
/** O maior texto de item que cabe nisso, já completado. */
const ITEM_TEXTO_MAXIMO = Math.floor((ITEM_MAXIMO - SOBRA_SELADO) / BLOCO) * BLOCO;
/** O manifesto cresce com os itens (até 2.000): o limite é o do corpo de um pedido. */
const MANIFESTO_MAXIMO = 160 * 1024;

const ROTULO = {
  prf: 'murall-cofre-v1-prf',
  envelope: 'cofre-v1 env ',
  recuperacao: 'cofre-v1 rec',
  provaCodigo: 'cofre-v1 rec auth',
  cofre: 'cofre-v1 cofre',
  provaSenha: 'cofre-v1 auth',
  item: 'cofre-v1 item',
  manifesto: 'cofre-v1 manifesto',
} as const;

export type MotivoErro =
  /** Parâmetros do Argon2id abaixo do mínimo: tentativa de rebaixamento. */
  | 'kdf-fraco'
  /** Parâmetros acima do máximo, ou que nem são números inteiros. */
  | 'kdf-invalido'
  /** Uma versão do formato que este cofre não conhece. */
  | 'versao'
  /** Tamanho, id ou formato fora do esperado. */
  | 'formato'
  /** Não abriu: chave errada, ou o selado (ou o lugar dele) foi mexido. */
  | 'abrir'
  /** O item passa do limite. */
  | 'grande'
  /** O que o servidor mandou não bate com o manifesto. */
  | 'manifesto';

export class ErroCofre extends Error {
  constructor(
    readonly motivo: MotivoErro,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroCofre';
  }
}

// ---------------------------------------------------------------------------------------------
// Conferências do que vem de fora

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ids (do usuário, de um envelope, de um item) são UUIDs em minúsculas e nada mais. */
export function conferirId(id: string, oQue: string): void {
  if (typeof id !== 'string' || !UUID.test(id)) throw new ErroCofre('formato', `${oQue}: id inválido`);
}

function conferirTamanho(bytes: Uint8Array, tamanho: number, oQue: string): void {
  if (!(bytes instanceof Uint8Array) || bytes.length !== tamanho) {
    throw new ErroCofre('formato', `${oQue}: esperava ${tamanho} bytes`);
  }
}

/**
 * Confere a versão e os parâmetros do Argon2id que o servidor mandou. Abaixo do mínimo é
 * rebaixamento (um servidor adulterado tentando deixar a senha fácil de adivinhar); acima do
 * máximo, uma tentativa de travar o navegador. Os dois são recusados.
 */
export function conferirKdf(kdf: Kdf, versao: number): void {
  if (versao !== VERSAO_CRIPTO) throw new ErroCofre('versao', `versão ${versao} desconhecida`);
  const { m, t, p } = kdf ?? ({} as Kdf);
  if (![m, t, p].every((n) => Number.isSafeInteger(n))) throw new ErroCofre('kdf-invalido', 'parâmetros do Argon2id inválidos');
  if (m < KDF_PADRAO.m || t < KDF_PADRAO.t || p < KDF_PADRAO.p) throw new ErroCofre('kdf-fraco', 'parâmetros do Argon2id abaixo do mínimo');
  if (m > KDF_MAXIMO.m || t > KDF_MAXIMO.t || p > KDF_MAXIMO.p) throw new ErroCofre('kdf-invalido', 'parâmetros do Argon2id acima do máximo');
}

// ---------------------------------------------------------------------------------------------
// Peças: Argon2id, HKDF e AES-256-GCM

/**
 * kSenha: a senha mestra passada pelo Argon2id. A senha é normalizada (NFC) antes, para a mesma
 * frase digitada no celular e no PC dar a mesma chave.
 */
export async function chaveDaSenha(senha: string, sal: Uint8Array, kdf: Kdf, versao = VERSAO_CRIPTO): Promise<Bytes> {
  conferirKdf(kdf, versao);
  conferirTamanho(sal, TAM_SAL, 'sal');
  if (typeof senha !== 'string' || !senha) throw new ErroCofre('formato', 'senha vazia');
  const senhaBytes = utf8(senha.normalize('NFC'));
  try {
    const saida = await argon2id({
      password: senhaBytes,
      salt: sal,
      iterations: kdf.t,
      memorySize: kdf.m,
      parallelism: kdf.p,
      hashLength: TAM_CHAVE,
      outputType: 'binary',
    });
    return new Uint8Array(saida);
  } finally {
    zerar(senhaBytes);
  }
}

async function baseHkdf(ikm: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ikm as Bytes, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

/** HKDF-SHA-256 em bytes (RFC 5869). Para as provas que vão ao servidor; as chaves usam `chaveAes`. */
export async function derivarBytes(ikm: Uint8Array, sal: Uint8Array, info: Uint8Array, tamanho: number): Promise<Bytes> {
  const base = await baseHkdf(ikm);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal as Bytes, info: info as Bytes }, base, tamanho * 8);
  return new Uint8Array(bits);
}

/** Uma chave AES-256-GCM não exportável, derivada por HKDF-SHA-256 de uma base. */
async function chaveAes(base: CryptoKey, sal: Uint8Array, info: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: sal as Bytes, info: utf8(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function chaveAesDeBytes(ikm: Uint8Array, info: string): Promise<CryptoKey> {
  return chaveAes(await baseHkdf(ikm), new Uint8Array(0), info);
}

/** Sela: [versão][IV de 12 bytes sorteado][texto cifrado + etiqueta]. */
async function selar(chave: CryptoKey, claro: Uint8Array, aad: string): Promise<Bytes> {
  const iv = aleatorios(TAM_IV);
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 }, chave, claro as Bytes);
  return juntar(Uint8Array.of(VERSAO_CRIPTO), iv, new Uint8Array(cifrado));
}

/** Abre um selado. Qualquer falha (versão, tamanho, chave, AAD, um bit mexido) vira `ErroCofre`. */
async function abrir(chave: CryptoKey, selado: Uint8Array, aad: string): Promise<Bytes> {
  if (!(selado instanceof Uint8Array) || selado.length < SOBRA_SELADO) throw new ErroCofre('formato', 'selado curto demais');
  if (selado[0] !== VERSAO_CRIPTO) throw new ErroCofre('versao', `versão ${selado[0]} desconhecida`);
  try {
    const claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: selado.slice(1, CABECALHO), additionalData: utf8(aad), tagLength: 128 },
      chave,
      selado.slice(CABECALHO),
    );
    return new Uint8Array(claro);
  } catch {
    throw new ErroCofre('abrir', 'não abriu');
  }
}

/** O AAD: o que amarra um selado ao dono e ao lugar dele. Os ids já foram conferidos. */
function aad(...partes: (string | number)[]): string {
  return ['cofre-v1', ...partes].join('|');
}

// ---------------------------------------------------------------------------------------------
// Sorteios

/** M, a chave do meio. */
export function novaChaveDoMeio(): Bytes {
  return aleatorios(TAM_CHAVE);
}

/** O sal do Argon2id (um novo a cada troca de senha). */
export function novoSal(): Bytes {
  return aleatorios(TAM_SAL);
}

/** S_i: o segredo de um aparelho sem PRF, que o servidor guarda (cifrado com o secret dele). */
export function novoSegredoDeAparelho(): Bytes {
  return aleatorios(TAM_CHAVE);
}

/** Id de item ou de envelope. */
export function novoId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------------------------
// Envelopes: guardam M

/** A entrada do PRF que toda passkey do cofre recebe: SHA-256("murall-cofre-v1-prf"). */
export async function entradaPrf(): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(ROTULO.prf)));
}

/**
 * E_i: M guardado para um aparelho. `segredo` é a resposta do PRF da passkey (32 bytes) ou, no
 * modo servidor, o S_i dela.
 */
export async function selarEnvelope(segredo: Uint8Array, usuario: string, idEnvelope: string, m: Uint8Array): Promise<Bytes> {
  conferirTamanho(segredo, TAM_CHAVE, 'segredo do aparelho');
  conferirTamanho(m, TAM_CHAVE, 'M');
  conferirId(usuario, 'usuário');
  conferirId(idEnvelope, 'envelope');
  const chave = await chaveAesDeBytes(segredo, ROTULO.envelope + idEnvelope);
  return selar(chave, m, aad('env', usuario, idEnvelope));
}

/** Abre E_i e devolve M (que quem chamou zera depois). */
export async function abrirEnvelope(segredo: Uint8Array, usuario: string, idEnvelope: string, envelope: Uint8Array): Promise<Bytes> {
  conferirTamanho(segredo, TAM_CHAVE, 'segredo do aparelho');
  conferirId(usuario, 'usuário');
  conferirId(idEnvelope, 'envelope');
  const chave = await chaveAesDeBytes(segredo, ROTULO.envelope + idEnvelope);
  const m = await abrir(chave, envelope, aad('env', usuario, idEnvelope));
  conferirTamanho(m, TAM_CHAVE, 'M');
  return m;
}

/** E_rec: M guardado para o código de recuperação (os 16 bytes, não o texto). */
export async function selarRecuperacao(codigo: Uint8Array, usuario: string, m: Uint8Array): Promise<Bytes> {
  conferirTamanho(codigo, TAM_CODIGO, 'código');
  conferirTamanho(m, TAM_CHAVE, 'M');
  conferirId(usuario, 'usuário');
  return selar(await chaveAesDeBytes(codigo, ROTULO.recuperacao), m, aad('rec', usuario));
}

export async function abrirRecuperacao(codigo: Uint8Array, usuario: string, envelope: Uint8Array): Promise<Bytes> {
  conferirTamanho(codigo, TAM_CODIGO, 'código');
  conferirId(usuario, 'usuário');
  const m = await abrir(await chaveAesDeBytes(codigo, ROTULO.recuperacao), envelope, aad('rec', usuario));
  conferirTamanho(m, TAM_CHAVE, 'M');
  return m;
}

/** kRec: a prova do código, com que o servidor solta o E_rec. */
export async function provaDoCodigo(codigo: Uint8Array): Promise<Bytes> {
  conferirTamanho(codigo, TAM_CODIGO, 'código');
  return derivarBytes(codigo, new Uint8Array(0), utf8(ROTULO.provaCodigo), TAM_CHAVE);
}

// ---------------------------------------------------------------------------------------------
// O cofre: V guarda VK, e só abre com kSenha e M juntos

/** VK, já como chave HKDF não exportável. Só serve para derivar as chaves dos itens e do manifesto. */
export interface ChaveDoCofre {
  readonly base: CryptoKey;
}

async function comSenhaEMeio<T>(kSenha: Uint8Array, m: Uint8Array, faz: (ikm: Bytes) => Promise<T>): Promise<T> {
  conferirTamanho(kSenha, TAM_CHAVE, 'kSenha');
  conferirTamanho(m, TAM_CHAVE, 'M');
  const ikm = juntar(kSenha, m);
  try {
    return await faz(ikm);
  } finally {
    zerar(ikm);
  }
}

async function importarVk(vk: Bytes): Promise<ChaveDoCofre> {
  try {
    return { base: await baseHkdf(vk) };
  } finally {
    zerar(vk);
  }
}

/** Cria o cofre: sorteia VK, devolve V (para o servidor) e a chave já importada. */
export async function criarCofre(kSenha: Uint8Array, m: Uint8Array, usuario: string): Promise<{ v: Bytes; chave: ChaveDoCofre }> {
  conferirId(usuario, 'usuário');
  const vk = aleatorios(TAM_CHAVE);
  try {
    const v = await comSenhaEMeio(kSenha, m, async (ikm) => selar(await chaveAesDeBytes(ikm, ROTULO.cofre), vk, aad('cofre', usuario)));
    return { v, chave: await importarVk(vk) };
  } finally {
    zerar(vk);
  }
}

async function abrirVk(kSenha: Uint8Array, m: Uint8Array, usuario: string, v: Uint8Array): Promise<Bytes> {
  conferirId(usuario, 'usuário');
  const vk = await comSenhaEMeio(kSenha, m, async (ikm) => abrir(await chaveAesDeBytes(ikm, ROTULO.cofre), v, aad('cofre', usuario)));
  if (vk.length !== TAM_CHAVE) {
    zerar(vk);
    throw new ErroCofre('formato', 'VK: tamanho errado');
  }
  return vk;
}

/** Abre V com kSenha e M. */
export async function abrirCofre(kSenha: Uint8Array, m: Uint8Array, usuario: string, v: Uint8Array): Promise<ChaveDoCofre> {
  return importarVk(await abrirVk(kSenha, m, usuario, v));
}

/** Troca a senha: abre V com a senha antiga e sela a mesma VK com a nova. */
export async function reselarCofre(kSenhaAntiga: Uint8Array, kSenhaNova: Uint8Array, m: Uint8Array, usuario: string, v: Uint8Array): Promise<Bytes> {
  const vk = await abrirVk(kSenhaAntiga, m, usuario, v);
  try {
    return await comSenhaEMeio(kSenhaNova, m, async (ikm) => selar(await chaveAesDeBytes(ikm, ROTULO.cofre), vk, aad('cofre', usuario)));
  } finally {
    zerar(vk);
  }
}

/** kAuth: a prova da senha (com M), que o servidor compara com o HMAC que guarda. */
export async function provaDaSenha(kSenha: Uint8Array, m: Uint8Array): Promise<Bytes> {
  return comSenhaEMeio(kSenha, m, (ikm) => derivarBytes(ikm, new Uint8Array(0), utf8(ROTULO.provaSenha), TAM_CHAVE));
}

// ---------------------------------------------------------------------------------------------
// Itens

/** O JSON em UTF-8, completado com espaços até um múltiplo de `BLOCO` (o JSON ignora os espaços). */
function completar(json: string, maximo: number): Bytes {
  const bytes = utf8(json);
  const tamanho = Math.max(BLOCO, Math.ceil(bytes.length / BLOCO) * BLOCO);
  if (tamanho > maximo) {
    zerar(bytes);
    throw new ErroCofre('grande', 'grande demais');
  }
  const saida = new Uint8Array(tamanho).fill(0x20);
  saida.set(bytes);
  zerar(bytes);
  return saida;
}

function lerJson(claro: Bytes): unknown {
  try {
    return JSON.parse(deUtf8(claro));
  } catch {
    throw new ErroCofre('formato', 'conteúdo ilegível');
  } finally {
    zerar(claro);
  }
}

function conferirVersao(versao: number): void {
  if (!Number.isSafeInteger(versao) || versao < 1) throw new ErroCofre('formato', 'versão do item inválida');
}

async function chaveDoItem(chave: ChaveDoCofre, id: string): Promise<CryptoKey> {
  return chaveAes(chave.base, utf8(id), ROTULO.item);
}

/**
 * Cifra um item. Tudo dele vai dentro (título, usuário, senha, site, observações, datas): o
 * servidor vê só o id, a versão e o tamanho, arredondado para `BLOCO`.
 */
export async function cifrarItem(chave: ChaveDoCofre, usuario: string, id: string, versao: number, item: unknown): Promise<Bytes> {
  conferirId(usuario, 'usuário');
  conferirId(id, 'item');
  conferirVersao(versao);
  const claro = completar(JSON.stringify(item), ITEM_TEXTO_MAXIMO);
  try {
    return await selar(await chaveDoItem(chave, id), claro, aad('item', usuario, id, versao));
  } finally {
    zerar(claro);
  }
}

/** Decifra um item. Só abre no dono, no id e na versão com que foi cifrado. */
export async function decifrarItem(chave: ChaveDoCofre, usuario: string, id: string, versao: number, dados: Uint8Array): Promise<unknown> {
  conferirId(usuario, 'usuário');
  conferirId(id, 'item');
  conferirVersao(versao);
  if (dados.length > ITEM_MAXIMO) throw new ErroCofre('grande', 'item grande demais');
  return lerJson(await abrir(await chaveDoItem(chave, id), dados, aad('item', usuario, id, versao)));
}

// ---------------------------------------------------------------------------------------------
// Manifesto: a lista cifrada de todos os itens e versões

export interface Manifesto {
  /** Sobe 1 a cada gravação; o servidor recusa (409) quem gravar com um contador velho. */
  readonly contador: number;
  /** Os itens no cofre: id → versão. */
  readonly itens: Readonly<Record<string, number>>;
  /** Os itens na lixeira (seção 16.5): id → versão. Um id nunca está nas duas listas. */
  readonly lixeira: Readonly<Record<string, number>>;
  /** Quando foi a última mudança (ISO 8601), para a tela de abrir mostrar. */
  readonly mudadoEm: string;
  /** Em que aparelho, em palavras ("Celular", "PC"), para a tela de abrir mostrar. */
  readonly aparelho: string;
}

function conferirLista(lista: unknown, oQue: string): Record<string, number> {
  if (!lista || typeof lista !== 'object' || Array.isArray(lista)) throw new ErroCofre('formato', `${oQue}: formato inválido`);
  const saida: Record<string, number> = {};
  for (const [id, versao] of Object.entries(lista)) {
    conferirId(id, oQue);
    conferirVersao(versao as number);
    saida[id] = versao as number;
  }
  return saida;
}

/** Confere o formato de um manifesto vindo de fora e devolve uma cópia limpa. */
function conferirManifesto(bruto: unknown): Manifesto {
  const m = bruto as Partial<Manifesto> | null;
  if (!m || typeof m !== 'object') throw new ErroCofre('formato', 'manifesto inválido');
  if (!Number.isSafeInteger(m.contador) || (m.contador as number) < 0) throw new ErroCofre('formato', 'manifesto: contador inválido');
  if (typeof m.mudadoEm !== 'string' || Number.isNaN(Date.parse(m.mudadoEm))) throw new ErroCofre('formato', 'manifesto: data inválida');
  if (typeof m.aparelho !== 'string' || m.aparelho.length > 80) throw new ErroCofre('formato', 'manifesto: aparelho inválido');
  const itens = conferirLista(m.itens, 'manifesto: itens');
  const lixeira = conferirLista(m.lixeira, 'manifesto: lixeira');
  if (Object.keys(lixeira).some((id) => id in itens)) throw new ErroCofre('formato', 'manifesto: item no cofre e na lixeira');
  return { contador: m.contador as number, itens, lixeira, mudadoEm: m.mudadoEm, aparelho: m.aparelho };
}

async function chaveDoManifesto(chave: ChaveDoCofre): Promise<CryptoKey> {
  return chaveAes(chave.base, new Uint8Array(0), ROTULO.manifesto);
}

export async function cifrarManifesto(chave: ChaveDoCofre, usuario: string, manifesto: Manifesto): Promise<Bytes> {
  conferirId(usuario, 'usuário');
  const limpo = conferirManifesto(manifesto);
  const claro = completar(JSON.stringify(limpo), MANIFESTO_MAXIMO);
  try {
    return await selar(await chaveDoManifesto(chave), claro, aad('manifesto', usuario, limpo.contador));
  } finally {
    zerar(claro);
  }
}

/**
 * Decifra o manifesto que o servidor mandou com o contador que ele diz ter. O contador entra no
 * AAD e é conferido de novo por dentro: um manifesto velho com o contador novo não abre.
 */
export async function decifrarManifesto(chave: ChaveDoCofre, usuario: string, contador: number, dados: Uint8Array): Promise<Manifesto> {
  conferirId(usuario, 'usuário');
  if (!Number.isSafeInteger(contador) || contador < 0) throw new ErroCofre('formato', 'contador inválido');
  if (dados.length > MANIFESTO_MAXIMO + SOBRA_SELADO) throw new ErroCofre('grande', 'manifesto grande demais');
  const manifesto = conferirManifesto(lerJson(await abrir(await chaveDoManifesto(chave), dados, aad('manifesto', usuario, contador))));
  if (manifesto.contador !== contador) throw new ErroCofre('manifesto', 'o contador não bate');
  return manifesto;
}

/** O que o servidor diz de cada item, sem os dados. */
export interface ItemDoServidor {
  readonly id: string;
  readonly versao: number;
  readonly naLixeira: boolean;
}

/**
 * Confere que os itens que o servidor mandou são exatamente os do manifesto: os mesmos ids, as
 * mesmas versões, no mesmo lugar (cofre ou lixeira). Faltou, sobrou, repetiu ou mudou: erro, e o
 * cofre não mostra nada (seção 6.3).
 */
export function conferirItens(manifesto: Manifesto, itens: readonly ItemDoServidor[]): void {
  const vistos = new Set<string>();
  for (const item of itens) {
    if (vistos.has(item.id)) throw new ErroCofre('manifesto', 'item repetido');
    vistos.add(item.id);
    const lista = item.naLixeira ? manifesto.lixeira : manifesto.itens;
    if (!Object.hasOwn(lista, item.id)) throw new ErroCofre('manifesto', 'item fora do manifesto');
    if (lista[item.id] !== item.versao) throw new ErroCofre('manifesto', 'versão de item diferente do manifesto');
  }
  const total = Object.keys(manifesto.itens).length + Object.keys(manifesto.lixeira).length;
  if (vistos.size !== total) throw new ErroCofre('manifesto', 'faltam itens do manifesto');
}
