import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config';

describe('readConfig', () => {
  it('lê os valores do wrangler.toml', () => {
    expect(
      readConfig({ MODO: 'ligado', ORIGENS: 'https://a.io/, http://localhost:4200', COTA_LINHAS_DIA: '60000', GOOGLE_CLIENT_ID: ' x ' }),
    ).toEqual({ mode: 'ligado', allowedOrigins: ['https://a.io', 'http://localhost:4200'], dailyRowBudget: 60000, googleClientId: 'x', publicMurals: 'logados', apiCodes: [], site: '', imagesTotalBytes: 0, imagesUserBytes: 0, imagesPerDay: 0 });
    expect(readConfig({ VER_MURAIS: 'todos' }).publicMurals).toBe('todos');
  });

  it('na dúvida, desliga e zera a cota', () => {
    expect(readConfig({})).toEqual({ mode: 'desligado', allowedOrigins: [], dailyRowBudget: 0, googleClientId: '', publicMurals: 'logados', apiCodes: [], site: '', imagesTotalBytes: 0, imagesUserBytes: 0, imagesPerDay: 0 });
    expect(readConfig({ API_CODIGOS: ' k7qf-m2xa , *,, ' }).apiCodes).toEqual(['K7QFM2XA', '*']);
    expect(readConfig({ VER_MURAIS: 'Todos' }).publicMurals).toBe('logados');
    expect(readConfig({ MODO: 'on', COTA_LINHAS_DIA: '-5' })).toMatchObject({ mode: 'desligado', dailyRowBudget: 0 });
    expect(readConfig({ COTA_LINHAS_DIA: '1.5' }).dailyRowBudget).toBe(0);
  });

  it('as imagens: os megabytes e o limite do dia; o que não é um inteiro positivo zera (recusa todo envio)', () => {
    expect(readConfig({ IMAGENS_MB_TOTAL: '400', IMAGENS_MB_PESSOA: ' 25 ', IMAGENS_POR_DIA: '30' })).toMatchObject({
      imagesTotalBytes: 400 * 1024 * 1024,
      imagesUserBytes: 25 * 1024 * 1024,
      imagesPerDay: 30,
    });
    expect(readConfig({ IMAGENS_MB_TOTAL: '-1', IMAGENS_MB_PESSOA: '2.5', IMAGENS_POR_DIA: 'muitas' })).toMatchObject({
      imagesTotalBytes: 0,
      imagesUserBytes: 0,
      imagesPerDay: 0,
    });
  });

  it('o endereço do site: https, ou http só no próprio computador, sem a barra do fim', () => {
    expect(readConfig({ SITE: ' https://murall.igorsc.com.br/ ' }).site).toBe('https://murall.igorsc.com.br');
    expect(readConfig({ SITE: 'https://igorsolerc.github.io/mural/' }).site).toBe('https://igorsolerc.github.io/mural');
    expect(readConfig({ SITE: 'http://localhost:4200' }).site).toBe('http://localhost:4200');
    expect(readConfig({ SITE: 'http://murall.igorsc.com.br' }).site).toBe('');
    expect(readConfig({ SITE: 'murall' }).site).toBe('');
  });
});
