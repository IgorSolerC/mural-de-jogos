import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PROFILE_KEY, ProfileStore } from './profile-store';

describe('ProfileStore', () => {
  beforeEach(() => {
    localStorage.removeItem(PROFILE_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => localStorage.removeItem(PROFILE_KEY));

  it('a mudança que não muda nada não vira a mais nova (senão vencia na nuvem a de outro aparelho)', () => {
    const store = TestBed.inject(ProfileStore);
    store.apply({ ...store.profile(), tagline: 'Curadora' }, '2026-10-01T10:00:00.000Z');
    // o espaço no fim, que o saneamento tira, e a mesma cor de novo
    store.update((p) => ({ ...p, tagline: 'Curadora ' }));
    store.update((p) => ({ ...p, photo: p.photo }));
    expect(store.changedAt()).toBe('2026-10-01T10:00:00.000Z');
    expect(store.profile().tagline).toBe('Curadora');
    // uma mudança de verdade marca a hora
    store.update((p) => ({ ...p, tagline: 'Curadora · SP' }));
    expect(store.changedAt()).not.toBe('2026-10-01T10:00:00.000Z');
    expect(store.profile().tagline).toBe('Curadora · SP');
  });
});
