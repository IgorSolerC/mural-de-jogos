import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { sanitizeReview } from './review';
import { ReviewStore } from './review-store';

function review(id: string, name: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    ...extra,
  };
}

describe('ReviewStore', () => {
  let store: ReviewStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
  });

  afterEach(() => localStorage.clear());

  it('junta um backup: novas entram, as mais recentes atualizam, as velhas ficam de fora', () => {
    store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', '2024-01-02T00:00:00Z'), review('rbbbb1', 'B', '2024-01-02T00:00:00Z')] }), 'replace');
    const res = store.importJson(
      JSON.stringify({
        reviews: [
          review('raaaa1', 'A nova', '2024-02-01T00:00:00Z'),
          review('rbbbb1', 'B velha', '2023-01-01T00:00:00Z'),
          review('rcccc1', 'C', '2024-01-02T00:00:00Z'),
        ],
      }),
      'merge',
    );
    expect(res).toEqual({ added: 1, updated: 1, skipped: 1, drafts: 0, wishes: 0, removed: 0 });
    expect(store.get('raaaa1')!.game.name).toBe('A nova');
    expect(store.get('rbbbb1')!.game.name).toBe('B');
    expect(store.count()).toBe(3);
  });

  it('aceita a lista pura dos backups antigos', () => {
    const res = store.importJson(JSON.stringify([review('raaaa1', 'A', '2024-01-02T00:00:00Z'), { lixo: true }]), 'merge');
    expect(res.added).toBe(1);
    expect(res.skipped).toBe(1);
  });

  it('recusa o que não é backup', () => {
    expect(() => store.importJson('não é json', 'merge')).toThrowError(/JSON válido/);
    expect(() => store.importJson('{"x":1}', 'merge')).toThrowError(/Não achei resenhas/);
  });

  it('substituir troca o mural inteiro', () => {
    store.add(sanitizeReview(review('rzzzz1', 'Z', '2024-01-02T00:00:00Z'))!);
    store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', '2024-01-02T00:00:00Z')] }), 'replace');
    expect(store.count()).toBe(1);
    expect(store.get('rzzzz1')).toBeUndefined();
  });

  it('pendente que já virou resenha não volta para a fila', () => {
    store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', '2024-01-02T00:00:00Z')] }), 'replace');
    const res = store.importJson(
      JSON.stringify({ reviews: [], drafts: [{ id: 'raaaa1', game: { name: 'A' } }, { id: 'rdddd1', game: { name: 'D' } }] }),
      'merge',
    );
    expect(res.drafts).toBe(1);
    expect(store.drafts().map((d) => d.id)).toEqual(['rdddd1']);
  });

  describe('apagadas', () => {
    const old = '2024-01-02T00:00:00Z';

    it('juntar um backup velho não traz de volta a resenha apagada', () => {
      const backup = JSON.stringify({ reviews: [review('raaaa1', 'A', old)] });
      store.importJson(backup, 'replace');
      store.remove('raaaa1');
      const res = store.importJson(backup, 'merge');
      expect(store.get('raaaa1')).toBeUndefined();
      expect(res.added).toBe(0);
      expect(res.skipped).toBe(1);
    });

    it('mas volta se foi editada no outro navegador depois de apagada aqui', () => {
      store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', old)] }), 'replace');
      store.remove('raaaa1');
      const later = new Date(Date.now() + 60_000).toISOString();
      store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A editada', later)] }), 'merge');
      expect(store.get('raaaa1')?.game.name).toBe('A editada');
    });

    it('o que foi apagado no outro navegador sai daqui também', () => {
      store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', old), review('rbbbb1', 'B', old)] }), 'replace');
      const res = store.importJson(
        JSON.stringify({ reviews: [review('rbbbb1', 'B', old)], deleted: { reviews: { raaaa1: '2024-06-01T00:00:00Z' }, drafts: {} } }),
        'merge',
      );
      expect(res.removed).toBe(1);
      expect(store.get('raaaa1')).toBeUndefined();
      expect(store.get('rbbbb1')).toBeDefined();
    });

    it('desfazer tira a marca de apagada', async () => {
      store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', old)] }), 'replace');
      const r = store.remove('raaaa1')!;
      store.restore(r);
      const { blob } = await store.exportBackup();
      const data = JSON.parse(await store.readBackup(blob));
      expect(data.deleted.reviews['raaaa1']).toBeUndefined();
    });

    it('pendente que vira resenha não fica marcado como apagado; tirado da fila, fica', () => {
      store.saveDraft({ id: 'rdddd1', kind: 'jogos', game: { name: 'D', coverUrl: null, source: 'manual' }, createdAt: old, updatedAt: old });
      store.saveDraft({ id: 'reeee1', kind: 'jogos', game: { name: 'E', coverUrl: null, source: 'manual' }, createdAt: old, updatedAt: old });
      store.removeDraft('rdddd1', false);
      store.removeDraft('reeee1');
      const res = store.importJson(
        JSON.stringify({ reviews: [], drafts: [{ id: 'rdddd1', game: { name: 'D' }, updatedAt: old }, { id: 'reeee1', game: { name: 'E' }, updatedAt: old }] }),
        'merge',
      );
      expect(store.drafts().map((d) => d.id)).toEqual(['rdddd1']);
      expect(res.drafts).toBe(1);
    });
  });

  describe('wishlist', () => {
    const old = '2024-01-02T00:00:00Z';
    const wish = (id: string, name: string) => ({ id, kind: 'jogos' as const, game: { name, coverUrl: null, source: 'manual' as const }, createdAt: old, updatedAt: old });

    it('vai e volta no backup, e o backup sem wishlist deixa a de agora como está', async () => {
      store.saveWish(wish('rwwww1', 'Hades II'));
      const { blob } = await store.exportBackup();
      const text = await store.readBackup(blob);
      localStorage.clear();
      store.importJson(JSON.stringify({ reviews: [] }), 'replace');
      expect(store.wishes().map((w) => w.id)).toEqual(['rwwww1']);
      store.wishes.set([]);
      const res = store.importJson(text, 'merge');
      expect(store.wishes().map((w) => w.game.name)).toEqual(['Hades II']);
      expect(res.wishes).toBe(1);
    });

    it('desejo tirado da lista não volta; o que virou resenha também não', () => {
      store.saveWish(wish('rwwww1', 'A'));
      store.saveWish(wish('rwwww2', 'B'));
      store.removeWish('rwwww1');
      store.removeWish('rwwww2', false);
      store.importJson(JSON.stringify({ reviews: [review('rwwww2', 'B', old)] }), 'merge');
      const res = store.importJson(JSON.stringify({ reviews: [], wishes: [wish('rwwww1', 'A'), wish('rwwww2', 'B')] }), 'merge');
      expect(store.wishes()).toEqual([]);
      expect(res.wishes).toBe(0);
    });

    it('trocar a vontade marca a hora, e Comum sai do registro', () => {
      store.saveWish(wish('rwwww1', 'A'));
      store.setRelevance('rwwww1', 'must');
      expect(store.getWish('rwwww1')!.relevance).toBe('must');
      expect(store.getWish('rwwww1')!.updatedAt).not.toBe(old);
      store.setRelevance('rwwww1', 'comum');
      expect('relevance' in store.getWish('rwwww1')!).toBeFalse();
    });

    it('juntar um backup traz a vontade mudada lá depois', () => {
      store.saveWish(wish('rwwww1', 'A'));
      const later = { ...wish('rwwww1', 'A'), relevance: 'later', updatedAt: '2024-03-01T00:00:00Z' };
      store.importJson(JSON.stringify({ reviews: [], wishes: [later] }), 'merge');
      expect(store.getWish('rwwww1')!.relevance).toBe('later');
      // e um backup mais velho não desfaz a de agora
      store.setRelevance('rwwww1', 'must');
      store.importJson(JSON.stringify({ reviews: [], wishes: [later] }), 'merge');
      expect(store.getWish('rwwww1')!.relevance).toBe('must');
    });

    it('desfazer devolve o desejo e esquece que foi apagado', () => {
      const w = wish('rwwww1', 'A');
      store.saveWish(w);
      store.removeWish('rwwww1');
      store.restoreWish(w);
      const res = store.importJson(JSON.stringify({ reviews: [], wishes: [w] }), 'merge');
      expect(store.wishes().length).toBe(1);
      expect(res.wishes).toBe(0);
    });
  });

  describe('bugs achados na caça', () => {
    const wish = (id: string, name: string, updatedAt: string) => ({ id, kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: updatedAt, updatedAt });

    it('juntar um backup não deixa o mesmo id na fila e no mural', () => {
      store.saveDraft({ id: 'rdddd1', kind: 'jogos', game: { name: 'D', coverUrl: null, source: 'manual' }, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' });
      store.importJson(JSON.stringify({ reviews: [review('rdddd1', 'D', '2024-02-01T00:00:00Z')], drafts: [] }), 'merge');
      expect(store.get('rdddd1')).toBeDefined();
      expect(store.getDraft('rdddd1')).toBeUndefined();
    });

    it('juntar um backup não deixa o mesmo id na wishlist e na fila', () => {
      store.saveWish(wish('rwwww1', 'W', '2024-01-01T00:00:00Z') as any);
      store.importJson(JSON.stringify({ reviews: [], drafts: [wish('rwwww1', 'W', '2024-02-01T00:00:00Z')] }), 'merge');
      expect(store.getDraft('rwwww1')).toBeDefined();
      expect(store.getWish('rwwww1')).toBeUndefined();
    });

    it('um desejo que virou resenha e foi apagado não volta de um backup antigo', () => {
      const old = wish('rxxxx1', 'X', '2024-01-01T00:00:00Z');
      store.saveWish(old as any);
      store.add(sanitizeReview(review('rxxxx1', 'X', '2024-02-01T00:00:00Z'))!);
      store.removeWish('rxxxx1', false);
      store.remove('rxxxx1');
      store.importJson(JSON.stringify({ reviews: [], wishes: [old] }), 'merge');
      expect(store.getWish('rxxxx1')).toBeUndefined();
    });

    it('desfazer e depois juntar um backup feito enquanto estava apagada não apaga de novo', () => {
      store.add(sanitizeReview(review('ryyyy1', 'Y', '2024-01-01T00:00:00Z'))!);
      const r = store.remove('ryyyy1')!;
      TestBed.tick();
      // o backup exportado enquanto estava apagada leva o mesmo registro de exclusão daqui
      const deleted = JSON.parse(localStorage.getItem('mural-de-jogos:apagadas:v1')!);
      expect(deleted.reviews.ryyyy1).toBeDefined();
      store.restore(r);
      store.importJson(JSON.stringify({ reviews: [], deleted }), 'merge');
      expect(store.get('ryyyy1')).toBeDefined();
    });

    it('a falha ao salvar as resenhas não some quando outra lista salva', () => {
      const real = localStorage.setItem.bind(localStorage);
      spyOn(localStorage, 'setItem').and.callFake((k: string, v: string) => {
        if (k === 'mural-de-jogos:resenhas:v1') throw new DOMException('cheio', 'QuotaExceededError');
        real(k, v);
      });
      store.saveWish(wish('rzzzz1', 'Z', '2024-01-01T00:00:00Z') as any);
      TestBed.tick();
      store.add(sanitizeReview(review('rzzzz1', 'Z', '2024-02-01T00:00:00Z'))!);
      store.removeWish('rzzzz1', false);
      TestBed.tick();
      expect(store.saveError()).not.toBeNull();
    });

    it('um texto corrompido não é apagado ao abrir: vai inteiro para …:corrompido', () => {
      TestBed.resetTestingModule();
      localStorage.clear();
      localStorage.setItem('mural-de-jogos:resenhas:v1', '[{"id":"raaaa1"');
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fresh = TestBed.inject(ReviewStore);
      TestBed.tick();
      expect(fresh.count()).toBe(0);
      expect(localStorage.getItem('mural-de-jogos:resenhas:v1')).toBe('[{"id":"raaaa1"');
      expect(localStorage.getItem('mural-de-jogos:resenhas:v1:corrompido')).toBe('[{"id":"raaaa1"');
    });
  });

  it('toda ficha ganha uma cartolina', () => {
    store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', '2024-01-02T00:00:00Z')] }), 'replace');
    expect(store.get('raaaa1')!.stock).toBeDefined();
  });

  describe('rejogadas', () => {
    beforeEach(() => {
      store.importJson(
        JSON.stringify({
          reviews: [
            review('raaaa1', 'A', '2024-01-02T00:00:00Z'),
            review('rvez01', 'A', '2024-03-02T00:00:00Z', { revisitOf: 'raaaa1', completedAt: '2024-03-01' }),
            review('rbbbb1', 'B', '2024-01-02T00:00:00Z'),
          ],
        }),
        'replace',
      );
    });

    it('guarda de qual ficha a rejogada é, e o backup leva junto', async () => {
      expect(store.get('rvez01')!.revisitOf).toBe('raaaa1');
      expect(store.get('raaaa1')!.revisitOf).toBeUndefined();
      const { blob } = await store.exportBackup();
      const text = await store.readBackup(blob);
      expect(JSON.parse(text).reviews.find((r: { id: string }) => r.id === 'rvez01').revisitOf).toBe('raaaa1');
    });

    it('apagar a original leva as rejogadas junto; apagar a rejogada não mexe na original', () => {
      store.remove('rvez01');
      expect(store.get('raaaa1')).toBeDefined();
      expect(store.get('rvez01')).toBeUndefined();
      store.restore(sanitizeReview(review('rvez01', 'A', '2024-03-02T00:00:00Z', { revisitOf: 'raaaa1' }))!);
      store.remove('raaaa1');
      expect(store.get('raaaa1')).toBeUndefined();
      expect(store.get('rvez01')).toBeUndefined();
      expect(store.get('rbbbb1')).toBeDefined();
    });

    it('trocar o item da original troca o das rejogadas', () => {
      const a = store.get('raaaa1')!;
      store.update({ ...a, game: { ...a.game, name: 'A remasterizado' }, updatedAt: '2024-05-01T00:00:00.000Z' });
      expect(store.get('rvez01')!.game.name).toBe('A remasterizado');
      expect(store.get('rbbbb1')!.game.name).toBe('B');
    });

    it('pregar uma rejogada de antes da original troca a original, e diz quem trocou', () => {
      const swap = store.add(sanitizeReview(review('rvez02', 'A', '2024-04-01T00:00:00Z', { revisitOf: 'raaaa1', completedAt: '2023-06' }))!);
      expect(swap).toEqual({ from: 'raaaa1', to: 'rvez02' });
      expect(store.get('rvez02')!.revisitOf).toBeUndefined();
      expect(store.get('raaaa1')!.revisitOf).toBe('rvez02');
      expect(store.get('rvez01')!.revisitOf).toBe('rvez02');
      // uma rejogada depois da original não troca nada
      expect(store.add(sanitizeReview(review('rvez03', 'A', '2024-04-02T00:00:00Z', { revisitOf: 'rvez02', completedAt: '2025-01-01' }))!)).toBeNull();
      expect(store.get('rvez03')!.revisitOf).toBe('rvez02');
    });
  });
});

