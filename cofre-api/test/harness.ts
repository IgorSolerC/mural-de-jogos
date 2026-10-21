/** O que as suítes usam igual. */

export const BASE_ENV = {
  MODO: 'ligado',
  COTA_LINHAS_DIA: '1000',
  COFRE_CODIGOS: 'K7QF-M2XA',
  COFRE_ORIGEM: 'https://cofre.teste.dev',
  COFRE_RP_ID: 'cofre.teste.dev',
  GOOGLE_CLIENT_ID: 'cofre.apps.googleusercontent.com',
};

/** Todas as tabelas das migrações: cada teste começa com elas vazias (as filhas antes das mães). */
export const TABLES = [
  'cofre_envelopes',
  'cofre_credenciais',
  'cofre_itens',
  'cofre_contas',
  'cofre_sessoes',
  'cofre_desafios',
  'cofre_eventos',
  'cofre_freio_senha',
  'freios',
  'uso_diario',
];
export const NOW = new Date('2026-10-21T15:00:00Z');

/** Uma chamada com corpo JSON, da origem do cofre (ou de outra, se vier). */
export function jsonCaller(call: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  return (method: string, path: string, body?: unknown, origin: string | null = BASE_ENV.COFRE_ORIGEM) =>
    call(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
