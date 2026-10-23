import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CATEGORY_COLORS, MAX_CATEGORY_LOOKS, bandColor, lookKey, randomCategoryColor, sanitizeCategoryLooks } from './category-looks';
import { categoryLooksOf, fingerprint, publicCategoryLooks } from './cloud-sync';
import { parseBackupSnapshot } from './backup-file';
import { SETTINGS_KEY, Settings } from './settings';

describe('o ícone e a cor das categorias', () => {
  beforeEach(() => localStorage.removeItem(SETTINGS_KEY));
  afterEach(() => localStorage.removeItem(SETTINGS_KEY));

  it('guarda só ícones e cores conhecidos, pela categoria sem acento nem caixa', () => {
    expect(
      sanitizeCategoryLooks({
        'Diário ': { icon: 'caderno', color: 'azul' },
        Trabalho: { icon: 'nada', color: 'vermelho' },
        Vazia: { icon: 'x', color: 'y' },
        Ruim: 'azul',
      }),
    ).toEqual({ diario: { icon: 'caderno', color: 'azul' }, trabalho: { color: 'vermelho' } });
    expect(sanitizeCategoryLooks(['azul'])).toEqual({});
    const many = Object.fromEntries(Array.from({ length: MAX_CATEGORY_LOOKS + 5 }, (_, i) => [`c${i}`, { color: 'rosa' }]));
    expect(Object.keys(sanitizeCategoryLooks(many)).length).toBe(MAX_CATEGORY_LOOKS);
    expect(lookKey(' Estúdios ')).toBe('estudios');
  });

  it('a cor de cada artista vem do nome: a mesma sempre, sem ligar para caixa nem acento, e todas as cores saem', () => {
    expect(bandColor('Milton Nascimento')).toBe(bandColor(' milton nascimento '));
    expect(bandColor('Björk')).toBe(bandColor('BJORK'));
    // as que se sorteiam: as oito de antes (o cinza e o preto só se escolhem, e nenhum artista mudou de cor)
    const ids = CATEGORY_COLORS.filter((c) => c.id !== 'cinza' && c.id !== 'preto').map((c) => c.id) as string[];
    const names = Array.from({ length: 200 }, (_, i) => `Banda ${i}`);
    const seen = new Set(names.map(bandColor));
    expect([...seen].every((c) => ids.includes(c))).toBeTrue();
    expect(seen.size).toBe(ids.length);
  });

  it('a cor sorteada é uma das cores, de ponta a ponta', () => {
    expect(randomCategoryColor(() => 0)).toBe(CATEGORY_COLORS[0].id);
    expect(randomCategoryColor(() => 0.9999)).toBe('vinho');
  });

  it('Settings troca, volta ao de sempre e lembra ao recarregar', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const settings = TestBed.inject(Settings);
    expect(settings.categoryLook('Trabalho')).toEqual({});
    settings.setCategoryLook('Trabalho', { icon: 'coroa', color: 'verde' });
    expect(settings.categoryLook('trabalho')).toEqual({ icon: 'coroa', color: 'verde' });
    expect(settings.categoryLooksAt()).not.toBe('');
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).categoryLooks).toEqual({ trabalho: { icon: 'coroa', color: 'verde' } });
    settings.setCategoryLook('TRABALHO', {});
    expect(settings.categoryLooks()).toEqual({});
  });

  it('vai no mural privado da nuvem, e muda a impressão digital', async () => {
    const doc = { reviews: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } };
    const looks = { mapa: { trabalho: { color: 'azul' as const } }, em: '2026-10-10T00:00:00.000Z' };
    expect(await fingerprint(doc, null, null, looks)).not.toBe(await fingerprint(doc));
    expect(categoryLooksOf({ categorias: { mapa: { Trabalho: { color: 'azul', icon: '?' } }, em: looks.em } })).toEqual(looks);
    expect(categoryLooksOf({ categorias: { mapa: {} } })).toBeNull();
  });

  it('o mural público leva só os das categorias das anotações publicadas, e o mural de alguém os lê', () => {
    const looks = { trabalho: { color: 'azul' as const }, segredo: { icon: 'coroa' as const } };
    const notas = [{ id: 'n1', category: 'Trabalho' }, { id: 'n2' }];
    expect(publicCategoryLooks(looks, notas)).toEqual({ trabalho: { color: 'azul' } });
    const note = { id: 'nt000001', kind: 'anotacoes', game: { name: 'Daily' }, text: 'x', category: 'Trabalho', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' };
    const publico = JSON.stringify({ app: 'meu-mural', version: 2, reviews: [], notas: [note], categorias: { Trabalho: { color: 'azul', icon: '?' } } });
    expect(parseBackupSnapshot(publico).categoryLooks).toEqual({ trabalho: { color: 'azul' } });
    expect(parseBackupSnapshot(JSON.stringify({ app: 'meu-mural', version: 2, reviews: [] })).categoryLooks).toEqual({});
  });
});
