import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, SESSION_KEY } from './cloud-account';
import { LocalData, deleteDataDb } from './local-data';
import { MoveHouse, NEW_ORIGIN, OLD_ORIGIN, bridgeHasWall, cleanBridge } from './move-house';
import { ReviewStore } from './review-store';

/** A mudança de endereço: a faixa no endereço novo, a ponte e a gravação do que veio. */
describe('a mudança para murall.igorsc.com.br', () => {
  let move: MoveHouse;
  let reloaded: number;

  beforeEach(async () => {
    localStorage.clear();
    await deleteDataDb();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    move = TestBed.inject(MoveHouse);
    move.origin.set(NEW_ORIGIN);
    reloaded = 0;
    move.reload = () => reloaded++;
  });
  afterEach(async () => {
    localStorage.clear();
    await deleteDataDb();
  });

  const post = (data: unknown, origin = OLD_ORIGIN) => window.dispatchEvent(new MessageEvent('message', { data, origin }));
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('só traz o que é do mural, só textos, e nunca o login', () => {
    const data = cleanBridge({
      ls: { 'meu-mural:calendario:v1': '{}', [SESSION_KEY]: 'segredo', [ACCOUNT_KEY]: '{}', 'outra-coisa': 'x', 'mural-de-jogos:config:v1': 3 },
      idb: { 'mural-de-jogos:resenhas:v1': '[]', migrado: '2026-10-01', '<script>': 'x' },
    })!;
    expect(data.ls).toEqual({ 'meu-mural:calendario:v1': '{}' });
    expect(data.idb).toEqual({ 'mural-de-jogos:resenhas:v1': '[]', migrado: '2026-10-01' });
    expect(cleanBridge('lixo')).toBeNull();
    expect(bridgeHasWall(data)).toBeTrue();
    expect(bridgeHasWall({ ls: { 'mural-de-jogos:espelho:v1': '{}' }, idb: { migrado: 'x' } })).toBeFalse();
  });

  it('a faixa aparece só no endereço novo, com o mural vazio, até ser fechada', () => {
    expect(move.offered()).toBeTrue();
    move.origin.set(OLD_ORIGIN);
    expect(move.offered()).toBeFalse();
    move.origin.set(NEW_ORIGIN);
    move.close();
    expect(move.offered()).toBeFalse();
    expect(localStorage.getItem('meu-mural:mudanca:fechada')).toBe('1');
  });

  it('com mural, a faixa não aparece', () => {
    const fresh = TestBed.inject(ReviewStore);
    fresh.drafts.set([{ id: 'd1', kind: 'jogos', game: { name: 'Hades', coverUrl: null, source: 'manual' } } as never]);
    expect(move.offered()).toBeFalse();
  });

  it('a ponte entrega o mural: ele é gravado como estava e a página recarrega', async () => {
    spyOn(window, 'open').and.returnValue({} as Window);
    move.bring();
    expect(window.open).toHaveBeenCalledWith('https://igorsolerc.github.io/mural-de-jogos/ponte.html', 'murall-ponte', jasmine.any(String));
    expect(move.state()).toBe('abrindo');
    // de outro endereço, nada
    post({ tipo: 'murall-ponte', ls: { 'meu-mural:calendario:v1': '{"x":1}' }, idb: {} }, 'https://outro.site');
    await settle();
    expect(localStorage.getItem('meu-mural:calendario:v1')).toBeNull();
    const resenhas = JSON.stringify([{ id: 'r1' }]);
    post({ tipo: 'murall-ponte', ls: { 'meu-mural:calendario:v1': '{"x":1}', [SESSION_KEY]: 'segredo' }, idb: { 'mural-de-jogos:resenhas:v1': resenhas, migrado: '2026-10-01T00:00:00.000Z' } });
    await settle();
    await settle();
    expect(reloaded).toBe(1);
    expect(localStorage.getItem('meu-mural:calendario:v1')).toBe('{"x":1}');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    // o mural foi para o banco, onde o site o lê ao subir
    const data = new LocalData();
    await data.load();
    expect(data.getItem('mural-de-jogos:resenhas:v1')).toBe(resenhas);
  });

  it('sem mural lá, aberta já aqui, ou com a janela bloqueada: diz o que houve', async () => {
    const open = spyOn(window, 'open').and.returnValue(null);
    move.bring();
    expect(move.state()).toBe('bloqueado');
    open.and.returnValue({} as Window);
    move.bring();
    post({ tipo: 'murall-ponte', ls: {}, idb: { migrado: 'x' } });
    await settle();
    expect(move.state()).toBe('vazio');
    move.bring();
    post({ tipo: 'murall-ponte', semAntigo: true }, NEW_ORIGIN);
    await settle();
    expect(move.state()).toBe('sem-antigo');
    expect(reloaded).toBe(0);
  });
});
