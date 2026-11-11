import { UrlSegment } from '@angular/router';
import { routes, visitMatcher } from './app.routes';

/** A visita é uma rota só com quatro endereços: andar entre eles não refaz a página (ver `visitMatcher`). */

const match = (path: string) => {
  const segments = path.split('/').map((p) => new UrlSegment(p, {}));
  const result = visitMatcher(segments);
  if (!result) return null;
  expect(result.consumed).toEqual(segments);
  return Object.fromEntries(Object.entries(result.posParams ?? {}).map(([k, v]) => [k, v.path]));
};

describe('O endereço da visita (visitMatcher)', () => {
  it('o mural da pessoa, sem seção', () => {
    expect(match('comparar/mural')).toEqual({});
  });

  it('os Estudos, o grupo e o baralho', () => {
    expect(match('comparar/mural/estudos')).toEqual({ secao: 'estudos' });
    expect(match('comparar/mural/estudos/japones')).toEqual({ secao: 'estudos', grupo: 'japones' });
    expect(match('comparar/mural/estudos/japones/dkanji')).toEqual({ secao: 'estudos', grupo: 'japones', baralho: 'dkanji' });
    // o Kanban dos grupos públicos (PLANO-COMPARTILHAR.md, 4.6): um grupo por vez
    expect(match('comparar/mural/kanban')).toEqual({ secao: 'kanban' });
    expect(match('comparar/mural/kanban/trabalho')).toEqual({ secao: 'kanban', grupo: 'trabalho' });
  });

  it('o resto não é dela', () => {
    for (const path of ['comparar', 'comparar/outra', 'anotacoes/mural', 'comparar/mural/kanban/a/b', 'comparar/mural/estudos/a/b/c']) {
      expect(match(path)).withContext(path).toBeNull();
    }
  });

  it('o título diz em que parte a pessoa está', () => {
    const route = routes.find((r) => r.matcher === visitMatcher)!;
    const title = route.title as (r: { paramMap: { get(k: string): string | null } }) => string;
    expect(title({ paramMap: { get: () => null } })).toBe('Mural do colega');
    expect(title({ paramMap: { get: (k) => (k === 'secao' ? 'estudos' : null) } })).toBe('Flashcards do colega');
  });
});
