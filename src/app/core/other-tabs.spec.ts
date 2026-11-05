import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CALENDAR_KEY, CalendarStore } from './calendar-store';
import { KANBAN_KEY, KanbanStore } from './kanban-store';
import { PROFILE_KEY, ProfileStore } from './profile-store';
import { SETTINGS_KEY, Settings } from './settings';
import { catchUpOtherTabs, onOtherTab, writeJson } from './storage';

/**
 * Duas abas abertas no mesmo navegador: o que guarda o estado inteiro numa chave do localStorage (os
 * ajustes, os quadros do Kanban, o perfil, o calendário) acompanha o que a outra aba gravou. Sem isso,
 * a aba aberta desde antes regravava o que tinha por cima, e a sincronização o mandava de volta para a
 * nuvem: a cor da tag mudada, a anotação movida, voltavam sozinhas (ver também sync-devices.spec.ts).
 */

/** O que o navegador entrega às outras abas quando uma grava no localStorage. */
function otherTabWrote(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
}

describe('onOtherTab', () => {
  it('avisa quando outra aba grava ou tira a chave (ou limpa tudo), e para de avisar quando pedido', () => {
    const seen: string[] = [];
    const off = onOtherTab('meu-mural:teste-abas', () => seen.push('mudou'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'meu-mural:teste-abas', newValue: '1', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'meu-mural:outra-chave', newValue: '1', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'meu-mural:teste-abas', newValue: '1', storageArea: sessionStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    expect(seen).toEqual(['mudou', 'mudou']);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: 'meu-mural:teste-abas', newValue: '2', storageArea: localStorage }));
    expect(seen.length).toBe(2);
  });
});

