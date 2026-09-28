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
    expect(res).toEqual({ added: 1, updated: 1, skipped: 1, drafts: 0, removed: 0 });
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
      store.saveDraft({ id: 'rdddd1', game: { name: 'D', coverUrl: null, source: 'manual' }, createdAt: old, updatedAt: old });
      store.saveDraft({ id: 'reeee1', game: { name: 'E', coverUrl: null, source: 'manual' }, createdAt: old, updatedAt: old });
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

  it('toda ficha ganha uma cartolina', () => {
    store.importJson(JSON.stringify({ reviews: [review('raaaa1', 'A', '2024-01-02T00:00:00Z')] }), 'replace');
    expect(store.get('raaaa1')!.stock).toBeDefined();
  });
});
