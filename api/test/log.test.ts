import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { Db } from '../src/ports';
import { BASE_ENV, NOW, noGoogle } from './harness';

/** As respostas de erro no log: o que o Workers Logs guarda para achar os erros que se repetem. */

const noDb: Db = {
  first: () => Promise.reject(new Error('o banco não devia ser chamado')),
  all: () => Promise.reject(new Error('o banco não devia ser chamado')),
  batch: () => Promise.reject(new Error('o banco não devia ser chamado')),
};

describe('o log das respostas de erro', () => {
  it('leva o método, o molde da rota, o status e o código; nunca a consulta nem o que vem na rota', async () => {
    const logged: string[] = [];
    const app = createApp({ db: noDb, config: readConfig(BASE_ENV), now: () => NOW, verifyGoogle: noGoogle, log: (line) => logged.push(line) });
    await app.request('https://api.teste/v1/agenda');
    await app.request('https://api.teste/v1/catalogo/rawg/games?search=segredo');
    await app.request('https://api.teste/v1/nada/aqui?x=segredo');
    const ok = await app.request('https://api.teste/v1/catalogo');
    expect(ok.status).toBe(200);
    expect(logged).toEqual(['GET /v1/agenda 401 sessao-invalida', 'GET /v1/catalogo/rawg/* 403 origem', 'GET /v1/nada/aqui 404 nao-encontrado']);
    expect(logged.join()).not.toContain('segredo');
  });
});
