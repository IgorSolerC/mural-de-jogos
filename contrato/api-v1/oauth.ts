import { ATALHOS, ESCOPOS, ehEscopo, escoposEmOrdem } from './escopos';

/**
 * O OAuth 2.1 do Murall (PLANO-API.md, seção 11): os conectores (claude.ai, Claude Code, ChatGPT) ganham
 * acesso sem ninguém copiar chave. Só dados e funções puras: a API confere com isto e o site (a página
 * Autorizar) mostra com isto.
 */

/** O pedido de autorização espera a pessoa decidir por 10 minutos. */
export const PRAZO_DO_PEDIDO_MS = 10 * 60 * 1000;
/** O código que volta ao cliente vale 5 minutos, uma vez. */
export const PRAZO_DO_CODIGO_MS = 5 * 60 * 1000;
/** O token de acesso vale 1 hora (o cliente renova sozinho). */
export const PRAZO_DO_ACESSO_S = 60 * 60;
/** A renovação parada por 90 dias corridos deixa de valer (e nunca passa da validade da chave). */
export const DIAS_DA_RENOVACAO = 90;
/** Registros de cliente (RFC 7591) por IP em 24 horas. */
export const REGISTROS_POR_IP = 20;
/** Pedidos de autorização por IP em 24 horas (cada um é uma linha no banco até a pessoa decidir). */
export const PEDIDOS_POR_IP = 60;
/** Um cliente registrado sem nenhuma autorização em 24 horas sai na limpeza. */
export const CLIENTE_SEM_USO_MS = 24 * 60 * 60 * 1000;

/** O nome que o cliente diz ter (não é confiável: a página mostra o domínio do retorno em destaque). */
export const NOME_DO_CLIENTE_MAX = 60;
/** Endereços de volta por cliente, e o tamanho de cada um. */
export const MAX_RETORNOS = 10;
export const RETORNO_MAX = 512;

/** Os endereços de volta de clientes conhecidos: ganham o selo "conhecido" na página. */
export const RETORNOS_CONHECIDOS: readonly { url: string; nome: string }[] = [
  { url: 'https://claude.ai/api/mcp/auth_callback', nome: 'Claude' },
  { url: 'https://claude.com/api/mcp/auth_callback', nome: 'Claude' },
  { url: 'https://chatgpt.com/connector_platform_oauth_redirect', nome: 'ChatGPT' },
];

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * O endereço de volta serve? `https://` de qualquer domínio, ou `http://` só no próprio computador (as
 * CLIs, como o Claude Code, abrem uma porta local). Sem fragmento, sem usuário e senha no endereço.
 */
export function retornoAceito(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > RETORNO_MAX) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || raw.includes('#') || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAIS.has(url.hostname);
}

/**
 * O `client_id` é o endereço de um documento de cliente (CIMD, o rascunho da IETF que o claude.ai usa)?
 * `https://`, com caminho, sem fragmento, sem usuário e senha, sem `.` ou `..` no caminho, e com um nome
 * de domínio (não um IP nem `localhost`).
 */
export function ehDocumentoDeCliente(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > RETORNO_MAX || !raw.startsWith('https://')) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.href !== raw || url.hash || url.username || url.password || url.port || url.pathname === '/') return false;
  if (/(^|\/)\.\.?(\/|$)/.test(raw.slice(url.origin.length))) return false;
  const host = url.hostname;
  return host.includes('.') && !/^[\d.]+$/.test(host) && !host.startsWith('[') && host !== 'localhost';
}

/** O documento do cliente: até 5 KB (o rascunho recomenda), buscado de novo depois de um dia. */
export const DOCUMENTO_MAX = 5 * 1024;
export const DOCUMENTO_VALE_MS = 24 * 60 * 60 * 1000;

/** O retorno é no próprio computador (uma CLI)? A página explica isso. */
export function retornoLocal(url: string): boolean {
  try {
    return LOCAIS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** O cliente conhecido daquele retorno, ou null. */
export function retornoConhecido(url: string): string | null {
  return RETORNOS_CONHECIDOS.find((r) => r.url === url)?.nome ?? null;
}

/** O que a página mostra em destaque: o domínio do retorno ("claude.ai", "localhost"). */
export function dominioDoRetorno(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Os escopos que o OAuth anuncia: os mesmos nomes das chaves. */
export const ESCOPOS_DO_OAUTH: readonly string[] = ESCOPOS.map((e) => e.id);

/** Sem `scope` no pedido, vem marcado o atalho de ler e escrever as Anotações. */
export const ESCOPOS_SEM_PEDIDO: readonly string[] = ATALHOS.find((a) => a.id === 'anotacoes')!.escopos;

/**
 * Os escopos de um `scope` do OAuth (separados por espaço), na ordem da tela e sem o que não existe.
 * Vazio ou só com desconhecidos: o padrão. A pessoa ainda escolhe na página.
 */
export function escoposDoPedido(scope: unknown): string[] {
  const pedidos = typeof scope === 'string' ? scope.split(/\s+/).filter(ehEscopo) : [];
  return escoposEmOrdem(pedidos.length ? pedidos : ESCOPOS_SEM_PEDIDO);
}
