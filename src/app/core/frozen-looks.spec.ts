import { FROZEN_LOOKS } from './frozen-looks.data';
import { frozenPrints } from './frozen-looks';

describe('a aparência aprovada', () => {
  it('nenhum desenho sorteado muda por tabela (estampas, rabiscos, estragos, papéis, recortes, folhas)', () => {
    const now = frozenPrints();
    const changed = Object.keys(FROZEN_LOOKS).filter((k) => now[k] !== FROZEN_LOOKS[k]);
    // Uma lista vazia é o esperado. Mudou de propósito? `node scripts/freeze-looks.mjs <prefixo>`, só daquele desenho.
    expect(changed.slice(0, 40)).toEqual([]);
    expect(changed.length).toBe(0);
  });

  it('tudo o que é desenhado está congelado', () => {
    const missing = Object.keys(frozenPrints()).filter((k) => !(k in FROZEN_LOOKS));
    expect(missing.slice(0, 40)).toEqual([]);
  });
});
