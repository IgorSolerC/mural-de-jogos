import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CALENDAR_KEY, CalendarStore } from './calendar-store';
import { KANBAN_KEY, KanbanStore } from './kanban-store';
import { PROFILE_KEY, ProfileStore } from './profile-store';
import { SETTINGS_KEY, Settings } from './settings';
import { onOtherTab } from './storage';

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
