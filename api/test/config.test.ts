import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config';

describe('readConfig', () => {
  it('lê os valores do wrangler.toml', () => {
    expect(
      readConfig({ MODO: 'ligado', ORIGENS: 'https://a.io/, http://localhost:4200', COTA_LINHAS_DIA: '60000', GOOGLE_CLIENT_ID: ' x ' }),
    ).toEqual({ mode: 'ligado', allowedOrigins: ['https://a.io', 'http://localhost:4200'], dailyRowBudget: 60000, googleClientId: 'x', publicMurals: 'logados' });
    expect(readConfig({ VER_MURAIS: 'todos' }).publicMurals).toBe('todos');
  });

  it('na dúvida, desliga e zera a cota', () => {
    expect(readConfig({})).toEqual({ mode: 'desligado', allowedOrigins: [], dailyRowBudget: 0, googleClientId: '', publicMurals: 'logados' });
    expect(readConfig({ VER_MURAIS: 'Todos' }).publicMurals).toBe('logados');
    expect(readConfig({ MODO: 'on', COTA_LINHAS_DIA: '-5' })).toMatchObject({ mode: 'desligado', dailyRowBudget: 0 });
    expect(readConfig({ COTA_LINHAS_DIA: '1.5' }).dailyRowBudget).toBe(0);
  });
});
