import { describe, expect, it } from 'vitest';
import { formatCode, generateCode, normalizeCode } from '../src/domain/code';
import { cleanName } from '../src/domain/name';

describe('código de usuário', () => {
  it('sorteia 8 caracteres do alfabeto, sem I, L, O nem U', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('aceita o código digitado de vários jeitos', () => {
    expect(normalizeCode('k7qf-m2xa')).toBe('K7QFM2XA');
    expect(normalizeCode(' K7QF M2XA ')).toBe('K7QFM2XA');
    expect(normalizeCode('k7qf-m2xO')).toBe('K7QFM2X0');
    expect(normalizeCode('i7lf-m2xa')).toBe('171FM2XA');
  });

  it('recusa o que não pode ser um código', () => {
    for (const bad of ['', 'K7QF-M2X', 'K7QF-M2XAA', 'K7QF-M2XU', 'K7QF_M2XA']) expect(normalizeCode(bad)).toBeNull();
  });

  it('mostra em dois grupos de 4', () => {
    expect(formatCode('K7QFM2XA')).toBe('K7QF-M2XA');
  });
});

describe('nome público', () => {
  it('limpa espaços, invisíveis e controle, e corta em 40', () => {
    expect(cleanName('  Igor \n Soler ')).toBe('Igor Soler');
    expect(cleanName('Igor​Soler\u0007')).toBe('IgorSoler');
    expect(cleanName('🎮'.repeat(50))).toBe('🎮'.repeat(40));
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});