describe('ReviewStore: junção para a sincronização', () => {
  let store: ReviewStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
  });

  afterEach(() => localStorage.clear());

  const draft = (name: string, updatedAt: string) => ({ id: 'rdddd1', kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: '2024-01-01T00:00:00Z', updatedAt });

  it('o mesmo pendente dos dois lados: fica o mexido por último', () => {
    store.importJson(JSON.stringify({ reviews: [], drafts: [draft('Antigo', '2024-01-02T00:00:00Z')] }), 'replace');
    store.importJson(JSON.stringify({ reviews: [], drafts: [draft('Editado lá', '2024-02-01T00:00:00Z')] }), 'merge');
    expect(store.drafts().map((d) => d.game.name)).toEqual(['Editado lá']);
    // e um mais velho não desfaz
    store.importJson(JSON.stringify({ reviews: [], drafts: [draft('Antigo', '2024-01-02T00:00:00Z')] }), 'merge');
    expect(store.drafts().map((d) => d.game.name)).toEqual(['Editado lá']);
  });

  it('no mesmo instante, os dois lados escolhem a mesma versão (sem isso a sincronização reenviaria para sempre)', () => {
    const t = '2024-01-02T00:00:00Z';
    const a = review('raaaa1', 'Versão A', t);
    const b = review('raaaa1', 'Versão B', t);
    store.importJson(JSON.stringify({ reviews: [a] }), 'replace');
    store.importJson(JSON.stringify({ reviews: [b] }), 'merge');
    const fromA = store.get('raaaa1')!.game.name;
    store.importJson(JSON.stringify({ reviews: [b] }), 'replace');
    store.importJson(JSON.stringify({ reviews: [a] }), 'merge');
    expect(store.get('raaaa1')!.game.name).toBe(fromA);
  });

  it('snapshot leva tudo no formato do backup', () => {
    store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', '2024-01-02T00:00:00Z')], drafts: [draft('D', '2024-01-02T00:00:00Z')] }), 'replace');
    const snap = store.snapshot('Igor');
    expect(snap.app).toBe('meu-mural');
    expect(snap.version).toBe(2);
    expect(snap.owner).toEqual({ name: 'Igor' });
    expect(snap.reviews.length).toBe(1);
    expect(snap.drafts.length).toBe(1);
    expect(store.hasContent()).toBeTrue();
  });
});
