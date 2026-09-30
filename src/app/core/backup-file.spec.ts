import { parseBackupSnapshot, readBackupFile } from './backup-file';
import { ReviewStore } from './review-store';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

const entry = {
  id: 'review1',
  game: { name: 'Celeste' },
  scores: { final: 8 },
  finalOverride: 11,
  completedAt: '2020',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('leitura independente de backup', () => {
  it('aceita JSON atual e lista antiga, preservando ano e nota manual', () => {
    for (const data of [
      [entry],
      { app: 'meu-mural', version: 2, reviews: [entry] },
    ]) {
      const snapshot = parseBackupSnapshot(JSON.stringify(data));
      expect(snapshot.reviews[0].completedAt).toBe('2020');
      expect(snapshot.reviews[0].scores.final).toBe(11);
    }
  });
  it('ignora registros inválidos, pendentes e exclusões anteriores à avaliação mais recente', () => {
    const snapshot = parseBackupSnapshot(
      JSON.stringify({
        reviews: [entry, { lixo: true }],
        drafts: [entry],
        wishes: [entry],
        deleted: { reviews: { review1: '2023-01-01T00:00:00Z' } },
      }),
    );
    expect(snapshot.reviews.length).toBe(1);
    expect(snapshot.skipped).toBe(1);
    expect(
      parseBackupSnapshot(
        JSON.stringify({
          reviews: [entry],
          deleted: { reviews: { review1: '2025-01-01T00:00:00Z' } },
        }),
      ).reviews,
    ).toEqual([]);
  });
  it('recusa arquivo errado ou versão desconhecida e aceita backup vazio', () => {
    expect(() => parseBackupSnapshot('x')).toThrowError(/JSON válido/);
    expect(() => parseBackupSnapshot('{}')).toThrowError(/Não achei resenhas/);
    expect(() =>
      parseBackupSnapshot('{"app":"outro","reviews":[]}'),
    ).toThrowError(/outro aplicativo/);
    expect(() =>
      parseBackupSnapshot('{"version":3,"reviews":[]}'),
    ).toThrowError(/versão mais nova/);
    expect(parseBackupSnapshot('{"reviews":[]}').reviews).toEqual([]);
  });
  it('lê gzip pelo cabeçalho e mantém caracteres pt-BR', async () => {
    const text = JSON.stringify([
      { ...entry, game: { name: 'Pokémon — coração' } },
    ]);
    const plain = new Blob([text]);
    const gzip = await new Response(
      plain.stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    expect(await readBackupFile(plain)).toBe(text);
    expect(await readBackupFile(gzip)).toBe(text);
    await expectAsync(
      readBackupFile(new Blob([new Uint8Array([0x1f, 0x8b, 0])])),
    ).toBeRejectedWithError(/Não consegui ler/);
  });
  it('recusa arquivos acima do limite antes de ler', async () => {
    await expectAsync(
      readBackupFile(new Blob([new Uint8Array(32 * 1024 * 1024 + 1)])),
    ).toBeRejectedWithError(/32 MB/);
  });
  it('abrir o backup de colega não altera nenhuma coleção própria; exportação conserva ano e 11', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const store = TestBed.inject(ReviewStore);
    store.importJson(JSON.stringify([entry]), 'replace');
    const original = JSON.stringify([
      store.reviews(),
      store.drafts(),
      store.wishes(),
    ]);
    parseBackupSnapshot(
      JSON.stringify([{ ...entry, game: { name: 'Hades' } }]),
    );
    expect(
      JSON.stringify([store.reviews(), store.drafts(), store.wishes()]),
    ).toBe(original);
    const backup = await store.exportBackup();
    const parsed = parseBackupSnapshot(await readBackupFile(backup.blob));
    expect(parsed.reviews[0].completedAt).toBe('2020');
    expect(parsed.reviews[0].finalOverride).toBe(11);
    localStorage.clear();
  });
});
