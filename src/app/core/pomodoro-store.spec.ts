import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { POMODORO_KEY } from './pomodoro';
import { PomodoroStore } from './pomodoro-store';

const MIN = 60_000;
const T0 = new Date(2026, 10, 24, 9, 0, 0).getTime();

describe('o Pomodoro do aparelho: a régua do dia', () => {
  beforeEach(() => {
    localStorage.removeItem(POMODORO_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => localStorage.removeItem(POMODORO_KEY));

  it('os trechos de hoje ficam gravados no aparelho, e a aba que abre depois os lê', () => {
    const store = TestBed.inject(PomodoroStore);
    store.start(T0);
    store.togglePause(T0 + 10 * MIN);
    const saved = JSON.parse(localStorage.getItem(POMODORO_KEY)!);
    expect(saved.log).toEqual([{ a: T0, b: T0 + 10 * MIN, f: 'estudo' }]);
    expect(saved.runAt).toBeNull();
  });

  it('o Desfazer do desligar devolve o trecho que andava, sem pintá-lo duas vezes', () => {
    const store = TestBed.inject(PomodoroStore);
    store.start(T0);
    const before = store.stop(T0 + 10 * MIN);
    expect(store.save().log.length).toBe(1);
    store.restore(before);
    expect(store.save().log).toEqual([]);
    expect(store.save().runAt).toBe(T0);
    store.togglePause(T0 + 12 * MIN);
    expect(store.save().log).toEqual([{ a: T0, b: T0 + 12 * MIN, f: 'estudo' }]);
  });
});
