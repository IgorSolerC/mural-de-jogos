import { sameForEveryMural } from './kind-switcher';

describe('trocar de mural', () => {
  it('nos Ajustes, nas Novidades e em Amigos com tudo misturado, leva ao mural', () => {
    expect(sameForEveryMural('/ajustes', 'misturado')).toBeTrue();
    expect(sameForEveryMural('/novidades', 'separado')).toBeTrue();
    expect(sameForEveryMural('/amigos', 'misturado')).toBeTrue();
  });

  it('nas páginas do mural, e em Amigos separado por mural, fica onde está', () => {
    expect(sameForEveryMural('/amigos', 'separado')).toBeFalse();
    for (const p of ['/', '/fila', '/wishlist', '/ranking', '/extras', '/extras/estatisticas', '/comparar', '/comparar/mural', '/lado-a-lado']) {
      expect(sameForEveryMural(p, 'misturado')).withContext(p).toBeFalse();
    }
  });
});