describe('catchUpOtherTabs', () => {
  afterEach(() => localStorage.removeItem('meu-mural:teste-vez'));

  it('chama quem acompanha a chave que outra aba gravou sem o aviso ter chegado, uma vez; o que esta grava não', () => {
    const seen: string[] = [];
    const off = onOtherTab('meu-mural:teste-vez', () => seen.push(localStorage.getItem('meu-mural:teste-vez') ?? '-'));
    writeJson('meu-mural:teste-vez', { daqui: 1 });
    catchUpOtherTabs();
    expect(seen).toEqual([]);
    localStorage.setItem('meu-mural:teste-vez', '{"outra":1}');
    catchUpOtherTabs();
    catchUpOtherTabs();
    expect(seen).toEqual(['{"outra":1}']);
    // o aviso, quando chega, já foi visto; e depois dele, nada de novo
    localStorage.setItem('meu-mural:teste-vez', '{"outra":2}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'meu-mural:teste-vez', newValue: '{"outra":2}', storageArea: localStorage }));
    catchUpOtherTabs();
    expect(seen).toEqual(['{"outra":1}', '{"outra":2}']);
    off();
    localStorage.setItem('meu-mural:teste-vez', '{"outra":3}');
    catchUpOtherTabs();
    expect(seen.length).toBe(2);
  });
});

describe('writeJson numa chave acompanhada', () => {
  afterEach(() => localStorage.removeItem('meu-mural:teste-junta'));

  it('não grava por cima do que outra aba gravou e esta não ouviu: avisa quem acompanha, com o que esta tinha visto', () => {
    const heard: (string | null)[] = [];
    const off = onOtherTab('meu-mural:teste-junta', (before) => heard.push(before));
    writeJson('meu-mural:teste-junta', { v: 1 });
    expect(heard).toEqual([]);
    // a outra aba grava, e o aviso ainda não chegou
    localStorage.setItem('meu-mural:teste-junta', '{"v":2}');
    writeJson('meu-mural:teste-junta', { v: 3 });
    expect(localStorage.getItem('meu-mural:teste-junta')).toBe('{"v":2}');
    expect(heard).toEqual(['{"v":1}']);
    // depois de ouvir, grava
    writeJson('meu-mural:teste-junta', { v: 4 });
    expect(localStorage.getItem('meu-mural:teste-junta')).toBe('{"v":4}');
    off();
  });
});

describe('as outras abas', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => localStorage.clear());

  /**
   * A mudança feita "na outra aba": o que a chave tinha antes e depois de `change` (feita aqui mesmo,
   * só para ter o que a outra aba gravaria). Esta aba volta ao antes, como se nunca tivesse mudado,
   * e então recebe o depois.
   */
  function fromOtherTab(key: string, change: () => void): { before: string | null; after: string } {
    TestBed.tick();
    const before = localStorage.getItem(key);
    change();
    TestBed.tick();
    const after = localStorage.getItem(key)!;
    expect(after).not.toBe(before ?? '');
    otherTabWrote(key, before);
    TestBed.tick();
    return { before, after };
  }

  it('os ajustes: a cor da tag e a do grupo que a outra aba mudou valem aqui, e esta não grava a de antes por cima', () => {
    const settings = TestBed.inject(Settings);
    const { after } = fromOtherTab(SETTINGS_KEY, () => {
      settings.setTagColor('Feira', 'azul', 'Casa');
      settings.setCategoryLook('Trabalho', { color: 'verde' });
    });
    expect(settings.tagColor('Feira', 'Casa')).toBeUndefined();
    otherTabWrote(SETTINGS_KEY, after);
    TestBed.tick();
    expect(settings.tagColor('Feira', 'Casa')).toBe('azul');
    expect(settings.categoryLook('Trabalho').color).toBe('verde');
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(after);
    // a mudança seguinte daqui soma à da outra aba
    settings.setCategoryLook('Casa', { color: 'rosa' });
    TestBed.tick();
    const now = JSON.parse(localStorage.getItem(SETTINGS_KEY)!) as { categoryLooks: Record<string, { color?: string }> };
    expect(Object.values(now.categoryLooks).map((l) => l.color).sort()).toEqual(['azul', 'rosa', 'verde']);
  });

  it('os quadros do Kanban: o quadro que a outra aba mexeu vale aqui', () => {
    const kanban = TestBed.inject(KanbanStore);
    const { after } = fromOtherTab(KANBAN_KEY, () => kanban.update(kanban.boardFor('Trabalho').id, (b) => ({ ...b, columns: b.columns.map((c, i) => (i ? c : { ...c, name: 'Para fazer' })) })));
    expect(kanban.boards().length).toBe(0);
    otherTabWrote(KANBAN_KEY, after);
    TestBed.tick();
    expect(kanban.boards().map((b) => [b.category, b.columns[0].name])).toEqual([['trabalho', 'Para fazer']]);
    expect(localStorage.getItem(KANBAN_KEY)).toBe(after);
  });

  /** O quadro do Trabalho com as colunas renomeadas: o que esta aba tem e o que a "outra" gravou. */
  function twoRenames(heard: boolean): string[] {
    const kanban = TestBed.inject(KanbanStore);
    const id = kanban.boardFor('Trabalho').id;
    kanban.update(id, (b) => ({ ...b, columns: b.columns.map((c, i) => (i ? c : { ...c, name: 'Para fazer' })) }));
    TestBed.tick();
    const theirs = JSON.parse(localStorage.getItem(KANBAN_KEY)!) as { boards: { columns: { name: string }[] }[] };
    theirs.boards[0].columns[1].name = 'Lá';
    // esta aba renomeia outra coluna, e o effect ainda não gravou
    kanban.update(id, (b) => ({ ...b, columns: b.columns.map((c, i) => (i === 2 ? { ...c, name: 'Aqui' } : c)) }));
    if (heard) otherTabWrote(KANBAN_KEY, JSON.stringify(theirs));
    // sem o aviso ter chegado: a outra só gravou
    else localStorage.setItem(KANBAN_KEY, JSON.stringify(theirs));
    TestBed.tick();
    const stored = JSON.parse(localStorage.getItem(KANBAN_KEY)!) as { boards: { columns: { name: string }[] }[] };
    expect(stored.boards[0].columns.map((c) => c.name)).withContext('gravado').toEqual(kanban.boards()[0].columns.map((c) => c.name));
    return kanban.boards()[0].columns.map((c) => c.name);
  }

  it('os quadros do Kanban: esta aba e a outra mexendo ao mesmo tempo, ficam as duas mudanças (com o aviso a caminho ou sem ele)', () => {
    expect(twoRenames(true)).toEqual(['Para fazer', 'Lá', 'Aqui']);
  });

  it('os quadros do Kanban: gravando antes de ouvir a outra aba, esta não grava por cima e junta', () => {
    expect(twoRenames(false)).toEqual(['Para fazer', 'Lá', 'Aqui']);
  });

  it('o perfil: o que a outra aba mudou vale aqui, com a hora dela', () => {
    const profiles = TestBed.inject(ProfileStore);
    const { after } = fromOtherTab(PROFILE_KEY, () => profiles.update((p) => ({ ...p, tagline: 'Escrito na outra aba' })));
    expect(profiles.profile().tagline).not.toBe('Escrito na outra aba');
    otherTabWrote(PROFILE_KEY, after);
    TestBed.tick();
    expect(profiles.profile().tagline).toBe('Escrito na outra aba');
    expect(profiles.changedAt()).toBe((JSON.parse(after) as { em: string }).em);
    expect(localStorage.getItem(PROFILE_KEY)).toBe(after);
  });

  it('uma aba aberta antes de uma versão nova não regrava o que a outra gravou sem os campos que não conhece', () => {
    const kanban = TestBed.inject(KanbanStore);
    const settings = TestBed.inject(Settings);
    const profiles = TestBed.inject(ProfileStore);
    TestBed.tick();
    for (const key of [KANBAN_KEY, SETTINGS_KEY, PROFILE_KEY]) {
      const theirs = JSON.stringify({ ...(JSON.parse(localStorage.getItem(key)!) as object), campoDaVersaoNova: 1 });
      otherTabWrote(key, theirs);
      TestBed.tick();
      expect(localStorage.getItem(key)).withContext(key).toBe(theirs);
    }
    // o que esta aba mudar depois é gravado, como sempre
    kanban.update(kanban.boardFor('Trabalho').id, (b) => ({ ...b, columns: b.columns.map((c, i) => (i ? c : { ...c, name: 'Daqui' })) }));
    settings.setCategoryLook('Casa', { color: 'rosa' });
    profiles.update((p) => ({ ...p, tagline: 'Daqui' }));
    TestBed.tick();
    expect(localStorage.getItem(KANBAN_KEY)).toContain('Daqui');
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('rosa');
    expect(localStorage.getItem(PROFILE_KEY)).toContain('Daqui');
  });

  it('o calendário: o lembrete que a outra aba salvou aparece aqui', () => {
    const calendar = TestBed.inject(CalendarStore);
    const { after } = fromOtherTab(CALENDAR_KEY, () => calendar.save({ ...calendar.blank(calendar.today()), title: 'Dentista' }));
    expect(calendar.reminders()).toEqual([]);
    otherTabWrote(CALENDAR_KEY, after);
    TestBed.tick();
    expect(calendar.reminders().map((r) => r.title)).toEqual(['Dentista']);
    expect(localStorage.getItem(CALENDAR_KEY)).toBe(after);
  });
});
