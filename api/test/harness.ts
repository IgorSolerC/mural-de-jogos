import { eraseAccount } from '../src/domain/erase';
import { VerifyGoogle } from '../src/domain/google';
import { hashToken } from '../src/domain/session';
import { Deps } from '../src/ports';

/** O que as duas suítes (`suite.ts` e `amigos.suite.ts`) usam igual. */

export const BASE_ENV = {
  MODO: 'ligado',
  ORIGENS: 'https://igorsolerc.github.io,http://localhost:4200',
  COTA_LINHAS_DIA: '1000',
  GOOGLE_CLIENT_ID: 'teste.apps.googleusercontent.com',
  VER_MURAIS: 'todos',
};

/** Todas as tabelas das migrações: cada teste começa com elas vazias. */
export const TABLES = ['usuarios', 'sessoes', 'murais', 'murais_publicos', 'seguindo', 'seguindo_desfeito', 'atividades', 'reacoes', 'comentarios', 'comentario_reacoes', 'freios', 'notas', 'nota_membros', 'agenda_google', 'agenda_pedidos', 'api_chaves', 'api_espelho', 'api_espelho_estado', 'api_pedidos', 'oauth_clientes', 'oauth_pedidos', 'oauth_codigos', 'uso_diario'];
export const NOW = new Date('2026-10-06T15:00:00Z');

export async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: ArrayBuffer): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Para os apps montados à mão num teste que não passa pelo login: chegar aqui é erro do teste. */
export const noGoogle: VerifyGoogle = async () => {
  throw new Error('o login do Google não devia ser chamado neste teste');
};

/** Uma chamada com corpo JSON e, se vier, o token da sessão. */
export function jsonCaller(call: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  return (method: string, path: string, body?: unknown, token?: string) =>
    call(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

/**
 * Apaga a conta de quem tem este token como a limpeza diária apaga, depois dos 7 dias (o DELETE /v1/eu só
 * marca: o pedido e a espera são conferidos em `suite.ts`). Para os testes do que sai junto com a conta.
 */
export async function eraseNow(deps: Deps, token: string): Promise<void> {
  const row = await deps.db.first<{ usuario_id: string }>('SELECT usuario_id FROM sessoes WHERE hash = ?', [await hashToken(token)]);
  if (!row) throw new Error('a sessão não existe');
  await eraseAccount(deps, row.usuario_id);
}
