import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KEEP_VERSION_DAYS, KeptVersion, MAX_VERSIONS, keptMessage, mergeVersions, sameContent, sanitizeVersions, storedVersions } from './kept-versions';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';

const DAY = 86_400_000;

function review(id: string, name: string, updatedAt: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    ...extra,
  })!;
}

const kept = (r: Review, em: string, motivo: KeptVersion['motivo'] = 'juntou'): KeptVersion => ({ ficha: r, em, motivo });

describe('versões guardadas', () => {
  const now = Date.parse('2026-10-15T12:00:00.000Z');
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  it('a mesma ficha em outra data é outra versão; a mesma versão dos dois lados fica uma só', () => {
    const a = kept(review('rhades01', 'Hades', '2026-10-01T00:00:00.000Z'), iso(DAY));
    const b = kept(review('rhades01', 'Hades (outra)', '2026-10-02T00:00:00.000Z'), iso(2 * DAY));
    const merged = mergeVersions([a], [b, { ...a, em: iso(3 * DAY) }], now);
    // a guardada por último primeiro; da mesma versão, fica a data em que foi guardada primeiro
    expect(merged.map((v) => [v.ficha.game.name, v.em])).toEqual([
      ['Hades (outra)', iso(2 * DAY)],
      ['Hades', iso(3 * DAY)],
    ]);
    // a mesma lista dos dois jeitos: os aparelhos chegam ao mesmo resultado
    expect(mergeVersions([b, { ...a, em: iso(3 * DAY) }], [a], now)).toEqual(merged);
  });

  it(`ficam ${KEEP_VERSION_DAYS} dias e no máximo ${MAX_VERSIONS}, as mais novas`, () => {
    const old = kept(review('rvelha01', 'Velha', '2026-01-01T00:00:00.000Z'), iso((KEEP_VERSION_DAYS + 1) * DAY));
    const many = Array.from({ length: MAX_VERSIONS + 5 }, (_, i) => kept(review(`rmuitas${String(i).padStart(2, '0')}`, `F${i}`, '2026-10-01T00:00:00.000Z'), iso(i * 60_000)));
    const merged = mergeVersions([old], many, now);
    expect(merged.length).toBe(MAX_VERSIONS);
    expect(merged.some((v) => v.ficha.id === 'rvelha01')).toBeFalse();
    expect(merged[0].ficha.id).toBe('rmuitas00');
  });

  it('vão e voltam do armazenamento, a anotação sem as notas; o que não serve fica de fora', () => {
    const note = sanitizeReview({ ...review('rnota001', 'Lista', '2026-10-01T00:00:00.000Z'), kind: 'anotacoes', text: 'oi' })!;
    const list = [kept(review('rhades01', 'Hades', '2026-10-01T00:00:00.000Z'), iso(0), 'editor'), kept(note, iso(0), 'apagada')];
    const stored = storedVersions(list) as { ficha: Record<string, unknown> }[];
    expect('scores' in stored[1].ficha).toBeFalse();
    const back = sanitizeVersions(JSON.parse(JSON.stringify([...stored, null, { ficha: {}, em: 'x' }, { ficha: stored[0].ficha, em: iso(0), motivo: '?' }])));
    expect(back.map((v) => [v.ficha.id, v.motivo])).toEqual([
      ['rhades01', 'editor'],
      ['rnota001', 'apagada'],
      ['rhades01', 'juntou'],
    ]);
    expect(sameContent(back[1].ficha, note)).toBeTrue();
  });

  it('o mesmo conteúdo em outra data é o mesmo conteúdo', () => {
    expect(sameContent(review('r1aaaa', 'A', '2026-01-01T00:00:00.000Z'), review('r1aaaa', 'A', '2026-02-01T00:00:00.000Z'))).toBeTrue();
    expect(sameContent(review('r1aaaa', 'A', '2026-01-01T00:00:00.000Z'), review('r1aaaa', 'B', '2026-01-01T00:00:00.000Z'))).toBeFalse();
  });

  it('o bilhete diz onde a versão ficou', () => {
    expect(keptMessage(1, 'juntou')).toContain('Ajustes › Backup');
    expect(keptMessage(3, 'juntou')).toMatch(/^3 fichas/);
    expect(keptMessage(1, 'editor')).toContain('enquanto você editava');
  });
});

