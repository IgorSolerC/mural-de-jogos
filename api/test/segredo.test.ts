import { describe, expect, it } from 'vitest';
import { PREFIXO_DO_SEGREDO, SEGREDO_RE, crc32, montarSegredo, segredoConfere } from '../../contrato/api-v1/segredo';
import { newSecret } from '../src/domain/api-key';

/** O segredo das chaves de API (contrato/api-v1/segredo.ts): a forma e a conferência que pega erro de cópia. */
describe('o segredo das chaves de API', () => {
  it('o CRC32 é o de sempre (o do zip)', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
    expect(crc32('')).toBe(0);
  });

  it('um segredo novo tem a forma certa e confere', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = newSecret();
      expect(s).toMatch(SEGREDO_RE);
      expect(s.startsWith(PREFIXO_DO_SEGREDO)).toBe(true);
      expect(s).toHaveLength(7 + 43 + 6);
      expect(segredoConfere(s)).toBe(true);
      seen.add(s);
    }
    expect(seen.size).toBe(200);
  });

  it('pega uma letra trocada em qualquer lugar e o segredo cortado', () => {
    const s = montarSegredo('Q3N0abcdefghijklmnopqrstuvwxyz-_0123456789Z');
    expect(segredoConfere(s)).toBe(true);
    for (let i = PREFIXO_DO_SEGREDO.length; i < s.length; i++) {
      const swap = s[i] === 'a' ? 'b' : 'a';
      expect(segredoConfere(s.slice(0, i) + swap + s.slice(i + 1)), `posição ${i}`).toBe(false);
    }
    expect(segredoConfere(s.slice(0, -1))).toBe(false);
    expect(segredoConfere(` ${s}`)).toBe(false);
    expect(segredoConfere(s.replace('murall_', 'mural_'))).toBe(false);
  });
});
