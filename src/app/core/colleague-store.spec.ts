import { ColleagueStore } from './colleague-store';

describe('backups separados de colegas', () => {
  let store: ColleagueStore;
  const ids: string[] = [];
  const file = (name: string) =>
    new File(
      [
        JSON.stringify({
          app: 'meu-mural',
          version: 2,
          reviews: [
            {
              id: 'shared11',
              game: { name },
              scores: { final: 8 },
              completedAt: '2020',
            },
          ],
        }),
      ],
      'colega.json',
      { type: 'application/json' },
    );

  beforeEach(async () => {
    store = new ColleagueStore();
    await store.ready;
  });
  afterEach(async () => {
    for (const id of ids.splice(0)) await store.remove(id);
  });

  it('guarda colegas distintos, preserva identidade e nome após reabrir', async () => {
    const a = await store.add(file('Hades'), '  Marina  ');
    ids.push(a.id);
    const b = await store.add(file('Celeste'), 'João');
    ids.push(b.id);
    await store.rename(a.id, 'Marina Silva');
    const reopened = new ColleagueStore();
    await reopened.ready;
    expect(reopened.colleagues().find((c) => c.id === a.id)!.name).toBe(
      'Marina Silva',
    );
    expect(
      reopened.colleagues().find((c) => c.id === a.id)!.reviews[0].game.name,
    ).toBe('Hades');
    expect(
      reopened.colleagues().find((c) => c.id === b.id)!.reviews[0].game.name,
    ).toBe('Celeste');
  });
  it('um arquivo inválido não substitui nenhum backup já guardado', async () => {
    const a = await store.add(file('Celeste'), 'Marina');
    ids.push(a.id);
    const before = JSON.stringify(store.colleagues());
    await expectAsync(
      store.add(new File(['{"no":true}'], 'invalido.json'), 'Outro'),
    ).toBeRejectedWithError(/Não achei resenhas/);
    expect(JSON.stringify(store.colleagues())).toBe(before);
  });
  it('a remoção permite Desfazer sem duplicar o colega', async () => {
    const a = await store.add(file('Hades'), 'Marina');
    ids.push(a.id);
    await store.remove(a.id);
    expect(store.colleagues().find((c) => c.id === a.id)).toBeUndefined();
    await store.restore(a);
    await store.restore(a);
    expect(store.colleagues().filter((c) => c.id === a.id).length).toBe(1);
  });
});
