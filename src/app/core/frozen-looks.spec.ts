import { FROZEN_LOOKS } from './frozen-looks.data';
import { FROZEN_DAMAGES, FROZEN_DECORS, FROZEN_PAPERS, FROZEN_PATTERNS, FROZEN_SCRIBBLES, FROZEN_STAINS, frozenPrints } from './frozen-looks';
import { DAMAGES, DECORS, PAPERS, PATTERNS, SCRIBBLES, STAINS } from './paper';

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

  // A conferência de cima só pega o que as listas congeladas sorteiam: um item novo numa cartela que
  // não entrou na lista passaria em branco.
  it('as listas congeladas têm todo item das cartelas', () => {
    const same = (frozen: readonly string[], all: readonly string[]) => expect([...frozen].sort()).toEqual([...all].sort());
    same(FROZEN_PAPERS, PAPERS);
    same(FROZEN_PATTERNS, PATTERNS);
    same(FROZEN_SCRIBBLES, SCRIBBLES);
    same(FROZEN_DAMAGES, DAMAGES);
    same(FROZEN_STAINS, STAINS);
    same(FROZEN_DECORS, DECORS);
  });
});
