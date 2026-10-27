import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FERRAMENTAS } from '../../contrato/api-v1/ferramentas';
import { API_DO_MURALL, guia } from '../../contrato/api-v1/guia';
import { openapi } from '../../contrato/api-v1/openapi';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { Db, Deps } from '../src/ports';
import { BASE_ENV, NOW } from './harness';

/**
 * A documentação da API das AIs (PLANO-API.md, 13): as cópias em docs/api/ são as geradas do contrato
 * (mudou a API sem `npm run docs`, quebra aqui), e a API serve o guia e o OpenAPI sem chave.
 */
describe('a documentação da API das AIs', () => {
  it('docs/api/ está em dia com o contrato (senão: cd api && npm run docs)', () => {
    expect(readFileSync('../docs/api/guia.md', 'utf8').replace(/\r\n/g, '\n')).toBe(guia(API_DO_MURALL));
    expect(readFileSync('../docs/api/openapi.json', 'utf8').replace(/\r\n/g, '\n')).toBe(`${JSON.stringify(openapi(API_DO_MURALL), null, 2)}\n`);
  });

  it('o OpenAPI tem uma operação por ferramenta de /ext/v1, com ids únicos', () => {
    const doc = openapi('https://api.teste');
    const ops = Object.values(doc.paths).flatMap((p) => Object.values(p) as { operationId: string }[]);
    const ids = ops.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(FERRAMENTAS.filter((f) => f.caminho.startsWith('/ext/')).map((f) => f.nome)));
    expect(doc.paths['/ext/v1/notas/{id}']).toEqual(expect.objectContaining({ get: expect.anything(), patch: expect.anything(), delete: expect.anything() }));
  });

  it('a API serve /llms.txt, /llms-full.txt e o OpenAPI sem chave, com o endereço dela', async () => {
    const deps: Deps = { db: {} as Db, config: readConfig(BASE_ENV), now: () => NOW, verifyGoogle: async () => null as never };
    const app = createApp(deps);
    const llms = await app.request('https://api.teste/llms.txt');
    expect(llms.status).toBe(200);
    expect(await llms.text()).toContain('https://api.teste/llms-full.txt');
    expect(await (await app.request('https://api.teste/llms-full.txt')).text()).toContain('# O Murall, para AIs');
    const spec = (await (await app.request('https://api.teste/ext/v1/openapi.json')).json()) as { servers: { url: string }[] };
    expect(spec.servers[0]!.url).toBe('https://api.teste');
  });
});
