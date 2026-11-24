import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DRAFTS_DB, PixelDraft, PixelDrafts, STASH_PREFIX, draftKey, draftWhen, sanitizeDraft } from './pixel-drafts';
import { freezeStorage, thawStorage } from './storage';

/** Os rascunhos do ateliê (PLANO-RASCUNHOS-PIXEL.md, rodada 2): guardados no IndexedDB deste aparelho. */
describe('os rascunhos da pixel art', () => {
  const draft = (id: string, savedAt: number, extra: Partial<PixelDraft> = {}): PixelDraft => ({
    id,
    origin: { kind: 'obra', id: 'gato1234' },
    title: 'Gato',
    values: { pixels: '12/21', width: '2', height: '2', palette: 'classica', colors: '' },
    base: draftKey({ pixels: '1', width: '2', height: '2' }),
    createdAt: savedAt,
    savedAt,
    ...extra,
  });

  async function wipe(): Promise<void> {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DRAFTS_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }

  beforeEach(async () => {
    await wipe();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(async () => {
    thawStorage();
    for (const k of Object.keys(localStorage)) if (k.startsWith(STASH_PREFIX)) localStorage.removeItem(k);
    TestBed.resetTestingModule();
    await wipe();
  });

  it('guarda, relê, troca e apaga; a lista vem da mais nova para a mais velha', async () => {
    const drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    expect(drafts.count()).toBe(0);
    expect(await drafts.put(draft('rasc0001', 10))).toBeTrue();
    expect(await drafts.put(draft('rasc0002', 20, { origin: { kind: 'widget' }, title: '' }))).toBeTrue();
    await drafts.refresh();
    expect(drafts.list().map((d) => d.id)).toEqual(['rasc0002', 'rasc0001']);
    await drafts.put(draft('rasc0001', 30, { values: { pixels: '3', width: '2', height: '2' } }));
    await drafts.refresh();
    expect(drafts.list().map((d) => d.id)).toEqual(['rasc0001', 'rasc0002']);
    expect((await drafts.get('rasc0001'))!.values['pixels']).toBe('3');
    await drafts.remove('rasc0001');
    await drafts.refresh();
    expect(drafts.list().map((d) => d.id)).toEqual(['rasc0002']);
  });

  it('o guardado às pressas (a aba sumindo) vai para o banco na próxima abertura, se for mais novo que o de lá', async () => {
    let drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    await drafts.put(draft('rasc0001', 10, { values: { pixels: '1', width: '2', height: '2' } }));
    drafts.stash(draft('rasc0001', 20, { values: { pixels: '2', width: '2', height: '2' } }));
    drafts.stash(draft('rasc0002', 5));
    // um mais velho que o do banco não troca o de lá
    await drafts.put(draft('rasc0003', 50, { values: { pixels: '3', width: '2', height: '2' } }));
    localStorage.setItem(STASH_PREFIX + 'rasc0003', JSON.stringify(draft('rasc0003', 40)));
    expect(localStorage.getItem(STASH_PREFIX + 'rasc0001')).not.toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    expect((await drafts.get('rasc0001'))!.values['pixels']).toBe('2');
    expect(await drafts.get('rasc0002')).not.toBeNull();
    expect((await drafts.get('rasc0003'))!.values['pixels']).toBe('3');
    expect(Object.keys(localStorage).filter((k) => k.startsWith(STASH_PREFIX))).toEqual([]);
    expect(drafts.count()).toBe(3);
  });

  it('o rascunho que chegou ao banco depois, ou saiu, leva junto o guardado às pressas', async () => {
    const drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    drafts.stash(draft('rasc0001', 10));
    await drafts.put(draft('rasc0001', 11));
    expect(localStorage.getItem(STASH_PREFIX + 'rasc0001')).toBeNull();
    drafts.stash(draft('rasc0002', 10));
    await drafts.remove('rasc0002');
    expect(localStorage.getItem(STASH_PREFIX + 'rasc0002')).toBeNull();
  });

  it('com o navegador sendo limpo (saiu da conta), nada grava', async () => {
    const drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    freezeStorage();
    expect(await drafts.put(draft('rasc0001', 10))).toBeFalse();
    drafts.stash(draft('rasc0001', 10));
    expect(localStorage.getItem(STASH_PREFIX + 'rasc0001')).toBeNull();
    thawStorage();
    await drafts.refresh();
    expect(drafts.count()).toBe(0);
  });

  it('o que não serve sai na leitura: id estranho, origem desconhecida, sem tela', () => {
    expect(sanitizeDraft(draft('rasc0001', 1))).not.toBeNull();
    // o id de uma obra é o da galeria (de 1 a 64): o rascunho de uma obra de id curto não se perde
    expect(sanitizeDraft({ ...draft('rasc0001', 1), origin: { kind: 'obra', id: 'pa' } })!.origin).toEqual({ kind: 'obra', id: 'pa' });
    expect(sanitizeDraft({ ...draft('x', 1) })).toBeNull();
    expect(sanitizeDraft({ ...draft('rasc0001', 1), origin: { kind: 'outra' } })).toBeNull();
    expect(sanitizeDraft({ ...draft('rasc0001', 1), values: { pixels: '1' } })).toBeNull();
    expect(sanitizeDraft('lixo')).toBeNull();
  });

  it('quando foi guardado, numa frase: hoje, ontem, a data (com o ano, de outro ano)', () => {
    const now = new Date(2026, 10, 24, 18, 0);
    expect(draftWhen(new Date(2026, 10, 24, 14, 32).getTime(), now)).toBe('hoje às 14:32');
    expect(draftWhen(new Date(2026, 10, 23, 9, 5).getTime(), now)).toBe('ontem às 09:05');
    expect(draftWhen(new Date(2026, 10, 12, 14, 32).getTime(), now)).toBe('em 12/11 às 14:32');
    expect(draftWhen(new Date(2025, 10, 12, 14, 32).getTime(), now)).toBe('em 12/11/2025 às 14:32');
  });

  it('o rascunho aberto noutra aba (a trava de lá) fica em `busy`, e sai quando ela solta', async () => {
    const drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const done = navigator.locks.request('meu-mural:rascunho:rasc0009', () => held);
    await new Promise((r) => setTimeout(r, 20));
    await drafts.refresh();
    expect(drafts.busy().has('rasc0009')).toBeTrue();
    release();
    await done;
    await drafts.refresh();
    expect(drafts.busy().has('rasc0009')).toBeFalse();
  });

  it('a mesma chave para o mesmo desenho, outra para outro', () => {
    expect(draftKey({ width: '2', height: '2', pixels: '1' })).toBe(draftKey({ pixels: '1', height: '2', width: '2', caption: 'x' }));
    expect(draftKey({ width: '2', height: '2', pixels: '1' })).not.toBe(draftKey({ width: '2', height: '2', pixels: '2' }));
  });

  it('segurar um rascunho: esta aba não o conta como de outra, e soltar libera', async () => {
    const drafts = TestBed.inject(PixelDrafts);
    const free = drafts.hold('rasc0001');
    await new Promise((r) => setTimeout(r, 20));
    expect((await drafts.heldElsewhere()).has('rasc0001')).toBeFalse();
    const names = (await navigator.locks.query()).held!.map((l) => l.name);
    expect(names).toContain('meu-mural:rascunho:rasc0001');
    free();
    await new Promise((r) => setTimeout(r, 20));
    expect((await navigator.locks.query()).held!.map((l) => l.name)).not.toContain('meu-mural:rascunho:rasc0001');
  });
});