describe('ReviewStore: versões guardadas', () => {
  let store: ReviewStore;
  /** Mesma ficha em 1º/out: a que o aparelho e a nuvem tinham juntos. */
  const BASE = '2026-10-01T00:00:00.000Z';
  const common = (id: string, at: string) => id === 'rhades01' && at === BASE;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.add(review('rhades01', 'Hades', BASE));
  });

  afterEach(() => localStorage.clear());

  const cloudWith = (...reviews: Review[]) => JSON.stringify({ app: 'meu-mural', version: 2, reviews, drafts: [], wishes: [], deleted: {} });

  it('mexida só lá: entra, e nada fica guardado', () => {
    const res = store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-02T00:00:00.000Z')), 'merge', common);
    expect(store.get('rhades01')!.game.name).toBe('Hades (lá)');
    expect(res.kept).toBe(0);
    expect(store.versions()).toEqual([]);
    expect(store.keptNotice()).toBeNull();
  });

  it('mexida só aqui: fica, e nada fica guardado', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-03T00:00:00.000Z'));
    store.importJson(cloudWith(review('rhades01', 'Hades', BASE)), 'merge', common);
    expect(store.get('rhades01')!.game.name).toBe('Hades (aqui)');
    expect(store.versions()).toEqual([]);
  });

  it('mexida dos dois lados: fica a mais nova, e a daqui, que perdeu, fica guardada', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-02T00:00:00.000Z'));
    const res = store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-03T00:00:00.000Z')), 'merge', common);
    expect(store.get('rhades01')!.game.name).toBe('Hades (lá)');
    expect(res.kept).toBe(1);
    expect(store.versions().map((v) => [v.ficha.game.name, v.motivo])).toEqual([['Hades (aqui)', 'juntou']]);
    expect(store.keptNotice()).toEqual(jasmine.objectContaining({ n: 1, motivo: 'juntou' }));
  });

  it('mexida dos dois lados: a de lá, que perdeu, também fica guardada', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-03T00:00:00.000Z'));
    store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-02T00:00:00.000Z')), 'merge', common);
    expect(store.get('rhades01')!.game.name).toBe('Hades (aqui)');
    expect(store.versions().map((v) => v.ficha.game.name)).toEqual(['Hades (lá)']);
  });

  it('apagada lá depois de mexida aqui: sai do mural, e a daqui fica guardada', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-02T00:00:00.000Z'));
    const doc = JSON.parse(cloudWith());
    doc.deleted = { reviews: { rhades01: '2026-10-03T00:00:00.000Z' } };
    store.importJson(JSON.stringify(doc), 'merge', common);
    expect(store.get('rhades01')).toBeUndefined();
    expect(store.versions().map((v) => [v.ficha.game.name, v.motivo])).toEqual([['Hades (aqui)', 'apagada']]);
  });

  it('apagada lá sem ter mudado aqui: só sai', () => {
    const doc = JSON.parse(cloudWith());
    doc.deleted = { reviews: { rhades01: '2026-10-03T00:00:00.000Z' } };
    store.importJson(JSON.stringify(doc), 'merge', common);
    expect(store.get('rhades01')).toBeUndefined();
    expect(store.versions()).toEqual([]);
  });

  it('um backup juntado à mão não guarda nada (a mais velha só sai, como sempre)', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-02T00:00:00.000Z'));
    const res = store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-03T00:00:00.000Z')), 'merge');
    expect(res.kept).toBeUndefined();
    expect(store.versions()).toEqual([]);
  });

  it('as versões de lá chegam junto, e vão no snapshot (e para a nuvem)', () => {
    const theirs = storedVersions([kept(review('rceleste', 'Celeste', '2026-09-01T00:00:00.000Z'), new Date().toISOString())]);
    store.importJson(JSON.stringify({ ...JSON.parse(cloudWith()), versoes: theirs }), 'merge', common);
    expect(store.versions().map((v) => v.ficha.id)).toEqual(['rceleste']);
    expect(store.snapshot().versoes).toEqual(storedVersions(store.versions()));
    // trocar o mural pelo de lá não leva as daqui embora
    store.importJson(cloudWith(), 'replace');
    expect(store.versions().length).toBe(1);
  });

  it('o editor que abriu uma versão velha guarda a que chegou enquanto ele estava aberto', () => {
    const opened = store.get('rhades01')!;
    // a sincronização trouxe a de outro aparelho com o editor aberto
    store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-02T00:00:00.000Z')), 'merge', common);
    store.update({ ...opened, game: { ...opened.game, name: 'Hades (editor)' }, updatedAt: '2026-10-04T00:00:00.000Z' }, opened);
    expect(store.get('rhades01')!.game.name).toBe('Hades (editor)');
    expect(store.versions().map((v) => [v.ficha.game.name, v.motivo])).toEqual([['Hades (lá)', 'editor']]);
    expect(store.keptNotice()!.motivo).toBe('editor');
  });

  it('o editor que salva a mesma versão que abriu não guarda nada', () => {
    const opened = store.get('rhades01')!;
    store.update({ ...opened, text: 'novo', updatedAt: '2026-10-04T00:00:00.000Z' }, opened);
    expect(store.versions()).toEqual([]);
  });

  it('a ficha apagada (em outro aparelho) enquanto estava aberta volta ao salvar, em vez de a edição sumir', () => {
    const opened = store.get('rhades01')!;
    const doc = JSON.parse(cloudWith());
    doc.deleted = { reviews: { rhades01: '2026-10-03T00:00:00.000Z' } };
    store.importJson(JSON.stringify(doc), 'merge', common);
    expect(store.get('rhades01')).toBeUndefined();
    store.update({ ...opened, text: 'Escrito com ela aberta.', updatedAt: '2026-10-02T00:00:00.000Z' }, opened);
    const back = store.get('rhades01')!;
    expect(back.text).toBe('Escrito com ela aberta.');
    // mexida depois do apagamento: a próxima junção não a apaga de novo
    expect(Date.parse(back.updatedAt)).toBeGreaterThan(Date.parse('2026-10-03T00:00:00.000Z'));
    store.importJson(JSON.stringify(doc), 'merge', common);
    expect(store.get('rhades01')).toBeDefined();
  });

  it('restaurar põe a versão de volta e guarda a que estava no mural', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-02T00:00:00.000Z'));
    store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-03T00:00:00.000Z')), 'merge', common);
    const [v] = store.versions();
    store.restoreVersion(v);
    expect(store.get('rhades01')!.game.name).toBe('Hades (aqui)');
    expect(Date.parse(store.get('rhades01')!.updatedAt)).toBeGreaterThan(Date.parse('2026-10-03T00:00:00.000Z'));
    expect(store.versions().map((x) => [x.ficha.game.name, x.motivo])).toEqual(
      jasmine.arrayWithExactContents([
        ['Hades (lá)', 'trocada'],
        ['Hades (aqui)', 'juntou'],
      ]),
    );
  });

  it('restaurar uma ficha que saiu do mural traz ela de volta', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-02T00:00:00.000Z'));
    const doc = JSON.parse(cloudWith());
    doc.deleted = { reviews: { rhades01: '2026-10-03T00:00:00.000Z' } };
    store.importJson(JSON.stringify(doc), 'merge', common);
    store.restoreVersion(store.versions()[0]);
    expect(store.get('rhades01')!.game.name).toBe('Hades (aqui)');
  });

  it('ficam guardadas no aparelho', () => {
    store.update(review('rhades01', 'Hades (aqui)', '2026-10-02T00:00:00.000Z'));
    store.importJson(cloudWith(review('rhades01', 'Hades (lá)', '2026-10-03T00:00:00.000Z')), 'merge', common);
    TestBed.tick();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    expect(TestBed.inject(ReviewStore).versions().map((v) => v.ficha.game.name)).toEqual(['Hades (aqui)']);
  });
});
