import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fingerprint, notesConfigOf } from './cloud-sync';
import {
  MAX_CONFIG_CATEGORIES,
  NOTES_CONFIG_DEFAULT,
  activeOrder,
  arrangedKeys,
  asksTag,
  groupViews,
  hiddenKeys,
  moveKey,
  newNoteAudience,
  prefsOf,
  sanitizeNotesConfig,
  tagHiddenByDefault,
  withPrefs,
  withTagHidden,
} from './mural-config';
import { SETTINGS_KEY, Settings } from './settings';

describe('as configurações do mural de anotações', () => {
  beforeEach(() => localStorage.removeItem(SETTINGS_KEY));
  afterEach(() => localStorage.removeItem(SETTINGS_KEY));

  it('sem nada guardado, fica como o site sempre foi', () => {
    expect(sanitizeNotesConfig(undefined)).toEqual(NOTES_CONFIG_DEFAULT);
    expect(sanitizeNotesConfig([1, 2])).toEqual(NOTES_CONFIG_DEFAULT);
    expect(newNoteAudience(NOTES_CONFIG_DEFAULT, 'Trabalho')).toBe('privada');
    expect(asksTag(NOTES_CONFIG_DEFAULT, 'Trabalho', true)).toBeTrue();
    expect(asksTag(NOTES_CONFIG_DEFAULT, 'Trabalho', false)).toBeFalse();
    expect(activeOrder(NOTES_CONFIG_DEFAULT)).toBeNull();
  });

  it('guarda só valores conhecidos, pela categoria sem acento nem caixa, sem as categorias vazias', () => {
    const cfg = sanitizeNotesConfig({
      audience: 'publicar',
      // a cor da sub-nota de antes (até a build 443) é ignorada
      subColor: 'mae',
      orderBy: 'minha',
      order: ['Viagens!', 'viagens!', ' Roadmap site ', 3, ''],
      categories: {
        'Roadmap site': { audience: 'visivel', subColor: 'nada', askTag: 'sim' },
        'Viagens!': { audience: 'publicar', askTag: false },
        Vazia: { audience: 'todo mundo' },
        Ruim: 'publicar',
      },
    });
    expect(cfg).toEqual({
      audience: 'publicar',
      orderBy: 'minha',
      order: ['viagens!', 'roadmap site'],
      categories: { 'roadmap site': { audience: 'visivel' }, 'viagens!': { audience: 'publicar', askTag: false } },
      hiddenTags: [],
      showAll: false,
      subjects: {},
    });
    // a aba Tudo: só com true (o padrão é sem ela)
    expect(sanitizeNotesConfig({ showAll: true }).showAll).toBeTrue();
    expect(sanitizeNotesConfig({ showAll: 'sim' }).showAll).toBeFalse();
    expect(sanitizeNotesConfig(null).showAll).toBeFalse();
    const many = Object.fromEntries(Array.from({ length: MAX_CONFIG_CATEGORIES + 5 }, (_, i) => [`c${i}`, { askTag: true }]));
    expect(Object.keys(sanitizeNotesConfig({ categories: many }).categories).length).toBe(MAX_CONFIG_CATEGORIES);
  });

  it('a categoria muda o que escolheu; o resto segue o mural', () => {
    // "todas privadas, mas Roadmap site Disponível e Viagens! Publicar"
    let cfg = withPrefs(NOTES_CONFIG_DEFAULT, 'Roadmap site', { audience: 'visivel' });
    cfg = withPrefs(cfg, 'VIAGENS!', { audience: 'publicar', askTag: false });
    expect(newNoteAudience(cfg, 'roadmap SITE')).toBe('visivel');
    expect(newNoteAudience(cfg, 'Viagens!')).toBe('publicar');
    expect(newNoteAudience(cfg, 'Receitas')).toBe('privada');
    expect(newNoteAudience(cfg, null)).toBe('privada');
    expect(asksTag(cfg, 'Viagens!', true)).toBeFalse();
    expect(asksTag(cfg, 'Roadmap site', true)).toBeTrue();
    // o mural muda: quem não escolheu acompanha
    cfg = { ...cfg, audience: 'publicar' };
    expect(newNoteAudience(cfg, 'Receitas')).toBe('publicar');
    expect(newNoteAudience(cfg, 'Roadmap site')).toBe('visivel');
  });

  it('voltar a seguir o mural tira o campo, e a categoria sem nada deixa de ser guardada', () => {
    let cfg = withPrefs(NOTES_CONFIG_DEFAULT, 'Viagens!', { audience: 'publicar', askTag: false });
    cfg = withPrefs(cfg, 'Viagens!', { audience: undefined });
    expect(prefsOf(cfg, 'Viagens!')).toEqual({ askTag: false });
    cfg = withPrefs(cfg, 'viagens!', { askTag: undefined });
    expect(cfg.categories).toEqual({});
    // sem nome, nada muda
    expect(withPrefs(cfg, '  ', { audience: 'publicar' })).toBe(cfg);
  });

  it('esconder a categoria: guardado só quando escondida; mostrar de novo tira o campo', () => {
    let cfg = withPrefs(NOTES_CONFIG_DEFAULT, 'Viagens!', { hidden: true });
    cfg = withPrefs(cfg, 'Receitas', { hidden: true, askTag: false });
    expect([...hiddenKeys(cfg)].sort()).toEqual(['receitas', 'viagens!']);
    cfg = withPrefs(cfg, 'viagens!', { hidden: false });
    expect(cfg.categories).toEqual({ receitas: { hidden: true, askTag: false } });
    cfg = withPrefs(cfg, 'Receitas', { hidden: undefined });
    expect([...hiddenKeys(cfg)]).toEqual([]);
    // da nuvem ou do armazenamento: só o true conta
    expect(sanitizeNotesConfig({ categories: { A: { hidden: true }, B: { hidden: 'sim' }, C: { hidden: false } } }).categories).toEqual({ a: { hidden: true } });
  });

  it('a visualização padrão do grupo: só as da régua; voltar à última usada tira o campo', () => {
    let cfg = withPrefs(NOTES_CONFIG_DEFAULT, 'Trabalho', { view: 'lista' });
    cfg = withPrefs(cfg, 'Estudos!', { view: 'inteira', askTag: false });
    expect(prefsOf(cfg, 'TRABALHO').view).toBe('lista');
    expect([...groupViews(cfg)]).toEqual([
      ['c:trabalho', 'lista'],
      ['c:estudos!', 'inteira'],
    ]);
    cfg = withPrefs(cfg, 'trabalho', { view: undefined });
    expect(cfg.categories).toEqual({ 'estudos!': { view: 'inteira', askTag: false } });
    // da nuvem ou do armazenamento: só as visualizações que existem
    expect(sanitizeNotesConfig({ categories: { A: { view: 'capas' }, B: { view: 'gigante' }, C: { view: 3 } } }).categories).toEqual({ a: { view: 'capas' } });
  });

  it('o filtro padrão das tags: Excluído por categoria (a mesma tag pode ficar em outra), e da nuvem só chaves de tag', () => {
    let cfg = withTagHidden(NOTES_CONFIG_DEFAULT, 'Desabafo', 'Pessoal', true);
    cfg = withTagHidden(cfg, 'Rascunho', null, true);
    expect(cfg.hiddenTags).toEqual(['##pessoal#desabafo', '###rascunho']);
    expect(tagHiddenByDefault(cfg, 'DESABAFO', 'pessoal')).toBeTrue();
    expect(tagHiddenByDefault(cfg, 'Desabafo', 'Trabalho')).toBeFalse();
    expect(tagHiddenByDefault(cfg, 'rascunho', '')).toBeTrue();
    // de novo não repete; Disponível tira
    expect(withTagHidden(cfg, 'desabafo', 'Pessoal', true).hiddenTags).toEqual(['###rascunho', '##pessoal#desabafo']);
    expect(withTagHidden(cfg, 'Desabafo', 'Pessoal', false).hiddenTags).toEqual(['###rascunho']);
    expect(sanitizeNotesConfig({ hiddenTags: ['##pessoal#desabafo', '##pessoal#desabafo', 'pessoal', '#cor', 7, '##x#' + 'a'.repeat(200)] }).hiddenTags).toEqual(['##pessoal#desabafo']);
    expect(sanitizeNotesConfig({}).hiddenTags).toEqual([]);
  });

  it('a ordem montada à mão: as que têm lugar nele, as novas no fim', () => {
    expect(arrangedKeys(['b', 'x', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c', 'd']);
    expect(arrangedKeys([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(moveKey(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveKey(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
    expect(moveKey(['a', 'b', 'c'], 'z', 0)).toEqual(['a', 'b', 'c']);
    expect(activeOrder({ ...NOTES_CONFIG_DEFAULT, orderBy: 'minha', order: ['a'] })).toEqual(['a']);
    // pela quantidade, a ordem fica guardada para voltar a ela
    expect(activeOrder({ ...NOTES_CONFIG_DEFAULT, orderBy: 'quantidade', order: ['a'] })).toBeNull();
  });

  it('fica guardado nos Ajustes, e cada mudança vale como a mais nova', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const settings = TestBed.inject(Settings);
    expect(settings.notesConfigAt()).toBe('');
    settings.setCategoryPrefs('Viagens!', { audience: 'publicar' });
    settings.setNotesConfig({ orderBy: 'minha' });
    TestBed.tick();
    expect(settings.notesConfigAt()).not.toBe('');
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(stored.notesConfig.orderBy).toBe('minha');
    expect(stored.notesConfig.categories).toEqual({ 'viagens!': { audience: 'publicar' } });
    // "Voltar ao padrão" (Ajustes) não mexe: são coisas da pessoa
    settings.resetPreferences();
    expect(settings.notesConfig().orderBy).toBe('minha');
  });

  it('vai na nuvem com a data, e muda a impressão do mural', async () => {
    const doc = { reviews: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } };
    const config = { dados: withPrefs(NOTES_CONFIG_DEFAULT, 'Viagens!', { audience: 'publicar' }), em: '2026-10-15T10:00:00.000Z' };
    expect(await fingerprint(doc, null, null, null, null, config)).not.toBe(await fingerprint(doc));
    expect(notesConfigOf({ muralAnotacoes: { dados: { ...config.dados, audience: 'ninguem' }, em: config.em } })).toEqual(config);
    expect(notesConfigOf({ muralAnotacoes: { dados: config.dados } })).toBeNull();
    expect(notesConfigOf({})).toBeNull();
  });
});
