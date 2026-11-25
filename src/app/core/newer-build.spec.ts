import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toasts } from '../ui/toast';
import { BUILD } from './build';
import { BUILD_SEEN_KEY, NEWER_FROZEN_TEXT, NewerBuild, TRIED_KEY, markBuild, newerBuildSeen, seenBuild } from './newer-build';
import { storageFrozen, thawStorage, writeText } from './storage';

describe('a trava do site velho (PLANO-CANVAS.md, 4.1)', () => {
  beforeEach(() => {
    localStorage.removeItem(BUILD_SEEN_KEY);
    sessionStorage.removeItem(TRIED_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    thawStorage();
    localStorage.removeItem(BUILD_SEEN_KEY);
    sessionStorage.removeItem(TRIED_KEY);
    TestBed.resetTestingModule();
  });

  it('cada site marca a build dele na subida, e nunca abaixa a marca de um mais novo', () => {
    expect(markBuild(500)).toBe(0);
    expect(seenBuild()).toBe(500);
    expect(markBuild(501)).toBe(500);
    expect(seenBuild()).toBe(501);
    // o velho que sobe depois vê a marca do novo e não a troca
    expect(markBuild(500)).toBe(501);
    expect(seenBuild()).toBe(501);
  });

  it('a marca começa com meu-mural: (a limpeza do Sair a encontra)', () => {
    expect(BUILD_SEEN_KEY.startsWith('meu-mural:')).toBeTrue();
    expect(TRIED_KEY.startsWith('meu-mural:')).toBeTrue();
  });

  it('a build igual ou mais velha não faz nada', () => {
    const reload = jasmine.createSpy('reload');
    expect(newerBuildSeen(BUILD, { freeze: true, reload })).toBe('nao');
    expect(newerBuildSeen(BUILD - 3, { freeze: true, reload })).toBe('nao');
    expect(reload).not.toHaveBeenCalled();
    expect(storageFrozen()).toBeFalse();
  });

  it('uma mais nova neste navegador: para de gravar e recarrega, uma vez só por build (sem girar sem fim)', () => {
    const reload = jasmine.createSpy('reload');
    expect(newerBuildSeen(BUILD + 1, { freeze: true, reload })).toBe('recarregando');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storageFrozen()).toBeTrue();
    writeText('meu-mural:teste-trava', 'x');
    expect(localStorage.getItem('meu-mural:teste-trava')).toBeNull();
    // a página recarregada ainda é a velha (o servidor não trocou): fica, sem gravar
    expect(newerBuildSeen(BUILD + 1, { freeze: true, reload })).toBe('ja-tentou');
    expect(reload).toHaveBeenCalledTimes(1);
    // outra build mais nova ainda: tenta de novo
    expect(newerBuildSeen(BUILD + 2, { freeze: true, reload })).toBe('recarregando');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('a da nuvem recarrega sem parar de gravar (quem decide é a sincronização, que não envia)', () => {
    const reload = jasmine.createSpy('reload');
    expect(newerBuildSeen(BUILD + 1, { freeze: false, reload })).toBe('recarregando');
    expect(storageFrozen()).toBeFalse();
  });

  it('outra aba abriu uma build mais nova: esta recarrega; se já tinha tentado, o bilhete pede para recarregar', () => {
    const newer = TestBed.inject(NewerBuild);
    const reload = jasmine.createSpy('reload');
    newer.reload = reload;
    window.dispatchEvent(new StorageEvent('storage', { key: BUILD_SEEN_KEY, newValue: String(BUILD + 1) }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storageFrozen()).toBeTrue();
    window.dispatchEvent(new StorageEvent('storage', { key: BUILD_SEEN_KEY, newValue: String(BUILD + 1) }));
    expect(reload).toHaveBeenCalledTimes(1);
    const toast = TestBed.inject(Toasts).current();
    expect(toast?.text).toBe(NEWER_FROZEN_TEXT);
    toast?.action?.run();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('a marca de uma build mais velha (outra aba de antes do deploy) não mexe nesta', () => {
    const newer = TestBed.inject(NewerBuild);
    const reload = jasmine.createSpy('reload');
    newer.reload = reload;
    window.dispatchEvent(new StorageEvent('storage', { key: BUILD_SEEN_KEY, newValue: String(BUILD - 1) }));
    expect(reload).not.toHaveBeenCalled();
    expect(storageFrozen()).toBeFalse();
  });
});
