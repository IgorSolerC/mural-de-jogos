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
  it('o backup de outra pessoa não mostra o que ela deixou privado (resenhas e anotações)', () => {
    const snapshot = parseBackupSnapshot(
      JSON.stringify({
        reviews: [entry, { ...entry, id: 'review2', private: true }],
        notas: [
          { id: 'nota0001', kind: 'anotacoes', game: { name: 'Pública' }, updatedAt: '2024-01-01T00:00:00Z' },
          { id: 'nota0002', kind: 'anotacoes', game: { name: 'Diário' }, private: true, updatedAt: '2024-01-01T00:00:00Z' },
        ],
      }),
    );
    expect(snapshot.reviews.map((r) => r.id).sort()).toEqual(['nota0001', 'review1']);
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

/**
 * Um mural de outra pessoa (pelo código, pelo link ou por arquivo) é texto de fora: tudo o que vai
 * parar no HTML como texto continua texto, e tudo o que entra nos desenhos do papel (que são
 * montados como SVG) precisa ser um valor conhecido ou um número.
 */
describe('mural de fora com conteúdo malicioso', () => {
  const P = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const evil = {
    app: 'meu-mural',
    version: 2,
    owner: { name: `Ana ${P}` },
    reviews: [
      {
        id: '"><svg onload=alert(3)>',
        kind: '<y>',
        game: { name: `Jogo ${P}`, coverUrl: 'javascript:alert(4)', source: '<s>', by: P },
        scores: { historia: 8, diversao: 9, jogabilidade: 7, visual: 6 },
        status: '<x>',
        verdict: '<x>',
        difficulty: '<x>',
        stock: '<x>',
        paper: '<x>',
        pattern: '<x>',
        scribble: '"><script>alert(5)</script>',
        damage: 'queimado',
        damageSeed: '1);alert(6);//',
        stain: '<x>',
        decor: '<svg onload=alert(7)>',
        revisitOf: '"><x>',
        text: `Texto ${P}`,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  };

  it('só deixa passar valores conhecidos para o papel e guarda o resto como texto', () => {
    const [r] = parseBackupSnapshot(JSON.stringify(evil)).reviews;
    expect(r.id).toMatch(/^[\w-]{4,64}$/);
    expect(r.kind).toBe('jogos');
    expect(r.game.coverUrl).toBeNull();
    expect(r.game.source).toBe('manual');
    expect(r.status).toBe('finalizado');
    expect(r.verdict).toBeNull();
    expect(r.difficulty).toBe('nenhuma');
    expect(r.stock).toBeUndefined();
    for (const key of ['paper', 'pattern', 'scribble', 'stain', 'decor', 'damageSeed', 'revisitOf'] as const) {
      expect(r[key]).withContext(key).toBeUndefined();
    }
    expect(r.damage).toBe('queimado');
    // o texto continua igual: quem cuida dele é a interpolação do Angular, que nunca vira HTML
    expect(r.game.name).toBe(`Jogo ${P}`);
    expect(r.text).toBe(`Texto ${P}`);
  });
});
