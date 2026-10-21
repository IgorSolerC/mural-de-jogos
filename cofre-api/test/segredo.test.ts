import { describe, expect, it } from 'vitest';
import { fromBase64url } from '../src/domain/bytes';
import { readSecrets } from '../src/secrets';
// @ts-expect-error o script é JavaScript puro, sem tipos
import { base64url, doPapel, nomeValido, paraPapel } from '../scripts/segredo.mjs';

/** A cópia em papel dos secrets do cofre (scripts/segredo.mjs, 16.2 do plano). */
describe('o segredo no papel', () => {
  // um valor fixo: com um sorteado, o teste da troca de vizinhos falharia 1 vez em mil rodadas
  const bytes = Buffer.from('3f9a0c71e4b2d85601aa7e93c4f0b12d68e5937c0b4fa216d9e3058b7c1af460', 'hex');
  const { grupos, conferencia } = paraPapel(bytes);
  const papel = `${grupos.join(' ')} ${conferencia}`;

  it('vai em 16 grupos de 4 em hexadecimal e uma conferência', () => {
    expect(grupos).toHaveLength(16);
    for (const g of [...grupos, conferencia]) expect(g).toMatch(/^[0-9a-f]{4}$/);
  });

  it('volta do papel do jeito que for digitado (espaços, linhas, maiúsculas)', () => {
    expect(Buffer.from(doPapel(papel).bytes).equals(bytes)).toBe(true);
    expect(Buffer.from(doPapel(papel.toUpperCase().replace(/ /g, '\n')).bytes).equals(bytes)).toBe(true);
    expect(Buffer.from(doPapel(papel.replace(/ /g, '-')).bytes).equals(bytes)).toBe(true);
  });

  it('um caractere errado, a menos ou a mais não passa', () => {
    const errado = (papel[0] === 'a' ? 'b' : 'a') + papel.slice(1);
    expect(doPapel(errado).erro).toContain('conferência');
    expect(doPapel(papel.slice(0, -1)).erro).toContain('67');
    expect(doPapel(`${papel}0`).erro).toContain('69');
    expect(doPapel(papel.replace(/^./, 'g')).erro).toContain('0-9');
  });

  it('a conferência pega a troca de dois caracteres vizinhos', () => {
    // a troca mais comum ao copiar; com 16 bits de conferência, sobra 1 chance em 65 mil por erro
    let pegas = 0;
    let trocas = 0;
    for (let i = 0; i < 63; i++) {
      const hex = grupos.join('');
      if (hex[i] === hex[i + 1]) continue;
      trocas++;
      const trocado = hex.slice(0, i) + hex[i + 1] + hex[i] + hex.slice(i + 2);
      if (doPapel(trocado + conferencia).erro) pegas++;
    }
    expect(pegas).toBe(trocas);
  });

  it('o que vai para o Worker é o formato que ele lê', () => {
    const valor = base64url(bytes);
    expect(Buffer.from(fromBase64url(valor)!).equals(bytes)).toBe(true);
    expect(readSecrets({ COFRE_PIMENTA_1: valor }).peppers.get(1)).toEqual(new Uint8Array(bytes));
  });

  it('só grava os nomes do cofre (o nome vai para o shell no Windows)', () => {
    expect(nomeValido('COFRE_PIMENTA_1')).toBe(true);
    expect(nomeValido('COFRE_ENVELOPES_12')).toBe(true);
    for (const ruim of ['COFRE_PIMENTA_0', 'COFRE_PIMENTA_1 & calc', 'GOOGLE_CLIENT_SECRET', 'COFRE_PIMENTA_1000', '', undefined]) {
      expect(nomeValido(ruim)).toBe(false);
    }
  });
});
