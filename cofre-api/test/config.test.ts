import { describe, expect, it } from 'vitest';
import { canUseVault, readConfig } from '../src/config';

const BASE = { MODO: 'ligado', COTA_LINHAS_DIA: '20000', COFRE_ORIGEM: 'https://cofre.murall.igorsc.com.br', COFRE_RP_ID: 'cofre.murall.igorsc.com.br' };

describe('readConfig', () => {
  it('lê os valores do wrangler.toml', () => {
    expect(readConfig({ ...BASE, COFRE_CODIGOS: ' k7qf-m2xa, ABCD1234 ', GOOGLE_CLIENT_ID: ' x ' })).toEqual({
      mode: 'ligado',
      dailyRowBudget: 20000,
      allowedCodes: ['K7QFM2XA', 'ABCD1234'],
      origin: 'https://cofre.murall.igorsc.com.br',
      rpId: 'cofre.murall.igorsc.com.br',
      googleClientId: 'x',
    });
  });

  it('na dúvida, desliga, zera a cota e não deixa ninguém usar', () => {
    expect(readConfig({})).toEqual({ mode: 'desligado', dailyRowBudget: 0, allowedCodes: [], origin: '', rpId: '', googleClientId: '' });
    expect(readConfig({ ...BASE, MODO: 'on' }).mode).toBe('desligado');
    expect(readConfig({ ...BASE, COTA_LINHAS_DIA: '1.5' }).dailyRowBudget).toBe(0);
  });

  it('desliga se o rpId não é exatamente o host do cofre', () => {
    // o domínio de cima deixaria uma página do Murall pedir a passkey do cofre
    expect(readConfig({ ...BASE, COFRE_RP_ID: 'igorsc.com.br' }).mode).toBe('desligado');
    expect(readConfig({ ...BASE, COFRE_RP_ID: 'murall.igorsc.com.br' }).mode).toBe('desligado');
    expect(readConfig({ ...BASE, COFRE_ORIGEM: 'http://cofre.murall.igorsc.com.br' }).mode).toBe('desligado');
    expect(readConfig({ ...BASE, COFRE_ORIGEM: 'https://cofre.murall.igorsc.com.br/entrar' }).mode).toBe('desligado');
    expect(readConfig({ ...BASE, COFRE_ORIGEM: 'nada' }).mode).toBe('desligado');
    // a barra do fim não conta; o localhost do desenvolvimento vale sem https
    expect(readConfig({ ...BASE, COFRE_ORIGEM: 'https://cofre.murall.igorsc.com.br/' }).mode).toBe('ligado');
    expect(readConfig({ ...BASE, COFRE_ORIGEM: 'http://localhost:4400', COFRE_RP_ID: 'localhost' }).mode).toBe('ligado');
  });

  it('quem pode usar: os códigos da lista, ou todos com "*"', () => {
    const lista = readConfig({ ...BASE, COFRE_CODIGOS: 'K7QF-M2XA' });
    expect(canUseVault(lista, 'K7QFM2XA')).toBe(true);
    expect(canUseVault(lista, 'k7qf-m2xa')).toBe(true);
    expect(canUseVault(lista, 'ABCD1234')).toBe(false);
    expect(canUseVault(readConfig({ ...BASE, COFRE_CODIGOS: '' }), 'K7QFM2XA')).toBe(false);
    expect(canUseVault(readConfig({ ...BASE, COFRE_CODIGOS: '*' }), 'ABCD1234')).toBe(true);
  });
});
