import { COLLEAGUES_DB, Colleague, ColleagueStore } from './colleague-store';
import { cloudColleagueId } from './cloud-murals';
import { sanitizeReview } from './review';

describe('murais de outras pessoas guardados à parte', () => {
  let store: ColleagueStore;
  const ids: string[] = [];
  const wall = (code: string, name: string, game: string): Colleague => ({
    id: cloudColleagueId(code),
    name,
    fileName: `Código ${code}`,
    loadedAt: new Date().toISOString(),
    codigo: code,
    exportedAt: null,
    ownerName: name,
    skipped: 0,
    reviews: [sanitizeReview({ id: 'shared11', game: { name: game }, scores: { final: 8 }, completedAt: '2020' })!],
  } as Colleague);

  /** Grava direto no banco, como um site de antes gravava. */
  const putRaw = async (row: object) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(COLLEAGUES_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('colegas', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('colegas', 'readwrite');
      tx.objectStore('colegas').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  };

  beforeEach(async () => {
    store = new ColleagueStore();
    await store.ready;
  });
  afterEach(async () => {
    for (const id of ids.splice(0)) await store.remove(id);
  });

  it('guarda pessoas distintas e as devolve ao reabrir', async () => {
    const a = wall('K7QF-M2XA', 'Marina', 'Hades');
    const b = wall('A1B2-C3D4', 'João', 'Celeste');
    ids.push(a.id, b.id);
    await store.restore(a);
    await store.restore(b);
    const reopened = new ColleagueStore();
    await reopened.ready;
    expect(reopened.colleagues().find((c) => c.id === a.id)!.reviews[0].game.name).toBe('Hades');
    expect(reopened.colleagues().find((c) => c.id === b.id)!.reviews[0].game.name).toBe('Celeste');
  });

  it('o backup de um colega (de antes, sem código) sai do banco ao abrir', async () => {
    const kept = wall('K7QF-M2XA', 'Marina', 'Hades');
    ids.push(kept.id);
    await store.restore(kept);
    await putRaw({ ...wall('ZZZZ-ZZZZ', 'Do arquivo', 'Celeste'), id: 'arquivo1', codigo: undefined, fileName: 'colega.json' });
    const reopened = new ColleagueStore();
    await reopened.ready;
    expect(reopened.colleagues().map((c) => c.id)).toContain(kept.id);
    expect(reopened.colleagues().some((c) => c.id === 'arquivo1')).toBeFalse();
    // e não volta mais
    const again = new ColleagueStore();
    await again.ready;
    expect(again.colleagues().some((c) => c.id === 'arquivo1')).toBeFalse();
  });

  it('a remoção permite Desfazer sem duplicar a pessoa', async () => {
    const a = wall('K7QF-M2XA', 'Marina', 'Hades');
    ids.push(a.id);
    await store.restore(a);
    await store.remove(a.id);
    expect(store.colleagues().find((c) => c.id === a.id)).toBeUndefined();
    await store.restore(a);
    await store.restore(a);
    expect(store.colleagues().filter((c) => c.id === a.id).length).toBe(1);
  });
});
