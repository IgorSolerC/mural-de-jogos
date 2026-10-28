import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Backup } from './backup';

const KEY = 'mural-de-jogos:backup:v1';

describe('Backup', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => localStorage.clear());

  it('o backup baixado em outra aba chega aqui, e o Depois daqui não volta o lastAt para trás', () => {
    const old = '2026-08-01T00:00:00.000Z';
    localStorage.setItem(KEY, JSON.stringify({ lastAt: old, snoozeUntil: null }));
    const backup = TestBed.inject(Backup);
    expect(backup.lastAt()).toBe(old);

    // a outra aba baixou o backup agora
    const fresh = '2026-10-28T10:00:00.000Z';
    localStorage.setItem(KEY, JSON.stringify({ lastAt: fresh, snoozeUntil: null }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    expect(backup.lastAt()).toBe(fresh);

    backup.snooze();
    expect(JSON.parse(localStorage.getItem(KEY)!).lastAt).toBe(fresh);
  });

  it('o navegador que recusa o persist não solta erro em quem chamou', async () => {
    const backup = TestBed.inject(Backup);
    // a pergunta do construtor responde antes
    await navigator.storage.persisted();
    await new Promise((r) => setTimeout(r));
    backup.persisted.set(false);
    spyOn(navigator.storage, 'persist').and.rejectWith(new Error('recusado'));
    await expectAsync(backup.protect()).toBeResolved();
    expect(backup.persisted()).toBeFalse();
  });
});
