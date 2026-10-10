import { VerifyGoogle } from '../src/domain/google';

/** O que as duas suítes (`suite.ts` e `amigos.suite.ts`) usam igual. */

export const BASE_ENV = {
  MODO: 'ligado',
  ORIGENS: 'https://igorsolerc.github.io,http://localhost:4200',
  COTA_LINHAS_DIA: '1000',
  GOOGLE_CLIENT_ID: 'teste.apps.googleusercontent.com',
  VER_MURAIS: 'todos',
};

/** Todas as tabelas das migrações: cada teste começa com elas vazias. */
export const TABLES = ['usuarios', 'sessoes', 'murais', 'murais_publicos', 'seguindo', 'seguindo_desfeito', 'atividades', 'reacoes', 'freios', 'uso_diario'];
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
