import { readJson, readText, removeKey, writeJson, writeText } from './storage';

describe('storage', () => {
  const KEY = 'meu-mural:teste-storage';
  afterEach(() => localStorage.removeItem(KEY));

  it('guarda e lê texto e JSON', () => {
    writeText(KEY, 'oi');
    expect(readText(KEY)).toBe('oi');
    writeJson(KEY, { a: [1, 2] });
    expect(localStorage.getItem(KEY)).toBe('{"a":[1,2]}');
    expect(readJson<{ a: number[] }>(KEY)).toEqual({ a: [1, 2] });
    removeKey(KEY);
    expect(readText(KEY)).toBeNull();
    expect(readJson(KEY)).toBeNull();
  });

  it('JSON ilegível vira null', () => {
    localStorage.setItem(KEY, '{quebrado');
    expect(readJson(KEY)).toBeNull();
  });

  it('sem armazenamento, nada sobe: ler dá null e gravar ou tirar não faz nada', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    const remove = spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    expect(readText(KEY)).toBeNull();
    expect(readJson(KEY)).toBeNull();
    expect(() => writeText(KEY, 'x')).not.toThrow();
    expect(() => writeJson(KEY, { x: 1 })).not.toThrow();
    expect(() => removeKey(KEY)).not.toThrow();
    // o afterEach ainda roda com o espião
    remove.and.callThrough();
  });

  it('um valor que não vira JSON também não sobe', () => {
    const loop: Record<string, unknown> = {};
    loop['eu'] = loop;
    expect(() => writeJson(KEY, loop)).not.toThrow();
    expect(readText(KEY)).toBeNull();
  });
});
