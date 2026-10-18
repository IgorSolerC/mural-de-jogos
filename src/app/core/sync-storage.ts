import { InjectionToken } from '@angular/core';
import { readText, removeKey, writeText } from './storage';

/** Onde o estado da sincronização mora (o localStorage; os testes dão um por aparelho). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SYNC_STORAGE = new InjectionToken<KeyValueStore>('SYNC_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    // sem armazenamento, a próxima abertura recomeça pela primeira sincronização (que só junta)
    getItem: readText,
    setItem: writeText,
    removeItem: removeKey,
  }),
});

